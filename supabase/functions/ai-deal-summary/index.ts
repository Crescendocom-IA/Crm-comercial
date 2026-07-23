import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { toOpenAIStream, sseHeaders } from "../_shared/streaming.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const erro = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Valor em BRL, ou "não informado" — nunca "R$ 0" para dado ausente. */
function moeda(v: unknown, currency = "BRL"): string {
  if (v === null || v === undefined || v === "") return "não informado";
  const n = Number(v);
  if (Number.isNaN(n)) return "não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
}

const texto = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s === "" ? "não informado" : s;
};

/*
 * Toda data vai para o contexto com o cálculo JÁ FEITO.
 *
 * Num teste real o modelo leu "fechamento: 2026-07-10" com a data de hoje
 * disponível e escreveu "está próxima" — quando já estava 13 dias vencida.
 * Aritmética de data é justamente o tipo de raciocínio em que um LLM erra sem
 * avisar, e o erro soa plausível: o vendedor não confere. Se o número vem
 * pronto, não há o que errar.
 */

/** Diferença em dias inteiros, ignorando hora — datas do CRM são dia cheio. */
function diffDias(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ua - ub) / 86_400_000);
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data-alvo (prazo): "2026-07-10 (VENCIDA há 13 dias)". */
function prazo(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return "não informado";
  const dia = d.toISOString().slice(0, 10);
  const n = diffDias(d, new Date());
  if (n > 0) return `${dia} (faltam ${n} dia${n === 1 ? "" : "s"})`;
  if (n === 0) return `${dia} (hoje)`;
  return `${dia} (VENCIDA há ${-n} dia${-n === 1 ? "" : "s"})`;
}

