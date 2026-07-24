import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Smoke das três telas de email depois da migração para React Query. Templates
 * e Sequences exercitam criar -> aparecer (create + invalidação). Inbox é um
 * smoke de carga — a página monta e a query resolve. Uma derivação com nome de
 * campo errado passaria no typecheck e cairia aqui.
 */

test.describe("Templates de email", () => {
  test("criar template aparece na lista", async ({ page }) => {
    requireCreds();
    const nome = `Template E2E ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await page.goto("/email-templates");
      await expect(page.getByRole("heading", { name: "Templates de Email" })).toBeVisible();

      await page.getByRole("button", { name: "Novo Template" }).click();
      const dialog = page.getByRole("dialog");
      // Ordem dos campos no diálogo: nome, categoria, assunto, corpo. Salvar
      // exige nome + assunto.
      const campos = dialog.getByRole("textbox");
      await campos.nth(0).fill(nome);
      await campos.nth(2).fill("Assunto de teste");
      await dialog.getByRole("button", { name: "Salvar" }).click();
      await expect(dialog).toBeHidden();

      // Só a invalidação da mutation traz o novo para a lista, sem refetch manual.
      await expect(page.getByText(nome)).toBeVisible();
    } finally {
      await client.from("email_templates").delete().eq("name", nome);
    }
  });
});

test.describe("Sequências de email", () => {
  test("criar sequência aparece na lista", async ({ page }) => {
    requireCreds();
    const nome = `Sequência E2E ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await page.goto("/email-sequences");
      await expect(page.getByRole("heading", { name: "Sequências de Email" })).toBeVisible();

      await page.getByRole("button", { name: "Nova Sequência" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox").first().fill(nome);
      await dialog.getByRole("button", { name: "Criar" }).click();
      await expect(dialog).toBeHidden();

      await expect(page.getByText(nome)).toBeVisible();
    } finally {
      await client.from("email_sequences").delete().eq("name", nome);
    }
  });
});

test.describe("Caixa de entrada", () => {
  test("página monta com as abas", async ({ page }) => {
    requireCreds();
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Email" })).toBeVisible();
    // As abas só renderizam com a tela montada; provam que a query resolveu.
    await expect(page.getByRole("tab", { name: /Caixa de Entrada/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tab", { name: /Enviados/i })).toBeVisible();
  });
});
