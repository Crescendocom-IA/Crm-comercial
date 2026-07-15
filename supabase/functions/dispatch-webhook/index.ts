import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function postWithTimeout(url: string, payload: unknown, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status, body: text.slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

function eventMatches(configured: unknown, event: string): boolean {
  if (!configured) return false;
  if (Array.isArray(configured)) {
    return configured.length === 0 || configured.includes(event) || configured.includes("*");
  }
  if (typeof configured === "string") {
    // e.g. "deal.won, deal.lost, deal.created"
    const list = configured.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    return list.length === 0 || list.includes(event) || list.includes("*");
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { org_id, event, data } = body ?? {};

    if (!org_id || !event) {
      return new Response(JSON.stringify({ error: "org_id and event required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = {
      event,
      org_id,
      data: data ?? {},
      timestamp: new Date().toISOString(),
    };

    const targets: { url: string; source: string; id?: string }[] = [];

    // 1. webhooks table
    const { data: whs } = await sb
      .from("webhooks")
      .select("id,url,events,is_active")
      .eq("org_id", org_id)
      .eq("is_active", true);
    for (const wh of whs ?? []) {
      if (event === "test" || eventMatches((wh as any).events, event)) {
        targets.push({ url: (wh as any).url, source: "webhooks", id: (wh as any).id });
      }
    }

    // 2. integration_configs (zapier/n8n/make)
    const { data: cfgs } = await sb
      .from("integration_configs")
      .select("id,provider,config,is_active")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .in("provider", ["zapier", "n8n", "make"]);
    for (const cfg of cfgs ?? []) {
      const c = ((cfg as any).config ?? {}) as Record<string, unknown>;
      const url = (c.outbound_url as string) || (c.webhook_url as string) || (c.url as string);
      if (!url) continue;
      if (event === "test" || eventMatches(c.events, event)) {
        targets.push({ url, source: `integration:${(cfg as any).provider}`, id: (cfg as any).id });
      }
    }

    console.log(`dispatch-webhook: event=${event} org=${org_id} targets=${targets.length}`);

    const results = await Promise.all(
      targets.map(async (t) => {
        const r = await postWithTimeout(t.url, payload);
        console.log(`  -> ${t.source} ${t.url} :: ${r.status} ${r.ok ? "OK" : "FAIL"} ${r.body.slice(0, 120)}`);
        if (t.source === "webhooks" && t.id) {
          if (r.ok) {
            await sb.from("webhooks").update({ last_triggered_at: new Date().toISOString() }).eq("id", t.id);
          } else {
            await sb.rpc("noop").catch(() => {});
            await sb.from("webhooks").update({ failure_count: ((whs?.find((w: any) => w.id === t.id) as any)?.failure_count ?? 0) + 1 }).eq("id", t.id).catch(() => {});
          }
        }
        return { url: t.url, source: t.source, ok: r.ok, status: r.status };
      }),
    );

    const dispatched = results.filter((r) => r.ok).length;
    const failed = results.length - dispatched;

    return new Response(
      JSON.stringify({ dispatched, failed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("dispatch-webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
