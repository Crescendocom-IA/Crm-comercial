import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";

/*
 * Integrações: configs por provider (Slack, ERP, Resend...), webhooks e chaves
 * de API. Cada uma sob seu prefixo de domínio. Os botões de testar (slack-connect,
 * test-resend, etc) são invoke de edge function — não passam por React Query e
 * ficam como estão.
 */

export const integrationKeys = {
  configs: (orgId: string | null | undefined) => ["integrations", orgId, "configs"] as const,
  webhooks: (orgId: string | null | undefined) => ["integrations", orgId, "webhooks"] as const,
  apiKeys: (orgId: string | null | undefined) => ["integrations", orgId, "api-keys"] as const,
};

/* ── Configs de integração ────────────────────────────────────────────────── */

export function useIntegrationsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: integrationKeys.configs(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await (supabase.from("integration_configs").select("*").eq("org_id", orgId!) as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return { configs: query.data ?? [], isLoading: query.isLoading };
}

export function useIntegrationMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: integrationKeys.configs(orgId) });

  /** Cria ou atualiza a config de um provider (upsert manual por existência). */
  const saveConfig = useMutation({
    mutationFn: async ({ id, provider, config, connectedBy }: {
      id?: string; provider: string; config: unknown; connectedBy?: string;
    }) => {
      if (id) {
        const { error } = await (supabase.from("integration_configs")
          .update({ config, is_active: true } as any).eq("id", id) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("integration_configs")
          .insert({ org_id: orgId!, provider, config, connected_by: connectedBy } as any) as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase.from("integration_configs")
        .update({ is_active: active } as any).eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { saveConfig, toggle, invalidar };
}

/* ── Webhooks ─────────────────────────────────────────────────────────────── */

export function useWebhooksQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: integrationKeys.webhooks(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await (supabase.from("webhooks").select("*").eq("org_id", orgId!) as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return { webhooks: query.data ?? [], isLoading: query.isLoading };
}

export function useWebhookMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: integrationKeys.webhooks(orgId) });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await (supabase.from("webhooks").insert({ ...payload, org_id: orgId! } as any) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase.from("webhooks").update({ is_active: active } as any).eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { create, remove, toggle, invalidar };
}

/* ── Chaves de API ────────────────────────────────────────────────────────── */

export function useApiKeysQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: integrationKeys.apiKeys(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await (supabase.from("api_keys").select("*").eq("org_id", orgId!) as any);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return { apiKeys: query.data ?? [], isLoading: query.isLoading };
}

export function useApiKeyMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: integrationKeys.apiKeys(orgId) });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await (supabase.from("api_keys").insert({ ...payload, org_id: orgId! } as any) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Revoga sem apagar: mantém o histórico da chave, só desativa. */
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("api_keys").update({ is_active: false } as any).eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { create, revoke, remove, invalidar };
}
