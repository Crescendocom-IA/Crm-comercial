import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];

/*
 * Configurações da organização. As chaves ficam sob os prefixos de domínio
 * reais (['organizations'|'pipelines'|'pipeline_stages'|'custom_field_
 * definitions', orgId]) em vez de um ['settings'] isolado — assim uma escrita
 * de pipeline invalida o mesmo prefixo que o Kanban lê, e editar as indústrias
 * na aba Geral atualiza o select de indústria em Empresas, sem as telas se
 * conhecerem.
 */

/* ── Organização ──────────────────────────────────────────────────────────── */

export function useOrganizationQuery() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["organizations", orgId, "detail"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId!).single();
      if (error) throw error;
      return data as Organization;
    },
  });
}

export function useOrganizationMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  // Prefixo, não só o detail: settings.industries alimenta useIndustriesQuery,
  // que vive sob ['organizations', orgId, 'industries'].
  const invalidar = () => qc.invalidateQueries({ queryKey: ["organizations", orgId] });

  const update = useMutation({
    mutationFn: async (patch: Partial<Organization>) => {
      const { error } = await supabase.from("organizations").update(patch as any).eq("id", orgId!);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { update, invalidar };
}

/* ── Pipelines e estágios ─────────────────────────────────────────────────── */
/* As queries de leitura são as de useOrgOptions (usePipelinesQuery/useStagesQuery). */

function invalidarPipelines(qc: ReturnType<typeof useQueryClient>, orgId: string | null | undefined) {
  qc.invalidateQueries({ queryKey: ["pipelines", orgId] });
  qc.invalidateQueries({ queryKey: ["pipeline_stages", orgId] });
  // Kanban e forecast leem estágios; mudar um estágio muda as colunas lá.
  qc.invalidateQueries({ queryKey: ["deals", orgId] });
}

export function usePipelineMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async ({ name, isDefault }: { name: string; isDefault: boolean }) => {
      const { data, error } = await supabase.from("pipelines")
        .insert({ org_id: orgId!, name, is_default: isDefault }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidarPipelines(qc, orgId),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Estágios primeiro: sem cascade, apagar o pipeline deixaria estágios órfãos.
      await supabase.from("pipeline_stages").delete().eq("pipeline_id", id);
      const { error } = await supabase.from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarPipelines(qc, orgId),
  });

  return { create, remove };
}

export function useStageMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async (stage: {
      pipelineId: string; name: string; order: number; color: string; winProbability: number;
    }) => {
      const { error } = await supabase.from("pipeline_stages").insert({
        org_id: orgId!, pipeline_id: stage.pipelineId, name: stage.name,
        order: stage.order, color: stage.color, win_probability: stage.winProbability,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarPipelines(qc, orgId),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidarPipelines(qc, orgId),
  });

  /** Troca a ordem de dois estágios numa tacada. */
  const swapOrder = useMutation({
    mutationFn: async ({ a, b }: { a: { id: string; order: number }; b: { id: string; order: number } }) => {
      await Promise.all([
        supabase.from("pipeline_stages").update({ order: b.order }).eq("id", a.id),
        supabase.from("pipeline_stages").update({ order: a.order }).eq("id", b.id),
      ]);
    },
    onSuccess: () => invalidarPipelines(qc, orgId),
  });

  return { add, remove, swapOrder };
}

/* ── Razões de perda ──────────────────────────────────────────────────────── */

export function useLossReasonsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["loss_reasons", orgId] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await (supabase.from("loss_reasons").select("*").eq("org_id", orgId!) as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useLossReasonMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: ["loss_reasons", orgId] });

  const add = useMutation({
    mutationFn: async (label: string) => {
      const { error } = await (supabase.from("loss_reasons").insert({ org_id: orgId!, label } as any) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loss_reasons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
  return { add, remove };
}

/* ── Campos customizados ──────────────────────────────────────────────────── */

/**
 * Todos os campos customizados da org. A tela filtra por entity_type em memória
 * (troca de aba sem refetch), então a query não recebe o tipo — igual ao que a
 * versão com useEffect fazia.
 */
export function useCustomFieldsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["custom_field_definitions", orgId] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await (supabase.from("custom_field_definitions").select("*")
        .eq("org_id", orgId!).order("field_order") as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useCustomFieldsMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  // Um campo novo/removido muda como contatos, empresas ou negócios são
  // exibidos; invalida o cache da entidade dona do campo, além dos próprios.
  const invalidar = (entityType?: string) => {
    qc.invalidateQueries({ queryKey: ["custom_field_definitions", orgId] });
    const dominio = { contacts: "contacts", companies: "companies", deals: "deals" }[entityType ?? ""];
    if (dominio) qc.invalidateQueries({ queryKey: [dominio, orgId] });
  };

  const create = useMutation({
    mutationFn: async (field: {
      entityType: string; fieldKey: string; fieldLabel: string; fieldType: string;
      isRequired: boolean; showInTable: boolean; showInCard: boolean;
      options: string[]; fieldOrder: number;
    }) => {
      const { error } = await (supabase.from("custom_field_definitions").insert({
        org_id: orgId!, entity_type: field.entityType, field_key: field.fieldKey,
        field_label: field.fieldLabel, field_type: field.fieldType, is_required: field.isRequired,
        show_in_table: field.showInTable, show_in_card: field.showInCard,
        options: field.options, field_order: field.fieldOrder,
      } as any) as any);
      if (error) throw error;
      return field.entityType;
    },
    onSuccess: (entityType) => invalidar(entityType),
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; entityType: string }) => {
      const { error } = await supabase.from("custom_field_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, { entityType }) => invalidar(entityType),
  });

  return { create, remove };
}

/* ── Preferências de notificação (por usuário na org) ─────────────────────── */

export function useNotificationPrefsQuery(userId: string | undefined) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["notification_preferences", orgId, userId] as const,
    enabled: !!orgId && !!userId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data } = await supabase.from("notification_preferences").select("*")
        .eq("user_id", userId!).eq("org_id", orgId!).maybeSingle();
      return data as any;
    },
  });
}

export function useNotificationPrefsMutation(userId: string | undefined) {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: Record<string, unknown>) => {
      const { error } = await supabase.from("notification_preferences").upsert({
        user_id: userId!, org_id: orgId!, ...prefs,
      } as any, { onConflict: "user_id,org_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification_preferences", orgId, userId] }),
  });
}

/* ── Uso da org (aba Plano) ───────────────────────────────────────────────── */

export function useOrgUsageQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: ["organizations", orgId, "usage"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      const [c, d, co] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId!),
        supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId!),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("org_id", orgId!),
      ]);
      return { contacts: c.count ?? 0, deals: d.count ?? 0, companies: co.count ?? 0 };
    },
  });
  return query.data ?? { contacts: 0, deals: 0, companies: 0 };
}
