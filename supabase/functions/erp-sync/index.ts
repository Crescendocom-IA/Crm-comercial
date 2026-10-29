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
  type: "contact" | "company" | BatchType;
  codigo_erp: string;
  data: Record<string, unknown>;
};

/*
 * Espelho do histórico de vendas: chega em volume (centenas de milhares de
 * itens), então vai por upsert em lote em vez do busca-então-grava dos
 * clientes. Cada tipo aceita só as colunas listadas — campo desconhecido no
 * payload é ignorado, nunca vira coluna nem sobrescreve org_id.
 */
type BatchType = "seller" | "product_group" | "product" | "order" | "order_item";

const BATCH_TABLES: Record<BatchType, { table: string; columns: string[] }> = {
  seller: { table: "erp_sellers", columns: ["code", "name", "email", "active", "erp_updated_at"] },
  product_group: { table: "product_groups", columns: ["name", "active", "erp_updated_at"] },
  product: {
    table: "products",
    columns: [
      "code", "name", "description", "brand", "group_codigo_erp", "group_name", "subgroup_name",
      "unit", "ean", "ncm", "cost_price", "sale_price", "margin", "stock", "active",
      "erp_created_at", "erp_updated_at",
    ],
  },
  order: {
    table: "sales_orders",
    columns: [
      "number", "kind", "status", "customer_codigo_erp", "seller_codigo_erp", "order_date",
      "subtotal", "discount", "total", "payment_codigo_erp", "contact_name", "notes", "erp_updated_at",
    ],
  },
  order_item: {
    table: "sales_order_items",
    columns: [
      "order_codigo_erp", "product_codigo_erp", "customer_codigo_erp", "seq", "product_label",
      "quantity", "unit_price", "discount", "total", "erp_updated_at",
    ],
  },
};

