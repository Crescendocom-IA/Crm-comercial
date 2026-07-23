import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { DealSummaryPanel } from "@/components/crm/DealSummaryPanel";
import {
  useDealQuery, useDealActivitiesQuery, useDealMutation, useDealActivityMutation,
  dealKeys,
} from "@/hooks/queries/useDeals";
import { useStagesQuery, useMembersQuery } from "@/hooks/queries/useOrgOptions";
import { DealQualification } from "@/components/crm/DealQualification";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Trophy, XCircle, Building2, User, Calendar, Percent,
  Phone, Mail, FileText, CheckSquare, CalendarDays, Edit2, Check, X, Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ActivityType = Database["public"]["Enums"]["activity_type"];

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

const activityIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone, email: Mail, meeting: CalendarDays, note: FileText, task: CheckSquare,
};
const activityLabels: Record<ActivityType, string> = {
  call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa",
};

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();

  /*
   * Contato e empresa vêm no join da própria query do negócio, no lugar das
   * três buscas por id que o fetch fazia em sequência depois de carregar o
   * deal. É a mesma chave que a lista usa: chegar aqui por um clique no
   * kanban abre a página já preenchida, sem carregamento visível.
   */
  const { data: deal, isLoading } = useDealQuery(id);
  const stages = useStagesQuery(deal?.org_id);
  const members = useMembersQuery();
  const { activities } = useDealActivitiesQuery(id);

  const contact = deal?.contact ?? null;
  const company = deal?.company ?? null;
  const owner = members.find((m) => m.id === deal?.owner_id) ?? null;

  const { update, changeStage, setStatus } = useDealMutation(stages);
  const adicionarAtividade = useDealActivityMutation(id);

  // Inline edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingValue, setEditingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState("BRL");

  // Loss modal
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");

  // Add activity
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, title: "", body: "" });

  // Painel de resumo com IA
  const [summaryOpen, setSummaryOpen] = useState(false);

  /*
   * Os rascunhos de edição inline seguem o negócio pelo id, não pelo objeto:
   * reagir ao `deal` inteiro apagaria o que está sendo digitado a cada
   * refetch do detalhe.
   */
  useEffect(() => {
    if (!deal) return;
    setTitleDraft(deal.title);
    setValueDraft(String(deal.value || 0));
    setCurrencyDraft(deal.currency || "BRL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id]);

  // Id que não existe (ou de outra org, que a RLS esconde) volta para a lista.
  useEffect(() => {
    if (!isLoading && !deal) navigate("/deals");
  }, [isLoading, deal, navigate]);

  if (!deal) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Health indicator based on last activity
  const lastActivity = activities[0];
  const daysSinceActivity = lastActivity?.created_at
    ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const healthColor = daysSinceActivity <= 3 ? "bg-success" : daysSinceActivity <= 7 ? "bg-warning" : "bg-destructive";
  const healthLabel = daysSinceActivity <= 3 ? "Saudável" : daysSinceActivity <= 7 ? "Atenção" : "Inativo";

  const currentStage = stages.find((s) => s.id === deal.stage_id);
  const currentStageIndex = stages.findIndex((s) => s.id === deal.stage_id);

  const aoFalhar = (e: any) =>
    toast({ title: "Erro", description: e.message, variant: "destructive" });

  const saveTitle = () => {
    if (!titleDraft.trim()) return;
    update.mutate({ deal, patch: { title: titleDraft } }, {
      onSuccess: () => { setEditingTitle(false); toast({ title: "Título atualizado" }); },
      onError: aoFalhar,
    });
  };

  const saveValue = () => {
    update.mutate({ deal, patch: { value: Number(valueDraft) || 0, currency: currencyDraft } }, {
      onSuccess: () => { setEditingValue(false); toast({ title: "Valor atualizado" }); },
      onError: aoFalhar,
    });
  };

  const changeStageDoDeal = (stageId: string) => {
    changeStage.mutate({ deal, stageId }, {
      onSuccess: () => toast({ title: "Estágio atualizado" }),
      onError: () => toast({
        title: "Não foi possível mudar o estágio. Tente novamente.",
        variant: "destructive",
      }),
    });
  };

  const markAsWon = () => {
    setStatus.mutate({ deal, status: "won" }, {
      onSuccess: () => toast({ title: "Negócio marcado como ganho! 🎉" }),
      onError: aoFalhar,
    });
  };

  const confirmLoss = () => {
    const reason = lossNote ? `${lossReason}: ${lossNote}` : lossReason;
    setStatus.mutate({ deal, status: "lost", lossReason: reason }, {
      onSuccess: () => {
        setLossModalOpen(false);
        toast({ title: "Negócio marcado como perdido" });
      },
      onError: aoFalhar,
    });
  };

  const addActivity = () => {
    if (!activityForm.title) return;
    adicionarAtividade.mutate(activityForm, {
      onSuccess: () => {
        setActivityForm({ type: "note", title: "", body: "" });
        toast({ title: "Atividade adicionada" });
      },
      onError: aoFalhar,
    });
  };
  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={() => navigate("/deals")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />Voltar para Negócios
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          {/* Inline title */}
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <div className="flex items-center gap-1">
                <Input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="text-2xl font-bold h-auto py-0.5" autoFocus onKeyDown={(e) => e.key === "Enter" && saveTitle()} />
                <button onClick={saveTitle} className="text-success"><Check className="h-5 w-5" /></button>
                <button onClick={() => { setEditingTitle(false); setTitleDraft(deal.title); }} className="text-muted-foreground"><X className="h-5 w-5" /></button>
              </div>
            ) : (
              <h1 className="text-2xl font-bold tracking-tight group cursor-pointer" onClick={() => setEditingTitle(true)}>
                {deal.title}
                <Edit2 className="ml-2 inline h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
              </h1>
            )}
          </div>

          {/* Inline value */}
          <div className="flex items-center gap-3">
            {editingValue ? (
              <div className="flex items-center gap-2">
                <Select value={currencyDraft} onValueChange={setCurrencyDraft}>
                  <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={valueDraft} onChange={(e) => setValueDraft(e.target.value)} className="w-32 h-8" autoFocus onKeyDown={(e) => e.key === "Enter" && saveValue()} />
                <button onClick={saveValue} className="text-success"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditingValue(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <span className="text-xl font-bold text-primary cursor-pointer hover:opacity-80" onClick={() => setEditingValue(true)}>
                {formatCurrency(Number(deal.value) || 0, deal.currency || "BRL")}
              </span>
            )}

            {/* Stage dropdown */}
            <Select value={deal.stage_id || ""} onValueChange={changeStageDoDeal}>
              <SelectTrigger className="w-44 h-8">
                <div className="flex items-center gap-1.5">
                  {currentStage?.color && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: currentStage.color }} />}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Health */}
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${healthColor}`} />
              <span className="text-xs text-muted-foreground">{healthLabel}</span>
            </div>

            {/* Status badge */}
            {deal.status !== "open" && (
              <Badge variant="secondary" className={deal.status === "won" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                {deal.status === "won" ? "Ganho" : "Perdido"}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          {/* Fora do bloco de status: resumir um negócio já ganho ou perdido
              continua útil, para entender o que levou até ali. */}
          <Button variant="outline" onClick={() => setSummaryOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4 text-primary" />Resumir com IA
          </Button>
          {deal.status === "open" && (
            <>
              <Button variant="outline" onClick={markAsWon} className="text-success border-success/30 hover:bg-success/10">
                <Trophy className="mr-2 h-4 w-4" />Ganho
              </Button>
              <Button variant="outline" onClick={() => setLossModalOpen(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <XCircle className="mr-2 h-4 w-4" />Perdido
              </Button>
            </>
          )}
        </div>
      </div>

      <DealSummaryPanel
        dealId={deal.id}
        dealTitle={deal.title}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
      />

      {/* Pipeline progress bar */}
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <div
            key={s.id}
            className={`h-2 flex-1 rounded-full transition-colors cursor-pointer ${
              i <= currentStageIndex
                ? deal.status === "won" ? "bg-success" : deal.status === "lost" ? "bg-destructive" : "bg-primary"
                : "bg-muted"
            }`}
            onClick={() => deal.status === "open" && changeStageDoDeal(s.id)}
            title={s.name}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content: Timeline */}
        <div className="col-span-2 space-y-4">
          {/* Add activity form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Adicionar Atividade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v as ActivityType })}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Nota</SelectItem>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="task">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8 text-sm" placeholder="Título" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
              </div>
              <Textarea placeholder="Descrição (opcional)" value={activityForm.body} onChange={(e) => setActivityForm({ ...activityForm, body: e.target.value })} rows={2} className="text-sm" />
              <Button size="sm" onClick={addActivity} disabled={!activityForm.title}>Adicionar</Button>
            </CardContent>
          </Card>

          {/* Timeline */}
          <div className="space-y-1">
            {activities.map((a) => {
              const Icon = activityIcons[a.type];
              return (
                <div key={a.id} className="flex gap-3 rounded-lg border border-border p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-muted-foreground">{activityLabels[a.type]}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.body && <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>}
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">Nenhuma atividade registrada</div>
            )}
          </div>

          {/*
            Histórico de alterações do registro. Vai como Card, não como aba:
            esta página não usa Tabs, e criar uma só para isto reestruturaria o
            layout de 3 colunas inteiro.
          */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entityType="deal" entityId={deal.id} />
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* BANT Qualification */}
          <DealQualification
            dealId={deal.id}
            qualification={(deal as any).qualification}
            qualificationScore={(deal as any).qualification_score || 0}
            onUpdate={() => qc.invalidateQueries({ queryKey: dealKeys.detail(orgId, deal.id) })}
          />
          {/* Contact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />Contato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contact ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {contact.first_name[0]}{contact.last_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{contact.first_name} {contact.last_name}</p>
                    {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Nenhum contato vinculado</p>}
            </CardContent>
          </Card>

          {/* Company */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />Empresa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {company ? (
                <div>
                  <p className="text-sm font-medium">{company.name}</p>
                  {company.domain && <p className="text-xs text-muted-foreground">{company.domain}</p>}
                </div>
              ) : <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada</p>}
            </CardContent>
          </Card>

          {/* Owner */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />Responsável
              </CardTitle>
            </CardHeader>
            <CardContent>
              {owner ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={owner.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {owner.name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-medium">{owner.name}</p>
                </div>
              ) : <p className="text-sm text-muted-foreground">Sem responsável</p>}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-3.5 w-3.5" />Fechamento</span>
                <span>{deal.close_date ? new Date(deal.close_date).toLocaleDateString("pt-BR") : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Percent className="h-3.5 w-3.5" />Probabilidade</span>
                <span>{deal.probability || 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Criado em</span>
                <span>{deal.created_at ? new Date(deal.created_at).toLocaleDateString("pt-BR") : "—"}</span>
              </div>
              {deal.loss_reason && (
                <div className="mt-2 rounded-md bg-destructive/10 p-2">
                  <p className="text-xs font-medium text-destructive">Motivo da perda:</p>
                  <p className="text-xs text-destructive/80">{deal.loss_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loss Reason Modal */}
      <Dialog open={lossModalOpen} onOpenChange={setLossModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Perda</DialogTitle>
            <DialogDescription>Por que este negócio foi perdido?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Preço">Preço muito alto</SelectItem>
                  <SelectItem value="Concorrência">Perdeu para concorrência</SelectItem>
                  <SelectItem value="Timing">Timing inadequado</SelectItem>
                  <SelectItem value="Budget">Sem orçamento</SelectItem>
                  <SelectItem value="Fit">Produto não atende</SelectItem>
                  <SelectItem value="Sem resposta">Sem resposta do cliente</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={lossNote} onChange={(e) => setLossNote(e.target.value)} placeholder="Detalhes..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLoss} disabled={!lossReason}>Confirmar Perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
