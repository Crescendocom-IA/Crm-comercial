import { useState } from "react";
import { Package, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/crm/EmptyState";
import { TableSkeleton } from "@/components/crm/TableSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { useProductsQuery, useProductGroupsQuery, SALES_PAGE_SIZE } from "@/hooks/queries/useSales";
import { formatBRL, formatQty } from "@/lib/format";

/** Catálogo de produtos espelhado do ERP (somente leitura). */
export default function Products() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [group, setGroup] = useState("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [page, setPage] = useState(0);

  const { data: groups = [] } = useProductGroupsQuery();
  const { data, isLoading } = useProductsQuery({
    page, search: debouncedSearch, onlyActive, groupCodigo: group === "all" ? undefined : group,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  // O texto de grupo gravado no produto (PROD_GRU_DESCRICAO) vem "NAO
  // CADASTRADO" em quase todo o ERP; o nome confiável é o da tabela de grupos.
  const groupName = new Map(groups.map((g) => [g.codigo_erp, g.name]));
  const totalPages = Math.ceil(total / SALES_PAGE_SIZE);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Produtos</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">{total.toLocaleString("pt-BR")} produtos · sincronizados do ERP</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código, marca ou EAN…"
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <Select value={group} onValueChange={resetPage(setGroup)}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {groups.map((g) => <SelectItem key={g.codigo_erp} value={g.codigo_erp}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="only-active" checked={onlyActive} onCheckedChange={resetPage(setOnlyActive)} />
          <Label htmlFor="only-active" className="text-sm">Só ativos</Label>
        </div>
      </div>

      {isLoading ? <TableSkeleton rows={8} cols={6} /> : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Marca</TableHead>
                <TableHead className="hidden lg:table-cell">Grupo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Custo</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Cód. {p.code ?? "—"}{p.unit ? ` · ${p.unit}` : ""}
                      {!p.active && <Badge variant="outline" className="ml-2 text-[10px]">Inativo</Badge>}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.brand ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {(p.group_codigo_erp && groupName.get(p.group_codigo_erp)) ?? p.group_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(p.sale_price)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">{formatBRL(p.cost_price)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular-nums">{formatQty(p.stock)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={<Package className="h-7 w-7 text-muted-foreground" />}
                      title={debouncedSearch || group !== "all" ? "Nenhum produto encontrado" : "Nenhum produto ainda"}
                      description={debouncedSearch || group !== "all"
                        ? "Nenhum produto corresponde à busca ou ao grupo."
                        : "Os produtos chegam pela integração com o ERP (Integrações → ERP)."}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" aria-label="Próxima página" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
