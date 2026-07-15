## Diagnóstico

O motivo do n8n não receber nada é simples: **o CRM nunca dispara os webhooks de saída**.

O que existe hoje:
- Tela `Configurações → Integrações → Webhooks` salva URL + eventos na tabela `webhooks` (e também em `integration_configs` provider `zapier`, onde já está gravado `https://n8n-wqgh.srv1746890.hstgr.cloud/webhook-test/crm-events` com eventos `deal.won, deal.lost, deal.created`).
- Não existe **nenhum código** que leia essas linhas e faça POST quando um deal/contato muda. Só a engine de Automations tem uma action `call_webhook`, mas ela só dispara se o usuário montar uma automação manualmente — a aba "Webhooks" da integração é puramente decorativa hoje.

Ou seja: URL correta, n8n correto, mas nada é enviado ⇒ timeout / silêncio.

## Correção

Fazer a aba de Webhooks realmente disparar. Duas partes:

### 1. Edge function `dispatch-webhook` (nova)

`supabase/functions/dispatch-webhook/index.ts`, pública (verify_jwt=false), payload:
```json
{ "org_id": "...", "event": "deal.created", "data": { ... } }
```

Lógica:
1. Busca em `webhooks` (linhas `is_active=true` cujo campo `events` contém o `event`) **e** em `integration_configs` (`provider IN ('zapier','n8n','make')`, `is_active=true`, `config.events` contém o `event`) — para cobrir os dois lugares onde a URL pode estar salva.
2. Para cada URL, faz `fetch(url, POST, { event, data, org_id, timestamp })` com `AbortController` timeout 10s, `try/catch` (falha de um destino não bloqueia os outros).
3. Grava sucesso/erro em `webhook_deliveries` (usar tabela se já existir; caso contrário só `console.log`).
4. Retorna `{ dispatched: N, failed: M }`.

Sem autenticação de usuário (só service role interno via `SUPABASE_SERVICE_ROLE_KEY`), mas exige `org_id` obrigatório.

### 2. Helper cliente `src/lib/webhooks.ts` (novo) + call-sites

Função:
```ts
fireWebhook(orgId, event, data) // fire-and-forget, supabase.functions.invoke("dispatch-webhook", ...)
```

Chamar em:
- `src/pages/Deals.tsx` / `DealDetail.tsx` — após criar deal (`deal.created`) e após mudança de `status` para `won`/`lost` (`deal.won` / `deal.lost`).
- `src/components/crm/ContactCreateModal.tsx` — após criar (`contact.created`).
- `src/components/crm/CompanyCreateModal.tsx` — após criar (`company.created`).

Fire-and-forget (`.catch(console.warn)`) para nunca travar a UI.

### 3. Ajuste na UI de Integrações (mínimo)

Na aba "Webhooks" adicionar um botão **"Enviar teste"** por linha que chama `dispatch-webhook` com `event: "test"` e um payload dummy — isso permite validar o n8n imediatamente sem precisar criar um deal real.

## Fora do escopo

- Não vou mexer no schema (`webhooks` e `integration_configs` já existem e são suficientes).
- Não vou criar retry queue nem assinatura HMAC agora (posso adicionar depois se quiser).
- Automations (`process-automation` + action `call_webhook`) continuam intocadas.

## Como validar depois do build

1. Ir em Integrações → Webhooks → clicar "Enviar teste" na linha do n8n → conferir no editor do n8n que o webhook foi acionado.
2. Criar um deal e marcar como ganho → n8n deve receber `deal.created` e `deal.won`.