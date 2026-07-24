import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useStagesQuery, useMembersQuery, usePipelinesQuery } from "./useOrgOptions";
import { STALE_TIME } from "./config";

/*
 * O Dashboard não lê agregações prontas do servidor: ele puxa deals, atividades
 * e contatos crus e deriva todos os KPIs e gráficos em memória. Isso tem uma
 * consequência de desenho: KPIs e gráficos saem do MESMO conjunto de dados.
 *
 * Por isso não há uma query por KPI e outra por gráfico. Seriam duas leituras
 * da mesma tabela `deals`, com o risco pior de os dois blocos refletirem
 * snapshots diferentes — o número do topo dizendo uma coisa e o gráfico logo
 * abaixo dizendo outra. Uma fonte só, várias derivações.
 *
 * As chaves ficam sob os prefixos de domínio (['deals', orgId, 'dashboard'],
 * etc.), não sob ['dashboard', ...]: assim, fechar um negócio na tela de
 * Negócios — que invalida ['deals', orgId] — já atualiza o dashboard, que é
 * exatamente o "quero ver o número novo depois de fechar" pedido. Um prefixo
 * ['dashboard'] isolado não seria alcançado por mutação nenhuma.
 *
 * O staleTime honra "15s KPIs / 30s gráficos" na FONTE: deals e contatos, que
 * alimentam os KPIs, ficam nos 15s; atividades, que só alimentam gráficos,
 * nos 30s. Como um gráfico pode ler deals, ele herda a frescura mais curta —
 * o que é estritamente melhor, não pior.
 */

const REFETCH_INTERVAL = 5 * 60 * 1000;

type Deal = {
  id: string; title: string; value: number | null; stage_id: string | null;
  status: string | null; owner_id: string | null; close_date: string | null;
  probability: number | null; created_at: string | null; updated_at: string | null;
  contact_id: string | null; company_id: string | null; currency: string | null;
};
type ActivityRow = {
  id: string; type: string; title: string; due_date: string | null;
  completed_at: string | null; created_at: string | null; user_id: string | null;
  deal_id: string | null; contact_id: string | null;
};
type Contact = {
  id: string; first_name: string; last_name: string | null;
  lead_score: number; status: string | null; created_at: string | null;
};

export type PeriodFilter = "today" | "this_week" | "this_month" | "this_quarter" | "this_year" | "all";

export interface DashboardFilters {
  period: PeriodFilter;
  ownerFilter: string;   // "all" ou um id de membro
  pipelineFilter: string; // "all" ou um id de pipeline
}

/* ── Helpers de período ──────────────────────────────────────────────────── */

export function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  switch (period) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "this_week": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; }
    case "this_month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "this_quarter": return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case "this_year": return new Date(now.getFullYear(), 0, 1);
    case "all": return null;
  }
}

