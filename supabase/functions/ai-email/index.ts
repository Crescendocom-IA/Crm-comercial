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

    const { prompt, tone, context } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const toneMap: Record<string, string> = {
      formal: "profissional e formal, com linguagem corporativa",
      casual: "amigável e casual, mantendo profissionalismo",
      persuasive: "persuasivo e convincente, focado em benefícios",
      urgent: "urgente e direto, transmitindo importância e prazo",
    };

    const toneDesc = toneMap[tone] || toneMap.formal;

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
        system: `Você é um assistente de redação de emails profissionais B2B. Gere emails em português brasileiro.
Tom: ${toneDesc}.
${context ? `Contexto: ${context}` : ""}`,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        tools: [
          {
            name: "generate_email",
            description: "Generate a professional email with subject suggestions",
            input_schema: {
              type: "object",
              properties: {
                subject_options: {
                  type: "array",
                  items: { type: "string" },
                  description: "3 subject line options",
                },
                body: { type: "string", description: "Full email body in plain text" },
                sentiment: { type: "string", enum: ["positive", "neutral", "negative"], description: "Overall tone" },
              },
              required: ["subject_options", "body", "sentiment"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "generate_email" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: "Chave da API Anthropic inválida ou sem permissão. Verifique a secret ANTHROPIC_API_KEY." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI email error:", response.status, t);
      throw new Error("AI error");
    }

    const data = await response.json();
    let result = { subject_options: [], body: "", sentiment: "neutral" };
    try {
      const toolUse = data.content?.find((b: { type: string }) => b.type === "tool_use");
      if (toolUse) {
        result = toolUse.input;
      }
    } catch (e) {
      console.error("Parse error:", e);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
