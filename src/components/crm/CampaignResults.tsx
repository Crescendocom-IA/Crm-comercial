import { useState } from "react";
import { CheckSquare, Handshake, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDeleteDialog } from "@/components/crm/ConfirmDeleteDialog";
import { useCampaignMutation, useCampaignResultsQuery, type CampaignResult } from "@/hooks/queries/useSales";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import { formatBRL, formatDate } from "@/lib/format";

/** Campanhas já criadas: quanto andou cada uma e o botão de desfazer. */
export function CampaignResults() {
  const { toast } = useToast();
  const { canManage } = useRole();
  const { data: campaigns = [] } = useCampaignResultsQuery();
  const { undo } = useCampaignMutation();
  const [toUndo, setToUndo] = useState<CampaignResult | null>(null);

  if (campaigns.length === 0) return null;

  const confirmUndo = () => {
    if (!toUndo) return;
    undo.mutate(toUndo.id, {
      onSuccess: (r) => toast({
        title: `${r.removed} ${toUndo.action === "task" ? "tarefas removidas" : "negócios removidos"}`,
        description: r.kept > 0 ? `${r.kept} ${r.kept === 1 ? "foi mantido" : "foram mantidos"} porque já tinham andamento.` : undefined,
      }),
      onError: (e: Error) => toast({ title: "Erro ao desfazer", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Campanhas</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {campaigns.map((c) => {
          const isTask = c.action === "task";
          const total = isTask ? c.tasks_total : c.deals_total;
          const done = isTask ? c.tasks_done : c.deals_won + c.deals_lost;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={c.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {isTask ? <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  {c.undone_at && <Badge variant="outline" className="text-[10px] font-normal">Desfeita</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                  {canManage && !c.undone_at && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setToUndo(c)}>
                      <Undo2 className="mr-1 h-3 w-3" />Desfazer
                    </Button>
                  )}
                </div>
              </div>
              {!c.undone_at && (
                <>
                  <Progress value={pct} className="mt-2 h-1.5" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isTask
                      ? `${c.tasks_done} de ${c.tasks_total} tarefas concluídas`
                      : `${c.deals_open} em aberto · ${c.deals_won} ganhos (${formatBRL(c.won_value)}) · ${c.deals_lost} perdidos`}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
      <ConfirmDeleteDialog
        open={!!toUndo}
        onOpenChange={(o) => !o && setToUndo(null)}
        title={`Desfazer "${toUndo?.name ?? ""}"?`}
        description={toUndo?.action === "task"
          ? "As tarefas ainda não concluídas serão apagadas. As concluídas ficam."
          : "Os negócios abertos, na etapa inicial e sem atividades serão apagados. Os que já andaram ficam."}
        confirmLabel="Desfazer"
        onConfirm={confirmUndo}
      />
    </Card>
  );
}
