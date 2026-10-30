-- Carteira por vendedor: o que cada papel enxerga, aplicado no banco.
--
-- Até aqui qualquer membro lia, alterava e excluía tudo da empresa; os papéis só
-- escondiam botões (ver useRole.ts). Agora:
--
--   owner/admin: tudo, como antes.
--   member (vendedor):
--     - vê os contatos, empresas e negócios de que é dono, e também os clientes
--       em que tem negócio ou tarefa atribuída (senão a tarefa de uma campanha
--       apontaria para um cliente invisível);
--     - vê atividades próprias ou ligadas ao que enxerga;
--     - vê pedidos e itens só desses clientes;
--     - edita o que é dele e pode passar para um colega;
--     - não exclui contatos, empresas nem negócios.
--
-- Produtos, grupos e vendedores continuam visíveis a todos: não são carteira.
-- As edge functions usam service_role e não passam por estas regras.
--
-- Os (SELECT função()) são de propósito: assim o banco calcula uma vez por
-- consulta, em vez de uma vez por linha (são 110 mil pedidos).

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.org_id FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.org_id = p.org_id
  WHERE p.id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id AND r.org_id = p.org_id
    WHERE p.id = auth.uid() AND r.role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.my_deal_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.deals WHERE owner_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.my_contact_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.contacts WHERE owner_id = auth.uid()
  UNION SELECT contact_id FROM public.deals WHERE owner_id = auth.uid() AND contact_id IS NOT NULL
  UNION SELECT contact_id FROM public.activities WHERE user_id = auth.uid() AND contact_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.my_company_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.companies WHERE owner_id = auth.uid()
  UNION SELECT company_id FROM public.deals WHERE owner_id = auth.uid() AND company_id IS NOT NULL
  UNION SELECT company_id FROM public.activities WHERE user_id = auth.uid() AND company_id IS NOT NULL
$$;

-- Códigos do ERP dos clientes do usuário: ligam pedidos e itens à carteira.
CREATE OR REPLACE FUNCTION public.my_customer_codes()
RETURNS SETOF TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT codigo_erp FROM public.companies WHERE codigo_erp IS NOT NULL AND id IN (SELECT public.my_company_ids())
  UNION
  SELECT codigo_erp FROM public.contacts WHERE codigo_erp IS NOT NULL AND id IN (SELECT public.my_contact_ids())
$$;

-- Índices para os filtros por dono.
CREATE INDEX IF NOT EXISTS idx_companies_owner ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON public.deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_activities_user ON public.activities(user_id);