const isBatchType = (t: unknown): t is BatchType => typeof t === "string" && t in BATCH_TABLES;
const UPSERT_CHUNK = 500;

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

  const summary = { inserted: 0, updated: 0, upserted: 0, errors: 0 };
  const logRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  // ── Histórico de vendas: upsert em lote por tipo ──────────────────────────
  const batches = new Map<BatchType, Record<string, unknown>[]>();
  for (const ent of entities) {
    if (!isBatchType(ent?.type)) continue;
    const codigo = String(ent.codigo_erp ?? "").trim();
    if (!codigo) {
      summary.errors++;
      logRows.push({
        org_id: orgId, entity_type: ent.type, operation: "error", codigo_erp: null,
        error_message: "codigo_erp vazio", payload: ent as unknown as Record<string, unknown>,
      });
      continue;
    }
    const d = ent.data ?? {};
    const row: Record<string, unknown> = { org_id: orgId, codigo_erp: codigo, synced_at: now };
    for (const col of BATCH_TABLES[ent.type].columns) if (col in d) row[col] = d[col];
    if (!batches.has(ent.type)) batches.set(ent.type, []);
    batches.get(ent.type)!.push(row);
  }

  for (const [type, rows] of batches) {
    const { table } = BATCH_TABLES[type];
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { error } = await sb.from(table).upsert(chunk, { onConflict: "org_id,codigo_erp" });
      if (error) {
        summary.errors += chunk.length;
        // Um registro por lote com falha (não por linha): com 272 mil itens,
        // logar linha a linha encheria o erp_sync_log.
        logRows.push({
          org_id: orgId, entity_type: type, operation: "error",
          error_message: `lote de ${chunk.length}: ${error.message}`,
          payload: { first_codigo_erp: chunk[0].codigo_erp, last_codigo_erp: chunk[chunk.length - 1].codigo_erp },
        });
      } else {
        summary.upserted += chunk.length;
      }
    }
    logRows.push({
      org_id: orgId, entity_type: type, operation: "upsert",
      payload: { received: rows.length },
    });
  }

  // ── Clientes: novos em bloco, existentes um a um ──────────────────────────
  /*
   * Não dá para usar upsert: a chave única de companies/contacts é um índice
   * PARCIAL (codigo_erp não nulo), que o ON CONFLICT do PostgREST não aceita,
   * e o resumo/log precisa distinguir inserido de atualizado.
   *
   * Então: uma busca dos códigos do lote inteiro, um INSERT em bloco para os
   * novos e UPDATE individual só para os que já existiam. A versão anterior
   * fazia busca + gravação por cliente (~0,3 s cada): a carga inicial de 23
   * mil clientes levaria quase duas horas.
   */
  type Prepared = { type: "company" | "contact"; codigo: string; fields: Record<string, unknown>; d: Record<string, unknown> };
  const byTable: Record<"companies" | "contacts", Map<string, Prepared>> = { companies: new Map(), contacts: new Map() };

  for (const ent of entities) {
    if (isBatchType(ent?.type)) continue;
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
      synced_at: now,
      cnpj_cpf: (d.cnpj_cpf as string) ?? null,
      cidade: (d.cidade as string) ?? null,
      estado: (d.estado as string) ?? null,
      email: (d.email as string) ?? null,
      phone: (d.phone as string) ?? null,
      erp_seller_codigo: (d.seller_codigo_erp as string) ?? null,
      erp_active: typeof d.active === "boolean" ? d.active : null,
    };

    const fields = table === "companies"
      ? { ...common, name: (d.name as string) ?? "(sem nome)" }
      : { ...common, ...splitName(d.name as string) };

    // Código repetido no mesmo lote: vale a última ocorrência.
    byTable[table].set(codigo, { type: ent.type as "company" | "contact", codigo, fields, d });
  }

  const logError = (p: Prepared, message: string) => {
    summary.errors++;
    logRows.push({
      org_id: orgId, entity_type: p.type, operation: "error",
      codigo_erp: p.codigo, error_message: message, payload: p.d,
    });
  };

  for (const table of ["companies", "contacts"] as const) {
    const items = [...byTable[table].values()];
    if (items.length === 0) continue;

    const existing = new Map<string, string>();
    for (let i = 0; i < items.length; i += 200) {
      const codes = items.slice(i, i + 200).map((p) => p.codigo);
      const { data, error } = await sb.from(table).select("id, codigo_erp").eq("org_id", orgId).in("codigo_erp", codes);
      if (error) {
        for (const p of items.slice(i, i + 200)) logError(p, error.message);
        continue;
      }
      for (const row of data ?? []) if (row.codigo_erp) existing.set(row.codigo_erp, row.id);
    }

    const toInsert = items.filter((p) => !existing.has(p.codigo));
    for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
      const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
      const { data, error } = await sb.from(table)
        .insert(chunk.map((p) => ({ ...p.fields, org_id: orgId })))
        .select("id, codigo_erp");
      if (!error) {
        const ids = new Map((data ?? []).map((r) => [r.codigo_erp, r.id]));
        for (const p of chunk) {
          summary.inserted++;
          logRows.push({
            org_id: orgId, entity_type: p.type, operation: "insert",
            codigo_erp: p.codigo, entity_id: ids.get(p.codigo) ?? null, payload: p.d,
          });
        }
        continue;
      }
      // Um registro ruim derruba o INSERT inteiro: refaz um a um para isolar.
      for (const p of chunk) {
        const { data: created, error: oneErr } = await sb.from(table)
          .insert({ ...p.fields, org_id: orgId }).select("id").single();
        if (oneErr) { logError(p, oneErr.message); continue; }
        summary.inserted++;
        logRows.push({
          org_id: orgId, entity_type: p.type, operation: "insert",
          codigo_erp: p.codigo, entity_id: created?.id ?? null, payload: p.d,
        });
      }
    }

    // UPDATE não tem forma em bloco com valores diferentes por linha: vai em
    // paralelo, 10 por vez, para não serializar centenas de idas ao banco.
    const toUpdate = items.filter((p) => existing.has(p.codigo));
    for (let i = 0; i < toUpdate.length; i += 10) {
      await Promise.all(toUpdate.slice(i, i + 10).map(async (p) => {
        const id = existing.get(p.codigo)!;
        const { error } = await sb.from(table).update(p.fields).eq("id", id);
        if (error) { logError(p, error.message); return; }
        summary.updated++;
        logRows.push({
          org_id: orgId, entity_type: p.type, operation: "update",
          codigo_erp: p.codigo, entity_id: id, payload: p.d,
        });
      }));
    }
  }

  // Log em uma inserção só, no fim — não uma ida ao banco por entidade.
  if (logRows.length) await sb.from("erp_sync_log").insert(logRows);

  // Até 5 mensagens de erro na resposta: sem isso, quem chama só vê a
  // contagem e precisa ir ao erp_sync_log para saber o motivo.
  const error_samples = logRows
    .filter((r) => r.operation === "error")
    .slice(0, 5)
    .map((r) => ({ type: r.entity_type, codigo_erp: r.codigo_erp, message: r.error_message }));

  return json({ ...summary, total: entities.length, error_samples });
});
