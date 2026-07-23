import {
  useMutation, useQuery, useQueryClient, keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/audit";
import { fireWebhook, fireAutomations } from "@/lib/webhooks";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];
type ContactStatus = Database["public"]["Enums"]["contact_status"];

export const CONTACTS_PAGE_SIZE = 50;

export interface ContactFilters {
  status?: string;
  ownerId?: string;
  companyId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export type ContactSortKey = "name" | "email" | "status" | "created_at" | "title";
export type ContactSortDir = "asc" | "desc";

export interface ContactsQueryParams {
  page: number;
  search: string;
  filters: ContactFilters;
  sortKey: ContactSortKey;
  sortDir: ContactSortDir;
  /**
   * A visão por responsável é um kanban que agrupa TODOS os contatos por dono —
   * paginar traria 50 espalhados entre as colunas e daria um retrato falso.
   */
  paginate: boolean;
}

/*
 * Chaves em árvore, do mais geral para o mais específico:
 *
 *   ['contacts', orgId]                        -> tudo de contatos da org
 *   ['contacts', orgId, 'list',   { params }]  -> uma página/recorte
 *   ['contacts', orgId, 'detail', id]          -> um contato
 *
 * O orgId vem logo depois do domínio de propósito: trocar de organização deve
 * trocar de cache, não reaproveitar linhas de outra empresa. E toda invalidação
 * de escrita usa `all`, o prefixo — um contato criado pode entrar em qualquer
 * página, e adivinhar em qual daria uma lista desatualizada em silêncio.
 */
export const contactKeys = {
  all: (orgId: string | null | undefined) => ["contacts", orgId] as const,
  list: (orgId: string | null | undefined, params: ContactsQueryParams) =>
    ["contacts", orgId, "list", params] as const,
  detail: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["contacts", orgId, "detail", id] as const,
  related: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["contacts", orgId, "related", id] as const,
  lastActivity: (orgId: string | null | undefined, ids: string[]) =>
    ["contacts", orgId, "last-activity", ids] as const,
};

/**
 * Busca e filtros na própria query — nada é filtrado em memória. Exportado
 * porque a exportação de CSV precisa do mesmo recorte, só que sem `range`.
 */
export function applyContactFilters<T>(q: T, search: string, filters: ContactFilters): T {
  let out = q as any;
  if (search) {
    /*
     * Vírgula e parênteses são sintaxe do .or() do PostgREST — uma busca por
     * "Silva, João" quebraria a expressão. Trocados por espaço.
     */
    const term = search.replace(/[,()]/g, " ").trim();
    if (term) {
      out = out.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }
  if (filters.status && filters.status !== "all") out = out.eq("status", filters.status);
  if (filters.ownerId) out = out.eq("owner_id", filters.ownerId);
  if (filters.companyId) out = out.eq("company_id", filters.companyId);
  if (filters.createdFrom) out = out.gte("created_at", filters.createdFrom);
  // Fim do dia: created_at é timestamp, e lte na data crua cortaria em 00:00,
  // excluindo o próprio dia de createdTo.
  if (filters.createdTo) out = out.lte("created_at", `${filters.createdTo}T23:59:59.999`);
  return out as T;
}

/** Ordenação no servidor — ordenar só a página traria resultado errado. */
export function applyContactSort<T>(q: T, sortKey: ContactSortKey, sortDir: ContactSortDir): T {
  const asc = sortDir === "asc";
  const out = q as any;
  if (sortKey === "name") {
    // Não dá para ordenar por concatenação via PostgREST; nome e sobrenome em
    // sequência dão a mesma ordem na prática.
    return out.order("first_name", { ascending: asc }).order("last_name", { ascending: asc }) as T;
  }
  return out.order(sortKey, { ascending: asc }) as T;
}

/** Lista paginada + contagem total do recorte. */
export function useContactsQuery(params: ContactsQueryParams) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: contactKeys.list(orgId, params),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    /*
     * Mantém a página anterior na tela enquanto a nova carrega, em vez de
     * piscar o skeleton a cada tecla digitada na busca. É também o que a versão
     * com useEffect fazia — `loading` só era verdadeiro na primeira carga.
     */
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("contacts").select("*", { count: "exact" }).eq("org_id", orgId!);
      q = applyContactSort(applyContactFilters(q, params.search, params.filters), params.sortKey, params.sortDir);
      if (params.paginate) {
        const from = params.page * CONTACTS_PAGE_SIZE;
        q = q.range(from, from + CONTACTS_PAGE_SIZE - 1);
      }
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data || []) as Contact[], count: count ?? 0 };
    },
  });

  return {
    data: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/**
 * Data da última atividade por contato, só dos contatos visíveis.
 *
 * Buscar TODAS as atividades da org para calcular inatividade é o mesmo
 * problema de escala que a paginação resolve, um nível abaixo.
 */
export function useContactsLastActivityQuery(contactIds: string[]) {
  const { orgId } = useOrg();
  // Ordenado para a chave não mudar só porque a ordem da página mudou.
  const ids = [...contactIds].sort();

  const query = useQuery({
    queryKey: contactKeys.lastActivity(orgId, ids),
    enabled: !!orgId && ids.length > 0,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("contact_id,created_at")
        .in("contact_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, Date>();
      (data || []).forEach((a: any) => {
        if (!a.contact_id || !a.created_at) return;
        const d = new Date(a.created_at);
        const existing = map.get(a.contact_id);
        if (!existing || d > existing) map.set(a.contact_id, d);
      });
      return map;
    },
  });

  return query.data ?? new Map<string, Date>();
}

/**
 * Um contato pelo id.
 *
 * `placeholder` recebe a linha que a lista já tem em mãos, para o drawer abrir
 * preenchido: diferente de `initialData`, não entra no cache e não impede o
 * refetch — o que importa aqui, já que a lista pode estar desatualizada em
 * relação ao que outra aba acabou de salvar.
 */
export function useContactQuery(id: string | null | undefined, placeholder?: Contact | null) {
  const { orgId } = useOrg();

  return useQuery({
    queryKey: contactKeys.detail(orgId, id),
    enabled: !!orgId && !!id,
    staleTime: STALE_TIME.detail,
    placeholderData: placeholder ?? undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Contact | null;
    },
  });
}

