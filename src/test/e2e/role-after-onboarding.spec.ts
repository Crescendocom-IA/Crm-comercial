import { test, expect } from "@playwright/test";
import { resetarOnboarding } from "./helpers";

/*
 * Valida a consolidação do papel no AuthContext no caminho que mais preocupa:
 * o papel precisa chegar à UI depois do refreshProfile() do onboarding, SEM
 * recarregar a página.
 *
 * Por isso a navegação final é por clique na sidebar (SPA), não page.goto() —
 * um goto seria um carregamento novo e mascararia justamente o que se testa.
 *
 * Requer a conta e2e-onb@flowcrm.test, criada com email confirmado e SEM
 * promoção manual: o papel de owner vem do trigger handle_new_user (achado-3).
 */
const EMAIL = process.env.E2E_ONB_EMAIL || "e2e-onb@flowcrm.test";
const PASSWORD = process.env.E2E_ONB_PASSWORD || "E2eTest2026!";

test.describe("Papel após onboarding", () => {
  test("ações de owner aparecem sem reload", async ({ page }) => {
    // O próprio teste completa o onboarding ao pular; sem devolver a conta ao
    // estado pendente ele só passaria na primeira execução.
    await resetarOnboarding();

    await page.goto("/login");
    await page.getByRole("tab", { name: "Entrar" }).click();
    await page.getByPlaceholder("seu@email.com").first().fill(EMAIL);
    await page.getByPlaceholder("••••••••").fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();

    /*
     * Confirma que o login passou ANTES de esperar o modal.
     *
     * Sem isto, um login que não completa (a suíte inteira faz um sign-in por
     * teste, e o GoTrue limita por IP) falhava lá embaixo com "botão não
     * visível" — mensagem que manda procurar no lugar errado. Aqui a falha diz
     * que foi o login, e o texto de erro da própria tela vai junto.
     */
    await expect(
      page,
      "login não completou: ver a mensagem de erro na tela de login",
    ).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // Onboarding abre porque onboarding_completed = false. No passo de
    // boas-vindas o botão de avançar é "Vamos começar"; "Continuar" só nos
    // passos seguintes.
    const comecar = page.getByRole("button", { name: /vamos começar/i });
    await expect(comecar).toBeVisible({ timeout: 25_000 });

    /*
     * Clica IMEDIATAMENTE, sem espera: este clique rápido é o que reproduzia a
     * corrida do efeito de persistência (assíncrono) sobrescrevendo o passo com
     * getResumeStep(...) = 0. Se o passo avançar daqui, a guarda em
     * OnboardingModal está funcionando. Não reintroduzir waitForTimeout aqui —
     * a espera esconde exatamente o defeito que este teste protege.
     */

    // "Configurar depois" só aparece a partir do passo 1 — avança um.
    await comecar.click();
    const pular = page.getByRole("button", { name: /configurar depois/i });
    await expect(pular).toBeVisible({ timeout: 15_000 });

    // Sair por aqui dispara refreshProfile() -> recarrega profile E papel.
    await pular.click();

    /*
     * Espera o modal sumir, não a URL: já estávamos em /dashboard, então
     * toHaveURL(/dashboard/) passaria instantaneamente sem esperar nada — e o
     * navigate("/dashboard") do skip dispararia depois, desfazendo a navegação
     * seguinte. Como setIsOpen(false) e navigate() estão no mesmo bloco
     * síncrono, o diálogo escondido garante que a navegação do skip já ocorreu.
     */
    await expect(page.getByRole("dialog", { name: /configuração inicial/i }))
      .toBeHidden({ timeout: 15_000 });

    // Navegação SPA (clique na sidebar), sem reload.
    await page.getByRole("link", { name: "Automações" }).click();
    await expect(page).toHaveURL(/\/automations/, { timeout: 15_000 });

    // "Nova Automação" é gated por canManage (owner/admin). Se o papel não
    // tivesse chegado ao contexto, o botão não existiria.
    await expect(page.getByRole("button", { name: /nova automação/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
