import { test, expect } from "@playwright/test";
import { requireCreds } from "./helpers";

/*
 * Cria um deal, arrasta entre colunas, confirma persistência após reload, e
 * conta as requests de rede disparadas pelo drag — a correção da Sessão 5 diz
 * que um drag deve gerar 1 UPDATE, não o refetch das 6 queries.
 */
test.describe("Kanban de negócios", () => {
  test("cria, arrasta e persiste; drag dispara 1 request", async ({ page }) => {
    requireCreds();
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

    /*
     * Conta separadamente as escritas e as LEITURAS de /deals durante o drag.
     *
     * Contar só PATCH/POST deixava passar a regressão que mais importa aqui: um
     * refetch é GET, então a migração para React Query poderia ter reintroduzido
     * o recarregamento completo do pipeline a cada arrasto sem este teste
     * piscar. O contrato da Sessão 5 é 1 escrita e ZERO leituras.
     */
    const dealWrites: string[] = [];
    const dealReads: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (!u.includes("/rest/v1/deals")) return;
      if (["PATCH", "POST"].includes(req.method())) dealWrites.push(`${req.method()} ${u}`);
      else if (req.method() === "GET") dealReads.push(u);
    });

    // Só a partir daqui as contagens valem: a carga inicial da página já
    // terminou e qualquer GET que apareça é consequência do arrasto.
    dealWrites.length = 0;
    dealReads.length = 0;

    const box = await card.boundingBox();
    const target = await targetColumn.boundingBox();
    if (box && target) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + 80, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(2000);

    /*
     * Fecha a janela de medição AQUI, antes do reload: a recarga faz sua própria
     * leitura de /deals, e contá-la reprovaria o teste por um GET que não tem
     * nada a ver com o arrasto.
     */
    const writesNoDrag = dealWrites.length;
    const readsNoDrag = [...dealReads];

    // Persistência: recarrega e o card ainda existe.
    await page.reload();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    console.log(`[kanban] durante o drag — writes: ${writesNoDrag}, reads: ${readsNoDrag.length}`);
    expect(writesNoDrag).toBeLessThanOrEqual(1);
    expect(readsNoDrag, `refetch de /deals no drag: ${readsNoDrag.join(", ")}`).toHaveLength(0);
  });
});