/** Atividades, negócios e estágios de um contato — o conteúdo das abas do drawer. */
export function useContactRelatedQuery(contact: Contact | null) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: contactKeys.related(orgId, contact?.id),
    enabled: !!contact,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const [aRes, dRes, sRes] = await Promise.all([
        supabase.from("activities").select("*").eq("contact_id", contact!.id).order("created_at", { ascending: false }),
        supabase.from("deals").select("*").eq("contact_id", contact!.id),
        supabase.from("pipeline_stages").select("*").eq("org_id", contact!.org_id).order("order"),
      ]);
      return {
        activities: (aRes.data || []) as Activity[],
        deals: (dRes.data || []) as Deal[],
        stages: (sRes.data || []) as Stage[],
      };
    },
  });

  return {
    activities: query.data?.activities ?? [],
    deals: query.data?.deals ?? [],
    stages: query.data?.stages ?? [],
    isLoading: query.isLoading,
  };
}

/*
 * Empresas e membros alimentam os selects de filtro e os formulários de
 * contato. Ficam aqui porque hoje só Contatos os consome; quando Empresas
 * migrar, a chave ['companies', orgId] passa a ser compartilhada e a
 * invalidação de lá já chega aqui de graça.
 */
export function useContactCompaniesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["companies", orgId, "options"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Company[];
    },
  });
  return query.data ?? [];
}

export function useContactMembersQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["profiles", orgId, "options"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Profile[];
    },
  });
  return query.data ?? [];
}

/** Campos que o drawer edita — o par old/new do log de auditoria sai daqui. */
const CAMPOS_EDITAVEIS = [
  "first_name", "last_name", "email", "phone", "title", "status", "linkedin_url", "company_id",
] as const;

const recorte = (c: Record<string, any>) =>
  Object.fromEntries(CAMPOS_EDITAVEIS.map((k) => [k, c[k] ?? null]));

/**
 * Escrita de um contato por vez. Cada mutation invalida o prefixo da org — sem
 * refetch manual no componente, que era a fonte de listas desatualizadas quando
 * alguém esquecia de chamar `fetchData()` depois de salvar.
 */
