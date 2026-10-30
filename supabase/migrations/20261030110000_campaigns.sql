-- Campanhas: ações em massa a partir de um público-alvo.
--
-- Uma campanha cria uma tarefa OU um negócio por cliente do público. Fica
-- registrada para medir o resultado (tarefas feitas, negócios ganhos) e para
-- poder ser desfeita: um clique errado aqui gera centenas de registros.
--
-- Criar e desfazer são restritos a owner/admin; a empresa vem sempre do usuário
-- logado. Limite de 1.000 clientes por campanha.

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('task', 'deal')),
  filters JSONB NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  undone_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON public.campaigns(org_id, created_at DESC);

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_campaign ON public.activities(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_campaign ON public.deals(campaign_id) WHERE campaign_id IS NOT NULL;

-- Só leitura para o app; quem escreve são as funções abaixo.
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view campaigns" ON public.campaigns;
CREATE POLICY "Org members can view campaigns" ON public.campaigns
  FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));

-- Resultado de cada campanha.
CREATE OR REPLACE VIEW public.campaign_results
WITH (security_invoker = true) AS
SELECT
  c.id, c.org_id, c.name, c.action, c.target_count, c.created_at, c.undone_at, c.created_by,
  (SELECT COUNT(*) FROM public.activities a WHERE a.campaign_id = c.id) AS tasks_total,
  (SELECT COUNT(*) FROM public.activities a WHERE a.campaign_id = c.id AND a.completed_at IS NOT NULL) AS tasks_done,
  (SELECT COUNT(*) FROM public.deals d WHERE d.campaign_id = c.id) AS deals_total,
  (SELECT COUNT(*) FROM public.deals d WHERE d.campaign_id = c.id AND d.status = 'open') AS deals_open,
  (SELECT COUNT(*) FROM public.deals d WHERE d.campaign_id = c.id AND d.status = 'won') AS deals_won,
  (SELECT COUNT(*) FROM public.deals d WHERE d.campaign_id = c.id AND d.status = 'lost') AS deals_lost,
  (SELECT COALESCE(SUM(d.value), 0) FROM public.deals d WHERE d.campaign_id = c.id AND d.status = 'won') AS won_value
FROM public.campaigns c;

-- Empresa do usuário logado, exigindo owner ou admin.
CREATE OR REPLACE FUNCTION public.require_org_manager()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org UUID;
BEGIN
  v_org := public.get_user_org_id(auth.uid());
  IF v_org IS NULL OR NOT (
    public.has_role(auth.uid(), v_org, 'owner') OR public.has_role(auth.uid(), v_org, 'admin')
  ) THEN
    RAISE EXCEPTION 'apenas owner ou admin podem fazer esta ação' USING ERRCODE = '42501';
  END IF;
  RETURN v_org;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.require_org_manager() FROM PUBLIC, anon, authenticated;

