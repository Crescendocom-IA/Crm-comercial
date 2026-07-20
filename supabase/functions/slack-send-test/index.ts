import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api";

// Mensagens de erro da Slack API que valem traduzir para o usuário final.
const SLACK_ERROR_HINTS: Record<string, string> = {
  not_in_channel: "O bot do FlowCRM não está no canal. Convide-o com /invite @FlowCRM ou conceda o escopo chat:write.public.",
  channel_not_found: "Canal não encontrado. Verifique se o canal ainda existe e se o bot tem acesso.",
  is_archived: "Esse canal está arquivado.",
  invalid_auth: "Token do Slack inválido. Verifique a secret SLACK_BOT_TOKEN.",
  account_inactive: "O token do Slack pertence a uma conta ou app desativado.",
  missing_scope: "O Slack App não tem os escopos necessários (chat:write). Reinstale o app no workspace.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Exige usuário autenticado; se org_id vier, ele precisa pertencer à org.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "SLACK_BOT_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id, channel, message } = await req.json();

    if (org_id) {
      const svcCheck = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: belongs } = await svcCheck.from("user_roles").select("id").eq("user_id", user.id).eq("org_id", org_id).maybeSingle();
      if (!belongs) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!channel) {
      return new Response(JSON.stringify({ error: "Missing channel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slackRes = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: channel.replace("#", ""),
        text: message || "🚀 FlowCRM conectado! As notificações de vendas vão aparecer aqui.",
        // username/icon_emoji exigem o escopo chat:write.customize; sem ele o
        // Slack posta com a identidade padrão do app em vez de falhar.
        username: "FlowCRM",
        icon_emoji: ":rocket:",
      }),
    });

    const slackData = await slackRes.json();

    if (!slackData.ok) {
      console.error("Slack chat.postMessage failed:", slackData.error);
      return new Response(JSON.stringify({
        error: SLACK_ERROR_HINTS[slackData.error] || slackData.error,
        detail: slackData.error,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update channel in integration_configs
    if (org_id) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: existing } = await supabaseAdmin
        .from("integration_configs")
        .select("config")
        .eq("org_id", org_id)
        .eq("provider", "slack")
        .single();

      if (existing) {
        await supabaseAdmin.from("integration_configs").update({
          config: { ...existing.config, channel },
        }).eq("org_id", org_id).eq("provider", "slack");
      }
    }

    return new Response(JSON.stringify({ ok: true, ts: slackData.ts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("slack-send-test error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
