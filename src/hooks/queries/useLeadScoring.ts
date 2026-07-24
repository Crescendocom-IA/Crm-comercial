import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type ScoringRule = Database["public"]["Tables"]["lead_scoring_rules"]["Row"];

/*
 * Motor de lead scoring: regras, contatos pontuados, segmentos e histórico.
 * A tela carrega tudo e filtra em memória (histórico por contato), então não
 * há useLeadScoreHistoryQuery(contactId) — carrega o histórico inteiro (limite
 * de 200) e a tela recorta.
 *
 * Os contatos pontuados ficam sob ['contacts', orgId, 'scored']: assim uma
 * mutação de regra ou um ajuste manual — que invalidam ['contacts', orgId] —
 * atualizam o ranking, e o score novo também aparece na lista de Contatos.
 */

export const scoringKeys = {
  all: (orgId: string | null | undefined) => ["lead-scoring", orgId] as const,
  rules: (orgId: string | null | undefined) => ["lead-scoring", orgId, "rules"] as const,
  segments: (orgId: string | null | undefined) => ["lead-scoring", orgId, "segments"] as const,
  history: (orgId: string | null | undefined) => ["lead-scoring", orgId, "history"] as const,
  contacts: (orgId: string | null | undefined) => ["contacts", orgId, "scored"] as const,
};

export function useLeadScoringRulesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: scoringKeys.rules(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_scoring_rules").select("*")
        .eq("org_id", orgId!).order("points", { ascending: false });
      if (error) throw error;
      return (data || []) as ScoringRule[];
    },
  });
  return { rules: query.data ?? [], isLoading: query.isLoading };
}

export function useScoredContactsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: scoringKeys.contacts(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts")
        .select("id,first_name,last_name,email,status,lead_score,org_id,created_at,owner_id")
        .eq("org_id", orgId!).order("lead_score", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useSegmentsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: scoringKeys.segments(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("segments").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useLeadScoreHistoryQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: scoringKeys.history(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_score_history").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  return query.data ?? [];
}

export function useLeadScoringRuleMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: scoringKeys.rules(orgId) });
    // O score dos contatos aparece na lista de Contatos; mudar as regras deve
    // refletir lá (e no ranking pontuado, sob o mesmo prefixo).
    qc.invalidateQueries({ queryKey: ["contacts", orgId, "list"] });
    qc.invalidateQueries({ queryKey: scoringKeys.contacts(orgId) });
  };

  const save = useMutation({
    mutationFn: async ({ id, label, eventType, points }: {
      id?: string; label: string; eventType: string; points: number;
    }) => {
      if (id) {
        const { error } = await supabase.from("lead_scoring_rules")
          .update({ label, event_type: eventType, points } as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lead_scoring_rules")
          .insert({ org_id: orgId!, label, event_type: eventType, points } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("lead_scoring_rules")
        .update({ is_active: active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Ajuste de pontos vindo do RulePointsInput (já debounced na tela). */
  const updatePoints = useMutation({
    mutationFn: async ({ id, points }: { id: string; points: number }) => {
      const { error } = await supabase.from("lead_scoring_rules")
        .update({ points } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_scoring_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const seed = useMutation({
    mutationFn: async (rows: any[]) => {
      const { error } = await supabase.from("lead_scoring_rules").insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { save, toggle, updatePoints, remove, seed };
}

/** Ajuste manual de score: atualiza o contato e registra no histórico. */
export function useScoreAdjustMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, newScore, delta, reason }: {
      contactId: string; newScore: number; delta: number; reason: string;
    }) => {
      const up = await supabase.from("contacts").update({ lead_score: newScore } as any).eq("id", contactId);
      if (up.error) throw up.error;
      const hist = await supabase.from("lead_score_history").insert({
        org_id: orgId!, contact_id: contactId, points: delta, reason,
      } as any);
      if (hist.error) throw hist.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scoringKeys.history(orgId) });
      qc.invalidateQueries({ queryKey: scoringKeys.contacts(orgId) });
      // O score mudou; a lista de Contatos precisa refletir.
      qc.invalidateQueries({ queryKey: ["contacts", orgId, "list"] });
    },
  });
}

export function useSegmentMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: scoringKeys.segments(orgId) });

  const save = useMutation({
    mutationFn: async ({ id, name, description, filters }: {
      id?: string; name: string; description: string | null; filters: unknown;
    }) => {
      if (id) {
        const { error } = await supabase.from("segments")
          .update({ name, description, filters } as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("segments")
          .insert({ org_id: orgId!, name, description, filters, created_by: user?.id } as any);
        if (error) throw error;
      }
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { save, remove };
}
