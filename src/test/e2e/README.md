# Testes E2E (Playwright)

Rodam contra o app real subido localmente pelo Vite, com o Chrome do sistema
(`channel: "chrome"` — o binário do Playwright não baixa neste ambiente).

## Pré-requisitos

No `.env` da raiz (já usado pelo app):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

O `playwright.config.ts` carrega essas `VITE_*` para o `process.env` via `loadEnv`
do Vite — os testes que semeiam dados falam com o Supabase direto e precisam
delas.

No ambiente (não no `.env`, para não vazar em commit):

- `E2E_EMAIL` / `E2E_PASSWORD` — conta principal (owner, onboarding completo)
- `E2E_ONB_EMAIL` / `E2E_ONB_PASSWORD` — conta de onboarding pendente
  (opcional; o padrão é `e2e-onb@flowcrm.test` / `E2eTest2026!`)

Sem `E2E_EMAIL`/`E2E_PASSWORD`, os testes que dependem de login se marcam como
**skip** com motivo, em vez de falhar.

## Preparar as contas (uma vez, ou quando quiser resetar)

`scripts/create-test-user.ts` cria/reconfigura as **duas** contas e deixa a org
principal pronta (pipeline + 6 estágios, zero contatos/empresas/negócios).
Precisa da **service role key** — por isso é um passo à parte, e o resto da
suíte não exige o segredo de serviço:

```bash
SUPABASE_SERVICE_ROLE_KEY="..." VITE_SUPABASE_URL="..." npx tsx scripts/create-test-user.ts
```

Ele recusa rodar se o email não terminar em `.test` ou `@example.com` — trava
contra apontar por engano para uma conta real (o script limpa a org inteira).

## Rodar

```bash
E2E_EMAIL="..." E2E_PASSWORD="..." npx playwright test --project=chrome
```

Antes da suíte, o **`global-setup.ts`** faz login uma vez por conta e grava a
sessão em `.auth/user.json` e `.auth/user-onboarding.json` (ignorados pelo git —
contêm tokens). Os specs entram já logados via `test.use({ storageState })`, então
o login acontece **uma vez por execução**, não uma vez por teste. Isso reduz os
sign-ins (a suspeita de flake por limite de taxa do GoTrue) e acelera cada teste
autenticado.

Rodar um arquivo só:

```bash
E2E_EMAIL="..." E2E_PASSWORD="..." npx playwright test contacts --project=chrome
```

## Como cada spec entra

| Spec | Sessão | Por quê |
|------|--------|---------|
| a maioria (contacts, companies, deals, dashboard, …) | `.auth/user.json` (padrão do config) | já logado como owner |
| `login.spec.ts` | deslogado (`LOGGED_OUT`) | testa o próprio fluxo de login |
| `onboarding.spec.ts` | deslogado (`LOGGED_OUT`) | faz signup de conta nova |
| `role-after-onboarding.spec.ts` | `.auth/user-onboarding.json` | precisa da conta com onboarding pendente |

A conta de onboarding tem `onboarding_completed = false`, e o próprio teste o
marca `true` ao pular. Por isso `role-after-onboarding` chama `resetarOnboarding()`
no começo — devolve só esse campo ao estado pendente, sem tocar no papel.

## Skips esperados

- `deal-summary.spec.ts` pula sem `E2E_DEAL_ID` (aponta para um negócio real da org).
- `onboarding.spec.ts` pula se o projeto Supabase exigir confirmação de email —
  o signup->onboarding não roda headless nesse caso.

## Semear e limpar dados

Testes que precisam de massa (paginação, dashboard, edição de empresa) a criam
via `apiComoUsuario()` — um cliente Supabase autenticado como a conta E2E, que
passa pela RLS como o app passaria — e limpam num `finally`. A `create-test-user`
deixa a org vazia de propósito: massa órfã deslocaria a contagem dos outros
testes na execução seguinte.

## Flake conhecido

`automation.spec.ts` é o teste mais pesado (cria automação, liga o switch,
cria negócio, marca ganho e espera a automação disparar uma tarefa). Sob um
pico de latência de rede ele pode estourar o timeout — falha rara (~1 em 15
execuções da suíte) e correlacionada a execuções lentas, não a lógica de teste.
Ainda não endereçado.
