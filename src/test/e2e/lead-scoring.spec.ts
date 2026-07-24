import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Smoke do lead scoring depois da migração para React Query: criar uma regra
 * pelo builder e confirmar que ela aparece na lista — exercita save + a
 * invalidação que traz a nova regra, sem refetch manual.
 */
test.describe("Lead scoring", () => {
  test("criar regra aparece na lista", async ({ page }) => {
    requireCreds();
    const label = `RegraE2E ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await page.goto("/lead-scoring");
      await expect(page.getByRole("heading", { name: "Lead Scoring & Segmentação" })).toBeVisible();

      await page.getByRole("button", { name: "Nova Regra" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByPlaceholder("Ex: Download de material").fill(label);
      await dialog.getByRole("button", { name: "Criar Regra" }).click();
      await expect(dialog).toBeHidden();

      await expect(page.getByText(label)).toBeVisible();
    } finally {
      await client.from("lead_scoring_rules").delete().eq("label", label);
    }
  });
});
