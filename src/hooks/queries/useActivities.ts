import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { applyScoreEvent } from "@/lib/scoring";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];

/*
 * Atividades e Tarefas dividem a tabela `activities` (Tarefa = atividade com
 * type='task'). As duas telas carregam o recorte inteiro e derivam em memória
 * — Atividades tem visão de calendário, Tarefas soma contagens e stats, e
 * ambas filtram por data/dono/busca sem ida ao servidor. Paginar quebraria o
 * calendário e as contagens, então o desenho é o mesmo do Dashboard: uma
 * leitura, várias derivações. Por isso os hooks não recebem os filtros —
 * quem filtra é a tela, em useMemo, como já fazia.
 *
 * As chaves ficam sob o prefixo de domínio ['activities', orgId, ...]. Como o
 * Dashboard lê atividades sob ['activities', orgId, 'dashboard'], uma mutação
 * aqui — que invalida o prefixo — também atualiza os gráficos de atividade de
 * lá, sem as telas se conhecerem.
 *
 * Não há hook de ação em lote: nenhuma das duas telas tem seleção múltipla.
 * Criar um sem consumidor seria código morto.
 */

export const activityKeys = {
  all: (orgId: string | null | undefined) => ["activities", orgId] as const,
  list: (orgId: string | null | undefined) => ["activities", orgId, "list"] as const,
  tasks: (orgId: string | null | undefined) => ["activities", orgId, "tasks"] as const,
};

/** Todas as atividades da org (todos os tipos) — a tela de Atividades. */
export function useActivitiesQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: activityKeys.list(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*")
        .eq("org_id", orgId!).order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Activity[];
    },
  });
  return { activities: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching };
}

/**
 * Só as tarefas (type='task') — a tela de Tarefas.
 *
 * O filtro por tipo vai no servidor porque é o recorte permanente da tela (ela
 * nunca mostra outros tipos), diferente de Atividades, que carrega tudo e filtra
 * o tipo em memória. Mantém o volume igual ao que a tela já trazia.
 */
export function useTasksQuery() {
  const { orgId } = useOrg();
  const query = useQuery({
    queryKey: activityKeys.tasks(orgId),
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*")
        .eq("org_id", orgId!).eq("type", "task").order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Activity[];
    },
  });
  return { tasks: query.data ?? [], isLoading: query.isLoading, isFetching: query.isFetching };
}

export function useActivityMutation() {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: activityKeys.all(orgId) });
    // Uma atividade nova/removida muda a inatividade do contato, derivada numa
    // chave de outro domínio — sem isto, a coluna "dias sem atividade" de
    // Contatos ficaria velha até expirar sozinha.
    qc.invalidateQueries({ queryKey: ["contacts", orgId, "last-activity"] });
  };

  const create = useMutation({
    mutationFn: async (payload: ActivityInsert) => {
      const { data, error } = await supabase.from("activities").insert(payload).select().single();
      if (error) throw error;
      /*
       * Lead scoring só ao CRIAR (edição não repontua) e só para meeting/call
       * com contato — os eventos de engajamento. Tarefas não pontuam.
       */
      const evento = payload.type === "meeting" ? "meeting_done"
        : payload.type === "call" ? "call_done" : null;
      if (evento && payload.contact_id) applyScoreEvent(orgId!, payload.contact_id, evento);
      return data as Activity;
    },
    onSuccess: invalidar,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ActivityInsert> }) => {
      const { error } = await supabase.from("activities").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  /** Alterna concluído/pendente pela data — o clique no checkbox da lista. */
  const toggleComplete = useMutation({
    mutationFn: async (activity: Activity) => {
      const completed_at = activity.completed_at ? null : new Date().toISOString();
      const { error } = await supabase.from("activities").update({ completed_at }).eq("id", activity.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });

  return { create, update, remove, toggleComplete, invalidar };
}
