import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { STALE_TIME } from "./config";
import type { Database } from "@/integrations/supabase/types";

/*
 * Espelho do histórico de vendas do ERP (produtos, pedidos, itens). Só
 * leitura: quem grava é o erp-sync. Tudo paginado no servidor — são dezenas de
 * milhares de produtos e centenas de milhares de itens.
 *
 * As ligações são por codigo_erp (não FK), então nomes de cliente e vendedor
 * são resolvidos em uma segunda leitura só para a página exibida.
 *
 *   ['sales', orgId, 'products', { params }]
 *   ['sales', orgId, 'orders',   { params }]
 *   ['sales', orgId, 'items',    orderCodigo]
 *   ['sales', orgId, 'customer', customerCodigo]
 *   ['sales', orgId, 'sellers']
 *   ['sales', orgId, 'groups']
 */

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type SalesOrder = Database["public"]["Tables"]["sales_orders"]["Row"];
export type SalesOrderItem = Database["public"]["Tables"]["sales_order_items"]["Row"];
type Seller = Database["public"]["Tables"]["erp_sellers"]["Row"];
type ProductGroup = Database["public"]["Tables"]["product_groups"]["Row"];
type PurchaseSummary = Database["public"]["Views"]["customer_purchase_summary"]["Row"];
type TopProduct = Database["public"]["Functions"]["customer_top_products"]["Returns"][number];

export const SALES_PAGE_SIZE = 50;

/** Vírgula e parênteses são sintaxe do .or() do PostgREST. */
const sanitize = (s: string) => s.replace(/[,()%]/g, " ").trim();

export function useSellersQuery() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sales", orgId, "sellers"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("erp_sellers").select("*").eq("org_id", orgId!).order("name");
      if (error) throw error;
      return (data || []) as Seller[];
    },
  });
}

export function useProductGroupsQuery() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sales", orgId, "groups"] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("product_groups").select("*").eq("org_id", orgId!).order("name");
      if (error) throw error;
      return (data || []) as ProductGroup[];
    },
  });
}

export interface ProductsParams {
  page: number;
  search: string;
  groupCodigo?: string;
  onlyActive: boolean;
}

