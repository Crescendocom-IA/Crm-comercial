import { test, expect } from "@playwright/test";
import { requireCreds, login } from "./helpers";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/*
 * Importa um CSV com vírgulas DENTRO de campos entre aspas — o caso que um split
 * ingênuo por vírgula quebra. Confirma que os contatos entram com os campos
 * inteiros. O parser é papaparse (não split manual), então o esperado é passar.
 *
 * O fluxo do modal é upload -> mapping -> preview -> importar. O mapeamento de
 * coluna é manual (selects), então o teste mapeia nome/sobrenome/empresa à mão.
 */
test.describe("Import de CSV", () => {
  test("campos com vírgula entre aspas entram inteiros", async ({ page }) => {
    requireCreds();
    await login(page);

    // CSV com vírgula dentro de aspas na coluna empresa.
    const marker = Date.now();
    const csv =
      "first_name,last_name,company\n" +
      `Ana${marker},Souza,"Souza, Lima e Cia"\n` +
      `Bruno${marker},Costa,"Costa, Reis Ltda"\n`;
    const dir = mkdtempSync(join(tmpdir(), "e2e-csv-"));
    const csvPath = join(dir, "contatos.csv");
    writeFileSync(csvPath, csv, "utf8");

    await page.goto("/contacts?action=import");

    // Upload via input escondido.
    await page.setInputFiles('input[type="file"]', csvPath);

    // Mapeia as três colunas (a UI de mapping aparece após o parse).
    await expect(page.getByText(/mapeie as colunas/i)).toBeVisible({ timeout: 10_000 });
    const selects = page.locator('[role="combobox"]');
    const labels = ["Nome", "Sobrenome", "Empresa"];
    for (let i = 0; i < 3; i++) {
      await selects.nth(i).click();
      await page.getByRole("option", { name: labels[i], exact: true }).click();
    }
    await page.getByRole("button", { name: /^preview$/i }).click();

    // No preview, a célula da empresa deve conter a vírgula inteira.
    await expect(page.getByText("Souza, Lima e Cia")).toBeVisible({ timeout: 10_000 });

    // Confirma a importação.
    await page.getByRole("button", { name: /importar/i }).click();
    await page.waitForTimeout(2500);

    // Verifica na listagem: busca pelo contato e confirma que existe.
    await page.goto("/contacts");
    await page.getByPlaceholder(/buscar/i).first().fill(`Ana${marker}`);
    await expect(page.getByText(`Ana${marker}`).first()).toBeVisible({ timeout: 10_000 });
  });
});
