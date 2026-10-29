import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart } from "lucide-react";
import { useCustomerPurchasesQuery, useSellersQuery, type OrderRow } from "@/hooks/queries/useSales";
import { OrderItemsSheet, KindBadge } from "@/components/crm/OrderItemsSheet";
import { formatBRL, formatDate, formatQty } from "@/lib/format";

/**
 * Aba "Compras" da ficha de empresa/contato: resumo, produtos mais comprados
 * e últimos pedidos, a partir do espelho do ERP. Só aparece para clientes que
 * vieram do ERP (têm codigo_erp).
 */
export function CustomerPurchasesPanel({ codigoErp, customerName }: { codigoErp: string; customerName: string }) {
  const { data, isLoading } = useCustomerPurchasesQuery(codigoErp);
  const { data: sellers = [] } = useSellersQuery();
  const [openOrder, setOpenOrder] = useState<OrderRow | null>(null);

  if (isLoading) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const s = data?.summary;
  if (!s && !data?.recentOrders.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <ShoppingCart className="h-6 w-6" />
        Nenhuma compra registrada no ERP para este cliente.
      </div>
    );
  }

  const sellerName = (code: string | null) => sellers.find((v) => v.codigo_erp === code)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Total comprado" value={formatBRL(s?.total_spent)} />
        <Kpi label="Pedidos" value={String(s?.order_count ?? 0)} />
        <Kpi label="Ticket médio" value={formatBRL(s?.avg_ticket)} />
        <Kpi
          label="Última compra"
          value={formatDate(s?.last_order_date)}
          hint={s?.days_since_last_order !== null && s?.days_since_last_order !== undefined ? `há ${s.days_since_last_order} dias` : undefined}
        />
      </div>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Produtos mais comprados</h4>
        <ul className="divide-y divide-border rounded-md border border-border">
          {data!.topProducts.map((p) => (
            <li key={p.product_codigo_erp} className="flex items-center justify-between gap-2 p-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.product_name ?? `Produto ${p.product_code ?? "—"}`}</p>
                <p className="text-xs text-muted-foreground">
                  {formatQty(p.quantity)} un. · {p.order_count} pedido(s) · último {formatDate(p.last_order_date)}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">{formatBRL(p.total)}</span>
            </li>
          ))}
          {data!.topProducts.length === 0 && <li className="p-2 text-center text-xs text-muted-foreground">—</li>}
        </ul>
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Últimos pedidos e orçamentos</h4>
        <ul className="divide-y divide-border rounded-md border border-border">
          {data!.recentOrders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted/50"
                onClick={() => setOpenOrder({ ...o, customer_name: customerName, seller_name: sellerName(o.seller_codigo_erp) })}
              >
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{formatDate(o.order_date)}</span>
                  <span className="font-medium">#{o.number ?? o.codigo_erp}</span>
                  <KindBadge kind={o.kind} />
                </span>
                <span className="tabular-nums">{formatBRL(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <OrderItemsSheet order={openOrder} onClose={() => setOpenOrder(null)} />
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
