import { test, expect } from "@playwright/test";
import { resetarOnboarding, STORAGE } from "./helpers";

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

// Entra já logado como a conta de onboarding (sessão gravada pelo global-setup).
test.use({ storageState: STORAGE.onboarding });

test.describe("Papel após onboarding", () => {
  test("ações de owner aparecem sem reload", async ({ page }) => {
    /*
     * A sessão vem do storageState, mas o ESTADO do onboarding é do banco: o
     * próprio teste o completa ao pular, então sem devolver onboarding_completed
     * a false ele só passaria na primeira execução. O reset roda antes do goto,
     * então quando o AuthContext carregar o perfil o modal já deve aparecer.
     */
    await resetarOnboarding();
    await page.goto("/dashboard");

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

    // Espera o modal sumir antes de navegar.
    await expect(page.getByRole("dialog", { name: /configuração inicial/i }))
      .toBeHidden({ timeout: 15_000 });

    /*
     * ATENÇÃO — o modal sumir NÃO garante que a navegação do skip já ocorreu.
     *
     * handleSkipOnboarding faz `await refreshProfile()` e SÓ ENTÃO navega para
     * /dashboard. Mas o modal pode fechar antes disso, pelo efeito reativo que
     * observa profile.onboarding_completed (agora true) — um caminho diferente
     * da linha de navegação do handler. Resultado: o navigate("/dashboard")
     * atrasado do skip dispara num momento sem cota superior (depende da latência
     * do refreshProfile) e pode desfazer a navegação abaixo — inclusive DEPOIS
     * dela colar. Não afeta um usuário real (que ia para /dashboard mesmo), só um
     * teste que navega para outro lugar no mesmo instante.
     *
     * Por isso navegação E asserção vão juntas num toPass: o laço só sai quando
     * estamos em /automations E o botão está visível AO MESMO TEMPO. Se um bounce
     * atrasado nos jogar de volta para /dashboard, a iteração renavega. Isto não
     * afrouxa o que o teste protege: se o papel de owner NÃO chegasse ao contexto,
     * o botão nunca apareceria em /automations e o toPass estouraria — a
     * regressão continua pega.
     */
    const novaAutomacao = page.getByRole("button", { name: /nova automação/i });
    await expect(async () => {
      if (!/\/automations/.test(page.url())) {
        await page.getByRole("link", { name: "Automações" }).click();
      }
      await expect(page).toHaveURL(/\/automations/, { timeout: 3_000 });
      await expect(novaAutomacao).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
  });
});
