import { useMemo } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMembersQuery } from "@/hooks/queries/useOrgOptions";
import { useSellerLinkMutation, useSellersQuery } from "@/hooks/queries/useSales";
import { useRole } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";

/**
 * Liga cada vendedor do ERP a um usuário do CRM. É o que permite atribuir
 * clientes, tarefas e negócios ao vendedor certo.
 */
export function ErpSellersLink() {
  const { toast } = useToast();
  const { canManage } = useRole();
  const { data: sellers = [] } = useSellersQuery();
  const members = useMembersQuery();
  const link = useSellerLinkMutation();

  // Ativos primeiro: os inativos só interessam por histórico.
  const sorted = useMemo(
    () => [...sellers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    [sellers],
  );

  if (sellers.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum vendedor do ERP sincronizado ainda.</p>;
  }

  const change = (sellerId: string, value: string) => {
    link.mutate({ sellerId, userId: value === "none" ? null : value }, {
      onSuccess: (n) => toast({
        title: value === "none" ? "Vendedor desligado" : "Vendedor ligado",
        description: n > 0 ? `${n.toLocaleString("pt-BR")} clientes sem responsável passaram para este usuário.` : undefined,
      }),
      onError: (e: Error) => toast({ title: "Erro ao ligar vendedor", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ligue cada vendedor do ERP ao usuário dele no CRM. Os clientes desse vendedor que ainda não têm responsável
        passam para o usuário, e as campanhas podem ser atribuídas a ele.
      </p>
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor no ERP</TableHead>
              <TableHead className="w-72">Usuário no CRM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="font-medium">{s.name}</span>
                  {!s.active && <Badge variant="outline" className="ml-2 text-[10px] font-normal">Inativo</Badge>}
                </TableCell>
                <TableCell>
                  <Select value={s.user_id ?? "none"} onValueChange={(v) => change(s.id, v)} disabled={!canManage || link.isPending}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não ligado</SelectItem>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
