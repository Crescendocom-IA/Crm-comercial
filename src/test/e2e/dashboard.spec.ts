import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Smoke do dashboard depois da migração para React Query. Não valida os
 * números — valida que a página carrega, que os KPIs derivados aparecem com um
 * valor de verdade, que os gráficos renderizam e que trocar o período não
 * quebra nada. Uma derivação com nome de campo errado passaria no typecheck e
 * cairia aqui.
 */
test.describe("Dashboard", () => {
  test("carrega KPIs, gráficos e responde ao filtro de período", async ({ page }) => {
    requireCreds();

    /*
     * Semeia um negócio ganho no mês corrente para o KPI de Receita ter um
     * valor não-zero — assim o teste distingue "renderizou o número" de
     * "renderizou o placeholder de conta vazia". Marcador no título para o
     * cleanup pegar só o que criou.
     */
    const marcador = `dash-${Date.now()}`;
    // Valor distinto e improvável de colidir com outro dado da org, para poder
    // afirmar que ESTE negócio entrou na Receita — não um qualquer.
    const VALOR = 987654;
    const { client, orgId } = await apiComoUsuario();
    const { error } = await client.from("deals").insert({
      org_id: orgId, title: marcador, value: VALOR, status: "won", currency: "BRL",
    });
    expect(error, "falha ao semear negócio ganho").toBeNull();

    try {
      await page.goto("/dashboard");

      // O título prova que a rota montou; o "Atualizado HH:MM" vem do
      // dataUpdatedAt da query, então só aparece com dados carregados.
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      await expect(page.getByText(/^Atualizado \d{2}:\d{2}$/)).toBeVisible({ timeout: 15_000 });

      // KPI de Receita: o valor semeado tem que aparecer formatado em BRL. Uma
      // derivação com nome de campo errado renderizaria "R$ 0" e isto falharia.
      // Intl usa espaço não-quebrável como separador de milhar ( ).
      const valorBRL = new Intl.NumberFormat("pt-BR", {
        style: "currency", currency: "BRL", maximumFractionDigits: 0,
      }).format(VALOR);
      await expect(page.getByText(valorBRL).first()).toBeVisible({ timeout: 15_000 });

      // Gráficos: o Recharts monta um <svg class="recharts-surface"> por gráfico.
      // Mais de um prova que a grade de gráficos renderizou, não só os KPIs.
      await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 15_000 });
      expect(await page.locator("svg.recharts-surface").count()).toBeGreaterThan(1);

      // Trocar o período reexecuta todas as derivações. Não deve derrubar a
      // página — o título e os gráficos seguem lá.
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "Este ano" }).click();
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
      await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
    } finally {
      await client.from("deals").delete().eq("title", marcador);
    }
  });
});
