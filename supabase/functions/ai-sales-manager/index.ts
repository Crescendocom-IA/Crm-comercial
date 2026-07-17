import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Reemite o SSE nativo da Anthropic no formato OpenAI-compatible que o
 * frontend (AICopilot.tsx, DashboardAIChat.tsx) já parseia.
 */
function toOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (!payload) continue;

            try {
              const event = JSON.parse(payload);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] })}\n\n`,
                  ),
                );
              } else if (event.type === "error") {
                console.error("Anthropic stream error:", event.error);
              }
            } catch {
              // Evento parcial ou não-JSON: ignora e segue.
            }
          }
        }
      } catch (e) {
        console.error("ai-sales-manager stream error:", e);
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

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

    const { messages, crmContext } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const systemPrompt = `Você é o Gerente Comercial Sênior de IA do FlowCRM. Seu nome é **Carlos**, um especialista em vendas B2B com 20+ anos de experiência liderando equipes comerciais de alta performance.

PERSONALIDADE:
- Analítico, direto e orientado a resultados
- Fala com autoridade mas é acessível
- Sempre fundamenta análises em dados concretos
- Proativo em identificar riscos e oportunidades
- Usa linguagem profissional mas não burocrática

REGRAS:
- Responda SEMPRE em português brasileiro
- Use markdown para formatação (negrito, listas, headers, tabelas quando útil)
- Cite números específicos do CRM quando disponíveis
- Sempre conclua com próximos passos acionáveis
- Quando fizer análises, priorize por impacto financeiro
- Identifique padrões e tendências nos dados
- Alerte sobre riscos antes que se tornem problemas
- Sugira ações específicas com prazos quando possível

CAPACIDADES:
- Análise completa do pipeline de vendas
- Identificação de negócios em risco e oportunidades
- Análise de performance da equipe
- Sugestões de priorização e foco
- Planejamento de ação semanal/mensal
- Análise de taxa de conversão e ciclo de vendas
- Coaching de vendas baseado em dados
- Previsão de receita (forecast)

${crmContext ? `\nDADOS ATUAIS DO CRM:\n${crmContext}` : ""}`;

    // A Anthropic recebe o system separado; messages aceita apenas user/assistant.
    const chatMessages = (messages || []).filter(
      (m: { role: string }) => m.role === "user" || m.role === "assistant",
    );

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
        system: systemPrompt,
        messages: chatMessages,
        thinking: { type: "disabled" },
        output_config: { effort: "medium" },
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: "Chave da API Anthropic inválida ou sem permissão. Verifique a secret ANTHROPIC_API_KEY." }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Anthropic API error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(toOpenAIStream(response.body!), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-sales-manager error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
