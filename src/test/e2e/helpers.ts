import { Page, expect, test } from "@playwright/test";

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

/** Login pela aba "Entrar" e espera o redirect para /dashboard. */
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Entrar" }).click();
  await page.getByPlaceholder("seu@email.com").first().fill(CREDS.email);
  await page.getByPlaceholder("••••••••").fill(CREDS.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}
