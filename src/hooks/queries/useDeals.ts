import { useEffect } from "react";
import {
  useMutation, useQuery, useQueryClient, keepPreviousData, type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/audit";
import { fireWebhook, fireAutomations } from "@/lib/webhooks";
import { applyScoreEvent } from "@/lib/scoring";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type DealWithRelations = Deal & {
  contact?: Contact | null;
  company?: Company | null;
  owner?: Profile | null;
};

export const DEALS_PAGE_SIZE = 50;

export interface DealFilters {
  search?: string;
  ownerId?: string;
  minValue?: number;
  maxValue?: number;
  closeDateFrom?: string;
  closeDateTo?: string;
}

/** O que as duas listas devolvem — mesma forma, para um só patch de cache servir. */
type DealsPage = { rows: DealWithRelations[]; count: number };

const SELECT_COM_RELACOES =
  "*, contact:contacts!deals_contact_id_fkey(*), company:companies!deals_company_id_fkey(*)";

/*
 * Chaves:
 *
 *   ['deals', orgId]                          -> tudo de negócios da org
 *   ['deals', orgId, 'kanban', { filters }]   -> conjunto completo do recorte
 *   ['deals', orgId, 'list',   { page, ... }] -> uma página
 *   ['deals', orgId, 'detail', id]            -> um negócio
 *
 * Kanban e previsão agrupam e somam por estágio: "página 1 do kanban" não
 * significa nada, e os totais por coluna sairiam errados se só 50 negócios
 * chegassem. Por isso são duas queries e não um flag na mesma — e, sendo chaves
 * distintas, trocar de visão não descarta o que a outra já tinha carregado.
 */
export const dealKeys = {
  all: (orgId: string | null | undefined) => ["deals", orgId] as const,
  kanban: (orgId: string | null | undefined, filters: DealFilters) =>
    ["deals", orgId, "kanban", filters] as const,
  list: (orgId: string | null | undefined, params: { page: number; filters: DealFilters }) =>
    ["deals", orgId, "list", params] as const,
  detail: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["deals", orgId, "detail", id] as const,
  activities: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["deals", orgId, "activities", id] as const,
};

export function applyDealFilters<T>(q: T, filters: DealFilters): T {
  let out = q as any;
  if (filters.search) {
    // Sem .or() aqui: a busca é só por título, então .ilike() direto — e a
    // vírgula do usuário não corre risco de virar sintaxe do PostgREST.
    out = out.ilike("title", `%${filters.search}%`);
  }
  if (filters.ownerId) out = out.eq("owner_id", filters.ownerId);
  if (filters.minValue) out = out.gte("value", filters.minValue);
  if (filters.maxValue) out = out.lte("value", filters.maxValue);
  if (filters.closeDateFrom) out = out.gte("close_date", filters.closeDateFrom);
  if (filters.closeDateTo) out = out.lte("close_date", filters.closeDateTo);
  return out as T;
}

/**
 * Conjunto completo do recorte — kanban e previsão.
 *
 * Não recebe pipelineId de propósito. O recorte por pipeline é da VISÃO, não
 * dos dados: a Sessão 5 tirou `selectedPipeline` das dependências do fetch
 * justamente porque trocar de pipeline refazia todas as queries, e a filtragem
 * por estágio já acontece em memória. Pôr o pipeline na chave reintroduziria
 * aquele refetch, agora disfarçado de cache miss.
 */
export function useDealsQuery(filters: DealFilters, enabled = true) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: dealKeys.kanban(orgId, filters),
    enabled: !!orgId && enabled,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DealsPage> => {
      const q = applyDealFilters(
        supabase.from("deals").select(SELECT_COM_RELACOES, { count: "exact" })
          .eq("org_id", orgId!).order("created_at", { ascending: false }),
        filters,
      );
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data || []) as DealWithRelations[], count: count ?? 0 };
    },
  });

  return {
    data: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/** Versão paginada — só a visão de lista. */
export function useDealsListQuery(
  params: { page: number; filters: DealFilters },
  enabled = true,
) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: dealKeys.list(orgId, params),
    enabled: !!orgId && enabled,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DealsPage> => {
      const q = applyDealFilters(
        supabase.from("deals").select(SELECT_COM_RELACOES, { count: "exact" })
          .eq("org_id", orgId!).order("created_at", { ascending: false }),
        params.filters,
      );
      const from = params.page * DEALS_PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + DEALS_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as DealWithRelations[], count: count ?? 0 };
    },
  });

  return {
    data: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useDealQuery(id: string | null | undefined) {
  const { orgId } = useOrg();

  return useQuery({
    queryKey: dealKeys.detail(orgId, id),
    enabled: !!id,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals").select(SELECT_COM_RELACOES).eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as DealWithRelations) ?? null;
    },
  });
}

