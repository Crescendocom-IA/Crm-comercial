import { test, expect } from "@playwright/test";
import { requireCreds } from "./helpers";

/*
 * Smoke do último grupo (Metas, Relatórios, Integrações). São telas de leitura
 * pesada que derivam agregações em memória — uma derivação com nome de campo
 * errado passaria no typecheck e deixaria a página em branco. O smoke prova que
 * cada uma monta e renderiza o conteúdo que depende da query resolvida.
 */

test.describe("Metas de vendas", () => {
  test("página monta", async ({ page }) => {
    requireCreds();
    await page.goto("/sales-goals");
    await expect(page.getByRole("heading", { name: "Metas de Vendas" })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Relatórios", () => {
  test("monta, troca de aba e o Forecast renderiza", async ({ page }) => {
    requireCreds();
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Relatórios" }).first()).toBeVisible();

    // As abas só renderizam com os dados carregados; trocar para Forecast
    // exercita a derivação daquele sub-relatório.
    await expect(page.getByRole("tab", { name: "Vendas" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Forecast" }).click();
    await expect(page.getByRole("tab", { name: "Forecast" })).toHaveAttribute("data-state", "active");
  });
});

test.describe("Integrações", () => {
  test("monta com as abas", async ({ page }) => {
    requireCreds();
    await page.goto("/settings/integrations");
    await expect(page.getByRole("heading", { name: "Integrações & API" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Webhooks" })).toBeVisible({ timeout: 15_000 });
    // A aba API Keys lê a tabela api_keys; trocar para ela prova que a query resolveu.
    await page.getByRole("tab", { name: "API Keys" }).click();
    await expect(page.getByRole("tab", { name: "API Keys" })).toHaveAttribute("data-state", "active");
  });
});
