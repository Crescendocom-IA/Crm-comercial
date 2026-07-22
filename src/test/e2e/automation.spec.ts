import { test, expect } from "@playwright/test";
import { requireCreds, login } from "./helpers";

/*
 * Cria automação deal.won -> criar tarefa, marca um deal como ganho e confirma
 * que a tarefa aparece em /tasks. Exercita a cadeia fireAutomations ->
 * process-automation -> create_task de ponta a ponta.
 *
 * NOTA: process-automation é disparado client-side por fireAutomations; o teste
 * dá margem de tempo, mas se a automação não rodar, o que falha é o motor real,
 * não o teste.
 */
test.describe("Automação deal.won", () => {
  test("deal ganho cria tarefa via automação", async ({ page }) => {
    requireCreds();
    await login(page);

    const taskTitle = `Tarefa auto ${Date.now()}`;

    // 1. Cria a automação: trigger deal.won, action create_task.
    await page.goto("/automations");
    await page.getByRole("button", { name: /nova automação/i }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /negócio ganho/i }).click();
    await page.getByRole("button", { name: /^ação$/i }).click();
    await page.getByRole("menuitem", { name: /criar tarefa/i }).click();
    // Título da tarefa no config da action.
    const taskInput = page.getByPlaceholder(/título da tarefa|title/i).first();
    if (await taskInput.isVisible().catch(() => false)) {
      await taskInput.fill(taskTitle);
    }
    await page.getByRole("button", { name: /salvar|criar automação/i }).first().click();
    await page.waitForTimeout(1500);

    // 2. Marca um deal como ganho (list view tem ação em lote).
    await page.goto("/deals");
    // Cria um deal fresco para ganhar.
    const dealTitle = `Deal ganhar ${Date.now()}`;
    await page.goto("/deals?action=new");
    await page.getByPlaceholder("Nome do negócio").fill(dealTitle);
    await page.getByRole("button", { name: /criar negócio/i }).click();
    await expect(page.getByText(dealTitle)).toBeVisible({ timeout: 15_000 });

    // Abre o deal e marca como ganho (o caminho exato de UI pode variar).
    await page.getByText(dealTitle).first().click();
    const wonBtn = page.getByRole("button", { name: /ganho|marcar como ganho/i }).first();
    await wonBtn.click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(2500);

    // 3. A tarefa aparece em /tasks.
    await page.goto("/tasks");
    await page.reload();
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 15_000 });
  });
});
