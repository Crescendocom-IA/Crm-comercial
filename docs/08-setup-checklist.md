# 08 — Checklist de setup (obrigatório)

Execute na ordem ao clonar o projeto para uma instância Supabase própria. Não pular itens.

## 0. Clone e configuração inicial

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

## 1. Trigger de auth

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

## 2. Função handle_new_user

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

## 3. Profiles órfãos

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

## 4. Auth settings

No **Supabase Dashboard → Authentication → Providers / Settings**:

- **Confirm email** desabilitado (equivale a `auto_confirm_email = true`), ou um
  provedor SMTP configurado — senão o signup trava esperando confirmação.
- **Anonymous sign-in** desabilitado.
- Google OAuth configurado, se aplicável.

## 5. Teste end-to-end com conta nova

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

## 6. Teste com conta existente

Login → `/dashboard` → se `onboarding_completed=false`, modal abre; se `true`, app normal.

## 7. Secrets

Configurar em **Supabase Dashboard → Edge Functions → Secrets**:

| Secret | Obrigatório? |
|--------|--------------|
| `ANTHROPIC_API_KEY` | ✅ (qualquer função de IA) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ (injetadas automaticamente) |
| `SLACK_BOT_TOKEN` | se usar Slack (ver [05](./05-integrations.md)) |

## 8. Linter Supabase

Rodar `npx supabase db lint --linked` e endereçar warnings de:
- RLS desabilitado em tabela nova
- Função sem `search_path` fixo
- Policy permissiva demais

## 9. RLS em tabelas novas

Para cada tabela criada depois do setup inicial:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  );
```

Se aparecer alguma, criar policy de isolamento por `org_id` (ver [02](./02-database-schema.md)).

## 10. Edge Functions

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

## 11. Build & deploy do frontend

- `npm run build` não pode falhar.
- `npx tsc --noEmit` sem erros (valida que o `types.ts` bate com o schema aplicado).
- Console sem `Error` crítico no carregamento.
- Deploy na Vercel com as variáveis `VITE_*` configuradas (ver [README](../README.md)).

---

**Só considerar o setup "verde" quando todos os itens passarem.**