-- Vendedor que cria sem dono vira dono; senão o registro sumiria para ele.
CREATE OR REPLACE FUNCTION public.default_owner_to_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_org_manager() THEN
    IF TG_TABLE_NAME = 'activities' THEN
      NEW.user_id := COALESCE(NEW.user_id, auth.uid());
    ELSE
      NEW.owner_id := COALESCE(NEW.owner_id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS default_owner_to_creator ON public.contacts;
CREATE TRIGGER default_owner_to_creator BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.default_owner_to_creator();
DROP TRIGGER IF EXISTS default_owner_to_creator ON public.companies;
CREATE TRIGGER default_owner_to_creator BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.default_owner_to_creator();
DROP TRIGGER IF EXISTS default_owner_to_creator ON public.deals;
CREATE TRIGGER default_owner_to_creator BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.default_owner_to_creator();
DROP TRIGGER IF EXISTS default_owner_to_creator ON public.activities;
CREATE TRIGGER default_owner_to_creator BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.default_owner_to_creator();

DROP POLICY IF EXISTS "Org members can view contacts" ON public.contacts;
CREATE POLICY "Org members can view contacts" ON public.contacts FOR SELECT USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()) OR id IN (SELECT public.my_contact_ids()))
);
DROP POLICY IF EXISTS "Org members can insert contacts" ON public.contacts;
CREATE POLICY "Org members can insert contacts" ON public.contacts FOR INSERT WITH CHECK (
  org_id = (SELECT public.current_org_id())
);
DROP POLICY IF EXISTS "Org members can update contacts" ON public.contacts;
CREATE POLICY "Org members can update contacts" ON public.contacts FOR UPDATE USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()))
) WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Org members can view companies" ON public.companies;
CREATE POLICY "Org members can view companies" ON public.companies FOR SELECT USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()) OR id IN (SELECT public.my_company_ids()))
);
DROP POLICY IF EXISTS "Org members can insert companies" ON public.companies;
CREATE POLICY "Org members can insert companies" ON public.companies FOR INSERT WITH CHECK (
  org_id = (SELECT public.current_org_id())
);
DROP POLICY IF EXISTS "Org members can update companies" ON public.companies;
CREATE POLICY "Org members can update companies" ON public.companies FOR UPDATE USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()))
) WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Org members can view deals" ON public.deals;
CREATE POLICY "Org members can view deals" ON public.deals FOR SELECT USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS "Org members can insert deals" ON public.deals;
CREATE POLICY "Org members can insert deals" ON public.deals FOR INSERT WITH CHECK (
  org_id = (SELECT public.current_org_id())
);
DROP POLICY IF EXISTS "Org members can update deals" ON public.deals;
CREATE POLICY "Org members can update deals" ON public.deals FOR UPDATE USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR owner_id = (SELECT auth.uid()))
) WITH CHECK (org_id = (SELECT public.current_org_id()));

DROP POLICY IF EXISTS "Org members can view activities" ON public.activities;
CREATE POLICY "Org members can view activities" ON public.activities FOR SELECT USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR user_id = (SELECT auth.uid())
    OR contact_id IN (SELECT public.my_contact_ids())
    OR company_id IN (SELECT public.my_company_ids())
    OR deal_id IN (SELECT public.my_deal_ids()))
);
DROP POLICY IF EXISTS "Org members can insert activities" ON public.activities;
CREATE POLICY "Org members can insert activities" ON public.activities FOR INSERT WITH CHECK (
  org_id = (SELECT public.current_org_id())
);
DROP POLICY IF EXISTS "Org members can update activities" ON public.activities;
CREATE POLICY "Org members can update activities" ON public.activities FOR UPDATE USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR user_id = (SELECT auth.uid()))
) WITH CHECK (org_id = (SELECT public.current_org_id()));

-- Excluir: clientes e negócios só owner/admin (a tela já escondia o botão);
-- atividades, também quem as criou.
DROP POLICY IF EXISTS "Org members can delete contacts" ON public.contacts;
CREATE POLICY "Org members can delete contacts" ON public.contacts FOR DELETE USING (
  org_id = (SELECT public.current_org_id()) AND (SELECT public.is_org_manager())
);
DROP POLICY IF EXISTS "Org members can delete companies" ON public.companies;
CREATE POLICY "Org members can delete companies" ON public.companies FOR DELETE USING (
  org_id = (SELECT public.current_org_id()) AND (SELECT public.is_org_manager())
);
DROP POLICY IF EXISTS "Org members can delete deals" ON public.deals;
CREATE POLICY "Org members can delete deals" ON public.deals FOR DELETE USING (
  org_id = (SELECT public.current_org_id()) AND (SELECT public.is_org_manager())
);
DROP POLICY IF EXISTS "Org members can delete activities" ON public.activities;
CREATE POLICY "Org members can delete activities" ON public.activities FOR DELETE USING (
  org_id = (SELECT public.current_org_id()) AND ((SELECT public.is_org_manager()) OR user_id = (SELECT auth.uid()))
);

