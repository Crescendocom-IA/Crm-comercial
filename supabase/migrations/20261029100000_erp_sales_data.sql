-- Fase 2 da integração ERP: produtos, pedidos, itens e vendedores.
--
-- O CRM passa a guardar o histórico de vendas do ERP (só espelho: o ERP é a
-- fonte, o CRM não cria pedidos). É a base do filtro de público-alvo e da IA
-- de recomendação.
--
-- Chave de tudo: `codigo_erp` = ID INTERNO do ERP (CLI_ID, PROD_ID, PEDIDO_ID,
-- VEND_ID, ITEMPED_ID). Conferido no banco real: os pedidos apontam para
-- CLI_ID em 100% dos casos e só 78% batem com CLI_CODIGO, então o código
-- "visível" vai em coluna própria (`code`/`number`) e não serve de chave.
--
-- As ligações (pedido → cliente, item → produto…) são feitas por codigo_erp,
-- não por FK: o sync chega em lotes e em qualquer ordem, e um item pode chegar
-- antes do pedido. Índices em cada coluna de ligação mantêm os joins rápidos.

-- ── Clientes: campos do ERP que não tinham destino ─────────────────────────
-- O erp-sync recebia email/telefone de clientes PJ e descartava, porque
-- companies não tinha as colunas.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS erp_seller_codigo TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS erp_active BOOLEAN;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS erp_seller_codigo TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS erp_active BOOLEAN;

-- ── Vendedores do ERP ──────────────────────────────────────────────────────
-- Só referência (nome nos pedidos e clientes). `user_id` liga ao usuário do
-- CRM quando o vendedor for convidado. A senha do ERP nunca é sincronizada.
CREATE TABLE IF NOT EXISTS public.erp_sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo_erp TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  erp_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo_erp)
);

-- ── Grupos de produto ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo_erp TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  erp_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo_erp)
);

-- ── Produtos ───────────────────────────────────────────────────────────────
-- Marca vem do ERP como texto (PROD_MARCA), não como id — fica como texto.
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo_erp TEXT NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  group_codigo_erp TEXT,
  group_name TEXT,
  subgroup_name TEXT,
  unit TEXT,
  ean TEXT,
  ncm TEXT,
  cost_price NUMERIC(14,4),
  sale_price NUMERIC(14,2),
  margin NUMERIC(10,4),
  stock NUMERIC(14,4),
  active BOOLEAN NOT NULL DEFAULT true,
  erp_created_at DATE,
  erp_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo_erp)
);
CREATE INDEX IF NOT EXISTS idx_products_org_group ON public.products(org_id, group_codigo_erp);
CREATE INDEX IF NOT EXISTS idx_products_org_brand ON public.products(org_id, brand);
CREATE INDEX IF NOT EXISTS idx_products_org_code ON public.products(org_id, code);

-- ── Pedidos (e orçamentos) ─────────────────────────────────────────────────
-- kind: 'order' (PEDIDO_TIPO = 'P') ou 'quote' (= 'O'). Só 'order' conta
-- como venda nos totais; orçamentos ficam para o filtro ("pediu orçamento e
-- não comprou").
CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo_erp TEXT NOT NULL,
  number TEXT,
  kind TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'quote')),
  status TEXT,
  customer_codigo_erp TEXT,
  seller_codigo_erp TEXT,
  order_date DATE,
  subtotal NUMERIC(14,2),
  discount NUMERIC(14,2),
  total NUMERIC(14,2),
  payment_codigo_erp TEXT,
  contact_name TEXT,
  notes TEXT,
  erp_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo_erp)
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON public.sales_orders(org_id, customer_codigo_erp, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON public.sales_orders(org_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_seller ON public.sales_orders(org_id, seller_codigo_erp);

-- ── Itens dos pedidos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  codigo_erp TEXT NOT NULL,
  order_codigo_erp TEXT,
  product_codigo_erp TEXT,
  customer_codigo_erp TEXT,
  seq INTEGER,
  product_label TEXT,
  quantity NUMERIC(14,4),
  unit_price NUMERIC(14,4),
  discount NUMERIC(14,4),
  total NUMERIC(14,2),
  erp_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, codigo_erp)
);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON public.sales_order_items(org_id, order_codigo_erp);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product ON public.sales_order_items(org_id, product_codigo_erp);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_customer ON public.sales_order_items(org_id, customer_codigo_erp);

-- ── RLS: leitura por membros da org; escrita só pelo erp-sync ──────────────
-- O espelho do ERP não é editável pelo app: quem grava é a edge function com
-- service_role (que ignora RLS). Sem policies de escrita = negado ao cliente.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_sellers', 'product_groups', 'products', 'sales_orders', 'sales_order_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Org members can view %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Org members can view %s" ON public.%I FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id))',
      t, t);
  END LOOP;
END $$;

-- ── Resumo de compras por cliente ──────────────────────────────────────────
-- Só pedidos (kind = 'order'). security_invoker: respeita o RLS de quem lê.
CREATE OR REPLACE VIEW public.customer_purchase_summary
WITH (security_invoker = true) AS
SELECT
  o.org_id,
  o.customer_codigo_erp,
  COUNT(*) AS order_count,
  COALESCE(SUM(o.total), 0) AS total_spent,
  ROUND(COALESCE(AVG(o.total), 0), 2) AS avg_ticket,
  MIN(o.order_date) AS first_order_date,
  MAX(o.order_date) AS last_order_date,
  (CURRENT_DATE - MAX(o.order_date)) AS days_since_last_order
FROM public.sales_orders o
WHERE o.kind = 'order' AND o.customer_codigo_erp IS NOT NULL
GROUP BY o.org_id, o.customer_codigo_erp;

-- Produtos mais comprados por um cliente (aba "Compras" da ficha).
CREATE OR REPLACE FUNCTION public.customer_top_products(p_customer_codigo_erp TEXT, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  product_codigo_erp TEXT,
  product_name TEXT,
  product_code TEXT,
  quantity NUMERIC,
  total NUMERIC,
  order_count BIGINT,
  last_order_date DATE
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    i.product_codigo_erp,
    COALESCE(p.name, MAX(i.product_label)),
    p.code,
    SUM(i.quantity),
    SUM(i.total),
    COUNT(DISTINCT i.order_codigo_erp),
    MAX(o.order_date)
  FROM public.sales_order_items i
  JOIN public.sales_orders o
    ON o.org_id = i.org_id AND o.codigo_erp = i.order_codigo_erp AND o.kind = 'order'
  LEFT JOIN public.products p
    ON p.org_id = i.org_id AND p.codigo_erp = i.product_codigo_erp
  WHERE i.customer_codigo_erp = p_customer_codigo_erp
  GROUP BY i.product_codigo_erp, p.name, p.code
  ORDER BY SUM(i.total) DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.customer_top_products(TEXT, INTEGER) TO authenticated;
