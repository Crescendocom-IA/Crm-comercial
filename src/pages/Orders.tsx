import { useState } from "react";
import { ShoppingCart, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/crm/EmptyState";
import { TableSkeleton } from "@/components/crm/TableSkeleton";
import { OrderItemsSheet, KindBadge } from "@/components/crm/OrderItemsSheet";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useOrdersQuery, useSellersQuery, SALES_PAGE_SIZE, type OrdersParams, type OrderRow,
} from "@/hooks/queries/useSales";
import { formatBRL, formatDate } from "@/lib/format";

/** Pedidos e orçamentos espelhados do ERP (somente leitura). */
export default function Orders() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [kind, setKind] = useState<OrdersParams["kind"]>("order");
  const [seller, setSeller] = useState("all");
  const [page, setPage] = useState(0);
  const [openOrder, setOpenOrder] = useState<OrderRow | null>(null);

  const { data: sellers = [] } = useSellersQuery();
  const { data, isLoading } = useOrdersQuery({
    page, search: debouncedSearch, kind, sellerCodigo: seller === "all" ? undefined : seller,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / SALES_PAGE_SIZE);
  const filtered = !!debouncedSearch || seller !== "all";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Pedidos</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {total.toLocaleString("pt-BR")} {kind === "quote" ? "orçamentos" : kind === "order" ? "vendas" : "pedidos e orçamentos"} · sincronizados do ERP
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pelo número do pedido…"
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <Select value={kind} onValueChange={(v) => { setKind(v as OrdersParams["kind"]); setPage(0); }}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="order">Vendas</SelectItem>
            <SelectItem value="quote">Orçamentos</SelectItem>
            <SelectItem value="all">Vendas e orçamentos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={seller} onValueChange={(v) => { setSeller(v); setPage(0); }}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vendedores</SelectItem>
            {sellers.map((v) => <SelectItem key={v.codigo_erp} value={v.codigo_erp}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <TableSkeleton rows={8} cols={5} /> : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Vendedor</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenOrder(o)}>
                  <TableCell className="tabular-nums whitespace-nowrap">{formatDate(o.order_date)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">#{o.number ?? o.codigo_erp}<KindBadge kind={o.kind} /></span>
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">{o.customer_name ?? <span className="text-muted-foreground">Cliente {o.customer_codigo_erp ?? "—"}</span>}</TableCell>
                  <TableCell className="hidden md:table-cell">{o.seller_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(o.total)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState
                      icon={<ShoppingCart className="h-7 w-7 text-muted-foreground" />}
                      title={filtered ? "Nenhum pedido encontrado" : "Nenhum pedido ainda"}
                      description={filtered
                        ? "Nenhum pedido corresponde à busca ou ao vendedor."
                        : "Os pedidos chegam pela integração com o ERP (Integrações → ERP)."}
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

      <OrderItemsSheet order={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  );
}