-- p_params:
--   owner_mode: 'seller' (vendedor do cliente, se ligado a um usuário) | 'fixed'
--   owner_id:   responsável fixo; também é quem recebe clientes sem vendedor ligado
--   due_date:   prazo da tarefa / previsão de fechamento do negócio (AAAA-MM-DD)
--   body:       texto da tarefa
--   stage_id:   etapa inicial do negócio
--   value_mode: 'none' | 'matched' (valor das compras no filtro) | 'fixed'; value
CREATE OR REPLACE FUNCTION public.campaign_create(
  p_name TEXT, p_action TEXT, p_filters JSONB, p_params JSONB
)
RETURNS TABLE (campaign_id UUID, created_count INTEGER, assigned_to_seller INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_org UUID := public.require_org_manager();
  v_id UUID;
  v_owner UUID := NULLIF(p_params->>'owner_id', '')::uuid;
  v_by_seller BOOLEAN := COALESCE(p_params->>'owner_mode', 'fixed') = 'seller';
  v_stage UUID := NULLIF(p_params->>'stage_id', '')::uuid;
  v_due DATE := NULLIF(p_params->>'due_date', '')::date;
  v_name TEXT := NULLIF(trim(p_name), '');
  v_total BIGINT;
  v_created INTEGER;
  v_seller INTEGER;
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'dê um nome à campanha'; END IF;
  IF p_action NOT IN ('task', 'deal') THEN RAISE EXCEPTION 'ação inválida'; END IF;
  IF v_owner IS NULL OR NOT public.user_belongs_to_org(v_owner, v_org) THEN
    RAISE EXCEPTION 'escolha um responsável da empresa';
  END IF;
  IF p_action = 'deal' AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages s WHERE s.id = v_stage AND s.org_id = v_org
  ) THEN
    RAISE EXCEPTION 'escolha a etapa do funil';
  END IF;

  CREATE TEMP TABLE _targets ON COMMIT DROP AS
    SELECT t.*, COALESCE(CASE WHEN v_by_seller THEN v.user_id END, v_owner) AS owner_id,
           (v_by_seller AND v.user_id IS NOT NULL) AS via_seller
    FROM public.audience_search_org(v_org, p_filters, 1000, 0, 'matched') t
    LEFT JOIN public.erp_sellers v ON v.org_id = v_org AND v.codigo_erp = t.seller_codigo_erp;

  SELECT COALESCE(MAX(total_count), 0), COUNT(*) FILTER (WHERE via_seller)
    INTO v_total, v_seller FROM _targets;
  IF v_total = 0 THEN RAISE EXCEPTION 'o público está vazio'; END IF;
  IF v_total > 1000 THEN
    RAISE EXCEPTION 'público de % clientes: o limite por campanha é 1.000. Refine os filtros.', v_total;
  END IF;

  INSERT INTO public.campaigns (org_id, name, action, filters, params, target_count, created_by)
  VALUES (v_org, v_name, p_action, p_filters, p_params, v_total, auth.uid())
  RETURNING id INTO v_id;

  IF p_action = 'task' THEN
    INSERT INTO public.activities (org_id, type, title, body, contact_id, company_id, user_id, due_date, campaign_id)
    SELECT v_org, 'task', v_name || ' — ' || t.name, NULLIF(p_params->>'body', ''),
           CASE WHEN t.customer_kind = 'contact' THEN t.id END,
           CASE WHEN t.customer_kind = 'company' THEN t.id END,
           t.owner_id, v_due, v_id
    FROM _targets t;
  ELSE
    INSERT INTO public.deals (org_id, title, value, stage_id, contact_id, company_id, owner_id, close_date, status, campaign_id)
    SELECT v_org, v_name || ' — ' || t.name,
           CASE p_params->>'value_mode'
             WHEN 'matched' THEN COALESCE(t.matched_value, 0)
             WHEN 'fixed' THEN COALESCE(NULLIF(p_params->>'value', '')::numeric, 0)
             ELSE 0
           END,
           v_stage,
           CASE WHEN t.customer_kind = 'contact' THEN t.id END,
           CASE WHEN t.customer_kind = 'company' THEN t.id END,
           t.owner_id, v_due, 'open', v_id
    FROM _targets t;
  END IF;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN QUERY SELECT v_id, v_created, v_seller;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.campaign_create(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_create(TEXT, TEXT, JSONB, JSONB) TO authenticated;

-- Desfaz só o que ninguém mexeu: tarefas não concluídas e negócios abertos, ainda
-- na etapa inicial e sem atividades. O trabalho já feito é preservado.
CREATE OR REPLACE FUNCTION public.campaign_undo(p_campaign_id UUID)
RETURNS TABLE (removed INTEGER, kept INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_org UUID := public.require_org_manager();
  v_camp public.campaigns;
  v_removed INTEGER;
  v_kept INTEGER;
BEGIN
  SELECT * INTO v_camp FROM public.campaigns c WHERE c.id = p_campaign_id AND c.org_id = v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'campanha não encontrada'; END IF;
  IF v_camp.undone_at IS NOT NULL THEN RAISE EXCEPTION 'esta campanha já foi desfeita'; END IF;

  IF v_camp.action = 'task' THEN
    DELETE FROM public.activities a WHERE a.campaign_id = v_camp.id AND a.completed_at IS NULL;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    SELECT COUNT(*) INTO v_kept FROM public.activities a WHERE a.campaign_id = v_camp.id;
  ELSE
    DELETE FROM public.deals d
    WHERE d.campaign_id = v_camp.id AND d.status = 'open'
      AND d.stage_id = NULLIF(v_camp.params->>'stage_id', '')::uuid
      AND NOT EXISTS (SELECT 1 FROM public.activities a WHERE a.deal_id = d.id);
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    SELECT COUNT(*) INTO v_kept FROM public.deals d WHERE d.campaign_id = v_camp.id;
  END IF;

  UPDATE public.campaigns c SET undone_at = now() WHERE c.id = v_camp.id;
  RETURN QUERY SELECT v_removed, v_kept;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.campaign_undo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_undo(UUID) TO authenticated;

-- Liga um vendedor do ERP a um usuário do CRM. Os clientes dele ainda sem
-- responsável passam para esse usuário (é o que tira a base do ERP de
-- "Sem responsável"); quem já tem responsável não muda.
CREATE OR REPLACE FUNCTION public.erp_seller_set_user(p_seller_id UUID, p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org UUID := public.require_org_manager();
  v_code TEXT;
  v_a INTEGER := 0;
  v_b INTEGER := 0;
BEGIN
  SELECT codigo_erp INTO v_code FROM public.erp_sellers WHERE id = p_seller_id AND org_id = v_org;
  IF v_code IS NULL THEN RAISE EXCEPTION 'vendedor não encontrado'; END IF;
  IF p_user_id IS NOT NULL AND NOT public.user_belongs_to_org(p_user_id, v_org) THEN
    RAISE EXCEPTION 'usuário não pertence à empresa';
  END IF;

  UPDATE public.erp_sellers SET user_id = p_user_id WHERE id = p_seller_id;
  IF p_user_id IS NULL THEN RETURN 0; END IF;

  UPDATE public.companies SET owner_id = p_user_id
    WHERE org_id = v_org AND erp_seller_codigo = v_code AND owner_id IS NULL;
  GET DIAGNOSTICS v_a = ROW_COUNT;
  UPDATE public.contacts SET owner_id = p_user_id
    WHERE org_id = v_org AND erp_seller_codigo = v_code AND owner_id IS NULL;
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.erp_seller_set_user(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_seller_set_user(UUID, UUID) TO authenticated;
