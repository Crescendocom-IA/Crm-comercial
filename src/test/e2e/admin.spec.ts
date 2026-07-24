import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Smoke da administração depois da migração para React Query. Cobre uma escrita
 * de org (indústrias, reversível pela própria UI), uma escrita de pipeline
 * (create + invalidação, com limpeza via API) e a leitura do log de auditoria.
 * As abas de Settings são gated por canManage — a conta E2E é owner.
 */

test.describe("Configurações", () => {
  test("adicionar e remover indústria na aba Geral", async ({ page }) => {
    requireCreds();
    const marcador = `IndústriaE2E${Date.now()}`;

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();

    // Escreve em organizations.settings.industries e reverte pela UI — não deixa
    // resíduo na org compartilhada.
    await page.getByPlaceholder("Nova indústria").fill(marcador);
    await page.getByPlaceholder("Nova indústria").press("Enter");

    const badge = page.getByText(marcador, { exact: true });
    await expect(badge).toBeVisible();

    // O X de remover é um <button> filho do próprio badge.
    await badge.getByRole("button").click();
    await expect(page.getByText(marcador, { exact: true })).toBeHidden();
  });

  test("criar pipeline aparece no seletor", async ({ page }) => {
    requireCreds();
    const nome = `PipelineE2E ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await page.goto("/settings?tab=pipelines");
      await expect(page.getByPlaceholder("Nome do pipeline")).toBeVisible({ timeout: 15_000 });

      await page.getByPlaceholder("Nome do pipeline").fill(nome);
      await page.getByRole("button", { name: "Criar" }).click();

      // O pipeline criado vira o selecionado; seu nome aparece no seletor. Só a
      // invalidação da mutation faz a lista de pipelines incluir o novo.
      await expect(page.getByText(nome)).toBeVisible();
    } finally {
      await client.from("pipelines").delete().eq("name", nome);
    }
  });
});

test.describe("Segurança", () => {
  test("log de auditoria carrega", async ({ page }) => {
    requireCreds();
    await page.goto("/settings/security");
    await expect(page.getByRole("heading", { name: "Segurança" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Audit Log" })).toBeVisible({ timeout: 15_000 });
    // O filtro de ação só renderiza com a aba montada; prova que a query resolveu.
    await expect(page.getByPlaceholder("Buscar...")).toBeVisible();
  });
});
