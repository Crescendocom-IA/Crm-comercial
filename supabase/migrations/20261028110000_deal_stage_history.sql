-- Histórico de etapas dos negócios + função do funil de conversão.
--
-- Até aqui `deals` guardava só a etapa ATUAL, então o relatório de conversão
-- comparava contagens atuais de etapas vizinhas (dava >100% quando uma etapa
-- da frente tinha mais negócios que a anterior). Com o histórico dá para
-- saber até onde cada negócio CHEGOU.

CREATE TABLE IF NOT EXISTS public.deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  status deal_status,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- true nas linhas criadas pela carga inicial abaixo (data aproximada).
  backfilled BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON public.deal_stage_history(deal_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_org ON public.deal_stage_history(org_id, changed_at);

-- Só leitura para o app; quem escreve é o trigger.
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view deal stage history" ON public.deal_stage_history;
CREATE POLICY "Org members can view deal stage history" ON public.deal_stage_history
  FOR SELECT USING (user_belongs_to_org(auth.uid(), org_id));

-- Grava criação, mudança de etapa e mudança de status (ganho/perdido/reaberto).
CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_stage_history (org_id, deal_id, from_stage_id, to_stage_id, status, changed_by)
    VALUES (NEW.org_id, NEW.id, NULL, NEW.stage_id, NEW.status, auth.uid());
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.deal_stage_history (org_id, deal_id, from_stage_id, to_stage_id, status, changed_by)
    VALUES (NEW.org_id, NEW.id, OLD.stage_id, NEW.stage_id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_deal_stage_change ON public.deals;
CREATE TRIGGER log_deal_stage_change
  AFTER INSERT OR UPDATE OF stage_id, status ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.log_deal_stage_change();

-- Carga inicial: cada negócio existente ganha uma linha com a etapa atual,
-- datada na criação do negócio. É aproximada (não sabemos o caminho real até
-- aqui), mas já permite o funil "chegou pelo menos até esta etapa".
INSERT INTO public.deal_stage_history (org_id, deal_id, from_stage_id, to_stage_id, status, changed_at, backfilled)
SELECT d.org_id, d.id, NULL, d.stage_id, d.status, COALESCE(d.created_at, now()), true
FROM public.deals d
WHERE NOT EXISTS (SELECT 1 FROM public.deal_stage_history h WHERE h.deal_id = d.id);

-- Funil de conversão de um pipeline.
--
-- Coorte: negócios do pipeline criados no período (e do dono, se informado).
-- Para cada negócio, a etapa mais avançada que ele já atingiu (pelo histórico
-- ou pela etapa atual). Um negócio que chegou na etapa 3 conta nas etapas 1, 2
-- e 3 — inclusive se foi arrastado direto da 1 para a 3 — então o funil é
-- sempre decrescente e a conversão entre etapas fica entre 0 e 100%.
--
-- SECURITY INVOKER: roda com o RLS de quem chama.
CREATE OR REPLACE FUNCTION public.deal_funnel(
  p_pipeline_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS TABLE (
  stage_id UUID,
  stage_name TEXT,
  stage_order INTEGER,
  stage_color TEXT,
  reached_count BIGINT,
  reached_value NUMERIC,
  won_count BIGINT,
  won_value NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH stages AS (
    SELECT s.id, s.name, s."order", s.color
    FROM public.pipeline_stages s
    WHERE s.pipeline_id = p_pipeline_id
  ),
  cohort AS (
    SELECT d.id, d.stage_id, d.status, COALESCE(d.value, 0) AS value
    FROM public.deals d
    JOIN stages s ON s.id = d.stage_id
    WHERE (p_from IS NULL OR d.created_at >= p_from)
      AND (p_to IS NULL OR d.created_at < p_to)
      AND (p_owner_id IS NULL OR d.owner_id = p_owner_id)
  ),
  reached AS (
    SELECT c.id, c.status, c.value, MAX(s."order") AS max_order
    FROM cohort c
    LEFT JOIN public.deal_stage_history h ON h.deal_id = c.id
    JOIN stages s ON s.id = h.to_stage_id OR s.id = c.stage_id
    GROUP BY c.id, c.status, c.value
  )
  SELECT
    s.id,
    s.name,
    s."order",
    s.color,
    COUNT(r.id),
    COALESCE(SUM(r.value), 0),
    COUNT(r.id) FILTER (WHERE r.status = 'won'),
    COALESCE(SUM(r.value) FILTER (WHERE r.status = 'won'), 0)
  FROM stages s
  LEFT JOIN reached r ON r.max_order >= s."order"
  GROUP BY s.id, s.name, s."order", s.color
  ORDER BY s."order";
$$;

GRANT EXECUTE ON FUNCTION public.deal_funnel(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
