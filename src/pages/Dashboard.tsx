import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useOrg } from "@/hooks/useOrg";
import {
  useDashboardData, useDashboardKpis, useDashboardCharts, useDashboardAtRisk,
  type PeriodFilter, type DashboardFilters,
} from "@/hooks/queries/useDashboard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  DollarSign, Users, Handshake, TrendingUp, TrendingDown,
  Target, Clock, AlertTriangle, RefreshCw, ArrowRight,
  CalendarDays, Award, BarChart3,
} from "lucide-react";
import { DashboardAIChat } from "@/components/crm/DashboardAIChat";

// ── Helpers ──────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 11,
};

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
  "hsl(var(--chart-7))", "hsl(var(--chart-8))",
];

// ── Gauge component ─────────────────────────
function GaugeChart({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const angle = (percentage / 100) * 180;
  const color = percentage >= 100 ? "hsl(var(--success))" : percentage >= 70 ? "hsl(var(--primary))" : percentage >= 40 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
        {/* Value arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 251.2} 251.2`}
        />
        <text x="100" y="85" textAnchor="middle" className="fill-foreground" fontSize="28" fontWeight="700">
          {Math.round(percentage)}%
        </text>
        <text x="100" y="110" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
          {label}
        </text>
      </svg>
      <p className="text-xs text-muted-foreground mt-1">{fmt(value)} / {fmt(max)}</p>
    </div>
  );
}

// ── Main ─────────────────────────────────────
export default function Dashboard() {
  const { orgId } = useOrg();
  const navigate = useNavigate();

  // Filtros — recorte de visão, aplicado em memória sobre os dados em cache.
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const filters: DashboardFilters = { period, ownerFilter, pipelineFilter };

  const { members, pipelines, contacts, isLoading, isFetching, updatedAt, refetch } = useDashboardData();
  const { kpis } = useDashboardKpis(filters);
  const {
    monthlyRevenue, funnelData, actByType, actByDay,
    topPerformers, scoreDistribution, newLeadsByStatus,
  } = useDashboardCharts(filters);
  const atRiskDeals = useDashboardAtRisk(filters);

  // Nomes curtos para o JSX abaixo não mudar.
  const {
    wonRevenue, wonDealsCount, lostDealsCount, openDealsCount, totalClosed,
    winRate, avgTicket, pipelineValue, avgCycle, revenueVariation, monthlyGoal,
    contactsCount, newLeadsCount, pendingActivities,
  } = kpis;
  const lastRefresh = new Date(updatedAt);
  // O botão gira enquanto revalida, mesmo sem trocar o skeleton.
  const loading = isLoading;

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="mb-2 text-xl font-semibold">Bem-vindo ao FlowCRM!</h2>
        <p className="text-muted-foreground">Vá em Configurações para criar sua organização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header + Filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Atualizado {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="this_week">Esta semana</SelectItem>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="this_quarter">Trimestre</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda equipe</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {pipelines.length > 1 && (
            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos pipelines</SelectItem>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Gira enquanto revalida (isFetching), não só na primeira carga. */}
          <Button variant="outline" size="sm" className="h-8" onClick={refetch} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {/*
        Durante a primeira carga os KPIs renderizariam com zeros — "R$ 0",
        "0 negócios" — indistinguíveis de uma conta vazia. isLoading do React
        Query é verdadeiro só enquanto não há cache; no auto-refresh e no botão
        ele é falso e os dados atuais permanecem, sem piscar o skeleton. É o que
        o hasLoadedOnce fazia à mão.
      */}
      {loading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" role="status" aria-label="Carregando indicadores">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-2.5 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita</span>
              <DollarSign className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="text-xl font-bold">{fmt(wonRevenue)}</p>
            {revenueVariation !== 0 && (
              <div className={`flex items-center gap-0.5 text-xs ${revenueVariation > 0 ? "text-success" : "text-destructive"}`}>
                {revenueVariation > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {revenueVariation > 0 ? "+" : ""}{revenueVariation}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ganhos</span>
              <Handshake className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="text-xl font-bold">{wonDealsCount}</p>
            <p className="text-xs text-muted-foreground">{fmt(pipelineValue)} em pipeline</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</span>
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{winRate}%</p>
            <p className="text-xs text-muted-foreground">{totalClosed} fechados</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ticket Médio</span>
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{fmt(avgTicket)}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/activities")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ciclo Médio</span>
              <Clock className="h-3.5 w-3.5 text-warning" />
            </div>
            <p className="text-xl font-bold">{avgCycle}</p>
            <p className="text-xs text-muted-foreground">dias</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/contacts")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contatos</span>
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{contactsCount}</p>
            <p className="text-xs text-muted-foreground">{newLeadsCount} novos</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* ── Row 1: Revenue chart + Goal gauge ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Receita Mensal (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyRevenue}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" fill="url(#colorRevenue)" strokeWidth={2} />
                <Line type="monotone" dataKey="tendencia" stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meta do Mês</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <GaugeChart value={wonRevenue} max={monthlyGoal} label={fmt(monthlyGoal)} />
          </CardContent>
        </Card>
      </div>



      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Pipeline por Estágio</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/deals")}>
                Ver pipeline <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {funnelData.length > 0 ? (
              <div className="space-y-2">
                {funnelData.map((s, i) => {
                  const maxVal = Math.max(...funnelData.map((f) => f.value), 1);
                  return (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium">{s.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{s.count} negócios</span>
                          <span className="font-medium text-foreground">{fmt(s.value)}</span>
                        </div>
                      </div>
                      <div className="h-5 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded transition-all flex items-center justify-end pr-1"
                          style={{
                            width: `${Math.max((s.value / maxVal) * 100, 3)}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividades por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {actByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={actByType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {actByType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">Nenhuma atividade</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Top performers + Activity heatmap ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Award className="h-4 w-4 text-warning" />Top Performers</CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-2">
                {topPerformers.slice(0, 5).map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warning/20 text-warning" : i === 1 ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <span className="text-xs font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="secondary" className="text-xs">{p.deals} deals</Badge>
                      <span className="text-xs font-bold text-success">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividades por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={actByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Leads + Score distribution ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Novos Contatos por Status</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/contacts")}>
                Ver todos <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {newLeadsByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={newLeadsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {newLeadsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Distribuição de Lead Score</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/lead-scoring")}>
                Ver scoring <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {scoreDistribution.map((_, i) => (
                    <Cell key={i} fill={["hsl(var(--muted-foreground))", "hsl(var(--warning))", "hsl(38, 92%, 50%)", "hsl(var(--primary))", "hsl(var(--success))"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: At-risk deals ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />Negócios sem Atividade ({">"}14 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskDeals.inactive.length > 0 ? (
              <div className="space-y-2">
                {atRiskDeals.inactive.map((d) => {
                  const daysSince = d.updated_at ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000) : 999;
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 p-2 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate(`/deals/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{daysSince} dias sem atividade</p>
                      </div>
                      <span className="text-xs font-bold text-destructive shrink-0">{fmt(Number(d.value) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">Nenhum negócio em risco 🎉</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-warning" />Fechamento Próximo (prob {"<"} 50%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskDeals.closingSoon.length > 0 ? (
              <div className="space-y-2">
                {atRiskDeals.closingSoon.slice(0, 5).map((d) => {
                  const daysLeft = d.close_date ? Math.ceil((new Date(d.close_date).getTime() - Date.now()) / 86400000) : 0;
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-warning/20 bg-warning/5 p-2 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate(`/deals/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {daysLeft <= 0 ? "Vencido" : `${daysLeft} dias`} · {Number(d.probability) || 0}% prob
                        </p>
                      </div>
                      <span className="text-xs font-bold text-warning shrink-0">{fmt(Number(d.value) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">Nenhum negócio com fechamento próximo</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── AI Sales Manager Chat ── */}
      <DashboardAIChat
        crmData={{
          wonRevenue,
          pipelineValue,
          openDealsCount,
          winRate,
          avgTicket,
          avgCycle,
          wonDealsCount,
          lostDealsCount,
          pendingActivities,
          newLeadsCount,
          atRiskDeals: atRiskDeals.inactive.map((d) => ({
            title: d.title,
            value: Number(d.value) || 0,
            daysSinceUpdate: d.updated_at ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000) : 999,
          })),
          closingSoonDeals: atRiskDeals.closingSoon.map((d) => ({
            title: d.title,
            value: Number(d.value) || 0,
            daysLeft: d.close_date ? Math.ceil((new Date(d.close_date).getTime() - Date.now()) / 86400000) : 0,
            probability: Number(d.probability) || 0,
          })),
          topPerformers,
          funnelData: funnelData.map((f) => ({ name: f.name, count: f.count, value: f.value })),
        }}
      />
    </div>
  );
}
