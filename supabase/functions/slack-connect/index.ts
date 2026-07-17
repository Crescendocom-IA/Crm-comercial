import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SLACK_API = "https://slack.com/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    if (!SLACK_BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "SLACK_BOT_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id } = await req.json();

    const slackHeaders = {
      "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    };

    // 1. Verify the token with auth.test
    const authRes = await fetch(`${SLACK_API}/auth.test`, {
      method: "POST",
      headers: slackHeaders,
    });
    const authData = await authRes.json();

    if (!authData.ok) {
      console.error("Slack auth.test failed:", authData.error);
      return new Response(JSON.stringify({ error: "Slack connection failed", detail: authData.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. List public channels (requires the channels:read scope)
    const channelsRes = await fetch(
      `${SLACK_API}/conversations.list?types=public_channel&limit=200&exclude_archived=true`,
      { headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` } },
    );
    const channelsData = await channelsRes.json();

    if (!channelsData.ok) {
      console.error("Slack conversations.list failed:", channelsData.error);
      return new Response(JSON.stringify({ error: "Não foi possível listar os canais", detail: channelsData.error }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const channels = (channelsData.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
    }));

    // 3. Save to integration_configs
    if (org_id) {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Check if exists first, then insert or update
      const { data: existing } = await supabaseAdmin
        .from("integration_configs")
        .select("id")
        .eq("org_id", org_id)
        .eq("provider", "slack")
        .maybeSingle();

      const configData = {
        workspace_name: authData.team,
        bot_user_id: authData.user_id,
        connected_via: "direct",
      };

      if (existing) {
        await supabaseAdmin.from("integration_configs")
          .update({ config: configData, is_active: true })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("integration_configs")
          .insert({ org_id, provider: "slack", config: configData, is_active: true });
      }
    }

    return new Response(JSON.stringify({
      workspace_name: authData.team,
      bot_user_id: authData.user_id,
      channels,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("slack-connect error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
