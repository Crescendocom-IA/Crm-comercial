# FlowCRM

CRM B2B completo com AI nativa, pipeline visual e automações.

> **📚 Vai clonar este projeto para uma instância própria?** Leia primeiro [`docs/README.md`](./docs/README.md) — manual de fundação com schema, guardrails de auth/onboarding, convenções e o checklist de setup obrigatório.

## Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Vite
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions Deno)
- **AI:** Anthropic API (`claude-sonnet-5`), chamada direto pelas Edge Functions
- **Componentes:** shadcn/ui, Recharts, @dnd-kit

## Instalação Local

```bash
# Clonar o repositório
git clone <YOUR_GIT_URL>
cd flowcrm

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais Supabase

# Iniciar servidor de desenvolvimento
npm run dev
```

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|------------|-----------|
| `VITE_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Chave pública (anon) do Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | ID do projeto |

### Secrets (Edge Functions)

Configurar no **Supabase Dashboard → Edge Functions → Secrets** (não vão no `.env`,
que é só para o frontend):

| Secret | Uso | Obrigatória |
|--------|-----|-------------|
| `ANTHROPIC_API_KEY` | AI Copilot, Sales Manager, Insights e Email | ✅ |
| `SLACK_BOT_TOKEN` | Notificações Slack (Bot User OAuth Token, `xoxb-...`) | Se usar Slack |
| `GOOGLE_CLIENT_ID/SECRET` | Google Calendar / Gmail sync | Se usar Google |
| `EVOLUTION_API_URL/KEY` | WhatsApp | Se usar WhatsApp |
| `SENTRY_DSN` | Monitoramento de erros | Opcional |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são injetadas
automaticamente pelo Supabase — não precisa configurá-las.

## Módulos

- **Dashboard** — KPIs, gráficos, métricas em tempo real
- **Contatos & Empresas** — CRUD completo, filtros, tags, lead scoring
- **Pipeline Kanban** — Drag-and-drop, 3 visualizações, qualificação BANT
- **Atividades** — Calls, emails, reuniões, notas, tarefas
- **Email** — Sync Gmail/Outlook, templates, sequências, tracking
- **Automações** — Builder visual trigger→conditions→actions
- **AI Copilot** — Chat contextual, insights, geração de email
- **Integrações** — Slack, Google Calendar, WhatsApp, Zapier/Make, API REST
- **Configurações** — Pipelines, campos customizados, RBAC, billing

## Segurança

- RLS em todas as tabelas (isolamento por `org_id`)
- RBAC: Owner / Admin / Member
- Audit log de ações sensíveis
- Sanitização de inputs (DOMPurify)
- Error boundaries por componente
- Detecção de modo offline

## API Pública

Endpoints disponíveis:

```
GET    /functions/v1/public-api/contacts
POST   /functions/v1/public-api/contacts
PUT    /functions/v1/public-api/contacts/:id
DELETE /functions/v1/public-api/contacts/:id
```

Autenticação: `Authorization: Bearer fc_xxx`

Entidades: `contacts`, `companies`, `deals`, `activities`

## Health Check

```
GET /functions/v1/health
```

Retorna status do banco, latência e timestamp.

## Deploy

O frontend é um build estático do Vite; o backend roda no Supabase. São dois deploys
independentes.

### Frontend (Vercel)

1. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório.
2. A Vercel detecta o Vite sozinha. Confirme os defaults:
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Em **Settings → Environment Variables**, adicione as três variáveis `VITE_*` da
   tabela acima. Elas são embutidas no bundle em tempo de build — **só use chaves
   públicas aqui**, nunca a `service_role`.
4. **Deploy**. Os pushes na `main` passam a publicar automaticamente.

> Como é uma SPA com react-router, rotas profundas (ex: `/deals/123`) precisam cair no
> `index.html`. A Vercel já faz esse fallback para projetos Vite; se um refresh em rota
> profunda der 404, adicione um `vercel.json` com um rewrite de `/(.*)` para `/index.html`.

### Backend (Supabase)

```bash
npx supabase link --project-ref <SEU_PROJECT_REF>
npx supabase db push --linked                              # aplica as migrations
npx supabase functions deploy --project-ref <SEU_PROJECT_REF>   # sobe as Edge Functions
```

Configure as secrets no Dashboard antes do primeiro uso das funções de IA.

### Domínio customizado

Em **Settings → Domains** no projeto da Vercel.

## Licença

Proprietário — todos os direitos reservados.
