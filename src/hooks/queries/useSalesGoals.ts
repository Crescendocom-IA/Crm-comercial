import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type SalesGoal = Database["public"]["Tables"]["sales_goals"]["Row"];

/*
 * Metas de vendas do período (mês/ano). Os "realizados" NÃO são uma coluna: são
 * derivados dos deals ganhos, atividades e contatos criados no período. A hook
 * de realizados entrega esses dados crus do período; a tela calcula
 * current_value por meta em memória (respeitando a atribuição individual/equipe/
 * org), que é onde essa lógica sempre viveu.
 */

export interface GoalPeriod {
  month: number;
  year: number;
}

export const salesGoalKeys = {
  all: (orgId: string | null | undefined) => ["sales-goals", orgId] as const,
  list: (orgId: string | null | undefined, period: GoalPeriod) =>
    ["sales-goals", orgId, "list", period] as const,
  actuals: (orgId: string | null | undefined, period: GoalPeriod) =>
    ["sales-goals", orgId, "actuals", period] as const,
};

export function useSalesGoalsQuery(period: GoalPeriod) {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: salesGoalKeys.list(orgId, period),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_goals").select("*")
        .eq("org_id", orgId!).eq("period_month", period.month).eq("period_year", period.year);
      if (error) throw error;
      return (data || []) as SalesGoal[];
    },
  });
  return { goals: query.data ?? [], isLoading: query.isLoading };
}

export interface GoalActuals {
  wonDeals: { id: string; value: number | null; owner_id: string | null }[];
  activities: { id: string; user_id: string | null }[];
  newContacts: { id: string; owner_id: string | null }[];
}

/** Dados crus do período para computar os realizados de cada meta na tela. */
export function useSalesGoalActualsQuery(period: GoalPeriod) {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: salesGoalKeys.actuals(orgId, period),
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async (): Promise<GoalActuals> => {
      const startDate = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
      const endMonth = period.month === 12 ? 1 : period.month + 1;
      const endYear = period.month === 12 ? period.year + 1 : period.year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const [wd, act, nc] = await Promise.all([
        supabase.from("deals").select("id, value, owner_id").eq("org_id", orgId!)
          .eq("status", "won").gte("updated_at", startDate).lt("updated_at", endDate),
        supabase.from("activities").select("id, user_id").eq("org_id", orgId!)
          .gte("created_at", startDate).lt("created_at", endDate),
        supabase.from("contacts").select("id, owner_id").eq("org_id", orgId!)
          .gte("created_at", startDate).lt("created_at", endDate),
      ]);
      return {
        wonDeals: (wd.data || []) as any[],
        activities: (act.data || []) as any[],
        newContacts: (nc.data || []) as any[],
      };
    },
  });
  return query.data ?? { wonDeals: [], activities: [], newContacts: [] };
}

export function useSalesGoalMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: salesGoalKeys.all(orgId) });

  const save = useMutation({
    mutationFn: async ({ id, payload }: { id?: string; payload: Record<string, unknown> }) => {
      if (id) {
        const { error } = await supabase.from("sales_goals").update(payload as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales_goals").insert({ ...payload, org_id: orgId! } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { save, remove, invalidar };
}
