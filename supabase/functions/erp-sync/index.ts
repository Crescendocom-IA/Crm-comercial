import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-erp-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** SHA-256 hex — mesmo esquema usado pelo public-api para chaves de API. */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type EntityIn = {
  type: "contact" | "company";
  codigo_erp: string;
  data: Record<string, unknown>;
};

/**
 * O ERP manda um nome só; contacts guarda first_name/last_name separados.
 * Primeiro token vira o nome, o resto vira sobrenome — sem sobrenome, fica nulo.
 */
function splitName(full: string): { first_name: string; last_name: string | null } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "(sem nome)", last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Autenticação por token de sistema ─────────────────────────────────────
  // Não há JWT aqui: quem chama é o n8n, não um usuário logado. O segredo é a
  // única barreira, então a função é fail-closed em cada passo.
  const token = req.headers.get("x-erp-token");
  if (!token) return json({ error: "X-ERP-Token header required" }, 401);

  const tokenHash = await sha256(token);
  const { data: cfg } = await sb
    .from("integration_configs")
    .select("org_id, config, is_active")
    .eq("provider", "erp")
    .eq("is_active", true)
    .eq("config->>token_hash", tokenHash)
    .maybeSingle();

  if (!cfg) return json({ error: "Invalid or inactive ERP token" }, 401);

  let body: { org_id?: string; entities?: EntityIn[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  /*
   * A organização vem do TOKEN, não do corpo. Confiar no org_id do payload
   * deixaria um token válido da org A escrever na org B — o mesmo tipo de
   * furo cross-tenant que já foi fechado no resto do app. Se o corpo mandar
   * um org_id diferente, é erro explícito em vez de gravação silenciosa no
   * lugar errado.
   */
  const orgId: string = cfg.org_id;
  if (body.org_id && body.org_id !== orgId) {
    return json({ error: "org_id does not match the token's organization" }, 403);
  }

  const entities = Array.isArray(body.entities) ? body.entities : [];
  if (entities.length === 0) return json({ error: "No entities provided" }, 400);

  const summary = { inserted: 0, updated: 0, errors: 0 };
  const logRows: Record<string, unknown>[] = [];

  for (const ent of entities) {
    const codigo = String(ent?.codigo_erp ?? "").trim();
    const table = ent?.type === "company" ? "companies" : ent?.type === "contact" ? "contacts" : null;

    if (!table || !codigo) {
      summary.errors++;
      logRows.push({
        org_id: orgId, entity_type: ent?.type ?? "unknown", operation: "error",
        codigo_erp: codigo || null, error_message: "type inválido ou codigo_erp vazio",
        payload: ent as unknown as Record<string, unknown>,
      });
      continue;
    }

    const d = ent.data ?? {};
    const common = {
      codigo_erp: codigo,
      sync_source: "erp",
      synced_at: new Date().toISOString(),
      cnpj_cpf: (d.cnpj_cpf as string) ?? null,
      cidade: (d.cidade as string) ?? null,
      estado: (d.estado as string) ?? null,
    };

    const fields = table === "companies"
      ? { ...common, name: (d.name as string) ?? "(sem nome)" }
      : { ...common, ...splitName(d.name as string), email: (d.email as string) ?? null, phone: (d.phone as string) ?? null };

    try {
      /*
       * Busca-então-insere/atualiza em vez de upsert: preciso saber QUAL das
       * duas ocorreu para o resumo e para o log. Um upsert cego devolveria a
       * linha sem dizer se ela nasceu agora ou já existia.
       */
      const { data: existing, error: findErr } = await sb
        .from(table)
        .select("id")
        .eq("org_id", orgId)
        .eq("codigo_erp", codigo)
        .maybeSingle();
      if (findErr) throw new Error(findErr.message);

      if (existing) {
        const { error } = await sb.from(table).update(fields).eq("id", existing.id);
        if (error) throw new Error(error.message);
        summary.updated++;
        logRows.push({
          org_id: orgId, entity_type: ent.type, operation: "update",
          codigo_erp: codigo, entity_id: existing.id, payload: d,
        });
      } else {
        const { data: created, error } = await sb
          .from(table)
          .insert({ ...fields, org_id: orgId })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        summary.inserted++;
        logRows.push({
          org_id: orgId, entity_type: ent.type, operation: "insert",
          codigo_erp: codigo, entity_id: created?.id ?? null, payload: d,
        });
      }
    } catch (err) {
      // Uma entidade com problema não derruba o lote inteiro: registra e segue.
      summary.errors++;
      logRows.push({
        org_id: orgId, entity_type: ent.type, operation: "error",
        codigo_erp: codigo, error_message: (err as Error).message, payload: d,
      });
    }
  }

  // Log em uma inserção só, no fim — não uma ida ao banco por entidade.
  if (logRows.length) await sb.from("erp_sync_log").insert(logRows);

  return json({ ...summary, total: entities.length });
});
