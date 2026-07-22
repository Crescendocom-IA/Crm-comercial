import { createClient } from "@supabase/supabase-js";

/*
 * Cria (ou reconfigura) a conta de teste E2E já pronta para uso:
 *   - email confirmado (pula a confirmação que trava o signup headless)
 *   - onboarding_completed = true (sem o modal bloqueando o dashboard)
 *   - role = owner (para exercitar automações, pipelines, etc.)
 *
 * Idempotente: se a conta já existe (ex: criada antes como member), reusa o id
 * e reaplica as configurações, em vez de exigir deleção manual no painel.
 *
 *   SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/create-test-user.ts
 */
const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.env.E2E_EMAIL || "e2e@flowcrm.test";
const PASSWORD = process.env.E2E_PASSWORD || "E2eTest2026!";

// 1. Cria o usuário com email confirmado — ou recupera o id se já existir.
let userId: string | undefined;
const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

if (error) {
  if (/already been registered|already exists/i.test(error.message)) {
    // Procura o id da conta existente paginando os usuários.
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      userId = list.users.find((u) => u.email === EMAIL)?.id;
      if (!list.users.length) break;
    }
    console.log(`Conta ${EMAIL} já existia — reconfigurando (id ${userId}).`);
  } else {
    console.error("Erro ao criar:", error.message);
    process.exit(1);
  }
} else {
  userId = data.user?.id;
  console.log(`Conta criada: ${EMAIL} (id ${userId}).`);
}

if (!userId) {
  console.error("Não foi possível determinar o id do usuário.");
  process.exit(1);
}

// 2. Aguarda o trigger handle_new_user criar profile + org + user_roles.
await new Promise((r) => setTimeout(r, 2500));

// 3. Marca onboarding como completo.
const { error: pErr } = await supabase
  .from("profiles")
  .update({ onboarding_completed: true })
  .eq("id", userId);
if (pErr) console.error("profiles update:", pErr.message);

// 4. Promove para owner na org.
const { error: rErr } = await supabase
  .from("user_roles")
  .update({ role: "owner" })
  .eq("user_id", userId);
if (rErr) console.error("user_roles update:", rErr.message);

// 5. Confirma o estado final.
const { data: check } = await supabase
  .from("user_roles")
  .select("role, org_id")
  .eq("user_id", userId)
  .maybeSingle();
console.log("Estado final:", { id: userId, role: check?.role, org_id: check?.org_id });