/** Evento passado: "2026-06-08 (há 45 dias)". */
function passado(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return "não informado";
  const dia = d.toISOString().slice(0, 10);
  const n = diffDias(new Date(), d);
  if (n === 0) return `${dia} (hoje)`;
  if (n === 1) return `${dia} (ontem)`;
  return `${dia} (há ${n} dias)`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Autenticação ────────────────────────────────────────────────────────
    // A publishable key sozinha satisfaz o verify_jwt do gateway; sem checar o
    // usuário de verdade, qualquer visitante consumiria créditos da Anthropic.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return erro("Unauthorized", 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return erro("Unauthorized", 401);

    const { deal_id } = await req.json();
    if (!deal_id) return erro("deal_id é obrigatório", 400);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return erro("ANTHROPIC_API_KEY não configurada", 500);

    // Service role para montar o contexto: a RLS de audit_logs libera SELECT só
    // para owner/admin, e o resumo deve funcionar para qualquer membro que já
    // tenha acesso ao negócio. A autorização é feita explicitamente abaixo.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Autorização: o usuário pertence à org DESTE negócio? ─────────────────
    const { data: deal } = await admin
      .from("deals")
      .select("*, contact:contacts!deals_contact_id_fkey(*), company:companies!deals_company_id_fkey(*)")
      .eq("id", deal_id)
      .maybeSingle();
    if (!deal) return erro("Negócio não encontrado", 404);

    const { data: membro } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", deal.org_id)
      .maybeSingle();
    // 404, não 403: confirmar que o negócio existe para quem não pode vê-lo já
    // vaza informação sobre outra organização.
    if (!membro) return erro("Negócio não encontrado", 404);

    // ── Contexto ────────────────────────────────────────────────────────────
    const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [stageRes, atividadesRes, historicoRes] = await Promise.all([
      deal.stage_id
        ? admin.from("pipeline_stages").select("name, win_probability, pipeline_id").eq("id", deal.stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("activities").select("type, title, body, created_at, completed_at")
        .eq("deal_id", deal_id).order("created_at", { ascending: false }).limit(20),
      admin.from("audit_logs").select("action, old_values, new_values, created_at")
        .eq("entity_type", "deal").eq("entity_id", deal_id)
        .gte("created_at", trintaDiasAtras).order("created_at", { ascending: false }).limit(50),
    ]);

    const stage = stageRes.data as { name?: string; win_probability?: number; pipeline_id?: string } | null;
    const atividades = atividadesRes.data || [];
    const historico = historicoRes.data || [];

    let pipelineNome = "não informado";
    if (stage?.pipeline_id) {
      const { data: p } = await admin.from("pipelines").select("name").eq("id", stage.pipeline_id).maybeSingle();
      pipelineNome = texto(p?.name);
    }

    const notas = atividades.filter((a: any) => a.type === "note");
    const interacoes = atividades.filter((a: any) => a.type !== "note");

    /*
     * Há quanto tempo está NESTE estágio — sinal forte de negócio travado, e
     * que não estava no contexto antes. Vem da última troca de estágio no
     * audit_log; sem registro de troca, o deal nunca saiu do estágio inicial e
     * a referência passa a ser a criação.
     *
     * Query própria, sem o corte de 30 dias do histórico: uma troca de estágio
     * de 3 meses atrás é exatamente o caso que mais interessa aqui.
     */
    const { data: ultimaTroca } = await admin
      .from("audit_logs")
      .select("created_at, new_values")
      .eq("entity_type", "deal").eq("entity_id", deal_id).eq("action", "update")
      .not("new_values->>stage", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const desdeQuandoNoEstagio = ultimaTroca?.created_at ?? deal.created_at;
    const origemDoEstagio = ultimaTroca ? "última mudança de estágio" : "criação do negócio (nunca mudou de estágio)";

    // Qualificação BANT — o campo é jsonb e pode não existir.
    const bant = (deal as any).qualification ?? null;
    const bantScore = (deal as any).qualification_score ?? null;
    const bantTexto = bant && typeof bant === "object" && Object.keys(bant).length > 0
      ? Object.entries(bant).map(([k, v]) => `  - ${k}: ${texto(v)}`).join("\n")
      : "  não preenchida";

    const contexto = `
## NEGÓCIO
Título: ${texto(deal.title)}
Valor: ${moeda(deal.value, deal.currency || "BRL")}
Status: ${texto(deal.status)}
Pipeline: ${pipelineNome}
Estágio atual: ${texto(stage?.name)}${stage?.win_probability != null ? ` (probabilidade do estágio: ${stage.win_probability}%)` : ""}
Probabilidade informada no negócio: ${deal.probability != null ? `${deal.probability}%` : "não informado"}
Data prevista de fechamento: ${prazo(deal.close_date)}
Criado em: ${passado(deal.created_at)}
No estágio atual desde: ${passado(desdeQuandoNoEstagio)} — referência: ${origemDoEstagio}
Motivo da perda: ${texto(deal.loss_reason)}

NOTA: as datas acima já vêm com o cálculo pronto. Use os números como estão;
não recalcule prazos nem infira "próximo"/"vencido" por conta própria.

## CLIENTE
Contato: ${texto(deal.contact ? `${deal.contact.first_name ?? ""} ${deal.contact.last_name ?? ""}`.trim() : null)}
Cargo: ${texto(deal.contact?.title)}
E-mail: ${texto(deal.contact?.email)}
Telefone: ${texto(deal.contact?.phone)}
Empresa: ${texto(deal.company?.name)}
Setor: ${texto(deal.company?.industry)}

## QUALIFICAÇÃO BANT
Score: ${bantScore != null ? bantScore : "não informado"}
${bantTexto}

## ATIVIDADE
Total registrado: ${atividades.length} (limitado às 20 mais recentes)
Última atividade: ${atividades.length ? passado(atividades[0].created_at) : "nenhuma atividade registrada"}

### Interações recentes
${interacoes.length === 0 ? "  nenhuma interação registrada" : interacoes.slice(0, 12).map((a: any) =>
  `  - [${passado(a.created_at)}] ${a.type}: ${texto(a.title)}${a.body ? ` — ${String(a.body).slice(0, 200)}` : ""}${a.completed_at ? " (concluída)" : " (pendente)"}`,
).join("\n")}

### Notas
${notas.length === 0 ? "  nenhuma nota" : notas.slice(0, 8).map((n: any) =>
  `  - [${passado(n.created_at)}] ${texto(n.title)}${n.body ? `: ${String(n.body).slice(0, 300)}` : ""}`,
).join("\n")}

## HISTÓRICO DE ALTERAÇÕES (últimos 30 dias)
${historico.length === 0 ? "  nenhuma alteração registrada no período" : historico.slice(0, 20).map((h: any) => {
  const mudou = Object.keys({ ...(h.old_values || {}), ...(h.new_values || {}) })
    .filter((k) => JSON.stringify(h.old_values?.[k]) !== JSON.stringify(h.new_values?.[k]))
    .map((k) => `${k}: ${texto(h.old_values?.[k])} → ${texto(h.new_values?.[k])}`)
    .join("; ");
  return `  - [${passado(h.created_at)}] ${h.action}${mudou ? ` (${mudou})` : ""}`;
}).join("\n")}
`.trim();

    const systemPrompt = `Você é um analista comercial sênior que prepara briefings de negócios para vendedores brasileiros.

Escreva em português do Brasil, direto e objetivo, com EXATAMENTE estas 4 seções em markdown:

## Situação atual
Onde o negócio está: estágio, valor, há quanto tempo foi criado e há quanto tempo está parado. Uma análise curta, não uma repetição dos campos.

## Últimas interações
Resuma o que aconteceu recentemente com o cliente. Se não houver interação registrada, diga isso claramente.

## Riscos
Sinais concretos de que o negócio pode esfriar: tempo sem atividade, BANT incompleto, muito tempo no mesmo estágio, data de fechamento vencida, ausência de contato definido. Cite apenas riscos que os dados sustentam.

## Próximos passos sugeridos
2 a 3 ações concretas e acionáveis, na ordem em que devem ser feitas.

REGRAS ABSOLUTAS:
- NUNCA invente informação. Se um dado não está no contexto, escreva "não informado".
- Não suponha nome de pessoa, valor, prazo ou intenção que não esteja explícito.
- Se o contexto for pobre, diga que há pouca informação e aponte o que falta preencher — isso é mais útil que um resumo inventado.
- Não repita o contexto cru; interprete.
- Seja conciso: o vendedor lê isso entre duas ligações.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: `Gere o briefing deste negócio:\n\n${contexto}` }],
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const detalhe = await resp.text();
      console.error("[ai-deal-summary] Anthropic respondeu", resp.status, detalhe.slice(0, 500));
      if (resp.status === 401) return erro("Chave da API Anthropic inválida.", 502);
      if (resp.status === 429) return erro("Limite de uso da Anthropic atingido. Tente em instantes.", 429);
      return erro("Falha ao gerar o resumo.", 502);
    }

    return new Response(toOpenAIStream(resp.body, "ai-deal-summary"), {
      headers: { ...corsHeaders, ...sseHeaders },
    });
  } catch (err) {
    console.error("[ai-deal-summary]", err);
    return erro((err as Error).message ?? "Erro interno", 500);
  }
});
