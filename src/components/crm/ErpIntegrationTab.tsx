import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Copy, KeyRound, ScrollText, Database } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ENDPOINT = "https://qwigwpookuhxhehzewti.supabase.co/functions/v1/erp-sync";

type SyncLog = {
  id: string;
  entity_type: string;
  operation: string;
  codigo_erp: string | null;
  error_message: string | null;
  created_at: string;
};

const OPERATION_STYLE: Record<string, string> = {
  insert: "bg-success/10 text-success",
  update: "bg-primary/10 text-primary",
  skip: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

/** Token opaco de 32 bytes. Só o hash vai para o banco. */
async function generateToken(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return { token, hash };
}

export function ErpIntegrationTab() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { canManage } = useRole();
  const { toast } = useToast();

  const [configId, setConfigId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  /*
   * Só existe em memória, logo após gerar. O banco guarda apenas o hash, então
   * não há como exibi-lo de novo depois — o aviso na UI diz isso ao usuário.
   */
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<{ at: string; inserted: number; updated: number; errors: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    const { data: cfg } = await supabase
      .from("integration_configs")
      .select("id, config, is_active")
      .eq("org_id", orgId)
      .eq("provider", "erp")
      .maybeSingle();

    setConfigId(cfg?.id ?? null);
    setIsActive(!!cfg?.is_active);
    setHasToken(!!(cfg?.config as any)?.token_hash);

    // Resumo do último sync, derivado do próprio log.
    const { data: recent } = await supabase
      .from("erp_sync_log")
      .select("operation, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (recent && recent.length > 0) {
      // "Último sync" = as linhas do lote mais recente (mesmo minuto).
      const newest = new Date(recent[0].created_at as string);
      const batch = recent.filter(
        (r) => Math.abs(newest.getTime() - new Date(r.created_at as string).getTime()) < 60_000,
      );
      setLastSync({
        at: recent[0].created_at as string,
        inserted: batch.filter((r) => r.operation === "insert").length,
        updated: batch.filter((r) => r.operation === "update").length,
        errors: batch.filter((r) => r.operation === "error").length,
      });
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleGenerate = async () => {
    if (!orgId) return;
    const { token, hash } = await generateToken();
    if (configId) {
      await supabase.from("integration_configs")
        .update({ config: { token_hash: hash }, is_active: true } as any)
        .eq("id", configId);
    } else {
      await supabase.from("integration_configs")
        .insert({ org_id: orgId, provider: "erp", config: { token_hash: hash }, is_active: true, connected_by: user?.id } as any);
    }
    setPlainToken(token);
    toast({ title: "Token gerado", description: "Copie agora — ele não será exibido de novo." });
    void fetchAll();
  };

  const handleToggle = async (next: boolean) => {
    if (!configId) return;
    setIsActive(next);
    await supabase.from("integration_configs").update({ is_active: next } as any).eq("id", configId);
  };

  const openLog = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("erp_sync_log")
      .select("id, entity_type, operation, codigo_erp, error_message, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs((data as SyncLog[]) || []);
    setLogOpen(true);
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: `${what} copiado` });
  };

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Apenas proprietários e administradores podem configurar a integração com o ERP.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />Integração com ERP
          </CardTitle>
          <CardDescription className="text-xs">
            Recebe clientes do ERP e mantém contatos e empresas sincronizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Ativar integração ERP</p>
              <p className="text-xs text-muted-foreground">
                {hasToken ? "Token configurado" : "Gere um token para começar"}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={handleToggle} disabled={!hasToken || loading} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Token de integração</Label>
            {plainToken ? (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input readOnly value={plainToken} className="h-8 font-mono text-xs" />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => copy(plainToken, "Token")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-warning">
                  Copie agora. O banco guarda apenas o hash — este valor não aparece de novo.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={hasToken ? "•".repeat(32) : "Nenhum token gerado"}
                  className="h-8 font-mono text-xs text-muted-foreground"
                />
                <Button size="sm" variant="outline" className="h-8" onClick={handleGenerate}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  {hasToken ? "Gerar novo" : "Gerar token"}
                </Button>
              </div>
            )}
            {hasToken && !plainToken && (
              <p className="text-xs text-muted-foreground">
                Gerar um novo token invalida o anterior — o n8n precisa ser atualizado.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">URL do endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={ENDPOINT} className="h-8 font-mono text-xs" />
              <Button size="sm" variant="outline" className="h-8" onClick={() => copy(ENDPOINT, "URL")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              POST com o header <code className="rounded bg-muted px-1">X-ERP-Token</code>.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Último sync</p>
              {lastSync ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(lastSync.at).toLocaleString("pt-BR")} · {lastSync.inserted} novos ·{" "}
                  {lastSync.updated} atualizados
                  {lastSync.errors > 0 && <span className="text-destructive"> · {lastSync.errors} erros</span>}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum sync registrado ainda</p>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8" onClick={openLog}>
              <ScrollText className="mr-1 h-3.5 w-3.5" />Ver log
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log de sincronização</DialogTitle>
            <DialogDescription>Últimos 100 registros</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Operação</TableHead>
                  <TableHead className="text-xs">Código ERP</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">{l.entity_type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${OPERATION_STYLE[l.operation] || ""}`}>
                        {l.operation}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{l.codigo_erp || "—"}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate" title={l.error_message || ""}>
                      {l.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum registro de sincronização
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
