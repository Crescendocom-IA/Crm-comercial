# 05 — Integrações

## Anthropic API (padrão para IA)

Todas as funções de IA chamam a API da Anthropic diretamente, com a
`ANTHROPIC_API_KEY` configurada em **Supabase Dashboard → Edge Functions → Secrets**.

Modelo padrão: **`claude-sonnet-5`** — melhor equilíbrio entre velocidade e
inteligência. Use `claude-opus-4-8` se precisar de mais capacidade, ou
`claude-haiku-4-5` para volume alto e tarefas simples.

Uso em Edge Function:
```ts
const resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: systemPrompt,        // system vai separado, fora de messages
    messages,                    // apenas roles user/assistant
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    stream: true,                // opcional
  }),
});
```

### Pontos que mordem

- **`system` é um parâmetro separado.** Ao contrário do formato OpenAI, não existe
  `{role: "system"}` dentro de `messages` — filtre esse role antes de repassar.
- **`thinking` e `effort`.** O `claude-sonnet-5` liga *adaptive thinking* por padrão
  quando o campo é omitido, o que adiciona latência. Para chat, use
  `thinking: {type: "disabled"}` + `output_config: {effort: "low"}`. O `effort`
  controla o gasto de tokens e é independente do thinking; o default é `high`.
- **`tools`:** a definição é plana (`name`, `description`, `input_schema`), sem o
  invólucro `{type: "function", function: {...}}`. O `tool_choice` forçado é
  `{type: "tool", name: "..."}`. Use **`strict: true`** + `additionalProperties: false`
  para garantir que o `input` bata com o schema — sem isso o modelo pode devolver
  um array como string JSON.
- **Resposta:** vem em `data.content` (array de blocos), não em `data.choices`.
  Para tools, ache o bloco `type === "tool_use"` e leia `.input` — já é objeto,
  não precisa de `JSON.parse`.
- **Streaming SSE:** o formato nativo da Anthropic é
  `{type: "content_block_delta", delta: {type: "text_delta", text}}` — diferente do
  OpenAI. As funções `ai-copilot` e `ai-sales-manager` convertem para
  `data: {"choices":[{"delta":{"content":"..."}}]}` + `data: [DONE]` na saída,
  mantendo o parser do frontend intacto.
- **Autenticação:** as 4 funções de IA validam o JWT do usuário antes de chamar a
  Anthropic. A publishable key sozinha satisfaz o `verify_jwt` do gateway, então sem
  essa checagem qualquer visitante do site poderia consumir créditos.

**Tratar 429 (rate limit) e 401/403 (chave inválida)** com mensagens claras ao usuário.

## Resend (email transacional + envio do CRM)

- Config em `integration_configs` (`provider='resend'`) com `from_email` e `api_key`.
- Validação: Edge `validate-resend-key`.
- Templates de email em `email_templates` com interpolação.
- Domínio próprio configurável no painel do Resend (Domains → Add Domain).

## Slack (notificações)

- Requer um **Slack App próprio** ([api.slack.com/apps](https://api.slack.com/apps) →
  Create New App → From scratch), instalado no workspace. O **Bot User OAuth Token**
  (`xoxb-...`) vai na secret `SLACK_BOT_TOKEN`.
- Escopos obrigatórios: `chat:write`, `channels:read`. Opcionais: `chat:write.public`
  (postar em canal público sem convidar o bot) e `chat:write.customize` (bot aparece
  como "FlowCRM").
- Edge `slack-connect` valida o token (`auth.test`) e lista os canais
  (`conversations.list`), salvando em `integration_configs` (`provider='slack'`).
- Teste de envio: `slack-send-test` (`chat.postMessage`).
- Erro mais comum na primeira tentativa: `not_in_channel` — convide o bot com
  `/invite @FlowCRM` ou conceda `chat:write.public`.

## API pública REST — `/functions/v1/public-api`

Auth: `Authorization: Bearer fc_xxx` (chave em `api_keys`).

Endpoints:
```
GET    /public-api/contacts
POST   /public-api/contacts
PUT    /public-api/contacts/:id
DELETE /public-api/contacts/:id
```
Entidades suportadas: `contacts`, `companies`, `deals`, `activities`.

**Rate limiting** por org_id da api_key.

## Webhooks de entrada — `/functions/v1/inbound-webhook?org_id=...`

POST JSON `{ entity, action, data }`. Entidades: `contact`, `company`, `deal`, `activity`. Actions: `create`, `update`. Sem auth — `org_id` no querystring identifica.

## Tracking (pixel/snippet) — `/functions/v1/tracking`

Snippet JS injetado em sites externos posta eventos em `tracking_events`. Alimenta lead scoring.

## Health — `/functions/v1/health`

GET retorna `{ status, db_latency_ms, timestamp }`. Útil para uptime monitors.

## Google Calendar / Gmail (opcional)

- `google_oauth_tokens` armazena tokens.
- Edge `gmail-initial-sync` puxa últimos N emails.
- Atualmente parcial — verificar se a instância precisa.

## WhatsApp (legado/desativado)

Tabelas `whatsapp_*` permanecem no schema mas a integração foi removida (Evolution API). Não usar em projetos novos sem reativar manualmente.

## Secrets necessárias por integração

| Integração | Secrets (Edge Function env) |
|------------|------------------------------|
| Anthropic (IA) | `ANTHROPIC_API_KEY` |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto) |
| Resend | armazenada em `integration_configs.config.api_key` |
| Slack | `SLACK_BOT_TOKEN` (Bot User OAuth Token, `xoxb-...`) |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Adicionar/atualizar em **Supabase Dashboard → Edge Functions → Secrets**. Nunca expor
service role no frontend.
