import { createClient } from "@supabase/supabase-js";

/*
 * Cria (ou reaproveita) uma conta de teste E2E direto via admin API, com
 * email_confirm: true — pula a confirmação de email que bloqueia o signup
 * headless. Roda com a service_role key, nunca a publishable:
 *
 *   SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/create-test-user.ts
 */
const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.env.E2E_EMAIL || "e2e@flowcrm.test";
const PASSWORD = process.env.E2E_PASSWORD || "E2eTest2026!";

const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

if (error) {
  // Conta já existente não é erro fatal — o teste só precisa que ela exista.
  if (/already been registered|already exists/i.test(error.message)) {
    console.log(`Conta ${EMAIL} já existe — reaproveitando.`);
    process.exit(0);
  }
  console.error("Erro:", error.message);
  process.exit(1);
}

console.log(`Conta criada: ${data.user?.email} (id ${data.user?.id})`);
