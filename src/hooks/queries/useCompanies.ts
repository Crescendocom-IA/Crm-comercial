import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { logAudit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhooks";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

export const COMPANIES_PAGE_SIZE = 50;

export interface CompanyFilters {
  industry?: string;
  size?: string;
  ownerId?: string;
}

export type CompanySortKey = "name" | "domain" | "industry" | "size" | "revenue" | "created_at";
export type CompanySortDir = "asc" | "desc";

export interface CompaniesQueryParams {
  page: number;
  search: string;
  filters: CompanyFilters;
  sortKey: CompanySortKey;
  sortDir: CompanySortDir;
}

/*
 * Mesma árvore de chaves de contatos:
 *
 *   ['companies', orgId]                        -> tudo de empresas da org
 *   ['companies', orgId, 'list',    { params }] -> uma página/recorte
 *   ['companies', orgId, 'detail',  id]         -> uma empresa
 *   ['companies', orgId, 'options']             -> o select de empresa (useOrgOptions)
 *
 * O 'options' de Contatos entra debaixo do mesmo prefixo de propósito: criar
 * uma empresa aqui invalida ['companies', orgId] e o select da tela de
 * Contatos se atualiza sozinho, sem as duas telas se conhecerem.
 */
export const companyKeys = {
  all: (orgId: string | null | undefined) => ["companies", orgId] as const,
  list: (orgId: string | null | undefined, params: CompaniesQueryParams) =>
    ["companies", orgId, "list", params] as const,
  detail: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["companies", orgId, "detail", id] as const,
  related: (orgId: string | null | undefined, id: string | null | undefined) =>
    ["companies", orgId, "related", id] as const,
};

/** Busca e filtros na query, não em memória. Exportado para o export de CSV. */
export function applyCompanyFilters<T>(q: T, search: string, filters: CompanyFilters): T {
  let out = q as any;
  if (search) {
    // Vírgula e parênteses são sintaxe do .or() do PostgREST.
    const term = search.replace(/[,()]/g, " ").trim();
    if (term) out = out.or(`name.ilike.%${term}%,domain.ilike.%${term}%,industry.ilike.%${term}%`);
  }
  if (filters.industry) out = out.eq("industry", filters.industry);
  if (filters.size) out = out.eq("size", filters.size);
  if (filters.ownerId) out = out.eq("owner_id", filters.ownerId);
  return out as T;
}

export function applyCompanySort<T>(q: T, sortKey: CompanySortKey, sortDir: CompanySortDir): T {
  return (q as any).order(sortKey, { ascending: sortDir === "asc" }) as T;
}

/** Lista paginada + contagem total do recorte. */
export function useCompaniesQuery(params: CompaniesQueryParams) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: companyKeys.list(orgId, params),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    // Mantém a página anterior na tela enquanto a nova carrega, em vez de
    // piscar o skeleton a cada tecla digitada na busca.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("companies").select("*", { count: "exact" }).eq("org_id", orgId!);
      q = applyCompanySort(applyCompanyFilters(q, params.search, params.filters), params.sortKey, params.sortDir);
      const from = params.page * COMPANIES_PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + COMPANIES_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as Company[], count: count ?? 0 };
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
 * Uma empresa pelo id.
 *
 * Usado em dois lugares: o drawer (com a linha da lista como placeholder, para
 * abrir preenchido) e o deep-link /companies?id=<uuid>, que precisa buscar
 * direto — com paginação no servidor a empresa do link pode estar em qualquer
 * página, e procurá-la na lista carregada nunca a encontraria.
 */
export function useCompanyQuery(id: string | null | undefined, placeholder?: Company | null) {
  const { orgId } = useOrg();

  return useQuery({
    queryKey: companyKeys.detail(orgId, id),
    enabled: !!orgId && !!id,
    staleTime: STALE_TIME.detail,
    placeholderData: placeholder ?? undefined,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });
}

