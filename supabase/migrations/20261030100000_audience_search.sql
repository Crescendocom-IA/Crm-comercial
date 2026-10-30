-- Busca de público-alvo: cruza cadastro de clientes com o histórico de vendas.
--
-- p_filters (JSON):
--   match: 'all' (todas as regras) | 'any' (qualquer uma)
--   rules: [{ op: 'bought' | 'not_bought', doc: 'order' | 'quote' | 'any',
--             product, brand, group, months, from, to, min_value, min_qty }]
--   kind: 'company' | 'contact'; cidade, estado, seller, has_email, has_phone, only_active
--   has_document: exclui quem não tem CNPJ/CPF, como as contas internas do ERP
--     (CONSUMIDOR = venda de balcão, TRANSFERENCIA), que não são alvo de oferta
--   min_total, max_total, min_orders, min_ticket, min_days_since, max_days_since
--
-- Ex.: "pediu orçamento de mangueira e não comprou" =
--   [{op:'bought', doc:'quote', product:'mangueira'},
--    {op:'not_bought', doc:'order', product:'mangueira'}]
--
-- Duas funções: a interna recebe a org e faz a consulta; a pública descobre a
-- org pelo usuário logado. Assim a org nunca vem do cliente. SECURITY DEFINER
-- porque avaliar o RLS linha a linha em 272 mil itens estouraria o tempo
-- limite da consulta; o isolamento é o filtro explícito por org em cada tabela.
-- Texto do filtro só entra como parâmetro — não há SQL dinâmico.

CREATE OR REPLACE FUNCTION public.audience_search_org(
  p_org UUID, p_filters JSONB, p_limit INTEGER, p_offset INTEGER, p_sort TEXT
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
    FROM public.companies c WHERE c.org_id = p_org
    UNION ALL
    SELECT 'contact', c.id, c.codigo_erp, trim(c.first_name || ' ' || COALESCE(c.last_name, '')),
           c.email, c.phone, c.cnpj_cpf, c.cidade, c.estado, c.erp_seller_codigo, c.erp_active
    FROM public.contacts c WHERE c.org_id = p_org
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

REVOKE EXECUTE ON FUNCTION public.audience_search_org(UUID, JSONB, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

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
AS $$
DECLARE v_org UUID;
BEGIN
  v_org := public.get_user_org_id(auth.uid());
  IF v_org IS NULL OR NOT public.user_belongs_to_org(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'usuário sem organização' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.audience_search_org(v_org, p_filters, p_limit, p_offset, p_sort);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audience_search(JSONB, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audience_search(JSONB, INTEGER, INTEGER, TEXT) TO authenticated;

-- Registro criado no teste do token do ERP.
DELETE FROM public.product_groups WHERE codigo_erp = '__teste__';
