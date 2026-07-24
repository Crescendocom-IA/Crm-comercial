import { useState } from "react";
import { useRole } from "@/hooks/useRole";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import {
  useEmailSequencesQuery, useSequenceStepsQuery, useSequenceEnrollmentsQuery,
  useEmailSequenceMutation, useSequenceStepMutation, useSequenceEnrollmentMutation,
} from "@/hooks/queries/useEmailSequences";
import { useContactOptionsQuery } from "@/hooks/queries/useOrgOptions";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Zap, Edit2, Trash2, MoreHorizontal, Users, Play, Pause,
  ArrowDown, Mail, Clock, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Sequence = {
  id: string; org_id: string; name: string; description: string | null;
  is_active: boolean; created_by: string | null; created_at: string | null;
};
type Step = {
  id: string; sequence_id: string; org_id: string; step_order: number;
  delay_days: number; template_id: string | null; subject: string | null;
  body_html: string | null; created_at: string | null;
};
type Enrollment = {
  id: string; sequence_id: string; org_id: string; contact_id: string;
  current_step: number; status: string; enrolled_at: string | null;
  next_send_at: string | null; completed_at: string | null;
};
type Contact = { id: string; first_name: string; last_name: string | null; email: string | null };

const statusLabels: Record<string, string> = {
  active: "Ativa", paused: "Pausada", completed: "Concluída", replied: "Respondeu", bounced: "Bounced",
};
const statusColors: Record<string, string> = {
  active: "bg-success/10 text-success", paused: "bg-warning/10 text-warning",
  completed: "bg-primary/10 text-primary", replied: "bg-accent text-accent-foreground",
  bounced: "bg-destructive/10 text-destructive",
};