/** Atividades de um negócio — a timeline do DealDetail. */
export function useDealActivitiesQuery(dealId: string | null | undefined) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: dealKeys.activities(orgId, dealId),
    enabled: !!dealId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities").select("*").eq("deal_id", dealId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Activity[];
    },
  });

  return { activities: query.data ?? [], isLoading: query.isLoading };
}

/* ── Manipulação do cache ────────────────────────────────────────────────── */

/**
 * Aplica um patch a um negócio em TODAS as listas em cache (kanban e lista) e
 * no detalhe, sem disparar requisição.
 *
 * É o que mantém o ganho da Sessão 5: arrastar um card no kanban emite um
 * UPDATE, e antes cada UPDATE refazia as seis queries da página. Aqui a
 * mudança entra direto na memória — a rede vê só o próprio UPDATE.
 */
function patchDealNoCache(
  qc: QueryClient,
  orgId: string | null | undefined,
  dealId: string,
  patch: Partial<Deal>,
) {
  qc.setQueriesData<DealsPage>({ queryKey: ["deals", orgId, "kanban"] }, (old) =>
    old && { ...old, rows: old.rows.map((d) => (d.id === dealId ? { ...d, ...patch } : d)) });
  qc.setQueriesData<DealsPage>({ queryKey: ["deals", orgId, "list"] }, (old) =>
    old && { ...old, rows: old.rows.map((d) => (d.id === dealId ? { ...d, ...patch } : d)) });
  qc.setQueryData<DealWithRelations | null>(dealKeys.detail(orgId, dealId), (old) =>
    old ? { ...old, ...patch } : old);
}

function removerDealDoCache(qc: QueryClient, orgId: string | null | undefined, dealId: string) {
  const remover = (old: DealsPage | undefined) => {
    if (!old) return old;
    const rows = old.rows.filter((d) => d.id !== dealId);
    // A contagem só cai se a linha estava mesmo nesta página do cache.
    return { rows, count: rows.length === old.rows.length ? old.count : Math.max(0, old.count - 1) };
  };
  qc.setQueriesData<DealsPage>({ queryKey: ["deals", orgId, "kanban"] }, remover);
  qc.setQueriesData<DealsPage>({ queryKey: ["deals", orgId, "list"] }, remover);
}

/** Snapshot de todas as listas, para desfazer um update otimista que falhou. */
function snapshotListas(qc: QueryClient, orgId: string | null | undefined) {
  return [
    ...qc.getQueriesData<DealsPage>({ queryKey: ["deals", orgId, "kanban"] }),
    ...qc.getQueriesData<DealsPage>({ queryKey: ["deals", orgId, "list"] }),
    ...qc.getQueriesData<DealWithRelations | null>({ queryKey: ["deals", orgId, "detail"] }),
  ];
}

function restaurar(qc: QueryClient, snapshot: ReturnType<typeof snapshotListas>) {
  snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
}

/* ── Realtime ────────────────────────────────────────────────────────────── */

/**
 * Assina os eventos de `deals` da org e os aplica no cache.
 *
 * UPDATE e DELETE entram direto na memória, sem refetch — é o caminho quente,
 * já que cada arrasto de card emite um UPDATE.
 *
 * INSERT invalida: uma linha criada por outra pessoa pode referenciar um
 * contato ou empresa que não temos, e o payload do realtime traz só as colunas
 * de `deals`, sem os joins.
 *
 * UPDATE que MUDA contact_id ou company_id cai no mesmo caso e também invalida
 * — resolver o join de memória exigiria manter as duas listas inteiras por
 * perto, e trocar o contato de um negócio é raro o bastante para não valer.
 */
