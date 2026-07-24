import { test, expect } from "@playwright/test";
import { requireCreds } from "./helpers";

/*
 * Cria automação deal.won -> criar tarefa, marca um deal como ganho pela ação em
 * lote (que dispara fireAutomations("deal.won")) e confirma que a tarefa aparece
 * em /tasks. Exercita fireAutomations -> process-automation -> create_task.
 *
 * Requer papel owner/admin: a Sessão 11 esconde "Nova Automação" de members.
 */
test.describe("Automação deal.won", () => {
  test("deal ganho cria tarefa via automação", async ({ page }) => {
    requireCreds();

    const taskTitle = `Tarefa auto ${Date.now()}`;

    // 1. Cria a automação.
    await page.goto("/automations");
    await page.getByRole("button", { name: /nova automação/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Nome é obrigatório (senão o botão de salvar fica desabilitado).
    const autoName = `Auto E2E ${Date.now()}`;
    await dialog.getByRole("textbox").first().fill(autoName);

    // Trigger: Negócio ganho (primeiro combobox do dialog).
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /negócio ganho/i }).click();

    // Ação: Criar tarefa.
    await dialog.getByRole("button", { name: /^ação$/i }).click();
    await page.getByRole("menuitem", { name: /criar tarefa/i }).click();
    await dialog.getByPlaceholder("Título da tarefa").fill(taskTitle);

    // Salvar (agora habilitado).
    await dialog.getByRole("button", { name: /criar automação/i }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    /*
     * Automação nasce INATIVA — fireAutomations só dispara as ativas. O toggle
     * refaz o fetch e reordena a lista, então miro o switch DENTRO do card com
     * o nome único desta automação, não o "primeiro" (que vira outro após o
     * refetch — runs anteriores deixam automações acumuladas).
     */
    const card = page.locator(".group").filter({ hasText: autoName });
    const toggle = card.getByRole("switch");
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();

    // 2. Cria um deal e o marca como ganho pela lista (batch dispara a automação).
    const dealTitle = `Deal ganhar ${Date.now()}`;
    await page.goto("/deals?action=new");
    await page.getByPlaceholder("Nome do negócio").fill(dealTitle);
    await page.getByRole("button", { name: /criar negócio/i }).click();
    await expect(page.getByText(dealTitle)).toBeVisible({ timeout: 15_000 });

    // Vai para a visualização em lista e seleciona o deal.
    await page.getByRole("button", { name: "Visualização Lista" }).click();
    const row = page.getByRole("row", { name: new RegExp(dealTitle) });
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: /ganhos/i }).click();
    await page.waitForTimeout(3000); // fireAutomations -> process-automation

    // 3. A tarefa criada pela automação aparece em /tasks.
    // ACHADO REAL: process-automation cria a tarefa com user_id null
    // (sem responsável), e /tasks abre no filtro "Minhas" (ownerFilter="mine"),
    // que esconde tarefas não atribuídas. Só aparece no filtro "Equipe" (all).
    await page.goto("/tasks");
    await page.getByRole("button", { name: /equipe/i }).click();
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 15_000 });
  });
});
