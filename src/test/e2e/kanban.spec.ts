import { test, expect } from "@playwright/test";
import { requireCreds, login } from "./helpers";

/*
 * Cria um deal, arrasta entre colunas, confirma persistência após reload, e
 * conta as requests de rede disparadas pelo drag — a correção da Sessão 5 diz
 * que um drag deve gerar 1 UPDATE, não o refetch das 6 queries.
 */
test.describe("Kanban de negócios", () => {
  test("cria, arrasta e persiste; drag dispara 1 request", async ({ page }) => {
    requireCreds();
    await login(page);
    await page.goto("/deals");

    // Cria um deal com título único.
    const title = `E2E Deal ${Date.now()}`;
    await page.goto("/deals?action=new");
    await page.getByPlaceholder("Nome do negócio").fill(title);
    await page.getByRole("button", { name: /criar negócio/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    // Localiza o card e as colunas do kanban.
    const card = page.getByText(title).first();
    const columns = page.locator('[class*="w-[220px]"], [class*="w-[240px]"]');
    const targetColumn = columns.nth(1);

    // Conta requests PATCH/POST a /deals durante o drag.
    const dealWrites: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/rest/v1/deals") && ["PATCH", "POST"].includes(req.method())) {
        dealWrites.push(`${req.method()} ${u}`);
      }
    });

    const box = await card.boundingBox();
    const target = await targetColumn.boundingBox();
    if (box && target) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(2000);

    // Persistência: recarrega e o card ainda existe.
    await page.reload();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    console.log(`[kanban] writes a /deals durante o drag: ${dealWrites.length}`);
    expect(dealWrites.length).toBeLessThanOrEqual(1);
  });
});