export function useDealsRealtime() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const invalidar = () => qc.invalidateQueries({ queryKey: dealKeys.all(orgId) });

    const channel = supabase
      .channel("deals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (id) removerDealDoCache(qc, orgId, id);
            return;
          }

          if (payload.eventType === "UPDATE") {
            const row = payload.new as Deal;
            const emCache = qc
              .getQueriesData<DealsPage>({ queryKey: ["deals", orgId] })
              .flatMap(([, data]) => data?.rows ?? [])
              .find((d) => d.id === row.id);

            // Linha que não temos, ou cujo vínculo mudou: só o servidor sabe
            // montar o join.
            if (!emCache || emCache.contact_id !== row.contact_id || emCache.company_id !== row.company_id) {
              invalidar();
              return;
            }
            patchDealNoCache(qc, orgId, row.id, row);
            return;
          }

          invalidar();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, qc]);
}

/* ── Escrita ─────────────────────────────────────────────────────────────── */

export function useDealMutation(stages: { id: string; name: string }[] = []) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidar = () => qc.invalidateQueries({ queryKey: dealKeys.all(orgId) });
  /*
   * Estágio vai pelo NOME, não pelo uuid: o histórico é para leitura humana, e
   * "Proposta → Negociação" diz algo que dois uuids não dizem.
   */
  const nomeEstagio = (id?: string | null) => stages.find((s) => s.id === id)?.name ?? null;

  /**
   * Mudança de estágio — a operação mais frequente da tela, e a única com
   * arrasto atrás.
   *
   * `onMutate` põe o card na coluna nova antes da resposta; sem isso ele volta
   * para a origem e salta de novo quando o servidor confirma. `onSuccess` não
   * invalida: o cache já está correto, e invalidar aqui refaria a query inteira
   * a cada arrasto — exatamente o custo que a Sessão 5 removeu.
   */
  const changeStage = useMutation({
    mutationFn: async ({ deal, stageId }: { deal: Deal; stageId: string }) => {
      const { data, error } = await supabase
        .from("deals").update({ stage_id: stageId }).eq("id", deal.id).select().single();
      if (error) throw error;

      void logAudit({
        orgId: deal.org_id, action: "update", entityType: "deal", entityId: deal.id,
        oldValues: { stage: nomeEstagio(deal.stage_id) },
        newValues: { stage: nomeEstagio(stageId) },
      });
      fireAutomations(orgId, "deal.stage_changed", { deal_id: deal.id, stage_id: stageId });
      return data as Deal;
    },
    onMutate: async ({ deal, stageId }) => {
      await qc.cancelQueries({ queryKey: dealKeys.all(orgId) });
      const anterior = snapshotListas(qc, orgId);
      patchDealNoCache(qc, orgId, deal.id, { stage_id: stageId });
      return { anterior };
    },
    /*
     * A linha devolvida pelo update entra no cache no lugar do patch otimista.
     * Sem isto, `updated_at` (e qualquer coluna que um trigger tenha mexido)
     * ficaria com o valor de antes da escrita até a próxima busca — o cache
     * pareceria correto e estaria um passo atrás do banco. Não custa
     * requisição: é o retorno do próprio UPDATE.
     */
    onSuccess: (row) => patchDealNoCache(qc, orgId, row.id, row),
    onError: (_e, _v, ctx) => { if (ctx) restaurar(qc, ctx.anterior); },
  });

  const create = useMutation({
    mutationFn: async (form: Partial<Deal>) => {
      const { data, error } = await supabase.from("deals").insert({
        org_id: orgId!, title: form.title!, value: Number(form.value) || 0,
        currency: form.currency || "BRL", stage_id: form.stage_id,
        probability: Number(form.probability) || 0, close_date: form.close_date,
        status: "open", owner_id: form.owner_id || user?.id,
        contact_id: form.contact_id || null, company_id: form.company_id || null,
      }).select().single();
      if (error) throw error;

      void logAudit({
        orgId: orgId!, action: "create", entityType: "deal", entityId: data.id,
        newValues: { title: form.title, value: Number(form.value) || 0 },
      });
      fireWebhook(orgId, "deal.created", data ?? {});
      if (data.contact_id) applyScoreEvent(orgId!, data.contact_id, "deal_created");
      return data as Deal;
    },
    onSuccess: invalidar,
  });

  const update = useMutation({
    mutationFn: async ({ deal, patch }: { deal: Deal; patch: Partial<Deal> }) => {
      const { data, error } = await supabase
        .from("deals").update(patch as any).eq("id", deal.id).select().single();
      if (error) throw error;

      void logAudit({
        orgId: deal.org_id, action: "update", entityType: "deal", entityId: deal.id,
        oldValues: {
          title: deal.title, value: deal.value, probability: deal.probability,
          close_date: deal.close_date, stage: nomeEstagio(deal.stage_id),
        },
        newValues: {
          ...patch,
          ...(patch.stage_id !== undefined ? { stage: nomeEstagio(patch.stage_id) } : {}),
        },
      });
      return data as Deal;
    },
    // Edição pode mudar contato/empresa, e aí o join precisa vir do servidor.
    onSuccess: invalidar,
  });

  /** Ganho/perdido de um negócio só. */
  const setStatus = useMutation({
    mutationFn: async ({ deal, status, lossReason }: {
      deal: Deal; status: "won" | "lost"; lossReason?: string;
    }) => {
      const patch = status === "won"
        ? { status } as Partial<Deal>
        : { status, loss_reason: lossReason ?? null } as Partial<Deal>;
      const { data, error } = await supabase
        .from("deals").update(patch as any).eq("id", deal.id).select().single();
      if (error) throw error;

      // Antes da migração, marcar um negócio como ganho ou perdido pela tela de
      // Negócios não gravava nada em audit_logs — só o DealDetail e o lote
      // gravavam. O Histórico do negócio pulava direto do "criado" para o que
      // viesse depois, sem o desfecho.
      void logAudit({
        orgId: deal.org_id, action: "update", entityType: "deal", entityId: deal.id,
        oldValues: { status: deal.status },
        newValues: status === "won" ? { status } : { status, loss_reason: lossReason ?? null },
      });
      const evento = status === "won" ? "deal.won" : "deal.lost";
      const payload = status === "won"
        ? { deal_id: deal.id, title: deal.title, value: deal.value }
        : { deal_id: deal.id, title: deal.title, loss_reason: lossReason ?? null };
      fireWebhook(orgId, evento, payload);
      fireAutomations(orgId, evento, payload);
      return data as Deal;
    },
    onSuccess: (row) => patchDealNoCache(qc, orgId, row.id, row),
  });

  return { create, update, changeStage, setStatus, invalidar };
}

