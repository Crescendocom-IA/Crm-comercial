# 07 — Edge Functions

Todas em `supabase/functions/`, runtime Deno. CORS habilitado em todas.

Deploy: `npx supabase functions deploy --project-ref <REF>` (ou o nome de uma função
para subir só ela).

| Function | Método | Auth | Propósito | Secrets |
|----------|--------|------|-----------|---------|
| `health` | GET | público | Status + latência do DB | — |
| `ai-copilot` | POST | JWT user | Chat contextual do Copilot | `ANTHROPIC_API_KEY` |
| `ai-email` | POST | JWT user | Geração de email com IA | `ANTHROPIC_API_KEY` |
| `ai-insights` | POST | JWT user | Insights sobre deals/atividades | `ANTHROPIC_API_KEY` |
| `ai-sales-manager` | POST | JWT user | "Gerente de vendas" virtual (Carlos) | `ANTHROPIC_API_KEY` |
| `validate-anthropic-key` | POST | JWT user | Testa chave Anthropic antes de salvar | — |
| `validate-resend-key` | POST | JWT user | Testa chave Resend antes de salvar | — |
| `slack-connect` | GET/POST | JWT user | Valida o token e lista canais | `SLACK_BOT_TOKEN` |
| `slack-send-test` | POST | JWT user | Envia mensagem teste | `SLACK_BOT_TOKEN` |
| `invite-member` | POST | JWT user (admin/owner) | Cria invitation + envia magic link | service role |
| `gmail-initial-sync` | POST | JWT user | Importa últimos N emails Gmail | `GOOGLE_*` |
| `process-automation` | POST | service | Executa automation enfileirada (pg_cron) | service role |
| `public-api` | GET/POST/PUT/DELETE | Bearer `fc_xxx` | CRUD REST público | service role |
| `inbound-webhook` | POST | querystring `org_id` | Recebe dados externos | service role |
| `tracking` | GET/POST | público (CORS) | Pixel/snippet de eventos | service role |

## Padrão de implementação

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Auth (se JWT): extrair user de Authorization header via supabase.auth.getUser(jwt)
    // 2. Validar payload (zod recomendado)
    // 3. Resolver org_id e checar permissão
    // 4. Operação com service role OR client com JWT do user
    // 5. Retornar JSON

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("function-name error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

## config.toml por função

Funções públicas (sem JWT) precisam de bloco em `supabase/config.toml`:

```toml
[functions.health]
verify_jwt = false

[functions.tracking]
verify_jwt = false

[functions.inbound-webhook]
verify_jwt = false

[functions.public-api]
verify_jwt = false  # auth própria via fc_xxx

[functions.dispatch-webhook]
verify_jwt = false  # chamada interna com org_id obrigatório
```

**`project_id` só muda ao apontar para outra instância Supabase.**

> ⚠️ **`verify_jwt = true` não significa "usuário logado".** O gateway aceita a
> publishable key como credencial válida — e ela é pública por design, já que vai no
> bundle do frontend. Funções que gastam dinheiro (as 4 de IA) precisam validar o JWT
> **dentro** da função com `supabase.auth.getUser()`; veja o padrão em `invite-member`.

## Princípios

- **service_role nunca volta ao cliente.**
- **Sempre validar `org_id`** mesmo quando RLS protege — defesa em profundidade.
- **Validar o JWT do usuário** em funções que custam dinheiro (ver aviso acima).
- **Tratar 429 (rate limit) e 401/403 (chave inválida) da Anthropic** com mensagem clara.
- **Logs estruturados**: `console.log` com objeto JSON, não strings concatenadas.
- **Idempotência** em webhooks/automations: aceitar re-entrega sem duplicar efeito.
- **Timeouts**: chamadas externas com `AbortController` + timeout < 30s.
