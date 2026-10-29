import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrderItemsQuery, type OrderRow } from "@/hooks/queries/useSales";
import { formatBRL, formatDate, formatQty } from "@/lib/format";

/** Detalhe de um pedido do ERP: cabeçalho + itens. */
export function OrderItemsSheet({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const { data: items = [], isLoading } = useOrderItemsQuery(order?.codigo_erp ?? null);

  return (
    <Sheet open={!!order} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {/* Na animação de fechar, order já é null: o título fica para leitores de tela. */}
        {!order && <SheetTitle className="sr-only">Pedido</SheetTitle>}
        {order && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {order.kind === "quote" ? "Orçamento" : "Pedido"} {order.number ?? order.codigo_erp}
                <KindBadge kind={order.kind} />
              </SheetTitle>
              <SheetDescription>
                {formatDate(order.order_date)} · {order.customer_name ?? `Cliente ${order.customer_codigo_erp ?? "—"}`}
                {order.seller_name ? ` · ${order.seller_name}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Bruto" value={formatBRL(order.subtotal)} />
              <Stat label="Desconto" value={formatBRL(order.discount)} />
              <Stat label="Total" value={formatBRL(order.total)} strong />
            </div>

            {order.notes && <p className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">{order.notes}</p>}

            <h3 className="mt-5 mb-2 text-sm font-semibold">Itens ({items.length})</h3>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.product_name ?? `Produto ${i.product_code ?? "—"}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.product_code ? `Cód. ${i.product_code} · ` : ""}
                        {formatQty(i.quantity)} × {formatBRL(i.unit_price)}
                        {i.discount ? ` · desc. ${formatBRL(i.discount)}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{formatBRL(i.total)}</span>
                  </li>
                ))}
                {items.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">Sem itens</li>}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return kind === "quote"
    ? <Badge variant="outline" className="text-xs font-normal">Orçamento</Badge>
    : <Badge variant="secondary" className="text-xs font-normal">Venda</Badge>;
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${strong ? "font-bold" : "font-medium"}`}>{value}</p>
    </div>
  );
}