/** Contatos, negócios e estágios de uma empresa — o conteúdo das abas do drawer. */
export function useCompanyRelatedQuery(company: Company | null) {
  const { orgId } = useOrg();

  const query = useQuery({
    queryKey: companyKeys.related(orgId, company?.id),
    enabled: !!company,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const [cRes, dRes, sRes] = await Promise.all([
        supabase.from("contacts").select("*").eq("company_id", company!.id),
        supabase.from("deals").select("*").eq("company_id", company!.id),
        supabase.from("pipeline_stages").select("*").eq("org_id", company!.org_id).order("order"),
      ]);
      return {
        contacts: (cRes.data || []) as Contact[],
        deals: (dRes.data || []) as Deal[],
        stages: (sRes.data || []) as Stage[],
      };
    },
  });

  return {
    contacts: query.data?.contacts ?? [],
    deals: query.data?.deals ?? [],
    stages: query.data?.stages ?? [],
    isLoading: query.isLoading,
  };
}

/** Campos editáveis — o par old/new do log de auditoria sai daqui. */
const CAMPOS_EDITAVEIS = [
  "name", "domain", "industry", "size", "revenue", "website", "linkedin_url",
] as const;

const recorte = (c: Record<string, any>) =>
  Object.fromEntries(CAMPOS_EDITAVEIS.map((k) => [k, c[k] ?? null]));

export function useCompanyMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidar = () => qc.invalidateQueries({ queryKey: companyKeys.all(orgId) });

  const create = useMutation({
    mutationFn: async ({ form, contatosParaVincular }: {
      form: {
        name: string; domain?: string; industry?: string; size?: string;
        revenue?: string | number | null; website?: string; linkedin_url?: string;
      };
      contatosParaVincular?: string[];
    }) => {
      const { data, error } = await supabase.from("companies").insert({
        org_id: orgId!, name: form.name, domain: form.domain || null,
        industry: form.industry || null, size: form.size || null,
        revenue: form.revenue ? Number(form.revenue) : null,
        website: form.website || null, linkedin_url: form.linkedin_url || null,
        owner_id: user?.id,
      }).select().single();
      if (error) throw error;

      void logAudit({
        orgId: orgId!, action: "create", entityType: "company", entityId: data.id,
        newValues: { name: form.name, domain: form.domain || null, industry: form.industry || null },
      });
      fireWebhook(orgId!, "company.created", { id: data.id, name: form.name });

      const ids = contatosParaVincular ?? [];
      if (ids.length) {
        await Promise.all(
          ids.map((cid) => supabase.from("contacts").update({ company_id: data.id }).eq("id", cid)),
        );
      }
      return { company: data as Company, vinculados: ids.length };
    },
    onSuccess: ({ vinculados }) => {
      invalidar();
      // Vincular contatos altera a coluna Empresa deles; sem isto a lista de
      // Contatos continuaria mostrando o vínculo antigo até expirar sozinha.
      if (vinculados > 0) qc.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ company, patch }: { company: Company; patch: Partial<Company> }) => {
      const { error } = await supabase.from("companies").update(patch as any).eq("id", company.id);
      if (error) throw error;
      void logAudit({
        orgId: company.org_id, action: "update", entityType: "company", entityId: company.id,
        oldValues: recorte(company as any), newValues: patch as Record<string, any>,
      });
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (company: Company) => {
      const { error } = await supabase.from("companies").delete().eq("id", company.id);
      if (error) throw error;
      void logAudit({
        orgId: company.org_id, action: "delete", entityType: "company", entityId: company.id,
        oldValues: { name: company.name, domain: company.domain },
      });
    },
    onSuccess: invalidar,
  });

  return { create, update, remove, invalidar };
}

/**
 * Ações em lote. Recebem as empresas inteiras, não os ids: depois do delete não
 * há de onde ler o nome, e um histórico que não diz qual empresa sumiu não
 * ajuda ninguém.
 */
export function useCompanyBulkMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: companyKeys.all(orgId) });

  const bulkDelete = useMutation({
    mutationFn: async (empresas: Company[]) => {
      await Promise.all(empresas.map((c) => supabase.from("companies").delete().eq("id", c.id)));
      // Uma entrada por entidade: cada linha do log é uma ação atômica.
      empresas.forEach((c) => {
        void logAudit({
          orgId: orgId!, action: "delete", entityType: "company", entityId: c.id,
          oldValues: { name: c.name, domain: c.domain },
        });
      });
      return empresas.length;
    },
    onSuccess: () => {
      invalidar();
      // Contatos apontam para a empresa apagada; a coluna Empresa deles muda.
      qc.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });

  return { bulkDelete, invalidar };
}