export function useDealBulkMutation(stages: { id: string; name: string }[] = []) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: dealKeys.all(orgId) });

  /** Uma entrada por entidade: cada linha do log é uma ação atômica. */
  const registrar = (
    negocios: DealWithRelations[],
    op: "delete" | "update",
    novos?: Record<string, unknown>,
  ) => {
    negocios.forEach((d) => {
      void logAudit({
        orgId: orgId!, action: op, entityType: "deal", entityId: d.id,
        oldValues: op === "delete"
          ? { title: d.title, value: d.value, status: d.status }
          : { status: d.status },
        newValues: novos,
      });
    });
  };

  const bulkDelete = useMutation({
    mutationFn: async (negocios: DealWithRelations[]) => {
      await Promise.all(negocios.map((d) => supabase.from("deals").delete().eq("id", d.id)));
      registrar(negocios, "delete");
      return negocios.length;
    },
    onSuccess: invalidar,
  });

  const bulkSetStatus = useMutation({
    mutationFn: async ({ negocios, status }: {
      negocios: DealWithRelations[]; status: "won" | "lost";
    }) => {
      await Promise.all(
        negocios.map((d) => supabase.from("deals").update({ status }).eq("id", d.id)),
      );
      registrar(negocios, "update", { status });
      const evento = status === "won" ? "deal.won" : "deal.lost";
      negocios.forEach((d) => {
        fireWebhook(orgId, evento, { deal_id: d.id });
        fireAutomations(orgId, evento, { deal_id: d.id });
      });
      return negocios.length;
    },
    onSuccess: ({ }, { negocios, status }) => {
      // Status não mexe em vínculo: dá para aplicar direto, sem refetch.
      negocios.forEach((d) => patchDealNoCache(qc, orgId, d.id, { status } as Partial<Deal>));
    },
  });

  return { bulkDelete, bulkSetStatus, invalidar };
}

/** Nova atividade num negócio. */
export function useDealActivityMutation(dealId: string | null | undefined) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (form: { type: Database["public"]["Enums"]["activity_type"]; title: string; body: string }) => {
      const { error } = await supabase.from("activities").insert({
        org_id: orgId!, deal_id: dealId!, type: form.type,
        title: form.title, body: form.body, user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dealKeys.activities(orgId, dealId) }),
  });
}
