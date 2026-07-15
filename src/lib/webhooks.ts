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
