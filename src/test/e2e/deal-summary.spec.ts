import { test, expect } from "@playwright/test";
import { requireCreds } from "./helpers";

/*
 * Painel de resumo com IA: skeleton -> texto em streaming -> Copiar.
 *
 * E2E_DEAL_ID aponta para um negócio da org das credenciais. Sem ele o teste
 * pula: navegar "no primeiro deal que aparecer" torna a falha ambígua.
 */
const DEAL_ID = process.env.E2E_DEAL_ID || "";

test.describe("Resumo de negócio com IA", () => {
  test("skeleton, streaming e copiar", async ({ page, context }) => {
    requireCreds();
    test.skip(!DEAL_ID, "E2E_DEAL_ID não definido");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/deals/${DEAL_ID}`);

    // Conta nova cai no onboarding, que é modal e engole o clique no botão.
    const pular = page.getByRole("button", { name: "Configurar depois" });
    if (await pular.isVisible().catch(() => false)) {
      await pular.click();
      await expect(pular).toBeHidden();
    }

    await page.getByRole("button", { name: /Resumir com IA/i }).click();

    // 1. Skeleton antes do primeiro token.
    const skeleton = page.getByRole("status", { name: "Gerando resumo" });
    await expect(skeleton).toBeVisible();
    console.log("[resumo] skeleton visível");

    // 2. O texto cresce em amostras sucessivas — é o streaming, não um bloco.
    const corpo = page.locator('[class*="prose"]').last();
    const lengths: number[] = [];
    for (let i = 0; i < 30; i++) {
      lengths.push(((await corpo.textContent().catch(() => "")) || "").length);
      await page.waitForTimeout(400);
      const n = lengths.length;
      if (n >= 4 && lengths[n - 1] > 0 && lengths[n - 4] === lengths[n - 1]) break;
    }
    console.log(`[resumo] comprimentos: ${lengths.join(", ")}`);
    expect(new Set(lengths.filter((l) => l > 0)).size).toBeGreaterThan(1);

    // O skeleton some assim que o texto entra.
    await expect(skeleton).toBeHidden();

    // 3. Copiar: o clipboard tem o texto e o botão confirma.
    const botao = page.getByRole("button", { name: /Copiar/i });
    await expect(botao).toBeEnabled();
    await botao.click();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    console.log(`[resumo] clipboard: ${copiado.length} chars`);
    expect(copiado.length).toBeGreaterThan(100);
    // O clipboard leva o markdown cru; o DOM mostra o texto renderizado, sem os
    // "##". Comparar os dois diretamente falharia — confere as seções.
    expect(copiado).toContain("## Situação atual");
    expect(copiado).toContain("## Próximos passos sugeridos");
    // O toast aparece duas vezes na árvore: o card visível e a cópia do
    // aria-live para leitor de tela. Basta uma delas estar visível.
    await expect(page.getByText("Resumo copiado").last()).toBeVisible();
  });
});