export function useContactMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidar = () => qc.invalidateQueries({ queryKey: contactKeys.all(orgId) });

  const create = useMutation({
    mutationFn: async (form: {
      first_name: string; last_name?: string; email?: string; phone?: string;
      title?: string; status: ContactStatus; linkedin_url?: string; company_id?: string;
    }) => {
      const { data, error } = await supabase.from("contacts").insert({
        org_id: orgId!, first_name: form.first_name, last_name: form.last_name || null,
        email: form.email || null, phone: form.phone || null, title: form.title || null,
        status: form.status, linkedin_url: form.linkedin_url || null, owner_id: user?.id,
        company_id: form.company_id || null,
      }).select().single();
      if (error) throw error;

      void logAudit({
        orgId: orgId!, action: "create", entityType: "contact", entityId: data?.id,
        newValues: { first_name: form.first_name, last_name: form.last_name, email: form.email },
      });
      fireWebhook(orgId!, "contact.created", data ?? {});
      fireAutomations(orgId!, "contact.created", {
        contact_id: data?.id, lead_score: (data as any)?.lead_score, status: data?.status,
      });
      return data as Contact;
    },
    onSuccess: invalidar,
  });

  const update = useMutation({
    mutationFn: async ({ contact, patch }: { contact: Contact; patch: Partial<Contact> }) => {
      const { error } = await supabase.from("contacts").update(patch as any).eq("id", contact.id);
      if (error) throw error;
      // Só os campos editáveis vão para o log: o diff da timeline compara
      // old/new e ignora o que não mudou.
      void logAudit({
        orgId: contact.org_id, action: "update", entityType: "contact", entityId: contact.id,
        oldValues: recorte(contact as any), newValues: patch as Record<string, any>,
      });
    },
    onSuccess: invalidar,
  });

  /**
   * Troca de responsável no kanban por arrasto. Atualiza o cache antes da
   * resposta do servidor: sem isso o cartão volta para a coluna de origem e
   * salta de novo quando o refetch chega.
   */
  const updateOwner = useMutation({
    mutationFn: async ({ contactId, ownerId }: { contactId: string; ownerId: string | null }) => {
      const { error } = await supabase.from("contacts").update({ owner_id: ownerId }).eq("id", contactId);
      if (error) throw error;
    },
    onMutate: async ({ contactId, ownerId }) => {
      await qc.cancelQueries({ queryKey: contactKeys.all(orgId) });
      const anterior = qc.getQueriesData<{ rows: Contact[]; count: number }>({
        queryKey: ["contacts", orgId, "list"],
      });
      qc.setQueriesData<{ rows: Contact[]; count: number }>(
        { queryKey: ["contacts", orgId, "list"] },
        (old) => old && {
          ...old,
          rows: old.rows.map((c) => (c.id === contactId ? { ...c, owner_id: ownerId } : c)),
        },
      );
      return { anterior };
    },
    onError: (_e, _v, ctx) => {
      // Falhou: devolve exatamente o que havia em cada chave afetada.
      ctx?.anterior.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (contact: Contact) => {
      const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (error) throw error;
      void logAudit({
        orgId: contact.org_id, action: "delete", entityType: "contact", entityId: contact.id,
        oldValues: { first_name: contact.first_name, last_name: contact.last_name, email: contact.email },
      });
    },
    onSuccess: invalidar,
  });

  return { create, update, updateOwner, remove, invalidar };
}

/**
 * Ações em lote. Recebem os contatos inteiros, não só os ids: depois do delete
 * não há de onde ler o nome, e um histórico que diz apenas "excluiu este
 * contato" sem dizer qual era não ajuda ninguém a entender o que sumiu.
 */
export function useContactBulkMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: contactKeys.all(orgId) });

  const bulkDelete = useMutation({
    mutationFn: async (contatos: Contact[]) => {
      await Promise.all(contatos.map((c) => supabase.from("contacts").delete().eq("id", c.id)));
      // Uma entrada por entidade: cada linha do log é uma ação atômica.
      contatos.forEach((c) => {
        void logAudit({
          orgId: orgId!, action: "delete", entityType: "contact", entityId: c.id,
          oldValues: { first_name: c.first_name, last_name: c.last_name, email: c.email },
        });
      });
      return contatos.length;
    },
    onSuccess: invalidar,
  });

  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ contatos, status }: { contatos: Contact[]; status: ContactStatus }) => {
      await Promise.all(contatos.map((c) => supabase.from("contacts").update({ status }).eq("id", c.id)));
      contatos.forEach((c) => {
        void logAudit({
          orgId: orgId!, action: "update", entityType: "contact", entityId: c.id,
          oldValues: { status: c.status ?? null }, newValues: { status },
        });
      });
      return contatos.length;
    },
    onSuccess: invalidar,
  });

  return { bulkDelete, bulkUpdateStatus, invalidar };
}

/** Nova atividade no drawer — invalida só o bloco de relacionados do contato. */
export function useContactActivityMutation(contact: Contact | null) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (form: { type: Database["public"]["Enums"]["activity_type"]; title: string; body: string }) => {
      const { error } = await supabase.from("activities").insert({
        org_id: orgId!, contact_id: contact!.id, type: form.type,
        title: form.title, body: form.body, user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.related(orgId, contact?.id) });
      // A coluna de inatividade da lista deriva da última atividade.
      qc.invalidateQueries({ queryKey: ["contacts", orgId, "last-activity"] });
    },
  });
}
