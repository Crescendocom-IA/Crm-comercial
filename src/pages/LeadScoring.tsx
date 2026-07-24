import { useEffect, useRef, useState, useMemo } from "react";
import {
  useLeadScoringRulesQuery, useScoredContactsQuery, useSegmentsQuery,
  useLeadScoreHistoryQuery, useLeadScoringRuleMutation, useScoreAdjustMutation,
  useSegmentMutation,
} from "@/hooks/queries/useLeadScoring";
import { useMembersQuery } from "@/hooks/queries/useOrgOptions";
import { useRole } from "@/hooks/useRole";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Zap, Edit2, Trash2, MoreHorizontal, Download, Users, Filter,
  TrendingUp, TrendingDown, Target, Search, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeadScoreBadge } from "@/components/crm/DealQualification";

type Contact = {
  id: string; first_name: string; last_name: string | null; email: string | null;
  status: string | null; lead_score: number; org_id: string; created_at: string | null;
  owner_id: string | null;
};
type Segment = {
  id: string; org_id: string; name: string; description: string | null;
  filters: any; created_by: string | null; created_at: string | null;
};
type ScoringRule = {
  id: string; org_id: string; event_type: string; label: string;
  points: number; is_active: boolean;
};
type ScoreHistory = {
  id: string; contact_id: string; points: number; reason: string;
  event_type: string | null; created_at: string | null;
};
type Profile = {
  id: string; name: string | null; email: string | null;
};

const DEFAULT_RULES = [
  { event_type: "email_opened", label: "Abertura de email", points: 5 },
  { event_type: "link_clicked", label: "Clique em link", points: 10 },
  { event_type: "meeting_done", label: "Reunião realizada", points: 20 },
  { event_type: "email_replied", label: "Resposta a email", points: 15 },
  { event_type: "website_visit", label: "Visita ao website", points: 3 },
  { event_type: "inactivity_30d", label: "Inatividade 30 dias", points: -10 },
];

type Tab = "scoring" | "segments" | "history";

const EVENT_TYPES = [
  { value: "email_opened", label: "Abertura de email" },
  { value: "link_clicked", label: "Clique em link" },
  { value: "meeting_done", label: "Reunião realizada" },
  { value: "email_replied", label: "Resposta a email" },
  { value: "website_visit", label: "Visita ao website" },
  { value: "form_submitted", label: "Formulário enviado" },
  { value: "deal_created", label: "Negócio criado" },
  { value: "call_done", label: "Ligação realizada" },
  { value: "inactivity_30d", label: "Inatividade 30 dias" },
  { value: "custom", label: "Personalizado" },
];

/**
 * Input de pontos com escrita debounced. Mantém o valor local enquanto o usuário
 * digita e só chama onCommit 500ms após parar — evita um UPDATE por tecla.
 */
