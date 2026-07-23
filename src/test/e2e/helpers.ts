import { Page, expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const CREDS = {
  email: process.env.E2E_EMAIL || "",
  password: process.env.E2E_PASSWORD || "",
};

export const hasCreds = !!CREDS.email && !!CREDS.password;

/**
 * Pula o teste com um motivo claro quando faltam credenciais, em vez de deixá-lo
 * falhar no muro de login e parecer bug do app.
 */
export function requireCreds() {
  test.skip(!hasCreds, "E2E_EMAIL / E2E_PASSWORD não definidos no ambiente");
}

/**
 * Cliente Supabase autenticado como a conta E2E, para semear massa de teste.
 *
 * Usa a publishable key e a sessão do próprio usuário — passa pela RLS como o
 * app passaria, e não exige a service role key na máquina de quem roda os
 * testes. `scripts/create-test-user.ts` deixa a org vazia de propósito; quem
 * precisa de volume o cria aqui e limpa depois.
 */
export async function apiComoUsuario() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL/PUBLISHABLE_KEY ausentes no ambiente");

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: CREDS.email, password: CREDS.password,
  });
  if (error) throw new Error(`login da conta E2E falhou: ${error.message}`);

  const { data: papel } = await client
    .from("user_roles").select("org_id").eq("user_id", data.user!.id).maybeSingle();
  if (!papel?.org_id) throw new Error("conta E2E sem organização");

  return { client, orgId: papel.org_id as string, userId: data.user!.id };
}

/**
 * Devolve a conta de onboarding ao estado pendente.
 *
 * O teste de papel-após-onboarding depende do modal aparecer, e o próprio teste
 * marca onboarding_completed ao clicar em "Configurar depois". Sem este reset
 * ele passa na primeira execução e falha em todas as seguintes — exatamente o
 * tipo de teste que ninguém confia e todo mundo aprende a ignorar.
 */
export async function resetarOnboarding() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL/PUBLISHABLE_KEY ausentes no ambiente");

  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.E2E_ONB_EMAIL || "e2e-onb@flowcrm.test",
    password: process.env.E2E_ONB_PASSWORD || "E2eTest2026!",
  });
  if (error) throw new Error(`login da conta de onboarding falhou: ${error.message}`);

  /*
   * `returning=representation` para conferir o que ficou gravado, em vez de
   * confiar num update que não devolveu erro. Sem a confirmação, o teste
   * seguia para o login sem saber se a linha realmente mudou — e falhava
   * esperando um modal de onboarding que não ia aparecer, com uma mensagem
   * que não dizia nada sobre a causa.
   */
  const { data: perfil, error: upErr } = await client.from("profiles")
    .update({ onboarding_completed: false, onboarding_step: 0 })
    .eq("id", data.user!.id)
    .select("onboarding_completed")
    .maybeSingle();
  if (upErr) throw new Error(`reset do onboarding: ${upErr.message}`);
  if (perfil?.onboarding_completed !== false) {
    throw new Error(
      `reset do onboarding não teve efeito (onboarding_completed=${perfil?.onboarding_completed}); ` +
      "a RLS de profiles permite este UPDATE?",
    );
  }
}

/** Login pela aba "Entrar" e espera o redirect para /dashboard. */
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Entrar" }).click();
  await page.getByPlaceholder("seu@email.com").first().fill(CREDS.email);
  await page.getByPlaceholder("••••••••").fill(CREDS.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}
