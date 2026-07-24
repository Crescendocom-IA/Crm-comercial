import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Sequence = Database["public"]["Tables"]["email_sequences"]["Row"];
type Step = Database["public"]["Tables"]["email_sequence_steps"]["Row"];
type Enrollment = Database["public"]["Tables"]["email_sequence_enrollments"]["Row"];

/*
 * A tela é master-detail: carrega as sequências, TODOS os passos e TODAS as
 * inscrições da org, e agrupa por sequence_id em memória. O detalhe é a
 * sequência selecionada no estado local, não uma buscada por id — por isso
 * não há useEmailSequenceQuery(id): a filtragem por sequência é um
 * `steps.filter(...)` trivial na tela, e envolvê-la numa hook sem ninguém
 * mais consumindo seria indireção sem ganho.
 *
 * Passos e inscrições ficam sob o mesmo prefixo ['email-sequences', orgId],
 * então qualquer mutação — criar sequência, adicionar passo, inscrever
 * contato — invalida o conjunto todo de uma vez.
 */

export const sequenceKeys = {
  all: (orgId: string | null | undefined) => ["email-sequences", orgId] as const,
  sequences: (orgId: string | null | undefined) => ["email-sequences", orgId, "list"] as const,
  steps: (orgId: string | null | undefined) => ["email-sequences", orgId, "steps"] as const,
  enrollments: (orgId: string | null | undefined) => ["email-sequences", orgId, "enrollments"] as const,
};

export function useEmailSequencesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: sequenceKeys.sequences(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_sequences").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Sequence[];
    },
  });
  return { sequences: query.data ?? [], isLoading: query.isLoading };
}

export function useSequenceStepsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: sequenceKeys.steps(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_sequence_steps").select("*")
        .eq("org_id", orgId!).order("step_order");
      if (error) throw error;
      return (data || []) as Step[];
    },
  });
  return query.data ?? [];
}

export function useSequenceEnrollmentsQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: sequenceKeys.enrollments(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_sequence_enrollments").select("*")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Enrollment[];
    },
  });
  return query.data ?? [];
}

export function useEmailSequenceMutation() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: sequenceKeys.all(orgId) });

  const create = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string | null }) => {
      const { error } = await supabase.from("email_sequences").insert({
        org_id: orgId!, name, description, created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const toggleActive = useMutation({
    // Param estreito (id + estado atual) para não acoplar ao Row completo da tela.
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("email_sequences")
        .update({ is_active: !isActive } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { create, toggleActive, remove, invalidar };
}

export function useSequenceStepMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: sequenceKeys.all(orgId) });

  const add = useMutation({
    mutationFn: async (step: {
      sequenceId: string; stepOrder: number; delayDays: number;
      subject: string; bodyHtml: string | null;
    }) => {
      const { error } = await supabase.from("email_sequence_steps").insert({
        sequence_id: step.sequenceId, org_id: orgId!,
        step_order: step.stepOrder, delay_days: step.delayDays,
        subject: step.subject, body_html: step.bodyHtml,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_sequence_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { add, remove, invalidar };
}

export function useSequenceEnrollmentMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const invalidar = () => qc.invalidateQueries({ queryKey: sequenceKeys.all(orgId) });

  /** Inscreve um contato; next_send_at sai do delay do primeiro passo. */
  const enroll = useMutation({
    mutationFn: async ({ sequenceId, contactId, firstStepDelayDays }: {
      sequenceId: string; contactId: string; firstStepDelayDays: number;
    }) => {
      const nextSend = new Date();
      nextSend.setDate(nextSend.getDate() + firstStepDelayDays);
      const { error } = await supabase.from("email_sequence_enrollments").insert({
        sequence_id: sequenceId, org_id: orgId!, contact_id: contactId,
        current_step: 0, status: "active", next_send_at: nextSend.toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { enroll, invalidar };
}