function RulePointsInput({ initial, onCommit }: { initial: number; onCommit: (points: number) => void }) {
  const [value, setValue] = useState(initial);
  const debounced = useDebounce(value, 500);

  // Sincroniza com o valor externo (ex: após refetch) sem sobrescrever digitação.
  useEffect(() => { setValue(initial); }, [initial]);

  useEffect(() => {
    if (debounced !== initial) onCommit(debounced);
    // onCommit/initial fora das deps de propósito: só persistir quando o debounce assenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => setValue(Number(e.target.value))}
      className="w-16 h-6 text-xs text-center"
    />
  );
}

export default function LeadScoring() {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("scoring");
  const [pendingDeleteRule, setPendingDeleteRule] = useState<string | null>(null);
  const { canDelete } = useRole();
  const [pendingDeleteSegment, setPendingDeleteSegment] = useState<string | null>(null);
  const contacts = useScoredContactsQuery() as Contact[];
  const { rules } = useLeadScoringRulesQuery();
  const segments = useSegmentsQuery() as Segment[];
  const history = useLeadScoreHistoryQuery() as ScoreHistory[];
  const members = useMembersQuery() as Profile[];
  const { save: saveRuleMut, toggle: toggleRuleMut, updatePoints, remove: removeRuleMut, seed } = useLeadScoringRuleMutation();
  const adjustScore = useScoreAdjustMutation();
  const { save: saveSegmentMut, remove: removeSegmentMut } = useSegmentMutation();
  const [search, setSearch] = useState("");

  // Segment form
  const [segFormOpen, setSegFormOpen] = useState(false);
  const [segName, setSegName] = useState("");
  const [segDesc, setSegDesc] = useState("");
  const [segFilters, setSegFilters] = useState<{ minScore: string; maxScore: string; status: string }>({ minScore: "", maxScore: "", status: "all" });
  const [editSegId, setEditSegId] = useState<string | null>(null);

  // New rule form
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleEventType, setRuleEventType] = useState("custom");
  const [ruleCustomEvent, setRuleCustomEvent] = useState("");
  const [rulePoints, setRulePoints] = useState(5);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);

  // Manual score adjust
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustContactId, setAdjustContactId] = useState("");
  const [adjustPoints, setAdjustPoints] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  // History filter
  const [historyContactId, setHistoryContactId] = useState("all");

  /*
   * Semeia as regras padrão uma vez, quando a org ainda não tem nenhuma. O ref
   * evita o disparo duplo entre o insert e o refetch da lista.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!orgId || seededRef.current || rules.length > 0) return;
    seededRef.current = true;
    seed.mutate(DEFAULT_RULES.map((r) => ({ ...r, org_id: orgId })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, rules.length]);

  const toggleRule = (id: string, active: boolean) => toggleRuleMut.mutate({ id, active });

  // Chamado pelo RulePointsInput já debounced: um UPDATE por pausa, não por tecla.
  const updateRulePoints = (id: string, points: number) => updatePoints.mutate({ id, points });

  const deleteRule = (id: string) => removeRuleMut.mutate(id);

  const openNewRule = () => {
    setEditRuleId(null);
    setRuleLabel("");
    setRuleEventType("custom");
    setRuleCustomEvent("");
    setRulePoints(5);
    setRuleFormOpen(true);
  };

  const openEditRule = (r: ScoringRule) => {
    setEditRuleId(r.id);
    setRuleLabel(r.label);
    const known = EVENT_TYPES.find((e) => e.value === r.event_type);
    if (known && known.value !== "custom") {
      setRuleEventType(r.event_type);
      setRuleCustomEvent("");
    } else {
      setRuleEventType("custom");
      setRuleCustomEvent(r.event_type);
    }
    setRulePoints(r.points);
    setRuleFormOpen(true);
  };

  const saveRule = () => {
    if (!ruleLabel.trim()) return;
    const eventType = ruleEventType === "custom" ? (ruleCustomEvent.trim() || "custom") : ruleEventType;
    saveRuleMut.mutate({ id: editRuleId ?? undefined, label: ruleLabel.trim(), eventType, points: rulePoints }, {
      onSuccess: () => { setRuleFormOpen(false); toast({ title: editRuleId ? "Regra atualizada" : "Regra criada" }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  // Manual score adjustment
  const submitAdjust = () => {
    if (!adjustContactId || !adjustReason.trim()) return;
    const contact = contacts.find((c) => c.id === adjustContactId);
    if (!contact) return;
    const newScore = Math.max(0, Math.min(100, (contact.lead_score || 0) + adjustPoints));
    adjustScore.mutate({ contactId: adjustContactId, newScore, delta: adjustPoints, reason: adjustReason }, {
      onSuccess: () => { setAdjustOpen(false); toast({ title: `Score ajustado em ${adjustPoints > 0 ? "+" : ""}${adjustPoints}` }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  // Segments
  const saveSegment = () => {
    if (!segName.trim()) return;
    const filters = {
      minScore: segFilters.minScore ? Number(segFilters.minScore) : undefined,
      maxScore: segFilters.maxScore ? Number(segFilters.maxScore) : undefined,
      status: segFilters.status !== "all" ? segFilters.status : undefined,
    };
    saveSegmentMut.mutate({ id: editSegId ?? undefined, name: segName, description: segDesc || null, filters }, {
      onSuccess: () => { setSegFormOpen(false); setEditSegId(null); toast({ title: editSegId ? "Segmento atualizado" : "Segmento criado" }); },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const deleteSegment = (id: string) =>
    removeSegmentMut.mutate(id, { onSuccess: () => toast({ title: "Segmento excluído" }) });

  const getSegmentContacts = (seg: Segment) => {
    const f = seg.filters as any;
    return contacts.filter((c) => {
      if (f.minScore !== undefined && (c.lead_score || 0) < f.minScore) return false;
      if (f.maxScore !== undefined && (c.lead_score || 0) > f.maxScore) return false;
      if (f.status && c.status !== f.status) return false;
      return true;
    });
  };

  const exportSegmentCSV = (seg: Segment) => {
    const rows = getSegmentContacts(seg);
    const csv = ["Nome,Email,Status,Score",
      ...rows.map((c) => `"${c.first_name} ${c.last_name || ""}","${c.email || ""}","${c.status || ""}",${c.lead_score || 0}`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `segmento-${seg.name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado" });
  };

  const filteredContacts = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q));
  }, [contacts, search]);

  const filteredHistory = useMemo(() => {
    if (historyContactId === "all") return history;
    return history.filter((h) => h.contact_id === historyContactId);
  }, [history, historyContactId]);

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lead Scoring & Segmentação</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contatos · {segments.length} segmentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAdjustContactId(""); setAdjustPoints(0); setAdjustReason(""); setAdjustOpen(true); }}>
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />Ajustar Score
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "scoring" as Tab, label: "Regras & Contatos", icon: Target },
          { key: "segments" as Tab, label: "Segmentos", icon: Users },
          { key: "history" as Tab, label: "Histórico", icon: TrendingUp },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* SCORING TAB */}
      {tab === "scoring" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Rules config */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Regras de Pontuação</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openNewRule}>
                <Plus className="mr-1 h-3 w-3" />Nova Regra
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className={`flex items-center justify-between rounded-md border border-border p-2 ${!r.is_active ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleRule(r.id, v)} className="scale-75" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{r.label}</p>
                      <p className="text-xs text-muted-foreground">{r.event_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <RulePointsInput
                      initial={r.points}
                      onCommit={(pts) => updateRulePoints(r.id, pts)}
                    />
                    <span className="text-xs text-muted-foreground">pts</span>
                    <button onClick={() => openEditRule(r)} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button hidden={!canDelete} onClick={() => setPendingDeleteRule(r.id)} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma regra criada</p>
              )}
            </CardContent>
          </Card>

          {/* Contacts with scores */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar contatos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contato</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-sm">{c.first_name} {c.last_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                      <TableCell>
                        {c.status && <Badge variant="secondary" className="text-xs">{c.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        <LeadScoreBadge score={c.lead_score || 0} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredContacts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum contato</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* SEGMENTS TAB */}
      {tab === "segments" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setSegName(""); setSegDesc(""); setSegFilters({ minScore: "", maxScore: "", status: "all" }); setEditSegId(null); setSegFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Novo Segmento
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((seg) => {
              const segContacts = getSegmentContacts(seg);
              const f = seg.filters as any;
              return (
                <Card key={seg.id} className="group hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{seg.name}</p>
                        {seg.description && <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditSegId(seg.id); setSegName(seg.name); setSegDesc(seg.description || "");
                            setSegFilters({ minScore: f.minScore?.toString() || "", maxScore: f.maxScore?.toString() || "", status: f.status || "all" });
                            setSegFormOpen(true);
                          }}><Edit2 className="mr-2 h-3.5 w-3.5" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSegmentCSV(seg)}><Download className="mr-2 h-3.5 w-3.5" />Exportar CSV</DropdownMenuItem>
                          <DropdownMenuItem disabled={!canDelete} onClick={() => setPendingDeleteSegment(seg.id)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{segContacts.length} contatos</Badge>
                      {f.minScore !== undefined && <Badge variant="outline" className="text-xs">Score ≥ {f.minScore}</Badge>}
                      {f.maxScore !== undefined && <Badge variant="outline" className="text-xs">Score ≤ {f.maxScore}</Badge>}
                      {f.status && <Badge variant="outline" className="text-xs">{f.status}</Badge>}
                    </div>
                    {/* Mini list */}
                    <div className="mt-2 space-y-0.5 max-h-24 overflow-hidden">
                      {segContacts.slice(0, 4).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                          <LeadScoreBadge score={c.lead_score || 0} />
                        </div>
                      ))}
                      {segContacts.length > 4 && <p className="text-xs text-muted-foreground">+{segContacts.length - 4} mais</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {segments.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-muted-foreground">Nenhum segmento criado</div>
            )}
          </div>

          {/* Segment form */}
          <Dialog open={segFormOpen} onOpenChange={setSegFormOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editSegId ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
                <DialogDescription>Defina filtros para criar uma lista dinâmica</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={segName} onChange={(e) => setSegName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={segDesc} onChange={(e) => setSegDesc(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Score mínimo</Label>
                    <Input type="number" value={segFilters.minScore} onChange={(e) => setSegFilters({ ...segFilters, minScore: e.target.value })} className="h-8 text-sm" placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score máximo</Label>
                    <Input type="number" value={segFilters.maxScore} onChange={(e) => setSegFilters({ ...segFilters, maxScore: e.target.value })} className="h-8 text-sm" placeholder="100" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={segFilters.status} onValueChange={(v) => setSegFilters({ ...segFilters, status: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="customer">Cliente</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveSegment} disabled={!segName.trim()} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Contato</Label>
              <Select value={historyContactId} onValueChange={setHistoryContactId}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.slice(0, 100).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-center">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((h) => {
                  const c = contacts.find((c) => c.id === h.contact_id);
                  const isPositive = h.points > 0;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.created_at ? new Date(h.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{c ? `${c.first_name} ${c.last_name || ""}` : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{h.event_type || "manual"}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.reason}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}{h.points}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum histórico</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Manual adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar Score</DialogTitle>
            <DialogDescription>Adicione ou remova pontos manualmente</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Contato</Label>
              <Select value={adjustContactId} onValueChange={setAdjustContactId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.lead_score || 0} pts)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pontos (positivo ou negativo)</Label>
              <Input type="number" value={adjustPoints} onChange={(e) => setAdjustPoints(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo *</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button onClick={submitAdjust} disabled={!adjustContactId || !adjustReason.trim()} className="w-full">Ajustar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New/Edit Rule dialog */}
      <Dialog open={ruleFormOpen} onOpenChange={setRuleFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editRuleId ? "Editar Regra" : "Nova Regra de Pontuação"}</DialogTitle>
            <DialogDescription>Defina o evento e a pontuação atribuída</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome da regra *</Label>
              <Input value={ruleLabel} onChange={(e) => setRuleLabel(e.target.value)} placeholder="Ex: Download de material" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de evento</Label>
              <Select value={ruleEventType} onValueChange={(v) => { setRuleEventType(v); if (v !== "custom") { const found = EVENT_TYPES.find(e => e.value === v); if (found && !ruleLabel) setRuleLabel(found.label); } }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ruleEventType === "custom" && (
              <div className="space-y-1">
                <Label className="text-xs">Identificador do evento</Label>
                <Input value={ruleCustomEvent} onChange={(e) => setRuleCustomEvent(e.target.value)} placeholder="ex: webinar_attended" className="h-8 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Pontos (use negativo para penalizar)</Label>
              <Input type="number" value={rulePoints} onChange={(e) => setRulePoints(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <Button onClick={saveRule} disabled={!ruleLabel.trim()} className="w-full">
              {editRuleId ? "Salvar" : "Criar Regra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={pendingDeleteRule !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteRule(null); }}
        title="Excluir regra?"
        onConfirm={() => { if (pendingDeleteRule) deleteRule(pendingDeleteRule); setPendingDeleteRule(null); }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteSegment !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteSegment(null); }}
        title="Excluir segmento?"
        onConfirm={() => { if (pendingDeleteSegment) deleteSegment(pendingDeleteSegment); setPendingDeleteSegment(null); }}
      />
    </div>
  );
}
