import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";
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

    /*
     * A vírgula entre aspas vai no CARGO — contatos não têm campo "empresa" no
     * mapeamento (empresa é entidade separada). "Diretor, Vendas" é o caso que
     * um split ingênuo por vírgula quebraria em duas colunas.
     */
    const marker = Date.now();
    const csv =
      "first_name,last_name,title\n" +
      `Ana${marker},Souza,"Diretor, Vendas ${marker}"\n` +
      `Bruno${marker},Costa,"Gerente, Contas ${marker}"\n`;
    const dir = mkdtempSync(join(tmpdir(), "e2e-csv-"));
    const csvPath = join(dir, "contatos.csv");
    writeFileSync(csvPath, csv, "utf8");

    await page.goto("/contacts?action=import");

    // Upload via input escondido.
    await page.setInputFiles('input[type="file"]', csvPath);

    // Mapeia as três colunas (a UI de mapping aparece após o parse).
    await expect(page.getByText(/mapeie as colunas/i)).toBeVisible({ timeout: 10_000 });
    const selects = page.locator('[role="combobox"]');
    const labels = ["Nome", "Sobrenome", "Cargo"];
    for (let i = 0; i < 3; i++) {
      await selects.nth(i).click();
      await page.getByRole("option", { name: labels[i], exact: true }).click();
    }
    await page.getByRole("button", { name: /^preview$/i }).click();

    // No preview, o cargo deve conter a vírgula inteira, não quebrado em duas células.
    await expect(page.getByText(`Diretor, Vendas ${marker}`)).toBeVisible({ timeout: 10_000 });

    // Confirma a importação.
    await page.getByRole("button", { name: /importar/i }).click();
    await page.waitForTimeout(2500);

    // Verifica na listagem: busca pelo contato e confirma que existe.
    await page.goto("/contacts");
    await page.getByPlaceholder(/buscar/i).first().fill(`Ana${marker}`);
    await expect(page.getByText(`Ana${marker}`).first()).toBeVisible({ timeout: 10_000 });
  });

  /*
   * Reimportar o MESMO arquivo não pode duplicar: a dedupe casa por email e faz
   * update em vez de insert. Importa duas vezes o mesmo contato e confirma, via
   * API, que existe exatamente 1 linha com aquele email.
   */
  test("reimportar o mesmo arquivo não duplica (casa por email)", async ({ page }) => {
    requireCreds();

    const marker = Date.now();
    const email = `reimport${marker}@e2e.test`;
    const csv = "first_name,email\n" + `Reimp${marker},${email}\n`;
    const dir = mkdtempSync(join(tmpdir(), "e2e-csv-re-"));
    const csvPath = join(dir, "reimport.csv");
    writeFileSync(csvPath, csv, "utf8");

    const importarUmaVez = async () => {
      await page.goto("/contacts?action=import");
      await page.setInputFiles('input[type="file"]', csvPath);
      // Auto-map já reconhece os cabeçalhos first_name e email — segue ao preview.
      await expect(page.getByText(/mapeie as colunas/i)).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: /^preview$/i }).click();
      await page.getByRole("button", { name: /importar/i }).click();
      // O modal fecha ao concluir; é o sinal estável de fim (o toast some rápido).
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    };

    await importarUmaVez(); // 1ª: insere
    await importarUmaVez(); // 2ª: atualiza, não duplica

    const { client, orgId } = await apiComoUsuario();
    try {
      const { data, error } = await client
        .from("contacts").select("id").eq("org_id", orgId).eq("email", email);
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
    } finally {
      await client.from("contacts").delete().eq("org_id", orgId).eq("email", email);
    }
  });
});
