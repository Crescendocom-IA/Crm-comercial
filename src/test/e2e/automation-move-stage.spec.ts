import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Regressão do bug pré-existente: move_deal_stage casava o estágio por nome
 * (ilike), então renomear o estágio quebrava a automação. Agora casa por
 * stage_id — este teste configura a automação apontando para um estágio,
 * RENOMEIA o estágio e confirma que o deal ainda cai nele quando a automação
 * dispara.
 *
 * Exercita builder (grava stage_id) -> fireAutomations("deal.won") ->
 * process-automation -> move_deal_stage por id.
 *
 * Requer papel owner/admin (a Sessão 11 esconde "Nova Automação" de members).
 */
test.describe("Automação move_deal_stage por id", () => {
  test("continua funcionando após renomear o estágio alvo", async ({ page }) => {
    requireCreds();

    const marker = Date.now();
    const { client, orgId } = await apiComoUsuario();

    // Estágio alvo: o último do pipeline (deals nascem no primeiro, então mover
    // para o último é uma mudança observável).
    const { data: stages } = await client
      .from("pipeline_stages").select("id,name,order")
      .eq("org_id", orgId).order("order", { ascending: true });
    expect(stages?.length ?? 0).toBeGreaterThan(1);
    const target = stages![stages!.length - 1];
    const origName = target.name as string;
    const renamed = `Renomeado ${marker}`;

    const autoName = `MoveStage E2E ${marker}`;
    const dealTitle = `Deal move ${marker}`;
    let dealId: string | null = null;

    try {
      // 1. Cria a automação: Negócio ganho -> Mover para o estágio alvo (por nome
      //    atual; o builder grava o stage_id por baixo).
      await page.goto("/automations");
      await page.getByRole("button", { name: /nova automação/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("textbox").first().fill(autoName);

      await dialog.getByRole("combobox").first().click();
      await page.getByRole("option", { name: /negócio ganho/i }).click();

      await dialog.getByRole("button", { name: /^ação$/i }).click();
      await page.getByRole("menuitem", { name: /mover negócio de estágio/i }).click();
      // O select do estágio é o último combobox do dialog (deal.won não tem
      // config de trigger, então só há o do trigger e o da ação).
      await dialog.getByRole("combobox").last().click();
      await page.getByRole("option", { name: origName, exact: true }).click();

      await dialog.getByRole("button", { name: /criar automação/i }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });

      // Garante ativa (mira o switch DENTRO do card desta automação).
      const card = page.locator(".group").filter({ hasText: autoName });
      const toggle = card.getByRole("switch");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      if (!(await toggle.isChecked())) await toggle.click();
      await expect(toggle).toBeChecked();

      // 2. Renomeia o estágio DEPOIS de configurada a automação — o caso que o
      //    casamento por nome quebrava.
      await client.from("pipeline_stages").update({ name: renamed }).eq("id", target.id);

      // 3. Cria um deal e o marca como ganho pela lista (dispara a automação).
      await page.goto("/deals?action=new");
      await page.getByPlaceholder("Nome do negócio").fill(dealTitle);
      await page.getByRole("button", { name: /criar negócio/i }).click();
      await expect(page.getByText(dealTitle)).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Visualização Lista" }).click();
      const row = page.getByRole("row", { name: new RegExp(dealTitle) });
      await row.getByRole("checkbox").check();
      await page.getByRole("button", { name: /ganhos/i }).click();
      await page.waitForTimeout(3000); // fireAutomations -> process-automation

      // 4. O deal foi para o estágio alvo (por id), apesar do rename.
      const { data: deal } = await client
        .from("deals").select("id,stage_id")
        .eq("org_id", orgId).eq("title", dealTitle).maybeSingle();
      dealId = deal?.id ?? null;
      expect(deal?.stage_id).toBe(target.id);
    } finally {
      // Restaura o nome do estágio e limpa o deal de teste.
      await client.from("pipeline_stages").update({ name: origName }).eq("id", target.id);
      if (dealId) await client.from("deals").delete().eq("id", dealId);
    }
  });
});