-- Pedidos e itens: só dos clientes da carteira.
DROP POLICY IF EXISTS "Org members can view sales_orders" ON public.sales_orders;
CREATE POLICY "Org members can view sales_orders" ON public.sales_orders FOR SELECT USING (
  org_id = (SELECT public.current_org_id())
  AND ((SELECT public.is_org_manager()) OR customer_codigo_erp IN (SELECT public.my_customer_codes()))
);
DROP POLICY IF EXISTS "Org members can view sales_order_items" ON public.sales_order_items;
CREATE POLICY "Org members can view sales_order_items" ON public.sales_order_items FOR SELECT USING (
  org_id = (SELECT public.current_org_id())
  AND ((SELECT public.is_org_manager()) OR customer_codigo_erp IN (SELECT public.my_customer_codes()))
);

-- Público-alvo: o vendedor só busca entre os próprios clientes. A função roda como
-- SECURITY DEFINER (não passa pelo RLS), então o filtro precisa ser explícito.
DROP FUNCTION IF EXISTS public.audience_search_org(UUID, JSONB, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.audience_search_org(
  p_org UUID, p_filters JSONB, p_limit INTEGER, p_offset INTEGER, p_sort TEXT, p_owner UUID DEFAULT NULL
)
RETURNS TABLE (
  customer_kind TEXT, id UUID, codigo_erp TEXT, name TEXT, email TEXT, phone TEXT,
  cnpj_cpf TEXT, cidade TEXT, estado TEXT, seller_codigo_erp TEXT,
  total_spent NUMERIC, order_count BIGINT, avg_ticket NUMERIC,
  last_order_date DATE, days_since_last_order INTEGER,
  matched_value NUMERIC, matched_qty NUMERIC, matched_last_date DATE,
  total_count BIGINT, total_matched_value NUMERIC
)
-- enable_nestloop off: as regras vêm de um JSON, o planejador subestima as linhas
-- e escolhe laços aninhados (mais de 8 s, cortado pelo timeout); com hash join o
-- pior caso medido sobre 272 mil itens foi 2,7 s.
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public SET enable_nestloop = off
AS $$
  WITH cfg AS (
    SELECT
      t.ord AS idx,
      COALESCE(t.r->>'op', 'bought') AS op,
      COALESCE(t.r->>'doc', 'order') AS doc,
      -- Escapa curingas digitados e deixa cada palavra casar em qualquer distância.
      CASE WHEN NULLIF(trim(t.r->>'product'), '') IS NOT NULL THEN
        '%' || regexp_replace(regexp_replace(trim(t.r->>'product'), '([\\%_])', '\\\1', 'g'), '\s+', '%', 'g') || '%'
      END AS product,
      NULLIF(trim(t.r->>'product'), '') AS product_raw,
      NULLIF(trim(t.r->>'brand'), '') AS brand,
      NULLIF(t.r->>'group', '') AS grp,
      COALESCE(
        NULLIF(t.r->>'from', '')::date,
        CASE WHEN NULLIF(t.r->>'months', '') IS NOT NULL
          THEN (CURRENT_DATE - make_interval(months => (t.r->>'months')::int))::date END
      ) AS from_date,
      NULLIF(t.r->>'to', '')::date AS to_date,
      NULLIF(t.r->>'min_value', '')::numeric AS min_value,
      NULLIF(t.r->>'min_qty', '')::numeric AS min_qty
    FROM jsonb_array_elements(COALESCE(p_filters->'rules', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)
  ),
  counts AS (
    SELECT COUNT(*) FILTER (WHERE op = 'bought') AS n_pos,
           COUNT(*) FILTER (WHERE op = 'not_bought') AS n_neg
    FROM cfg
  ),
  hits AS (
    SELECT c.idx, c.op, o.customer_codigo_erp AS code,
           SUM(i.total) AS v, SUM(i.quantity) AS q, MAX(o.order_date) AS d
    FROM cfg c
    JOIN public.sales_orders o
      ON o.org_id = p_org
     AND (c.doc = 'any' OR o.kind = c.doc)
     AND (c.from_date IS NULL OR o.order_date >= c.from_date)
     AND (c.to_date IS NULL OR o.order_date <= c.to_date)
    JOIN public.sales_order_items i ON i.org_id = p_org AND i.order_codigo_erp = o.codigo_erp
    LEFT JOIN public.products p ON p.org_id = p_org AND p.codigo_erp = i.product_codigo_erp
    WHERE o.customer_codigo_erp IS NOT NULL
      AND (c.product IS NULL OR p.name ILIKE c.product OR p.code = c.product_raw)
      AND (c.brand IS NULL OR p.brand ILIKE c.brand)
      AND (c.grp IS NULL OR p.group_codigo_erp = c.grp)
    GROUP BY c.idx, c.op, c.min_value, c.min_qty, o.customer_codigo_erp
    HAVING (c.min_value IS NULL OR SUM(i.total) >= c.min_value)
       AND (c.min_qty IS NULL OR SUM(i.quantity) >= c.min_qty)
  ),
  hit_sum AS (
    SELECT code,
           COUNT(*) FILTER (WHERE op = 'bought') AS pos,
           COUNT(*) FILTER (WHERE op = 'not_bought') AS neg,
           SUM(v) FILTER (WHERE op = 'bought') AS v,
           SUM(q) FILTER (WHERE op = 'bought') AS q,
           MAX(d) FILTER (WHERE op = 'bought') AS d
    FROM hits GROUP BY code
  ),
  purchases AS (
    SELECT customer_codigo_erp AS code, COALESCE(SUM(total), 0) AS total, COUNT(*) AS n,
           ROUND(COALESCE(AVG(total), 0), 2) AS avg, MAX(order_date) AS last
    FROM public.sales_orders
    WHERE org_id = p_org AND kind = 'order' AND customer_codigo_erp IS NOT NULL
    GROUP BY customer_codigo_erp
  ),
  customers AS (
    SELECT 'company'::text AS kind, c.id, c.codigo_erp, c.name, c.email, c.phone, c.cnpj_cpf,
           c.cidade, c.estado, c.erp_seller_codigo AS seller, c.erp_active AS active
    FROM public.companies c WHERE c.org_id = p_org AND (p_owner IS NULL OR c.owner_id = p_owner)
    UNION ALL
    SELECT 'contact', c.id, c.codigo_erp, trim(c.first_name || ' ' || COALESCE(c.last_name, '')),
           c.email, c.phone, c.cnpj_cpf, c.cidade, c.estado, c.erp_seller_codigo, c.erp_active
    FROM public.contacts c WHERE c.org_id = p_org AND (p_owner IS NULL OR c.owner_id = p_owner)
  ),
  matched AS (
    SELECT cu.*, COALESCE(pu.total, 0) AS total_spent, COALESCE(pu.n, 0) AS order_count,
           COALESCE(pu.avg, 0) AS avg_ticket, pu.last AS last_order,
           (CURRENT_DATE - pu.last) AS days_since,
           h.v AS m_value, h.q AS m_qty, h.d AS m_last
    FROM customers cu
    CROSS JOIN counts k
    LEFT JOIN purchases pu ON pu.code = cu.codigo_erp
    LEFT JOIN hit_sum h ON h.code = cu.codigo_erp
    WHERE (
        k.n_pos + k.n_neg = 0
        OR (COALESCE(p_filters->>'match', 'all') = 'all'
            AND COALESCE(h.pos, 0) = k.n_pos AND COALESCE(h.neg, 0) = 0)
        OR (p_filters->>'match' = 'any'
            AND (COALESCE(h.pos, 0) > 0 OR COALESCE(h.neg, 0) < k.n_neg))
      )
      AND (NULLIF(p_filters->>'kind', '') IS NULL OR cu.kind = p_filters->>'kind')
      AND (NULLIF(trim(p_filters->>'cidade'), '') IS NULL OR cu.cidade ILIKE '%' || trim(p_filters->>'cidade') || '%')
      AND (NULLIF(p_filters->>'estado', '') IS NULL OR cu.estado = upper(p_filters->>'estado'))
      AND (NULLIF(p_filters->>'seller', '') IS NULL OR cu.seller = p_filters->>'seller')
      AND (COALESCE((p_filters->>'has_email')::boolean, false) = false OR NULLIF(cu.email, '') IS NOT NULL)
      AND (COALESCE((p_filters->>'has_phone')::boolean, false) = false OR NULLIF(cu.phone, '') IS NOT NULL)
      AND (COALESCE((p_filters->>'only_active')::boolean, false) = false OR cu.active IS DISTINCT FROM false)
      AND (COALESCE((p_filters->>'has_document')::boolean, false) = false OR NULLIF(cu.cnpj_cpf, '') IS NOT NULL)
      AND (NULLIF(p_filters->>'min_total', '') IS NULL OR COALESCE(pu.total, 0) >= (p_filters->>'min_total')::numeric)
      AND (NULLIF(p_filters->>'max_total', '') IS NULL OR COALESCE(pu.total, 0) <= (p_filters->>'max_total')::numeric)
      AND (NULLIF(p_filters->>'min_orders', '') IS NULL OR COALESCE(pu.n, 0) >= (p_filters->>'min_orders')::numeric)
      AND (NULLIF(p_filters->>'min_ticket', '') IS NULL OR COALESCE(pu.avg, 0) >= (p_filters->>'min_ticket')::numeric)
      AND (NULLIF(p_filters->>'min_days_since', '') IS NULL OR (CURRENT_DATE - pu.last) >= (p_filters->>'min_days_since')::int)
      AND (NULLIF(p_filters->>'max_days_since', '') IS NULL OR (CURRENT_DATE - pu.last) <= (p_filters->>'max_days_since')::int)
  )
  SELECT m.kind, m.id, m.codigo_erp, m.name, m.email, m.phone, m.cnpj_cpf, m.cidade, m.estado, m.seller,
         m.total_spent, m.order_count, m.avg_ticket, m.last_order, m.days_since,
         m.m_value, m.m_qty, m.m_last,
         COUNT(*) OVER (), COALESCE(SUM(m.m_value) OVER (), 0)
  FROM matched m
  ORDER BY
    CASE WHEN p_sort = 'total' THEN m.total_spent END DESC NULLS LAST,
    CASE WHEN p_sort = 'recent' THEN m.last_order END DESC NULLS LAST,
    CASE WHEN p_sort = 'oldest' THEN m.last_order END ASC NULLS LAST,
    CASE WHEN p_sort = 'name' THEN m.name END ASC,
    m.m_value DESC NULLS LAST, m.total_spent DESC, m.id
  LIMIT LEAST(COALESCE(p_limit, 50), 1000) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.audience_search_org(UUID, JSONB, INTEGER, INTEGER, TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audience_search(
  p_filters JSONB, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0, p_sort TEXT DEFAULT 'matched'
)
RETURNS TABLE (
  customer_kind TEXT, id UUID, codigo_erp TEXT, name TEXT, email TEXT, phone TEXT,
  cnpj_cpf TEXT, cidade TEXT, estado TEXT, seller_codigo_erp TEXT,
  total_spent NUMERIC, order_count BIGINT, avg_ticket NUMERIC,
  last_order_date DATE, days_since_last_order INTEGER,
  matched_value NUMERIC, matched_qty NUMERIC, matched_last_date DATE,
  total_count BIGINT, total_matched_value NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $body$
DECLARE v_org UUID := public.current_org_id();
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'usuário sem organização' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.audience_search_org(
    v_org, p_filters, p_limit, p_offset, p_sort,
    CASE WHEN public.is_org_manager() THEN NULL ELSE auth.uid() END
  );
END;
$body$;
