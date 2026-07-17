# FlowCRM — Documentação-mãe

Manual de fundação para qualquer instância própria do FlowCRM. Leia em ordem; cada documento assume os anteriores.

## Índice

1. [Arquitetura](./01-architecture.md) — Stack, camadas, princípios SOLID/TDD, pastas
2. [Schema do banco](./02-database-schema.md) — Tabelas, RLS, funções, triggers
3. [Auth & Onboarding](./03-auth-and-onboarding.md) — **Crítico.** Guardrail obrigatório no setup
4. [Módulos](./04-modules.md) — Catálogo funcional (Contatos, Pipeline, AI, Automações, etc.)
5. [Integrações](./05-integrations.md) — Anthropic API, Resend, Slack, API pública
6. [Convenções](./06-conventions.md) — Naming, design system, rotas, i18n PT-BR
7. [Edge Functions](./07-edge-functions.md) — Contratos, secrets, payloads
8. [Checklist de setup](./08-setup-checklist.md) — Validações obrigatórias
9. [Estendendo o projeto](./09-extending.md) — Receitas para nova entidade/módulo/integração

## Como usar este guia

- **Acabou de clonar o projeto?** Vá direto ao [checklist de setup](./08-setup-checklist.md).
- **Vai adicionar um módulo?** Leia [convenções](./06-conventions.md) + [estendendo](./09-extending.md).
- **Precisa entender o domínio?** Comece em [arquitetura](./01-architecture.md) e [módulos](./04-modules.md).

## Princípios não-negociáveis

- **Onboarding obrigatório**: todo usuário novo vê o `OnboardingModal` em `/dashboard`. Detalhes em [03](./03-auth-and-onboarding.md).
- **RLS sempre habilitado** em toda tabela nova, com isolamento por `org_id`.
- **Migrations versionadas**: nunca editar migration já aplicada.
- **Sem `next-themes`** — use o `ThemeContext` próprio.
- **Textos em PT-BR**, código em inglês.
- **Anthropic API (`claude-sonnet-5`) por padrão** para qualquer chamada de IA, com a `ANTHROPIC_API_KEY` nas secrets do Supabase.
