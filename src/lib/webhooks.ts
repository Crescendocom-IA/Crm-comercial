import { supabase } from "@/integrations/supabase/client";

/**
 * Fire an outbound webhook event. Fire-and-forget: never throws, never blocks UI.
 * Reads active destinations from `webhooks` and `integration_configs` (zapier/n8n/make)
 * on the server and POSTs the payload to each matching URL.
 */
export function fireWebhook(orgId: string | null | undefined, event: string, data: Record<string, unknown> = {}) {
  if (!orgId) return;
  supabase.functions
    .invoke("dispatch-webhook", { body: { org_id: orgId, event, data } })
    .then((res) => {
      if (res.error) console.warn(`[webhook:${event}]`, res.error.message);
    })
    .catch((e) => console.warn(`[webhook:${event}]`, e));
}

/**
 * Dispara as automações cujo trigger casa com o evento. Fire-and-forget, nunca
 * lança, nunca bloqueia a UI. Busca as automações ativas da org, filtra pelo
 * `trigger.type` no cliente e invoca process-automation (que avalia condições e
 * executa as ações) para cada uma.
 *
 * `triggerType` deve ser um dos tipos de trigger de evento das automações:
 * "deal.won", "deal.lost", "deal.stage_changed", "contact.created",
 * "contact.updated". Os triggers temporais (date.relative, score.threshold) NÃO
 * passam por aqui — dependem de um agendador (pg_cron), ainda não implementado.
 *
 * `payload` precisa carregar a chave da entidade (`deal_id` ou `contact_id`) para
 * as ações funcionarem, além dos campos que as condições possam avaliar.
 */
export function fireAutomations(
  orgId: string | null | undefined,
  triggerType: string,
  payload: Record<string, unknown> = {},
) {
  if (!orgId) return;
  (async () => {
    try {
      const { data: autos, error } = await supabase
        .from("automations")
        .select("id, trigger")
        .eq("org_id", orgId)
        .eq("is_active", true);
      if (error || !autos?.length) return;
      const matching = autos.filter((a) => (a.trigger as any)?.type === triggerType);
      await Promise.all(
        matching.map((a) =>
          supabase.functions
            .invoke("process-automation", {
              body: { automation_id: a.id, org_id: orgId, trigger_payload: payload },
            })
            .then((res) => {
              if (res.error) console.warn(`[automation:${triggerType}]`, res.error.message);
            }),
        ),
      );
    } catch (e) {
      console.warn(`[automation:${triggerType}]`, e);
    }
  })();
}
