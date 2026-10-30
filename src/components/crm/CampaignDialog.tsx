import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMembersQuery, usePipelinesQuery, useStagesQuery } from "@/hooks/queries/useOrgOptions";
import { useCampaignMutation, type AudienceRow } from "@/hooks/queries/useSales";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit";
import { formatBRL } from "@/lib/format";
import { useOrg } from "@/hooks/useOrg";
import type { Json } from "@/integrations/supabase/types";

export type CampaignAction = "task" | "deal";

const MAX_TARGETS = 1000;

/**
 * Revisão antes de criar tarefas ou negócios para um público inteiro. Nada é
 * criado sem passar por aqui: mostra quantos, para quem e com quais dados.
 */
export function CampaignDialog({
  action, onClose, filters, total, totalMatchedValue, sample,
}: {
  action: CampaignAction | null;
  onClose: () => void;
  filters: Json | null;
  total: number;
  totalMatchedValue: number;
  /** Primeiros clientes do público, para a pessoa conferir. */
  sample: AudienceRow[];
}) {
  const { toast } = useToast();
  const { orgId } = useOrg();
  const { user } = useAuth();
  const members = useMembersQuery();
  const pipelines = usePipelinesQuery();
  const stages = useStagesQuery();
  const { create } = useCampaignMutation();

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [ownerMode, setOwnerMode] = useState<"seller" | "fixed">("seller");
  const [ownerId, setOwnerId] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [valueMode, setValueMode] = useState<"none" | "matched" | "fixed">("matched");
  const [value, setValue] = useState("");

  const isTask = action === "task";
  const tooMany = total > MAX_TARGETS;
  const pipelineStages = useMemo(
    () => stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.order - b.order),
    [stages, pipelineId],
  );

  // Valores iniciais a cada abertura.
  useEffect(() => {
    if (!action) return;
    setName(""); setBody(""); setDueDate(""); setOwnerMode("seller"); setValue(""); setValueMode("matched");
    setOwnerId(user?.id ?? "");
    const p = pipelines.find((x) => x.is_default) ?? pipelines[0];
    setPipelineId(p?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // Etapa inicial: a primeira do funil escolhido.
  useEffect(() => { setStageId(pipelineStages[0]?.id ?? ""); }, [pipelineStages]);

  const canSubmit = !!name.trim() && !!ownerId && !tooMany && total > 0 && (isTask || !!stageId)
    && (isTask || valueMode !== "fixed" || !!value);

  const submit = () => {
    if (!action || !filters) return;
    create.mutate({
      name: name.trim(),
      action,
      filters,
      params: isTask
        ? { owner_mode: ownerMode, owner_id: ownerId, body, due_date: dueDate }
        : { owner_mode: ownerMode, owner_id: ownerId, stage_id: stageId, value_mode: valueMode, value, due_date: dueDate },
    }, {
      onSuccess: (r) => {
        toast({
          title: `${r.created_count} ${isTask ? "tarefas criadas" : "negócios criados"}`,
          description: ownerMode === "seller"
            ? `${r.assigned_to_seller} com o vendedor do cliente; os demais com o responsável escolhido.`
            : undefined,
        });
        if (orgId) {
          logAudit({ orgId, action: "create", entityType: "campaign", entityId: r.campaign_id, newValues: { name: name.trim(), action, created: r.created_count } });
        }
        onClose();
      },
      onError: (e: Error) => toast({ title: "Erro ao criar a campanha", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isTask ? "Criar tarefas" : "Criar negócios no funil"} para este público</DialogTitle>
          <DialogDescription>
            {isTask ? "Será criada 1 tarefa" : "Será criado 1 negócio"} para cada um dos{" "}
            <strong>{total.toLocaleString("pt-BR")} clientes</strong>.
          </DialogDescription>
        </DialogHeader>

        {tooMany ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            O limite é de {MAX_TARGETS.toLocaleString("pt-BR")} clientes por campanha. Refine os filtros para reduzir o público.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome da campanha</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Oferta de mangueira — novembro" />
              {name.trim() && sample[0] && (
                <p className="text-xs text-muted-foreground">Vai aparecer como: {name.trim()} — {sample[0].name}</p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Quem fica responsável</Label>
                <Select value={ownerMode} onValueChange={(v) => setOwnerMode(v as "seller" | "fixed")}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Vendedor de cada cliente</SelectItem>
                    <SelectItem value="fixed">Uma pessoa só</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{ownerMode === "seller" ? "Se o cliente não tiver vendedor ligado" : "Responsável"}</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isTask ? (
              <div className="space-y-1">
                <Label className="text-xs">O que fazer (aparece na tarefa)</Label>
                <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ex.: Ligar oferecendo mangueira a R$ 1.000 para entrega na próxima semana." />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Funil</Label>
                    <Select value={pipelineId} onValueChange={setPipelineId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                      <SelectContent>
                        {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Etapa inicial</Label>
                    <Select value={stageId} onValueChange={setStageId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolher…" /></SelectTrigger>
                      <SelectContent>
                        {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Valor do negócio</Label>
                    <Select value={valueMode} onValueChange={(v) => setValueMode(v as typeof valueMode)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="matched">Valor das compras no filtro</SelectItem>
                        <SelectItem value="fixed">Mesmo valor para todos</SelectItem>
                        <SelectItem value="none">Sem valor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {valueMode === "fixed" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input type="number" min="0" className="h-9" value={value} onChange={(e) => setValue(e.target.value)} />
                    </div>
                  )}
                </div>
                {valueMode === "matched" && totalMatchedValue === 0 && (
                  <p className="text-xs text-muted-foreground">Este público não tem regra de compra: os negócios ficarão com valor zero.</p>
                )}
                {valueMode === "matched" && totalMatchedValue > 0 && (
                  <p className="text-xs text-muted-foreground">Total no funil: {formatBRL(totalMatchedValue)}. É o que cada cliente já comprou ou orçou, uma referência, não a venda esperada.</p>
                )}
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">{isTask ? "Prazo" : "Previsão de fechamento"} (opcional)</Label>
              <Input type="date" className="h-9 sm:w-48" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="rounded-md bg-muted/50 p-2.5 text-xs">
              <p className="mb-1 font-medium">Primeiros clientes:</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {sample.slice(0, 5).map((c) => <li key={c.id} className="truncate">{c.name}{c.cidade ? ` — ${c.cidade}` : ""}</li>)}
                {total > 5 && <li>… e mais {(total - 5).toLocaleString("pt-BR")}</li>}
              </ul>
            </div>

            <Button className="w-full" onClick={submit} disabled={!canSubmit || create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar {total.toLocaleString("pt-BR")} {isTask ? "tarefas" : "negócios"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Dá para desfazer depois na lista de campanhas.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
