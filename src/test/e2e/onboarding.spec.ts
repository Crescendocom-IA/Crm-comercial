import { test, expect } from "@playwright/test";

/*
 * Cria conta nova, avança um passo, clica "Configurar depois" e confirma que o
 * modal NÃO reaparece após reload — a correção da Sessão 3 (refreshProfile no
 * skip) depende disso.
 *
 * Requer signup sem confirmação de email obrigatória. Se o projeto exigir
 * confirmação, o teste se marca como skip ao detectar a tela de "verifique seu
 * email" em vez de falhar.
 */
test.describe("Onboarding", () => {
  test('"Configurar depois" não reaparece no reload', async ({ page }) => {
    const email = `e2e+${Date.now()}@example.com`;
    const password = "Senha123!e2e";

    await page.goto("/login");
    await page.getByRole("tab", { name: "Cadastrar" }).click();
    await page.getByPlaceholder("Seu nome").fill("E2E Bot");
    await page.getByPlaceholder("seu@email.com").fill(email);
    await page.getByPlaceholder("Mínimo 6 caracteres").fill(password);
    // "Cadastrar" é a aba; o botão de submit é "Criar conta".
    await page.getByRole("button", { name: /criar conta/i }).click();

    /*
     * O handler só cria sessão se o projeto NÃO exige confirmação de email.
     * Quando exige, um toast "Verifique seu email" aparece e some, e a página
     * fica em /login. Em vez de caçar o toast (que já pode ter sumido),
     * detectamos o estado estável: se após 5s ainda estamos em /login, é
     * confirmação de email ligada — não há como seguir headless.
     */
    await page.waitForTimeout(5000);
    const stuckOnLogin = /\/login/.test(page.url());
    test.skip(
      stuckOnLogin,
      "Projeto Supabase exige confirmação de email — signup->onboarding não roda headless"
    );

    // Espera o modal de onboarding abrir.
    const skipButton = page.getByRole("button", { name: /configurar depois/i });
    await expect(skipButton).toBeVisible({ timeout: 20_000 });
    await skipButton.click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Reload: o modal não deve voltar.
    await page.reload();
    await page.waitForTimeout(3000);
    await expect(
      page.getByRole("button", { name: /configurar depois/i })
    ).toHaveCount(0);
  });
});