export function useProductsQuery(params: ProductsParams) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sales", orgId, "products", params] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("products").select("*", { count: "exact" }).eq("org_id", orgId!);
      const s = sanitize(params.search);
      if (s) q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,brand.ilike.%${s}%,ean.eq.${s}`);
      if (params.groupCodigo) q = q.eq("group_codigo_erp", params.groupCodigo);
      if (params.onlyActive) q = q.eq("active", true);
      const from = params.page * SALES_PAGE_SIZE;
      const { data, error, count } = await q.order("name").range(from, from + SALES_PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as Product[], total: count ?? 0 };
    },
  });
}

export interface OrdersParams {
  page: number;
  search: string;
  kind: "all" | "order" | "quote";
  sellerCodigo?: string;
  customerCodigo?: string;
}

export type OrderRow = SalesOrder & { customer_name: string | null; seller_name: string | null };

/**
 * Nome do cliente por codigo_erp: o cliente do ERP vira empresa (CNPJ) ou
 * contato (CPF), então procura nas duas tabelas.
 */
async function customerNames(orgId: string, codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (codes.length === 0) return map;
  const [companies, contacts] = await Promise.all([
    supabase.from("companies").select("codigo_erp,name").eq("org_id", orgId).in("codigo_erp", codes),
    supabase.from("contacts").select("codigo_erp,first_name,last_name").eq("org_id", orgId).in("codigo_erp", codes),
  ]);
  if (companies.error) throw companies.error;
  if (contacts.error) throw contacts.error;
  for (const c of companies.data || []) if (c.codigo_erp) map.set(c.codigo_erp, c.name);
  for (const c of contacts.data || []) {
    if (c.codigo_erp) map.set(c.codigo_erp, [c.first_name, c.last_name].filter(Boolean).join(" "));
  }
  return map;
}

export function useOrdersQuery(params: OrdersParams) {
  const { orgId } = useOrg();
  const { data: sellers = [] } = useSellersQuery();
  return useQuery({
    queryKey: ["sales", orgId, "orders", params, sellers.length] as const,
    enabled: !!orgId,
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("sales_orders").select("*", { count: "exact" }).eq("org_id", orgId!);
      const s = sanitize(params.search);
      if (s) q = q.ilike("number", `%${s}%`);
      if (params.kind !== "all") q = q.eq("kind", params.kind);
      if (params.sellerCodigo) q = q.eq("seller_codigo_erp", params.sellerCodigo);
      if (params.customerCodigo) q = q.eq("customer_codigo_erp", params.customerCodigo);
      const from = params.page * SALES_PAGE_SIZE;
      const { data, error, count } = await q
        .order("order_date", { ascending: false, nullsFirst: false })
        .order("codigo_erp", { ascending: false })
        .range(from, from + SALES_PAGE_SIZE - 1);
      if (error) throw error;
      const orders = (data || []) as SalesOrder[];
      const names = await customerNames(orgId!, [...new Set(orders.map((o) => o.customer_codigo_erp).filter(Boolean) as string[])]);
      const sellerNames = new Map(sellers.map((v) => [v.codigo_erp, v.name]));
      const rows: OrderRow[] = orders.map((o) => ({
        ...o,
        customer_name: o.customer_codigo_erp ? names.get(o.customer_codigo_erp) ?? null : null,
        seller_name: o.seller_codigo_erp ? sellerNames.get(o.seller_codigo_erp) ?? null : null,
      }));
      return { rows, total: count ?? 0 };
    },
  });
}

export type OrderItemRow = SalesOrderItem & { product_name: string | null; product_code: string | null };

export function useOrderItemsQuery(orderCodigo: string | null) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sales", orgId, "items", orderCodigo] as const,
    enabled: !!orgId && !!orderCodigo,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_order_items").select("*")
        .eq("org_id", orgId!).eq("order_codigo_erp", orderCodigo!).order("seq");
      if (error) throw error;
      const items = (data || []) as SalesOrderItem[];
      const codes = [...new Set(items.map((i) => i.product_codigo_erp).filter(Boolean) as string[])];
      const products = new Map<string, { name: string; code: string | null }>();
      if (codes.length) {
        const { data: ps, error: pErr } = await supabase.from("products").select("codigo_erp,name,code")
          .eq("org_id", orgId!).in("codigo_erp", codes);
        if (pErr) throw pErr;
        for (const p of ps || []) products.set(p.codigo_erp, { name: p.name, code: p.code });
      }
      return items.map((i): OrderItemRow => {
        const p = i.product_codigo_erp ? products.get(i.product_codigo_erp) : undefined;
        return { ...i, product_name: p?.name ?? null, product_code: p?.code ?? i.product_label };
      });
    },
  });
}

/** Aba "Compras" da ficha de empresa/contato. */
export function useCustomerPurchasesQuery(customerCodigo: string | null | undefined) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sales", orgId, "customer", customerCodigo] as const,
    enabled: !!orgId && !!customerCodigo,
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const [summary, top, recent] = await Promise.all([
        supabase.from("customer_purchase_summary").select("*")
          .eq("org_id", orgId!).eq("customer_codigo_erp", customerCodigo!).maybeSingle(),
        supabase.rpc("customer_top_products", { p_customer_codigo_erp: customerCodigo!, p_limit: 10 }),
        supabase.from("sales_orders").select("*").eq("org_id", orgId!).eq("customer_codigo_erp", customerCodigo!)
          .order("order_date", { ascending: false, nullsFirst: false }).limit(10),
      ]);
      if (summary.error) throw summary.error;
      if (top.error) throw top.error;
      if (recent.error) throw recent.error;
      return {
        summary: summary.data as PurchaseSummary | null,
        topProducts: (top.data || []) as TopProduct[],
        recentOrders: (recent.data || []) as SalesOrder[],
      };
    },
  });
}
