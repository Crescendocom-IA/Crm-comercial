import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useStagesQuery, usePipelinesQuery, useMembersQuery, useCompanyOptionsQuery } from "./useOrgOptions";
import { STALE_TIME } from "./config";

/*
 * Relatórios seguem o padrão do Dashboard: uma leitura por domínio, todas as
 * agregações derivadas em memória por sub-relatório. Não há hook por relatório.
 *
 * deals/activities/contacts ficam sob os prefixos de domínio (['deals'|
 * 'activities'|'contacts', orgId, 'reports']); estágios, pipelines, membros e
 * empresas vêm de useOrgOptions. Assim uma mutação de negócio já mantém os
 * relatórios frescos.
 */

export function useReportsData() {
  const { orgId } = useOrg();

  const deals = useQuery({
    queryKey: ["deals", orgId, "reports"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const activities = useQuery({
    queryKey: ["activities", orgId, "reports"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const contacts = useQuery({
    queryKey: ["contacts", orgId, "reports"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts")
        .select("id,first_name,last_name,status,lead_score,created_at,owner_id").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const stages = useStagesQuery();
  const pipelines = usePipelinesQuery();
  const members = useMembersQuery();
  const companies = useCompanyOptionsQuery();

  return {
    deals: deals.data ?? [],
    activities: activities.data ?? [],
    contacts: contacts.data ?? [],
    stages,
    pipelines,
    members,
    companies,
    isLoading: deals.isLoading || activities.isLoading || contacts.isLoading,
  };
}

/** Edição inline de probabilidade no Forecast — invalida os deals de todas as telas. */
export function useDealProbabilityMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, probability }: { dealId: string; probability: number }) => {
      const { error } = await supabase.from("deals").update({ probability }).eq("id", dealId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals", orgId] }),
  });
}
