import { test, expect } from "@playwright/test";
import { hasCreds, login, LOGGED_OUT } from "./helpers";

// Este arquivo testa o próprio fluxo de login: precisa começar deslogado,
// ignorando a sessão padrão do global-setup.
test.use({ storageState: LOGGED_OUT });

test.describe("Login", () => {
  // Roda SEMPRE — não precisa de conta. Prova que a página carrega e o app bootou.
  test("página de login renderiza e rejeita credenciais inválidas", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("tab", { name: "Entrar" })).toBeVisible();
    await page.getByPlaceholder("seu@email.com").first().fill("naoexiste@example.com");
    await page.getByPlaceholder("••••••••").fill("senhaerrada123");
    await page.getByRole("button", { name: /entrar/i }).click();
    // Continua em /login — credencial ruim não redireciona.
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/);
  });

  test("login válido redireciona para /dashboard", async ({ page }) => {
    test.skip(!hasCreds, "E2E_EMAIL / E2E_PASSWORD não definidos");
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