export function inPeriod(dateStr: string | null, start: Date | null): boolean {
  if (!start || !dateStr) return true;
  return new Date(dateStr) >= start;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/* ── Camada de dados crus ─────────────────────────────────────────────────── */

/**
 * As leituras cruas do dashboard, uma vez só e compartilhadas.
 *
 * Cada seção (KPIs, gráficos, risco) chama este hook; o React Query dedupe as
 * três chamadas na mesma query, então não há refetch repetido. Estágios,
 * membros e pipelines vêm de useOrgOptions — as mesmas chaves que as outras
 * telas já usam.
 */
export function useDashboardData() {
  const { orgId } = useOrg();

  const dealsQuery = useQuery({
    queryKey: ["deals", orgId, "dashboard"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    refetchInterval: REFETCH_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Deal[];
    },
  });

  const activitiesQuery = useQuery({
    queryKey: ["activities", orgId, "dashboard"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    refetchInterval: REFETCH_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase.from("activities").select("*")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as ActivityRow[];
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["contacts", orgId, "dashboard"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.counts,
    refetchInterval: REFETCH_INTERVAL,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts").select("id,first_name,last_name,lead_score,status,created_at")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });

  const stages = useStagesQuery();
  const members = useMembersQuery();
  const pipelines = usePipelinesQuery();

  const qc = useQueryClient();
  const refetch = () => {
    // O botão de atualizar força as três leituras cruas; config muda pouco.
    void dealsQuery.refetch();
    void activitiesQuery.refetch();
    void contactsQuery.refetch();
  };

  return {
    deals: dealsQuery.data ?? [],
    activities: activitiesQuery.data ?? [],
    contacts: contactsQuery.data ?? [],
    stages,
    members,
    pipelines,
    // isLoading só na primeira carga (sem cache); refetch e auto-refresh mantêm
    // isLoading falso e não piscam skeleton — o que o hasLoadedOnce fazia à mão.
    isLoading: dealsQuery.isLoading || activitiesQuery.isLoading || contactsQuery.isLoading,
    isFetching: dealsQuery.isFetching || activitiesQuery.isFetching || contactsQuery.isFetching,
    // Momento do dado mais recente entre as três leituras, para o "Atualizado HH:MM".
    updatedAt: Math.max(dealsQuery.dataUpdatedAt, activitiesQuery.dataUpdatedAt, contactsQuery.dataUpdatedAt),
    refetch,
    qc,
  };
}

/* ── Recorte comum ────────────────────────────────────────────────────────── */

/**
 * Filtragem por responsável e pipeline — que é recorte de VISÃO, não de dados.
 * Fica em memória de propósito: pôr owner/pipeline na chave da query refariam a
 * leitura a cada troca de filtro, sendo que os dados são os mesmos. Mesma
 * decisão que manteve o pipeline fora da chave em Negócios.
 */
function useRecorte(filters: DashboardFilters) {
  const { deals, activities, stages, contacts, members, pipelines, ...rest } = useDashboardData();
  const { period, ownerFilter, pipelineFilter } = filters;

  // getPeriodStart devolve um Date novo a cada chamada; memoizar por `period`
  // impede que todos os derivados recalculem a cada render, e congela o "agora"
  // enquanto o filtro não muda.
  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (ownerFilter !== "all") list = list.filter((d) => d.owner_id === ownerFilter);
    if (pipelineFilter !== "all") {
      const pipeStages = stages.filter((s) => s.pipeline_id === pipelineFilter).map((s) => s.id);
      list = list.filter((d) => d.stage_id && pipeStages.includes(d.stage_id));
    }
    return list;
  }, [deals, ownerFilter, pipelineFilter, stages]);

  const periodDeals = useMemo(
    () => filteredDeals.filter((d) => inPeriod(d.created_at, periodStart)),
    [filteredDeals, periodStart],
  );

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (ownerFilter !== "all") list = list.filter((a) => a.user_id === ownerFilter);
    return list.filter((a) => inPeriod(a.created_at, periodStart));
  }, [activities, ownerFilter, periodStart]);

  return {
    filteredDeals, periodDeals, filteredActivities, periodStart,
    stages, contacts, members, pipelines, ...rest,
  };
}

/* ── KPIs ─────────────────────────────────────────────────────────────────── */

const MONTHLY_GOAL = 100000;

export function useDashboardKpis(filters: DashboardFilters) {
  const {
    filteredDeals, periodDeals, filteredActivities, periodStart, contacts,
    isLoading, isFetching, updatedAt, refetch,
  } = useRecorte(filters);

  const kpis = useMemo(() => {
    const wonDeals = periodDeals.filter((d) => d.status === "won");
    const lostDeals = periodDeals.filter((d) => d.status === "lost");
    const openDeals = filteredDeals.filter((d) => d.status === "open");
    const totalClosed = wonDeals.length + lostDeals.length;
    const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const pipelineValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

    const avgCycle = wonDeals.length === 0 ? 0 : Math.round(
      wonDeals.reduce((s, d) => {
        if (!d.created_at) return s;
        const created = new Date(d.created_at);
        const updated = d.updated_at ? new Date(d.updated_at) : new Date();
        return s + Math.floor((updated.getTime() - created.getTime()) / 86400000);
      }, 0) / wonDeals.length,
    );

    // Comparação com o período anterior — só para mês e trimestre.
    let prevPeriodRevenue = 0;
    if (filters.period === "this_month" || filters.period === "this_quarter") {
      const now = new Date();
      let prevStart: Date; let prevEnd: Date;
      if (filters.period === "this_month") {
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      } else {
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        prevStart = new Date(now.getFullYear(), qStart - 3, 1);
        prevEnd = new Date(now.getFullYear(), qStart, 0);
      }
      prevPeriodRevenue = filteredDeals
        .filter((d) => d.status === "won" && d.created_at && new Date(d.created_at) >= prevStart && new Date(d.created_at) <= prevEnd)
        .reduce((s, d) => s + (Number(d.value) || 0), 0);
    }
    const revenueVariation = prevPeriodRevenue > 0
      ? Math.round(((wonRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100) : 0;

    return {
      wonRevenue, wonDealsCount: wonDeals.length, lostDealsCount: lostDeals.length,
      openDealsCount: openDeals.length, totalClosed,
      winRate: pct(wonDeals.length, totalClosed),
      avgTicket: wonDeals.length > 0 ? wonRevenue / wonDeals.length : 0,
      pipelineValue, avgCycle, revenueVariation, monthlyGoal: MONTHLY_GOAL,
      contactsCount: contacts.length,
      newLeadsCount: contacts.filter((c) => inPeriod(c.created_at, periodStart)).length,
      pendingActivities: filteredActivities.filter((a) => !a.completed_at).length,
    };
  }, [filteredDeals, periodDeals, filteredActivities, periodStart, contacts, filters.period]);

  return { kpis, isLoading, isFetching, updatedAt, refetch };
}

/* ── Gráficos ─────────────────────────────────────────────────────────────── */

export function useDashboardCharts(filters: DashboardFilters) {
  const {
    filteredDeals, filteredActivities, contacts, stages, members, periodStart, isLoading,
  } = useRecorte(filters);
  const { pipelineFilter } = filters;

  const openDeals = useMemo(() => filteredDeals.filter((d) => d.status === "open"), [filteredDeals]);
  const wonDeals = useMemo(() => filteredDeals.filter((d) => d.status === "won"), [filteredDeals]);

  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const data: { month: string; receita: number; tendencia: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthWon = filteredDeals.filter((deal) => {
        if (deal.status !== "won" || !deal.created_at) return false;
        const c = new Date(deal.created_at);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
      });
      data.push({
        month: MONTHS_PT[d.getMonth()],
        receita: monthWon.reduce((s, deal) => s + (Number(deal.value) || 0), 0),
        tendencia: 0,
      });
    }
    for (let i = 0; i < data.length; i++) {
      const window = data.slice(Math.max(0, i - 2), i + 1);
      data[i].tendencia = Math.round(window.reduce((s, d) => s + d.receita, 0) / window.length);
    }
    return data;
  }, [filteredDeals]);

  const funnelData = useMemo(() => {
    const pipeStages = pipelineFilter !== "all"
      ? stages.filter((s) => s.pipeline_id === pipelineFilter) : stages;
    return pipeStages.map((s) => {
      const stageDeals = openDeals.filter((d) => d.stage_id === s.id);
      return {
        name: s.name,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
        color: s.color || "hsl(var(--primary))",
      };
    });
  }, [stages, openDeals, pipelineFilter]);

  const actByType = useMemo(() => {
    const map: Record<string, number> = {};
    filteredActivities.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1; });
    const labels: Record<string, string> = { call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa" };
    return Object.entries(map).map(([type, count]) => ({ name: labels[type] || type, value: count }));
  }, [filteredActivities]);

  const topPerformers = useMemo(() =>
    members.map((m) => {
      const mWon = wonDeals.filter((d) => d.owner_id === m.id);
      return {
        name: m.name || m.email || "—",
        deals: mWon.length,
        revenue: mWon.reduce((s, d) => s + (Number(d.value) || 0), 0),
      };
    }).filter((m) => m.deals > 0).sort((a, b) => b.revenue - a.revenue),
    [members, wonDeals],
  );

  const actByDay = useMemo(() => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const counts = new Array(7).fill(0);
    filteredActivities.forEach((a) => { if (a.created_at) counts[new Date(a.created_at).getDay()]++; });
    return days.map((d, i) => ({ day: d, count: counts[i] }));
  }, [filteredActivities]);

  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0-20", min: 0, max: 20, count: 0 },
      { label: "21-40", min: 21, max: 40, count: 0 },
      { label: "41-60", min: 41, max: 60, count: 0 },
      { label: "61-80", min: 61, max: 80, count: 0 },
      { label: "81-100", min: 81, max: 100, count: 0 },
    ];
    contacts.forEach((c) => {
      const s = c.lead_score || 0;
      const bucket = buckets.find((b) => s >= b.min && s <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [contacts]);

  const newLeadsByStatus = useMemo(() => {
    const periodContacts = contacts.filter((c) => inPeriod(c.created_at, periodStart));
    const map: Record<string, number> = {};
    periodContacts.forEach((c) => { const s = c.status || "lead"; map[s] = (map[s] || 0) + 1; });
    const labels: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned" };
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [contacts, periodStart]);

  return {
    monthlyRevenue, funnelData, actByType, actByDay, topPerformers,
    scoreDistribution, newLeadsByStatus, isLoading,
  };
}

/* ── Em risco (o bloco do dashboard, não o painel global) ─────────────────── */

export function useDashboardAtRisk(filters: DashboardFilters) {
  const { filteredDeals } = useRecorte(filters);
  const openDeals = useMemo(() => filteredDeals.filter((d) => d.status === "open"), [filteredDeals]);

  return useMemo(() => {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);

    const inactive = openDeals
      .filter((d) => (!d.updated_at ? true : new Date(d.updated_at) < fourteenDaysAgo))
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
      .slice(0, 5);

    const closingSoon = openDeals
      .filter((d) => {
        if (!d.close_date) return false;
        const cd = new Date(d.close_date);
        return cd <= sevenDaysFromNow && (Number(d.probability) || 0) < 50;
      })
      .sort((a, b) => new Date(a.close_date!).getTime() - new Date(b.close_date!).getTime());

    return { inactive, closingSoon };
  }, [openDeals]);
}
