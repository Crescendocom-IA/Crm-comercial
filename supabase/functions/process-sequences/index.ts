import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * Processa as matrículas de sequência de email vencidas. Roda via pg_cron.
 *
 * Para cada enrollment ativo com next_send_at <= now(): resolve o passo atual
 * (step_order = current_step), monta o email (assunto/corpo do passo, ou do
 * template vinculado), envia via Resend usando a chave da org (org_secrets) e o
 * remetente (integration_configs provider=resend), e avança:
 *  - se há próximo passo, agenda next_send_at = now + delay_days do próximo;
 *  - senão, marca status=completed.
 *
 * Se o Resend não estiver configurado para a org, PULA (deixa ativo para a
 * próxima rodada — assim volta a funcionar assim que a org conectar o Resend).
 * Se o contato não tem email, marca a matrícula como failed (não dá para enviar).
 *
 * Auth: pública (verify_jwt=false, é o pg_cron que chama), protegida por um
 * segredo compartilhado em CRON_SECRET (header X-Cron-Secret).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fail-closed: sem CRON_SECRET configurado, ninguém chama (a função é pública
  // no gateway, então o segredo é a única barreira contra abuso externo).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stats = { due: 0, sent: 0, skipped_no_resend: 0, completed: 0, failed: 0, errors: 0 };

  try {
    const nowIso = new Date().toISOString();
    const { data: due } = await sb
      .from("email_sequence_enrollments")
      .select("id, sequence_id, org_id, contact_id, current_step")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .limit(200);

    stats.due = due?.length ?? 0;

    // Cache do config de Resend por org (evita reconsultar por enrollment).
    const resendCache = new Map<string, { key: string; from: string } | null>();
    async function getResend(orgId: string) {
      if (resendCache.has(orgId)) return resendCache.get(orgId)!;
      const { data: secret } = await sb.from("org_secrets").select("key_value").eq("org_id", orgId).eq("key_name", "resend_api_key").maybeSingle();
      const { data: cfg } = await sb.from("integration_configs").select("config").eq("org_id", orgId).eq("provider", "resend").maybeSingle();
      const key = secret?.key_value as string | undefined;
      const from = (cfg?.config as Record<string, unknown> | null)?.from_email as string | undefined;
      const result = key && from ? { key, from } : null;
      resendCache.set(orgId, result);
      return result;
    }

    for (const enr of due ?? []) {
      try {
        const { data: step } = await sb
          .from("email_sequence_steps")
          .select("subject, body_html, template_id")
          .eq("sequence_id", enr.sequence_id)
          .eq("step_order", enr.current_step)
          .maybeSingle();

        // Sem passo neste índice → sequência terminou.
        if (!step) {
          await sb.from("email_sequence_enrollments").update({ status: "completed", completed_at: nowIso, next_send_at: null }).eq("id", enr.id);
          stats.completed++;
          continue;
        }

        // Resolve assunto/corpo: do passo, ou do template vinculado.
        let subject = step.subject as string | null;
        let body = step.body_html as string | null;
        if ((!subject || !body) && step.template_id) {
          const { data: tpl } = await sb.from("email_templates").select("subject, body_html").eq("id", step.template_id).maybeSingle();
          subject = subject || (tpl?.subject as string | null);
          body = body || (tpl?.body_html as string | null);
        }

        const { data: contact } = await sb.from("contacts").select("email, first_name, last_name").eq("id", enr.contact_id).maybeSingle();
        if (!contact?.email) {
          await sb.from("email_sequence_enrollments").update({ status: "failed", next_send_at: null }).eq("id", enr.id);
          stats.failed++;
          continue;
        }

        const resend = await getResend(enr.org_id);
        if (!resend) {
          // Resend não configurado nesta org — deixa ativo para a próxima rodada.
          stats.skipped_no_resend++;
          continue;
        }

        // Interpolação simples de variáveis.
        const fullName = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
        const render = (s: string | null) => (s || "")
          .replace(/\{\{primeiro_nome\}\}/g, contact.first_name || "")
          .replace(/\{\{nome\}\}/g, fullName)
          .replace(/\{\{email\}\}/g, contact.email);

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resend.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: resend.from,
            to: [contact.email],
            subject: render(subject) || "(sem assunto)",
            html: render(body) || "<p></p>",
          }),
        });

        if (!res.ok) {
          // Falha de envio — deixa ativo para retentar na próxima rodada.
          stats.errors++;
          continue;
        }
        stats.sent++;

        // Avança para o próximo passo ou completa.
        const nextIndex = (enr.current_step ?? 0) + 1;
        const { data: nextStep } = await sb.from("email_sequence_steps").select("delay_days").eq("sequence_id", enr.sequence_id).eq("step_order", nextIndex).maybeSingle();
        if (nextStep) {
          const nextSend = new Date(Date.now() + ((nextStep.delay_days as number) || 0) * 86400000);
          await sb.from("email_sequence_enrollments").update({ current_step: nextIndex, next_send_at: nextSend.toISOString() }).eq("id", enr.id);
        } else {
          await sb.from("email_sequence_enrollments").update({ status: "completed", completed_at: nowIso, next_send_at: null }).eq("id", enr.id);
          stats.completed++;
        }
      } catch (e) {
        console.error("process-sequences enrollment error:", enr.id, e);
        stats.errors++;
      }
    }

    return new Response(JSON.stringify(stats), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("process-sequences error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown", stats }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
