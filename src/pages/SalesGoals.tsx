import { useState, useMemo } from "react";
import {
  useSalesGoalsQuery, useSalesGoalActualsQuery, useSalesGoalMutation,
} from "@/hooks/queries/useSalesGoals";
import { useMembersQuery } from "@/hooks/queries/useOrgOptions";
import { useTeamsQuery } from "@/hooks/queries/useTeam";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Trash2, Target, Users, Building2, TrendingUp, Pencil,
  ChevronLeft, ChevronRight, Trophy, Phone, Mail, Handshake, UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOAL_TYPES = [
  { value: "revenue", label: "Receita (R$)", icon: TrendingUp, color: "text-chart-2" },
  { value: "deals_closed", label: "Deals Fechados", icon: Handshake, color: "text-chart-1" },
  { value: "activities", label: "Atividades", icon: Phone, color: "text-chart-3" },
  { value: "new_contacts", label: "Novos Contatos", icon: UserPlus, color: "text-chart-5" },
];

const ASSIGN_TYPES = [
  { value: "individual", label: "Vendedor", icon: Target },
  { value: "team", label: "Time", icon: Users },
  { value: "org", label: "Organização", icon: Building2 },
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type SalesGoal = {
  id: string;
  org_id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_month: number;
  period_year: number;
  assign_type: string;
  user_id: string | null;
  team_id: string | null;
  created_by: string | null;
};

type Member = { id: string; name: string | null; email: string | null };
type Team = { id: string; name: string };

export default function SalesGoals() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { goals: rawGoals, isLoading: loading } = useSalesGoalsQuery({ month, year });
  const actuals = useSalesGoalActualsQuery({ month, year });
  const members = useMembersQuery() as Member[];
  const { teams, teamMembers } = useTeamsQuery();
  const { save: saveGoalMut, remove: removeGoalMut } = useSalesGoalMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SalesGoal | null>(null);

  // Form
  const [form, setForm] = useState({
    goal_type: "revenue",
    target_value: "",
    assign_type: "individual",
    user_id: "",
    team_id: "",
  });

  /*
   * Realizados derivados em memória (padrão Dashboard): a query traz os dados
   * crus do período e o current_value de cada meta sai do recorte por
   * atribuição — individual, equipe ou org.
   */
  const goals = useMemo(() => {
    const teamMap = new Map<string, string[]>();
    (teamMembers as any[]).forEach((r) => {
      const arr = teamMap.get(r.team_id) || [];
      arr.push(r.user_id);
      teamMap.set(r.team_id, arr);
    });
    return rawGoals.map((g) => {
      const filterByAssign = (items: { owner_id?: string | null; user_id?: string | null }[]) => {
        if (g.assign_type === "org") return items;
        if (g.assign_type === "individual" && g.user_id) {
          return items.filter((i) => (i.owner_id || i.user_id) === g.user_id);
        }
        if (g.assign_type === "team" && g.team_id) {
          const tMembers = teamMap.get(g.team_id) || [];
          return items.filter((i) => tMembers.includes((i.owner_id || i.user_id) as string));
        }
        return items;
      };
      let current = 0;
      switch (g.goal_type) {
        case "revenue":
          current = filterByAssign(actuals.wonDeals).reduce((sum, d) => sum + (Number((d as any).value) || 0), 0);
          break;
        case "deals_closed": current = filterByAssign(actuals.wonDeals).length; break;
        case "activities": current = filterByAssign(actuals.activities).length; break;
        case "new_contacts": current = filterByAssign(actuals.newContacts).length; break;
      }
      return { ...g, current_value: current };
    });
  }, [rawGoals, actuals, teamMembers]);

  const openCreate = () => {
    setEditGoal(null);
    setForm({ goal_type: "revenue", target_value: "", assign_type: "individual", user_id: "", team_id: "" });
    setDialogOpen(true);
  };

  const openEdit = (g: SalesGoal) => {
    setEditGoal(g);
    setForm({
      goal_type: g.goal_type,
      target_value: String(g.target_value),
      assign_type: g.assign_type,
      user_id: g.user_id || "",
      team_id: g.team_id || "",
    });
    setDialogOpen(true);
  };

  const saveGoal = () => {
    const payload = {
      goal_type: form.goal_type,
      target_value: parseFloat(form.target_value) || 0,
      period_month: month,
      period_year: year,
      assign_type: form.assign_type,
      user_id: form.assign_type === "individual" ? form.user_id || null : null,
      team_id: form.assign_type === "team" ? form.team_id || null : null,
      created_by: user?.id || null,
    };
    saveGoalMut.mutate({ id: editGoal?.id, payload }, {
      onSuccess: () => { setDialogOpen(false); toast({ title: editGoal ? "Meta atualizada" : "Meta criada" }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const deleteGoal = (id: string) =>
    removeGoalMut.mutate(id, { onSuccess: () => toast({ title: "Meta excluída" }) });

  const navMonth = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const getAssignLabel = (g: SalesGoal) => {
    if (g.assign_type === "org") return "Organização";
    if (g.assign_type === "team") return teams.find((t) => t.id === g.team_id)?.name || "Time";
    return members.find((m) => m.id === g.user_id)?.name || "Vendedor";
  };

  const goalTypeInfo = (type: string) => GOAL_TYPES.find((gt) => gt.value === type) || GOAL_TYPES[0];

  const formatValue = (type: string, value: number) => {
    if (type === "revenue") return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
    return String(value);
  };

  const pct = (current: number, target: number) => target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  // Group goals by type for summary cards
  const summaryByType = useMemo(() => {
    return GOAL_TYPES.map((gt) => {
      const typeGoals = goals.filter((g) => g.goal_type === gt.value);
      const totalTarget = typeGoals.reduce((s, g) => s + Number(g.target_value), 0);
      const totalCurrent = typeGoals.reduce((s, g) => s + Number(g.current_value), 0);
      return { ...gt, count: typeGoals.length, totalTarget, totalCurrent };
    }).filter((s) => s.count > 0);
  }, [goals]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas de Vendas</h1>
          <p className="text-muted-foreground text-sm">Gerencie metas por vendedor, time ou organização</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />Nova Meta
        </Button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[180px] text-center">
          {MONTHS[month - 1]} {year}
        </span>
        <Button variant="ghost" size="icon" onClick={() => navMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      {summaryByType.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryByType.map((s) => {
            const Icon = s.icon;
            const p = pct(s.totalCurrent, s.totalTarget);
            return (
              <Card key={s.value}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${s.color}`} />
                    <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="text-xl font-bold">{formatValue(s.value, s.totalCurrent)}</div>
                  <div className="text-xs text-muted-foreground mb-2">de {formatValue(s.value, s.totalTarget)}</div>
                  <Progress value={p} className="h-1.5" />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{p}% atingido</span>
                    {p >= 100 && <Trophy className="h-3 w-3 text-warning" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Goals Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Metas do Período</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Target className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma meta definida para este mês</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}>
                <Plus className="mr-1 h-3 w-3" />Criar primeira meta
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Atribuição</TableHead>
                  <TableHead className="text-xs text-right">Meta</TableHead>
                  <TableHead className="text-xs text-right">Atual</TableHead>
                  <TableHead className="text-xs w-[140px]">Progresso</TableHead>
                  <TableHead className="text-xs w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => {
                  const info = goalTypeInfo(g.goal_type);
                  const Icon = info.icon;
                  const p = pct(Number(g.current_value), Number(g.target_value));
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                          {info.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs">
                          {getAssignLabel(g)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {formatValue(g.goal_type, Number(g.target_value))}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {formatValue(g.goal_type, Number(g.current_value))}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={p} className="h-1.5 flex-1" />
                          <span className={`text-xs font-medium ${p >= 100 ? "text-success" : ""}`}>
                            {p}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(g)} className="p-1 text-muted-foreground hover:text-foreground">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <ConfirmDeleteDialog
                            title="Excluir meta?"
                            onConfirm={() => deleteGoal(g.id)}
                            trigger={
                              <button className="p-1 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{editGoal ? "Editar Meta" : "Nova Meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Tipo de meta</Label>
              <Select value={form.goal_type} onValueChange={(v) => setForm({ ...form, goal_type: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((gt) => (
                    <SelectItem key={gt.value} value={gt.value}>{gt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Valor da meta</Label>
              <Input
                type="number"
                value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                placeholder={form.goal_type === "revenue" ? "50000" : "10"}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Atribuir a</Label>
              <Select value={form.assign_type} onValueChange={(v) => setForm({ ...form, assign_type: v, user_id: "", team_id: "" })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGN_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.assign_type === "individual" && (
              <div className="space-y-1">
                <Label className="text-xs">Vendedor</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.assign_type === "team" && (
              <div className="space-y-1">
                <Label className="text-xs">Time</Label>
                <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v })}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveGoal}>{editGoal ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
