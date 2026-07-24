import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

export type Automation = Database["public"]["Tables"]["automations"]["Row"];
type AutomationLog = Database["public"]["Tables"]["automation_logs"]["Row"];

/*
 * Automações. A tela carrega a lista e os logs (feed de execuções, limitado a
 * 100) e filtra os logs por automação em memória — não há fetch por id, então
 * useAutomationLogsQuery não recebe automationId.
 *
 * Uma mutação de automação NÃO invalida deals/contacts: o executor
 * client-side lê esses dados por conta própria quando dispara, então a
 * configuração da automação e os dados de negócio são caches independentes.
 */

export const automationKeys = {
  all: (orgId: string | null | undefined) => ["automations", orgId] as const,
  list: (orgId: string | null | undefined) => ["automations", orgId, "list"] as const,
  logs: (orgId: string | null | undefined) => ["automations", orgId, "logs"] as const,
};

export function useAutomationsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: automationKeys.list(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("automations").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Automation[];
    },
  });
  return { automations: query.data ?? [], isLoading: query.isLoading };
}

export function useAutomationLogsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: automationKeys.logs(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_logs").select("*")
        .eq("org_id", orgId!).order("executed_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as AutomationLog[];
    },
  });
  return query.data ?? [];
}

function patchAutomation(qc: QueryClient, orgId: string | null | undefined, id: string, patch: Partial<Automation>) {
  qc.setQueryData<Automation[]>(automationKeys.list(orgId), (old) =>
    old?.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function useAutomationMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: automationKeys.all(orgId) });

  const save = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      if (id) {
        // Editar não mexe no is_active: preserva ligada/desligada como estava.
        const { error } = await supabase.from("automations").update(payload as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("automations").insert({ ...payload, org_id: orgId!, is_active: true } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  /**
   * Liga/desliga. Otimista e sem refetch: é a operação mais frequente da tela e
   * um refetch a cada clique piscaria a lista inteira (mesmo padrão do markRead
   * do Inbox).
   */
  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("automations").update({ is_active: active } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, active }) => patchAutomation(qc, orgId, id, { is_active: active }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const duplicate = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("automations").insert({ ...payload, org_id: orgId!, is_active: false } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { save, toggleActive, remove, duplicate, invalidar };
}
