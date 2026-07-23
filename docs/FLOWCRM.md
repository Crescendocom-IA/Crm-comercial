# FlowCRM — Documentação Consolidada

Manual de fundação único para o FlowCRM e suas instâncias. Gerado a partir dos arquivos em `docs/`.

---

## Sumário

1. [Visão geral](#visao-geral)
2. [Arquitetura](#arquitetura)
3. [Schema do banco](#schema-do-banco)
4. [Auth & Onboarding (Guardrail obrigatório)](#auth--onboarding-guardrail-obrigatorio)
5. [Módulos funcionais](#modulos-funcionais)
6. [Integrações](#integracoes)
7. [Convenções](#convencoes)
8. [Edge Functions](#edge-functions)
9. [Checklist de setup](#checklist-de-setup)
10. [Estendendo o projeto](#estendendo-o-projeto)

---

<a id="visao-geral"></a>
## 1. Visão geral



Manual de fundação para qualquer instância própria do FlowCRM. Leia em ordem; cada documento assume os anteriores.

### Índice

1. [Arquitetura](./01-architecture.md) — Stack, camadas, princípios SOLID/TDD, pastas
2. [Schema do banco](./02-database-schema.md) — Tabelas, RLS, funções, triggers
3. [Auth & Onboarding](./03-auth-and-onboarding.md) — **Crítico.** Guardrail obrigatório no setup
4. [Módulos](./04-modules.md) — Catálogo funcional (Contatos, Pipeline, AI, Automações, etc.)
5. [Integrações](./05-integrations.md) — Anthropic API, Resend, Slack, API pública
6. [Convenções](./06-conventions.md) — Naming, design system, rotas, i18n PT-BR
7. [Edge Functions](./07-edge-functions.md) — Contratos, secrets, payloads
8. [Checklist de setup](./08-setup-checklist.md) — Validações obrigatórias
9. [Estendendo o projeto](./09-extending.md) — Receitas para nova entidade/módulo/integração

### Como usar este guia

- **Acabou de clonar o projeto?** Vá direto ao [checklist de setup](./08-setup-checklist.md).
- **Vai adicionar um módulo?** Leia [convenções](./06-conventions.md) + [estendendo](./09-extending.md).
- **Precisa entender o domínio?** Comece em [arquitetura](./01-architecture.md) e [módulos](./04-modules.md).

### Princípios não-negociáveis

- **Onboarding obrigatório**: todo usuário novo vê o `OnboardingModal` em `/dashboard`. Detalhes em [03](./03-auth-and-onboarding.md).
- **RLS sempre habilitado** em toda tabela nova, com isolamento por `org_id`.
- **Migrations versionadas**: nunca editar migration já aplicada.
- **Sem `next-themes`** — use o `ThemeContext` próprio.
- **Textos em PT-BR**, código em inglês.
- **Anthropic API (`claude-sonnet-5`) por padrão** para qualquer chamada de IA, com a `ANTHROPIC_API_KEY` nas secrets do Supabase.

---

<a id="arquitetura"></a>
## 2. 01 — Arquitetura



### Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript estrito + Vite 5 |
| Styling | Tailwind CSS v3 + shadcn/ui + tokens HSL semânticos |
| Estado servidor | TanStack Query 5 (staleTime 5min, gcTime 10min, refetchOnWindowFocus off) |
| Estado cliente | React Context (Auth, Theme) — sem Redux/Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions Deno) |
| AI | Anthropic API (`claude-sonnet-5`) via `ANTHROPIC_API_KEY` nas secrets do Supabase |
| Email | Resend |
| Roteamento | react-router-dom v6 com lazy + Suspense por rota |
| Testes | Vitest + RTL (frontend), Deno.test (backend) |

### Camadas

```
pages/          # Rotas — orquestram hooks, não contêm lógica de negócio
  ↓
components/     # UI reutilizável (crm/, layout/, onboarding/, setup/, ui/)
  ↓
hooks/          # Lógica de estado/efeito encapsulada (useOrg, useDebounce, ...)
  ↓
contexts/       # Auth, Theme — apenas o que precisa ser global
  ↓
integrations/   # Cliente Supabase tipado (NÃO EDITAR)
  ↓
lib/            # Utilidades puras (audit, utils)
```

### Estrutura de pastas

```
src/
├── App.tsx                      # Routes + Providers
├── main.tsx                     # Bootstrap
├── index.css                    # Tokens HSL + base Tailwind
├── pages/                       # 1 arquivo por rota (lazy)
├── components/
│   ├── ui/                      # shadcn (não tocar exceto pra variantes)
│   ├── layout/                  # AppLayout, AppHeader, AppSidebar, MobileBottomNav
│   ├── crm/                     # Domínio CRM (Drawers, Kanban, AICopilot, ...)
│   ├── onboarding/              # OnboardingModal + 6 Steps + persistence
│   └── setup/                   # Wizard fullscreen /setup
├── contexts/                    # AuthContext, ThemeContext
├── hooks/                       # use-mobile, useOrg, useDebounce, ...
├── integrations/supabase/       # client.ts + types.ts (AUTO-GERADOS — não editar)
└── lib/                         # audit.ts, utils.ts

supabase/
├── config.toml                  # project_id + verify_jwt por função
├── functions/                   # Edge Functions (kebab-case)
└── migrations/                  # Versionadas YYYYMMDDHHMMSS_*.sql

docs/
└── consolidated_schema.sql      # Schema completo (referência histórica)
```

### Princípios obrigatórios

Aderem ao Workspace Knowledge (constituição do workspace):

- **SOLID** em toda camada; componente React > 150 linhas, função > 30 linhas, arquivo > 200 linhas = sinal pra dividir.
- **TDD** Red → Green → Refactor. Teste descreve comportamento observável.
- **Imutabilidade** por padrão (`const`, spread, map/filter).
- **`strict: true`** sem `any` não-justificado. Discriminated unions pra estado.
- **Erros explícitos** — nunca `catch {}` silencioso.

### Pontos onde NÃO mexer

| Arquivo | Motivo |
|---------|--------|
| `src/integrations/supabase/types.ts` | Gerado por `npx supabase gen types typescript` — edições são sobrescritas |
| `supabase/config.toml` (project_id) | Identidade do projeto; só muda ao trocar de instância Supabase |
| Migrations já aplicadas | Criar nova migration ao invés de editar |

`src/integrations/supabase/client.ts` e `.env` **podem** ser editados — antes eram
gerados automaticamente, hoje são mantidos à mão. O `.env` não é versionado (está no
`.gitignore`); use o `.env.example` como referência.

### Code splitting

Toda página é `lazy()` em `App.tsx`, envolvida em `<SuspenseRoute>` que combina `ErrorBoundary + Suspense`. Não importar pages estaticamente.

### Performance

- TanStack Query com `staleTime: 5min` para reduzir round-trips.
- Listas longas: virtualização (`@tanstack/react-virtual`).
- Realtime apenas onde há colaboração simultânea (Kanban de deals).
- `memo()` em componentes que recebem props estáveis e re-renderizam frequente.

---

<a id="schema-do-banco"></a>
## 3. 02 — Schema do banco



Schema completo vive em `supabase/migrations/00000000000000_initial_schema.sql` (há também uma cópia de referência em `docs/consolidated_schema.sql`). Toda alteração estrutural exige nova migration versionada em `supabase/migrations/`. **Nunca editar migration já aplicada.**

### Modelo de tenancy

Single-tenant white-label na UI, multi-tenant no DB. Todo dado de domínio carrega `org_id` e RLS filtra por `org_id` do usuário autenticado.

```
auth.users (Supabase)
    │
    ├── profiles (1:1)          ← onboarding_completed, onboarding_step, org_id
    │
    └── user_roles (1:N)        ← role: owner | admin | member
            │
            └── organizations   ← settings JSONB (currency, timezone, segment, ...)
```

### Entidades de domínio

#### CRM core
- **organizations** — tenant raiz; `settings` JSONB guarda `segment`, `default_currency`, etc.
- **profiles** — espelho de `auth.users` + `onboarding_completed`, `onboarding_step`, `org_id`.
- **user_roles** — `(user_id, org_id, role)` com enum `app_role`.
- **companies** — empresas/contas. Relaciona 1:N com `contacts`.
- **contacts** — pessoas. FK opcional para `companies`.
- **pipelines** + **pipeline_stages** — funil customizável por org. Default criado no onboarding.
- **deals** — negócios no funil; FK para `pipeline_stages`, `contacts`, `companies`.
- **activities** — call/email/meeting/note/task. Hierarquia obrigatória Deal → Contact → Company.
- **tasks** (via `activities` com `type='task'`) — listadas em `/tasks`.
- **tags**, **contact_tags**, **deal_tags** — taxonomia compartilhada por org.

#### Email
- **email_connections** — provedor sincronizado (Gmail/Outlook).
- **emails** — mensagens sincronizadas e enviadas.
- **email_templates** — modelos com variáveis.
- **email_sequences** + **email_sequence_steps** + **email_sequence_enrollments** — cadências.
- **email_signatures** — por usuário.

#### Inteligência & automação
- **lead_scoring_rules** + **lead_score_history** — pontuação dinâmica.
- **automations** + **automation_logs** — trigger → conditions → actions.
- **segments** — filtros salvos.
- **risk_rules** — gatilhos custom para "deal em risco".
- **sales_goals** — metas mensais por owner/equipe.
- **tracking_events** — eventos vindos do pixel/snippet público.

#### Configuração & ops
- **integration_configs** — config de cada provedor (Resend, Slack, Anthropic, ...).
- **api_keys** — chaves `fc_xxx` da API pública.
- **webhooks** — endpoints de saída.
- **invitations** — convite por magic link; trigger `mark_invitation_accepted`.
- **custom_field_definitions** — campos dinâmicos por entidade.
- **teams** + **team_members** — agrupamento opcional.
- **role_permissions** — matriz RBAC (sobrescreve defaults por role).
- **notification_preferences** — por usuário.
- **loss_reasons** — motivos de perda configuráveis.
- **onboarding_progress** — passos já completados (suporta resume).
- **audit_logs** — ações sensíveis com `actor`, `entity`, `before/after`.
- **org_secrets** — segredos por org (alternativa a `vault.secrets` para chaves não-críticas).

#### Outras (legado/opcional)
- **whatsapp_*** — integração WhatsApp (atualmente desativada, mantida no schema).
- **google_oauth_tokens** — tokens Google Calendar/Gmail.

### Funções (Postgres)

Todas com `SECURITY DEFINER` + `SET search_path = public` quando aplicável.

| Função | Propósito |
|--------|-----------|
| `handle_new_user()` | **Trigger AFTER INSERT em auth.users.** Cria profile, vincula org (1º vira owner), atribui role. Ver [03](./03-auth-and-onboarding.md). |
| `has_role(user, org, role)` | Checagem de RBAC sem recursão de RLS. |
| `user_belongs_to_org(user, org)` | Predicado para policies. |
| `get_user_org_id(user)` | Resolve `org_id` do usuário. |
| `create_organization_for_user(user, name, slug, settings)` | Cria org + role owner + vincula profile. |
| `initialize_org_owner(org, user)` | Idempotente — garante role + vínculo. |
| `mark_invitation_accepted()` | Trigger ao criar profile, marca convite usado. |
| `update_updated_at_column()` | Trigger genérico para `updated_at`. |

### Triggers obrigatórios

```sql
-- CRÍTICO: sem isto, signup não cria profile/org
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### RLS — política padrão

Para qualquer tabela nova com `org_id`:

```sql
ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_select" ON public.minha_tabela
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "org_isolation_write" ON public.minha_tabela
FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));
```

Para policies sensíveis a role, usar `public.has_role(auth.uid(), org_id, 'admin')`.

### Convenções de coluna

- PK: `id uuid default gen_random_uuid()`.
- Timestamps: `created_at timestamptz default now()` e `updated_at timestamptz default now()` com trigger `update_updated_at_column()`.
- Dinheiro: `numeric(14,2)`.
- Datas de domínio: `timestamptz` em UTC; converter no display.
- Enum quando o domínio é fechado (`app_role`, `activity_type`).

---

<a id="auth--onboarding-guardrail-obrigatorio"></a>
## 4. 03 — Auth & Onboarding (Guardrail obrigatório)



> **Toda instância nova DEVE passar pelo checklist em [08](./08-setup-checklist.md) após aplicar o schema.**

### Princípio inegociável

Todo usuário novo VÊ o `OnboardingModal` imediatamente após entrar em `/dashboard`, sem ação manual. Nunca deixar usuário autenticado sem `profile`.

### Fluxo completo

```
[Login] /
   │  signup OR signin
   ▼
auth.users (INSERT)
   │  TRIGGER on_auth_user_created
   ▼
handle_new_user()
   ├── INSERT profiles (onboarding_completed=false, onboarding_step=1)
   ├── INSERT organizations (se for 1º usuário) ou vincula à org existente
   ├── INSERT user_roles (owner | member)
   └── UPDATE profiles.org_id
   ▼
AuthContext.loadProfile()
   │  retry com backoff [0,200,500,1000,1500]ms
   │  self-repair: INSERT profile direto se trigger falhou
   ▼
Navigate → /dashboard
   ▼
AppLayout → OnboardingModal (abre se profile.onboarding_completed != true)
```

### Configuração de Auth

- **Auto-confirm email**: HABILITADO. Usuário entra direto após signup.
- **Sem anonymous sign-ups.**
- **Social login**: Google opcional, configurado via `supabase--configure_social_auth`.
- **Reset de senha**: rota `/reset-password`.

### Trigger obrigatório

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_user_name text;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, name, avatar_url, onboarding_completed, onboarding_step)
  VALUES (NEW.id, NEW.email, v_user_name, NEW.raw_user_meta_data->>'avatar_url', false, 1)
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa',
            '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;

    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, v_org_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id AND org_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Self-repair no frontend

`src/contexts/AuthContext.tsx`:

1. **Retry com backoff** ao carregar profile (cobre lag de trigger): `[0, 200, 500, 1000, 1500]ms`.
2. **Self-repair**: se mesmo após retries não houver profile, faz `INSERT` direto (RLS permite `id = auth.uid()`).
3. **Sem `await` dentro de `onAuthStateChange`** — usa `setTimeout(..., 0)` para evitar deadlocks do Supabase.

### OnboardingModal — regras de abertura

`src/components/onboarding/OnboardingModal.tsx` abre quando:

- `user != null`
- `profile != null`
- `profile.onboarding_completed !== true`

Não bloquear por estado legado. Profile sem conclusão → modal abre.

### 6 steps do modal

| # | Step | Persiste em | Completo quando |
|---|------|-------------|-----------------|
| 0 | Welcome | — | Sempre |
| 1 | Company | `organizations.name` + `settings.segment` | `segment` preenchido |
| 2 | Pipeline | `pipelines` + `pipeline_stages` | Pipeline criado com stages |
| 3 | AI Copilot | `integration_configs` (`provider='anthropic'`) | Ativo |
| 4 | Email | `integration_configs` (`provider='resend'`) | Configurado com from_email |
| 5 | Slack | `integration_configs` (`provider='slack'`) | Configurado |
| 6 | Complete | `profiles.onboarding_completed=true` | Final |

`loadPersistedOnboardingState()` (`persistence.ts`) reconstrói `stepData` e `completedSteps` a partir do DB. `getResumeStep()` decide onde retomar.

### Backfill pós-setup (obrigatório)

Se houver usuários em `auth.users` sem profile (estado órfão), executar:

```sql
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name',
           u.raw_user_meta_data->>'name',
           split_part(u.email,'@',1)),
  false,
  1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

E garantir `org_id` + `user_roles` para esses usuários (via `initialize_org_owner` ou insert manual).

### Anti-padrões

- ❌ Marcar `onboarding_completed=true` no trigger.
- ❌ Usar Supabase anonymous sign-up.
- ❌ Async/await direto em `onAuthStateChange`.
- ❌ Bloquear modal por flag local (`localStorage`).
- ❌ Permitir `/dashboard` carregar sem profile (sempre mostrar loader e tentar self-repair).

---

<a id="modulos-funcionais"></a>
## 5. 04 — Módulos funcionais



Catálogo de módulos com rota, componentes principais e tabelas envolvidas.

### Geral

#### Dashboard — `/dashboard`
- **Componentes**: `pages/Dashboard.tsx`, `DashboardAIChat`, `AIInsightsPanel`, `OnboardingChecklist`, `NotificationBell`.
- **Dados**: KPIs agregados de `deals`, `activities`, `sales_goals`.
- **Charts**: Recharts. Forecasting 80/50/30% probabilidade.

#### Contatos — `/contacts`
- `ContactsKanbanByOwner`, `ContactCreateModal`, `ContactDrawer`, `CSVImportModal`.
- Tabelas: `contacts`, `contact_tags`, `companies` (FK), `custom_field_definitions`.
- Relação 1:N com companies. Industry como select customizável (`useIndustries`).
- DnD por owner.

#### Empresas — `/companies`
- `CompanyCreateModal`, `CompanyDrawer`.
- Tabelas: `companies`, `contacts` (filhos).

#### Negócios — `/deals` + `/deals/:id`
- `DealsKanban` (dnd-kit), `DealsList`, `DealsFilters`, `DealsForecast`, `DealQualification` (BANT), `DealDetail`.
- Tabelas: `deals`, `pipelines`, `pipeline_stages`, `deal_tags`, `loss_reasons`.
- **Realtime habilitado** para sync entre usuários no Kanban.
- 3 visualizações: Kanban, Lista, Forecast.

#### Atividades — `/activities`
- Hierarquia estrita: **Deal → Contact → Company**. Auto-preenche ao selecionar deal.
- Tabela densa estilo Pipedrive.

#### Tarefas — `/tasks`
- Página dedicada (removida do sidebar antigo).
- Filtros: hoje, atrasadas, próximas, concluídas.
- `TaskPanel` em drawer lateral.

#### Em Risco (overlay)
- `AtRiskPanel` (drawer no sidebar).
- Tabela: `risk_rules` (gatilhos custom de inatividade/follow-up).
- `RiskRulesManager` em settings.

### Email

#### Caixa de Entrada — `/inbox`
- Tabelas: `emails`, `email_connections`.
- Sem sincronização de caixa de entrada: os emails chegam por `inbound-webhook` ou são criados no app.

#### Templates — `/email-templates`
- `email_templates` com variáveis interpoladas.

#### Sequências — `/email-sequences`
- `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments`.

#### Envio
- `EmailComposeModal` — auto-preenche Deal → Contact.
- Backend: Resend via `integration_configs`.

### Analytics

#### Metas — `/sales-goals`
- `sales_goals` — metas mensais por owner ou equipe (revenue/deals/activities/contacts).

#### Lead Scoring — `/lead-scoring`
- `lead_scoring_rules` + `lead_score_history`.
- Eventos: email open/click, page visit (via `tracking_events`).

#### Relatórios — `/reports`
- Recharts. Filtros por período, owner, pipeline.

#### Automações — `/automations`
- Visual builder Trigger → Conditions → Actions.
- Tabelas: `automations`, `automation_logs`.
- Execução: pg_cron + Edge `process-automation`.

### Admin

#### Equipe — `/team`
- RBAC via `role_permissions` (matriz que sobrescreve defaults).
- Convite via magic link → `invitations` → Edge `invite-member`.

#### Configurações — `/settings`
- Pipelines, custom fields, loss reasons, signatures.

#### Integrações — `/settings/integrations`
- UI sobre `integration_configs`. Validações via `validate-anthropic-key`, `validate-resend-key`.

#### Segurança — `/settings/security`
- 2FA/TOTP, audit log viewer, `org_secrets` (write-only inputs).

### AI

#### Copilot (global)
- `AICopilot` flutuante em `AppLayout`.
- Edge: `ai-copilot` (Anthropic API, `claude-sonnet-5`).
- Contexto: deal/contact ativo, histórico recente.

#### Insights & Sales Manager
- `ai-insights`, `ai-sales-manager`, `ai-email` — diferentes prompts/modelos.

### Setup Wizard — `/setup`
- Rota **fullscreen fora de AppLayout**.
- 7 steps: Organization, Pipeline, AI, Resend, Slack, Contacts, Complete.
- Alternativa ao modal para reconfiguração explícita.

### Referências de memória

Detalhes de cada feature vivem em `mem://features/*` (ver `mem://index.md`). Consultar antes de modificar uma feature existente.

---

<a id="integracoes"></a>
## 6. 05 — Integrações



### Anthropic API (padrão para IA)

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

#### Pontos que mordem

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

### Resend (email transacional + envio do CRM)

- Config em `integration_configs` (`provider='resend'`) com `from_email` e `api_key`.
- Validação: Edge `validate-resend-key`.
- Templates de email em `email_templates` com interpolação.
- Domínio próprio configurável no painel do Resend (Domains → Add Domain).

### Slack (notificações)

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

### API pública REST — `/functions/v1/public-api`

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

### Webhooks de entrada — `/functions/v1/inbound-webhook?org_id=...`

POST JSON `{ entity, action, data }`. Entidades: `contact`, `company`, `deal`, `activity`. Actions: `create`, `update`. Sem auth — `org_id` no querystring identifica.

### Tracking (pixel/snippet) — `/functions/v1/tracking`

Snippet JS injetado em sites externos posta eventos em `tracking_events`. Alimenta lead scoring.

### Health — `/functions/v1/health`

GET retorna `{ status, db_latency_ms, timestamp }`. Útil para uptime monitors.

### Google Calendar / Gmail — não implementado

- `google_oauth_tokens` armazena tokens.
- Edge removida (código morto). Integração com Google exige fluxo OAuth — projeto à parte.
- `google_oauth_tokens` está no schema mas nenhum código a usa.

### WhatsApp (legado/desativado)

Tabelas `whatsapp_*` permanecem no schema mas a integração foi removida (Evolution API). Não usar em projetos novos sem reativar manualmente.

### Secrets necessárias por integração

| Integração | Secrets (Edge Function env) |
|------------|------------------------------|
| Anthropic (IA) | `ANTHROPIC_API_KEY` |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto) |
| Resend | armazenada em `integration_configs.config.api_key` |
| Slack | `SLACK_BOT_TOKEN` (Bot User OAuth Token, `xoxb-...`) |

Adicionar/atualizar em **Supabase Dashboard → Edge Functions → Secrets**. Nunca expor
service role no frontend.

---

<a id="convencoes"></a>
## 7. 06 — Convenções



### Naming

| Artefato | Convenção | Exemplo |
|----------|-----------|---------|
| Componente React | PascalCase | `DealsKanban.tsx` |
| Hook custom | `useCamelCase` | `useDebounce.ts` |
| Página | PascalCase | `pages/Dashboard.tsx` |
| Tabela Postgres | snake_case | `pipeline_stages` |
| Coluna | snake_case | `created_at` |
| Edge Function | kebab-case | `slack-connect` |
| Migration | `YYYYMMDDHHMMSS_descricao.sql` | `20260420185454_add_role.sql` |
| Booleano | `is_/has_/should_/can_` | `is_active`, `has_paid` |

### Design system

#### Tokens HSL semânticos

Todos os tokens vivem em `src/index.css` como HSL puro (sem `hsl()` wrapper):
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 221 83% 53%;
  /* ... */
}
```

Tailwind referencia via `tailwind.config.ts`. **Nunca usar cores diretas (`text-white`, `bg-blue-500`)** em componentes — sempre semantic tokens (`bg-primary`, `text-foreground`).

#### Tema

- **Inspiração**: Attio + Linear (light, minimal, denso).
- **Default**: light theme. Persistido em `localStorage` como `fc-theme`.
- **Dark mode**: opt-in via `ThemeContext`.
- **NUNCA usar `next-themes`** (conflita com nosso ThemeProvider e quebra hidratação).
- **Fonte**: Inter (carregada via `index.html`).

#### shadcn/ui

- Componentes em `src/components/ui/` — não editar diretamente. Adicionar variantes via CVA.
- Para customização, criar wrapper em `src/components/crm/`.

### Rotas

| Rota | Acesso | Layout |
|------|--------|--------|
| `/` | público | `Login` standalone |
| `/reset-password` | público | standalone |
| `/setup` | autenticado | **fullscreen, fora de AppLayout** |
| `/dashboard` e demais | autenticado | dentro de `AppLayout` (sidebar + header) |
| `*` | qualquer | `NotFound` |

**Regra**: `/` é estritamente auth. Pós-login redireciona para `/dashboard`.

### i18n

- **UI em PT-BR** (textos, labels, mensagens de erro, toasts).
- **Código em inglês** (nomes de variáveis, funções, comentários técnicos).
- **Datas/moedas formatadas com `Intl`** no display, UTC no DB.
- **Moeda padrão BRL** (configurável em `organizations.settings.default_currency`).

### React Query

- `staleTime: 5 * 60 * 1000` (5min) global.
- `gcTime: 10 * 60 * 1000`.
- `refetchOnWindowFocus: false`.
- **Query keys arrays** começando pela entidade: `['deals', orgId, filters]`.
- **Invalidate seletivo** após mutation: `queryClient.invalidateQueries({ queryKey: ['deals'] })`.

### Forms

- **react-hook-form + Zod** para validação.
- Mensagens de erro em PT-BR.
- Sanitizar entradas livres com **DOMPurify** antes de renderizar HTML.

### Acessibilidade

- Todo input tem `<label>` associado.
- Modais usam `Dialog` do shadcn (foco trap automático).
- Atalhos: `Cmd+K` (search), `N` (novo), `D` (deal), `T` (task).

### Logging & erros

- `console.warn` para condições recuperáveis com contexto.
- `console.error` apenas para erros não tratados.
- Toasts (`sonner`) para feedback ao usuário — nunca expor stack trace.
- `ErrorBoundary` envolvendo cada rota (`SuspenseRoute`).

### Mobile

- `useIsMobile` para alternar UX.
- `MobileBottomNav` substitui sidebar em telas pequenas.
- FAB para ação primária da página.

### Segurança no código

- Inputs sensíveis (api keys, tokens) **write-only** na UI: mostra `••••••••` + permite sobrescrever, nunca lê de volta.
- `service_role` **apenas em Edge Functions**.
- Validar `org_id` no backend mesmo com RLS — defesa em profundidade.

---

<a id="edge-functions"></a>
## 8. 07 — Edge Functions



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
| `process-automation` | POST | service | Executa automation enfileirada (pg_cron) | service role |
| `public-api` | GET/POST/PUT/DELETE | Bearer `fc_xxx` | CRUD REST público | service role |
| `inbound-webhook` | POST | querystring `org_id` | Recebe dados externos | service role |
| `tracking` | GET/POST | público (CORS) | Pixel/snippet de eventos | service role |

### Padrão de implementação

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

### config.toml por função

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

### Princípios

- **service_role nunca volta ao cliente.**
- **Sempre validar `org_id`** mesmo quando RLS protege — defesa em profundidade.
- **Validar o JWT do usuário** em funções que custam dinheiro (ver aviso acima).
- **Tratar 429 (rate limit) e 401/403 (chave inválida) da Anthropic** com mensagem clara.
- **Logs estruturados**: `console.log` com objeto JSON, não strings concatenadas.
- **Idempotência** em webhooks/automations: aceitar re-entrega sem duplicar efeito.
- **Timeouts**: chamadas externas com `AbortController` + timeout < 30s.

---

<a id="checklist-de-setup"></a>
## 9. 08 — Checklist de setup (obrigatório)



Execute na ordem ao clonar o projeto para uma instância Supabase própria. Não pular itens.

### 0. Clone e configuração inicial

```bash
git clone <URL_DO_REPO>
cd Crm-Comercial
npm install
cp .env.example .env   # preencher com as credenciais do SEU projeto Supabase
```

Crie o projeto em [supabase.com/dashboard](https://supabase.com/dashboard) e pegue as
credenciais em **Project Settings → API**. Depois aponte o CLI e aplique o schema:

```bash
npx supabase link --project-ref <SEU_PROJECT_REF>
npx supabase db push --linked
npx supabase functions deploy --project-ref <SEU_PROJECT_REF>
```

Atualize também o `project_id` em `supabase/config.toml`.

> `db push` não aceita `--project-ref`: use `link` + `--linked`, ou `--db-url`.

### 1. Trigger de auth

Confirmar que `on_auth_user_created` existe em `auth.users`:

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created';
```

Se vazio, recriar:

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 2. Função handle_new_user

```sql
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = 'handle_new_user';
```

Se ausente, executar migration com a função (ver [03](./03-auth-and-onboarding.md)).

> ⚠️ **A primeira conta criada vira `owner`; as seguintes viram `member`.** O
> `handle_new_user` faz `SELECT id FROM organizations LIMIT 1` — se já existe uma org,
> o novo usuário entra como membro dela. Consequência prática: se você criar uma conta
> de teste, apagá-la e **deixar a organização órfã**, sua primeira conta real entrará
> como `member` e o sistema ficará sem nenhum owner. Ao limpar dados de teste, apague
> a organização junto.

### 3. Profiles órfãos

```sql
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

Se houver linhas, backfill:

```sql
INSERT INTO public.profiles (id, email, name, onboarding_completed, onboarding_step)
SELECT u.id, u.email,
       COALESCE(u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                split_part(u.email,'@',1)),
       false, 1
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

E para cada profile sem `org_id`, vincular à org default (ou criar uma).

### 4. Auth settings

No **Supabase Dashboard → Authentication → Providers / Settings**:

- **Confirm email** desabilitado (equivale a `auto_confirm_email = true`), ou um
  provedor SMTP configurado — senão o signup trava esperando confirmação.
- **Anonymous sign-in** desabilitado.
- Google OAuth configurado, se aplicável.

### 5. Teste end-to-end com conta nova

1. Acessar `/` e criar conta de teste.
2. Confirmar redirect automático para `/dashboard`.
3. **OnboardingModal deve abrir sozinho.**
4. Verificar no DB:
   ```sql
   SELECT id, email, org_id, onboarding_completed, onboarding_step
   FROM public.profiles WHERE email = '<email-de-teste>';
   ```
   Esperado: `org_id` preenchido, `onboarding_completed=false`, `onboarding_step=1`.
5. Verificar role (a primeira conta deve ser `owner`):
   ```sql
   SELECT role FROM public.user_roles
   WHERE user_id = (SELECT id FROM auth.users WHERE email = '<email-de-teste>');
   ```

### 6. Teste com conta existente

Login → `/dashboard` → se `onboarding_completed=false`, modal abre; se `true`, app normal.

### 7. Secrets

Configurar em **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Obrigatório? |
|--------|--------------|
| `ANTHROPIC_API_KEY` | ✅ (qualquer função de IA) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ (injetadas automaticamente) |
| `SLACK_BOT_TOKEN` | se usar Slack (ver [05](./05-integrations.md)) |

### 8. Linter Supabase

Rodar `npx supabase db lint --linked` e endereçar warnings de:
- RLS desabilitado em tabela nova
- Função sem `search_path` fixo
- Policy permissiva demais

### 9. RLS em tabelas novas

Para cada tabela criada depois do setup inicial:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  );
```

Se aparecer alguma, criar policy de isolamento por `org_id` (ver [02](./02-database-schema.md)).

### 10. Edge Functions

- Verificar logs: `npx supabase functions logs <nome> --project-ref <REF>`, ou no
  Dashboard → Edge Functions → Logs.
- Testar `health`:
  ```bash
  curl https://<project-ref>.supabase.co/functions/v1/health
  ```
  Esperado: `{"status":"healthy", ..., "db_connected":true}`.
- Testar que as funções de IA **rejeitam** a publishable key sozinha:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://<project-ref>.supabase.co/functions/v1/ai-copilot \
    -H "apikey: <PUBLISHABLE_KEY>" -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"oi"}]}'
  ```
  Esperado: **401**. Se retornar 200, a validação de JWT dentro da função não está
  ativa e qualquer visitante do site pode consumir seus créditos da Anthropic.

### 11. Build & deploy do frontend

- `npm run build` não pode falhar.
- `npx tsc --noEmit` sem erros (valida que o `types.ts` bate com o schema aplicado).
- Console sem `Error` crítico no carregamento.
- Deploy na Vercel com as variáveis `VITE_*` configuradas (ver [README](../README.md)).

---

**Só considerar o setup "verde" quando todos os itens passarem.**

---

<a id="estendendo-o-projeto"></a>
## 10. 09 — Estendendo o projeto



Receitas para adicionar funcionalidade sem violar guardrails. Toda extensão segue SOLID + TDD do Workspace Knowledge.

### A. Nova entidade de domínio

Exemplo: adicionar `projects` (projetos vinculados a deals).

#### 1. Migration

```sql
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON public.projects(org_id);
CREATE INDEX idx_projects_deal ON public.projects(deal_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON public.projects
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "projects_write" ON public.projects
FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

#### 2. Tipos regenerados
Rodar `npx supabase gen types typescript --project-id <REF> > src/integrations/supabase/types.ts` após cada migration. O arquivo é gerado — edições manuais são sobrescritas.

#### 3. Hook
```ts
// src/hooks/useProjects.ts
export function useProjects() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('*').eq('org_id', orgId!);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}
```

#### 4. Página + componentes
- `src/pages/Projects.tsx` (lazy em `App.tsx`).
- `src/components/crm/ProjectCreateModal.tsx`, `ProjectDrawer.tsx`.

#### 5. Sidebar
Adicionar item em `AppSidebar.tsx` no grupo apropriado (Geral/Analytics/Admin).

#### 6. Rota
```tsx
const Projects = lazy(() => import("./pages/Projects"));
// ...
<Route path="/projects" element={<SuspenseRoute><Projects /></SuspenseRoute>} />
```

#### 7. Testes
- Unit: hooks (mock supabase).
- Integration: fluxo CRUD via RTL.

---

### B. Nova Edge Function

#### 1. Criar arquivo
`supabase/functions/minha-funcao/index.ts` seguindo template do [07](./07-edge-functions.md).

#### 2. config.toml (se público)
```toml
[functions.minha-funcao]
verify_jwt = false
```

#### 3. Secrets
Se precisar de chave externa, `secrets--add_secret`.

#### 4. Chamar do frontend
```ts
const { data, error } = await supabase.functions.invoke('minha-funcao', {
  body: { foo: 'bar' },
});
```

#### 5. Testar
- `supabase--test_edge_functions` ou curl direto.
- Verificar logs com `supabase--edge_function_logs`.

---

### C. Nova integração externa

#### 1. Registro em `integration_configs`
```ts
await supabase.from('integration_configs').insert({
  org_id,
  provider: 'meu_servico',
  config: { api_key: '***', endpoint: 'https://...' },
  is_active: true,
});
```

#### 2. Edge `validate-meu_servico-key`
Faz request de health no provedor, retorna `{ valid: true | false, error? }`.

#### 3. UI em `/settings/integrations`
- Input write-only para api_key (mostra `••••` se já configurado).
- Botão "Testar conexão" chama validador.

#### 4. Consumo
Edge Functions internas leem `integration_configs` por `org_id` + `provider`.

---

### D. Novo step no Onboarding

#### 1. Criar componente
`src/components/onboarding/MeuStep.tsx` implementando `OnboardingStepProps`.

#### 2. Adicionar ao array de steps
`OnboardingModal.tsx`:
```ts
const steps = [
  { id: 'welcome', component: WelcomeStep, label: 'Boas-vindas' },
  // ...
  { id: 'meu_step', component: MeuStep, label: 'Meu Step' },
  { id: 'complete', component: CompleteStep, label: 'Pronto' },
];
```

#### 3. Persistência
Em `persistence.ts`:
- Carregar estado prévio em `loadPersistedOnboardingState`.
- Adicionar ao `completedSteps.add('meu_step')` quando satisfeito.

#### 4. Resume logic
Atualizar `getResumeStep` para considerar a posição do novo step.

#### 5. Setup Wizard (`/setup`)
Espelhar o step em `src/components/setup/StepMeuStep.tsx` se aplicável.

---

### E. Nova role / permissão

#### 1. Atualizar enum (se nova role)
```sql
ALTER TYPE public.app_role ADD VALUE 'analyst';
```

#### 2. Atualizar `role_permissions`
Adicionar linhas com matriz de capacidades.

#### 3. Helper no frontend
`hooks/useRole.ts` para checar capacidade granular.

#### 4. UI em `/team`
Mostrar nova role no seletor.

---

### Checklist universal antes de mergear extensão

- [ ] Migration versionada criada (nunca editar applied).
- [ ] RLS habilitado + policies por `org_id`.
- [ ] Hook com `useQuery`/`useMutation` + invalidação correta.
- [ ] Componente < 150 linhas, função < 30 linhas.
- [ ] Sem `any` injustificado, sem cores hardcoded.
- [ ] Textos UI em PT-BR.
- [ ] Testes Vitest + RTL cobrindo comportamento observável.
- [ ] `supabase--linter` sem novos warnings.
- [ ] Memória atualizada (`mem://`) se a feature for permanente e estrutural.

---
