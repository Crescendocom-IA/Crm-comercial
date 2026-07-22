import { test, expect } from "@playwright/test";
import { requireCreds, login } from "./helpers";

/*
 * Abre o copilot flutuante, manda uma mensagem e verifica que a resposta chega
 * em streaming — o texto cresce ao longo do tempo, em vez de aparecer inteiro
 * num único frame. Amostra o comprimento do texto da resposta em intervalos.
 */
test.describe("AI Copilot", () => {
  test("responde com streaming (texto cresce progressivamente)", async ({ page }) => {
    requireCreds();
    await login(page);
    await page.goto("/dashboard");

    // Abre pelo atalho Ctrl+J. O botão flutuante fica no mesmo canto que o
    // viewport de toasts, que intercepta o clique — o atalho é robusto.
    await page.keyboard.press("Control+j");
    const input = page.getByPlaceholder("Pergunte algo sobre seus dados...");
    await expect(input).toBeVisible();
    await input.fill("Liste em uma frase quantos negócios abertos eu tenho.");
    await input.press("Enter");

    // Amostra o tamanho do texto da última mensagem do assistente a cada 400ms.
    const lengths: number[] = [];
    const assistantMsg = page.locator('[class*="prose"]').last();
    for (let i = 0; i < 20; i++) {
      const txt = (await assistantMsg.textContent().catch(() => "")) || "";
      lengths.push(txt.length);
      await page.waitForTimeout(400);
      if (lengths.length >= 4 && txt.length > 0 && lengths[lengths.length - 4] === txt.length) break;
    }

    const distinct = new Set(lengths.filter((l) => l > 0));
    console.log(`[copilot] amostras de comprimento: ${lengths.join(", ")}`);
    // Streaming = o texto passou por mais de um comprimento intermediário > 0.
    expect(distinct.size).toBeGreaterThan(1);
    expect(Math.max(...lengths)).toBeGreaterThan(0);
  });
});
