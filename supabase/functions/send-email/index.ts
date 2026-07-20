import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Envia um email avulso do CRM via Resend.
 *
 * Espelha o envio de process-sequences (chave em org_secrets.resend_api_key,
 * remetente em integration_configs provider=resend), mas para o envio manual do
 * compositor. Retorna erro explícito quando o Resend não está configurado, para
 * a UI poder distinguir "não configurado" de "falha no envio" — antes o app
 * apenas gravava a linha como enviada e mentia para o usuário.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { org_id, to, cc, bcc, subject, html } = await req.json();
    if (!org_id || !Array.isArray(to) || to.length === 0 || !subject) {
      return json({ error: "invalid_request", message: "org_id, to e subject são obrigatórios." }, 400);
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: belongs } = await sb
      .from("user_roles").select("id").eq("user_id", user.id).eq("org_id", org_id).maybeSingle();
    if (!belongs) return json({ error: "forbidden" }, 403);

    const { data: cfg } = await sb
      .from("integration_configs").select("config,is_active").eq("org_id", org_id).eq("provider", "resend").maybeSingle();
    const { data: secret } = await sb
      .from("org_secrets").select("key_value").eq("org_id", org_id).eq("key_name", "resend_api_key").maybeSingle();

    const apiKey = secret?.key_value as string | undefined;
    const config = (cfg?.config ?? {}) as Record<string, unknown>;
    const fromEmail = config.from_email as string | undefined;
    const fromName = config.from_name as string | undefined;

    if (!cfg?.is_active || !apiKey || !fromEmail) {
      return json({
        error: "resend_not_configured",
        message: "Configure o Resend em Integrações para enviar emails.",
      }, 400);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to,
        ...(Array.isArray(cc) && cc.length ? { cc } : {}),
        ...(Array.isArray(bcc) && bcc.length ? { bcc } : {}),
        subject,
        html: html || "<p></p>",
      }),
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      console.error("send-email: Resend falhou", res.status, data);
      return json({
        error: "send_failed",
        message: (data as { message?: string })?.message || `Resend retornou ${res.status}.`,
      }, 502);
    }

    return json({ ok: true, id: (data as { id?: string })?.id ?? null });
  } catch (e) {
    console.error("send-email error:", e);
    return json({ error: "internal", message: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
