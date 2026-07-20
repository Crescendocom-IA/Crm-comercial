import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Exige um JWT de usuário real. A publishable key sozinha satisfaz o
    // verify_jwt do gateway, então sem esta checagem qualquer visitante do site
    // poderia chamar a função e consumir créditos da Anthropic.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id } = await req.json();
    if (!org_id) throw new Error("org_id required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // O usuário está autenticado, mas precisa PERTENCER à org que enviou —
    // senão poderia passar o org_id de outra empresa e ler o pipeline dela.
    const { data: belongs } = await sb
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (!belongs) {
      return new Response(JSON.stringify({ error: "Forbidden", insights: [] }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch org data for insights
    const [dealsRes, activitiesRes, contactsRes, stagesRes] = await Promise.all([
      sb.from("deals").select("id,title,value,status,stage_id,owner_id,updated_at,probability,close_date").eq("org_id", org_id),
      sb.from("activities").select("id,type,deal_id,contact_id,user_id,created_at,completed_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(200),
      sb.from("contacts").select("id,first_name,last_name,lead_score,status").eq("org_id", org_id),
      sb.from("pipeline_stages").select("id,name,order").eq("org_id", org_id).order("order"),
    ]);

    const deals = dealsRes.data || [];
    const activities = activitiesRes.data || [];
    const contacts = contactsRes.data || [];
    const stages = stagesRes.data || [];

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 86400000);

    // Build data summary for AI
    const openDeals = deals.filter((d: any) => d.status === "open");
    const staleDeals = openDeals.filter((d: any) => d.updated_at && new Date(d.updated_at) < twentyOneDaysAgo);
    const highScoreNoDeals = contacts.filter((c: any) => (c.lead_score || 0) >= 80);
    const wonDeals = deals.filter((d: any) => d.status === "won");
    const lostDeals = deals.filter((d: any) => d.status === "lost");

    const dataSummary = `
DADOS DO CRM (org ${org_id}):
- ${openDeals.length} negócios abertos, ${wonDeals.length} ganhos, ${lostDeals.length} perdidos
- ${staleDeals.length} negócios sem atividade há mais de 21 dias: ${staleDeals.map((d: any) => `"${d.title}" (R$${d.value || 0})`).join(", ")}
- ${contacts.length} contatos totais
- ${highScoreNoDeals.length} contatos com score >= 80
- Estágios do pipeline: ${stages.map((s: any) => {
      const count = openDeals.filter((d: any) => d.stage_id === s.id).length;
      return `${s.name}: ${count} negócios`;
    }).join(", ")}
- Negócios com close_date nos próximos 7 dias e prob < 50%: ${openDeals.filter((d: any) => {
      if (!d.close_date) return false;
      const cd = new Date(d.close_date);
      return cd <= new Date(now.getTime() + 7 * 86400000) && (d.probability || 0) < 50;
    }).map((d: any) => `"${d.title}"`).join(", ") || "nenhum"}
`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: `Você é o motor de insights do FlowCRM. Analise os dados e gere exatamente 4-6 insights acionáveis em português brasileiro.`,
        messages: [
          {
            role: "user",
            content: `${dataSummary}

Gere de 4 a 6 insights acionáveis usando a ferramenta generate_insights. Para cada insight:
- "title": título curto
- "description": descrição em 1-2 frases
- "type": um de "warning", "success", "info", "danger"
- "action_label": texto do botão de ação
- "action_route": rota no CRM (ex: "/deals", "/contacts")`,
          },
        ],
        thinking: { type: "disabled" },
        output_config: { effort: "medium" },
        tools: [
          {
            name: "generate_insights",
            description: "Return CRM insights as structured data",
            // strict: true garante que input bate exatamente com o schema.
            // Sem isso o modelo devolvia `insights` como string JSON em vez de
            // array, e o AIInsightsPanel recebia um tipo que não sabe iterar.
            strict: true,
            input_schema: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      type: { type: "string", enum: ["warning", "success", "info", "danger"] },
                      action_label: { type: "string" },
                      action_route: { type: "string" },
                    },
                    required: ["title", "description", "type", "action_label", "action_route"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: { type: "tool", name: "generate_insights" },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI insights error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar insights", insights: [] }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    // Normaliza para array. Com strict:true o modelo já devolve o formato certo,
    // mas o frontend faz insights.map() e não pode quebrar se isso mudar:
    // aceita array, string JSON, ou objeto { insights: [...] } aninhado.
    const toInsightsArray = (value: unknown): any[] => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          return toInsightsArray(JSON.parse(value));
        } catch {
          return [];
        }
      }
      if (value && typeof value === "object" && "insights" in value) {
        return toInsightsArray((value as { insights: unknown }).insights);
      }
      return [];
    };

    // Extract from tool call
    let insights: any[] = [];
    try {
      const toolUse = data.content?.find((b: { type: string }) => b.type === "tool_use");
      if (toolUse) {
        insights = toInsightsArray(toolUse.input?.insights);
      } else {
        // Fallback: try parsing a text block directly
        const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
        const match = text.match(/\[[\s\S]*\]/);
        if (match) insights = toInsightsArray(match[0]);
      }
    } catch (e) {
      console.error("Failed to parse insights:", e);
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", insights: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