export default function EmailSequences() {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const { sequences } = useEmailSequencesQuery();
  const steps = useSequenceStepsQuery();
  const enrollments = useSequenceEnrollmentsQuery();
  const contacts = useContactOptionsQuery();
  const seqMutation = useEmailSequenceMutation();
  const stepMutation = useSequenceStepMutation();
  const enrollmentMutation = useSequenceEnrollmentMutation();

  const [pendingDeleteSeq, setPendingDeleteSeq] = useState<string | null>(null);
  const { canDelete } = useRole();
  const [pendingDeleteStep, setPendingDeleteStep] = useState<string | null>(null);
  const [selectedSeq, setSelectedSeq] = useState<Sequence | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [stepSubject, setStepSubject] = useState("");
  const [stepBody, setStepBody] = useState("");
  const [stepDelay, setStepDelay] = useState(0);
  const [enrollContactId, setEnrollContactId] = useState("none");

  const seqSteps = (id: string) => steps.filter((s) => s.sequence_id === id);
  const seqEnrollments = (id: string) => enrollments.filter((e) => e.sequence_id === id);

  const createSequence = () => {
    if (!formName.trim()) return;
    seqMutation.create.mutate({ name: formName.trim(), description: formDesc || null }, {
      onSuccess: () => {
        setCreateOpen(false); setFormName(""); setFormDesc("");
        toast({ title: "Sequência criada" });
      },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const toggleActive = (seq: Sequence) => seqMutation.toggleActive.mutate({ id: seq.id, isActive: seq.is_active });

  const deleteSequence = (id: string) =>
    seqMutation.remove.mutate(id, { onSuccess: () => {
      if (selectedSeq?.id === id) setSelectedSeq(null);
      toast({ title: "Sequência excluída" });
    } });

  const addStep = () => {
    if (!selectedSeq || !stepSubject.trim()) return;
    stepMutation.add.mutate({
      sequenceId: selectedSeq.id, stepOrder: seqSteps(selectedSeq.id).length,
      delayDays: stepDelay, subject: stepSubject.trim(), bodyHtml: stepBody || null,
    }, {
      onSuccess: () => {
        setAddStepOpen(false); setStepSubject(""); setStepBody(""); setStepDelay(0);
        toast({ title: "Etapa adicionada" });
      },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  const deleteStep = (id: string) => stepMutation.remove.mutate(id);

  const enrollContact = () => {
    if (!selectedSeq || enrollContactId === "none") return;
    enrollmentMutation.enroll.mutate({
      sequenceId: selectedSeq.id, contactId: enrollContactId,
      firstStepDelayDays: seqSteps(selectedSeq.id)[0]?.delay_days || 0,
    }, {
      onSuccess: () => {
        setEnrollOpen(false); setEnrollContactId("none");
        toast({ title: "Contato inscrito na sequência" });
      },
      onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });
  };

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sequências de Email</h1>
          <p className="text-sm text-muted-foreground">{sequences.length} sequências</p>
        </div>
        <Button onClick={() => { setFormName(""); setFormDesc(""); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />Nova Sequência
        </Button>
      </div>

      <div className="flex gap-4">
        {/* Sequences list */}
        <div className={`space-y-2 ${selectedSeq ? "w-[320px] shrink-0" : "flex-1"}`}>
          {sequences.map((seq) => {
            const st = seqSteps(seq.id);
            const en = seqEnrollments(seq.id);
            const isSelected = selectedSeq?.id === seq.id;
            return (
              <Card
                key={seq.id}
                className={`cursor-pointer transition-colors hover:border-primary/30 ${isSelected ? "border-primary" : ""}`}
                onClick={() => setSelectedSeq(seq)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{seq.name}</p>
                        <Badge variant={seq.is_active ? "default" : "secondary"} className="text-xs px-1">
                          {seq.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      {seq.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{seq.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Mail className="h-2.5 w-2.5" />{st.length} etapas</span>
                        <span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5" />{en.length} inscritos</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-accent transition-colors">
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggleActive(seq)}>
                          {seq.is_active ? <><Pause className="mr-2 h-3.5 w-3.5" />Pausar</> : <><Play className="mr-2 h-3.5 w-3.5" />Ativar</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canDelete} onClick={() => setPendingDeleteSeq(seq.id)} className="text-destructive">
                          <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {sequences.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">Nenhuma sequência criada</div>
          )}
        </div>

        {/* Detail panel */}
        {selectedSeq && (
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedSeq.name}</h2>
                {selectedSeq.description && <p className="text-xs text-muted-foreground">{selectedSeq.description}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setStepSubject(""); setStepBody(""); setStepDelay(0); setAddStepOpen(true); }}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Etapa
                </Button>
                <Button size="sm" onClick={() => { setEnrollContactId("none"); setEnrollOpen(true); }}>
                  <Users className="mr-1 h-3.5 w-3.5" />Inscrever
                </Button>
              </div>
            </div>

            {/* Steps timeline */}
            <div className="space-y-0">
              {seqSteps(selectedSeq.id).map((step, i) => (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary text-xs font-bold">
                      {i + 1}
                    </div>
                    {i < seqSteps(selectedSeq.id).length - 1 && (
                      <div className="flex-1 w-px bg-border my-1 min-h-[20px]" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-primary" />
                          <p className="text-sm font-medium">{step.subject || "(sem assunto)"}</p>
                        </div>
                        {step.delay_days > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />Enviar D+{step.delay_days}
                          </p>
                        )}
                        {step.body_html && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {step.body_html.replace(/<[^>]*>/g, "").slice(0, 100)}
                          </p>
                        )}
                      </div>
                      <button hidden={!canDelete} onClick={() => setPendingDeleteStep(step.id)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {seqSteps(selectedSeq.id).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Adicione etapas à sequência</p>
              )}
            </div>

            {/* Enrollments */}
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Contatos Inscritos</p>
              <div className="space-y-1">
                {seqEnrollments(selectedSeq.id).map((en) => {
                  const contact = contacts.find((c) => c.id === en.contact_id);
                  return (
                    <div key={en.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{contact ? `${contact.first_name} ${contact.last_name || ""}` : "Desconhecido"}</p>
                        <p className="text-xs text-muted-foreground">
                          Etapa {en.current_step + 1}/{seqSteps(selectedSeq.id).length}
                        </p>
                      </div>
                      <Badge className={`text-xs ${statusColors[en.status] || ""}`}>
                        {statusLabels[en.status] || en.status}
                      </Badge>
                    </div>
                  );
                })}
                {seqEnrollments(selectedSeq.id).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum contato inscrito</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create sequence dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Sequência</DialogTitle>
            <DialogDescription>Crie uma cadência de emails automatizada</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="text-sm" />
            </div>
            <Button onClick={createSequence} disabled={!formName.trim()} className="w-full">Criar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Etapa</DialogTitle>
            <DialogDescription>Adicione um email à sequência</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Delay (dias após etapa anterior)</Label>
              <Input type="number" min={0} value={stepDelay} onChange={(e) => setStepDelay(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assunto *</Label>
              <Input value={stepSubject} onChange={(e) => setStepSubject(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Corpo</Label>
              <Textarea value={stepBody} onChange={(e) => setStepBody(e.target.value)} rows={4} className="text-sm" />
            </div>
            <Button onClick={addStep} disabled={!stepSubject.trim()} className="w-full">Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enroll contact dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Inscrever Contato</DialogTitle>
            <DialogDescription>Selecione um contato para a sequência</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Select value={enrollContactId} onValueChange={setEnrollContactId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar contato..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecionar...</SelectItem>
                {contacts.filter((c) => c.email).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={enrollContact} disabled={enrollContactId === "none"} className="w-full">Inscrever</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={pendingDeleteSeq !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteSeq(null); }}
        title="Excluir sequência?"
        onConfirm={() => { if (pendingDeleteSeq) deleteSequence(pendingDeleteSeq); setPendingDeleteSeq(null); }}
      />

      <ConfirmDeleteDialog
        open={pendingDeleteStep !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteStep(null); }}
        title="Excluir passo?"
        onConfirm={() => { if (pendingDeleteStep) deleteStep(pendingDeleteStep); setPendingDeleteStep(null); }}
      />
    </div>
  );
}
