import { supabase } from "@/integrations/supabase/client";

/**
 * Aplica pontos de lead scoring a um contato quando um evento de engajamento
 * acontece. Busca a regra ATIVA da org com o `event_type` correspondente, soma
 * seus pontos ao `contacts.lead_score` (clamp 0-100, igual ao ajuste manual) e
 * registra a mudança em `lead_score_history`.
 *
 * Fire-and-forget: nunca lança, nunca bloqueia a UI.
 *
 * O modelo é POR EVENTO, não por campo — o score é incremental (cada evento de
 * engajamento soma/subtrai pontos), consistente com o ajuste manual e com o
 * scoring de pixel da função `tracking`. Se a org não tiver uma regra ativa para
 * o `event_type`, a chamada é um no-op.
 *
 * Eventos gerados no app: "meeting_done", "call_done" (ao criar a atividade),
 * "deal_created" (ao criar um negócio com contato). Os eventos de pixel
 * (email_opened, link_clicked, website_visit) são pontuados pela função tracking.
 */
export function applyScoreEvent(
  orgId: string | null | undefined,
  contactId: string | null | undefined,
  eventType: string,
) {
  if (!orgId || !contactId || !eventType) return;
  (async () => {
    try {
      const { data: rule } = await supabase
        .from("lead_scoring_rules")
        .select("points, label")
        .eq("org_id", orgId)
        .eq("event_type", eventType)
        .eq("is_active", true)
        .maybeSingle();
      if (!rule) return;

      const { data: contact } = await supabase
        .from("contacts")
        .select("lead_score")
        .eq("id", contactId)
        .maybeSingle();
      if (!contact) return;

      const newScore = Math.max(0, Math.min(100, (contact.lead_score ?? 0) + rule.points));
      await supabase.from("contacts").update({ lead_score: newScore }).eq("id", contactId);
      await supabase.from("lead_score_history").insert({
        org_id: orgId,
        contact_id: contactId,
        points: rule.points,
        reason: rule.label,
        event_type: eventType,
      });
    } catch (e) {
      console.warn(`[scoring:${eventType}]`, e);
    }
  })();
}
