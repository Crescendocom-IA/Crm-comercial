import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Atividades e Tarefas dividem a tabela activities e a mesma hook. O teste que
 * carrega o sinal é o de Tarefas: criar -> aparecer -> concluir -> mudar de
 * filtro exercita create + toggleComplete + a invalidação que re-deriva a
 * lista. Uma derivação com nome de campo errado passaria no typecheck e cairia
 * aqui. Atividades ganha um smoke de carga — a página monta e a query resolve.
 */

test.describe("Tarefas", () => {
  test("criar tarefa, concluir e ela migra para o filtro Concluídas", async ({ page }) => {
    requireCreds();
    const titulo = `Tarefa E2E ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await page.goto("/tasks");
      // O botão "Tarefa" do header só existe com a página montada.
      const novo = page.getByRole("button", { name: "Tarefa", exact: true });
      await expect(novo).toBeVisible();
      await novo.click();

      const dialog = page.getByRole("dialog");
      // O placeholder do título é único; se o diálogo não tivesse aberto, o
      // fill falharia. (Evito casar "Nova tarefa" por texto — a descrição
      // "...criar uma nova tarefa" também casaria.)
      await dialog.getByPlaceholder("Ex: Enviar proposta").fill(titulo);
      await dialog.getByRole("button", { name: "Criar" }).click();
      await expect(dialog).toBeHidden();

      // Filtro padrão "Para fazer" lista as pendentes: só a invalidação da
      // mutation traz a nova para cá, sem refetch manual.
      const linha = page.getByRole("row").filter({ hasText: titulo });
      await expect(linha).toBeVisible();

      // Concluir: o checkbox da linha. A tarefa sai de "Para fazer".
      await linha.getByRole("checkbox").click();
      await expect(page.getByRole("row").filter({ hasText: titulo })).toBeHidden();

      // E aparece em "Concluídas" — prova que o toggle persistiu e a lista
      // re-derivou do cache atualizado.
      await page.getByRole("button", { name: "Concluídas" }).click();
      await expect(page.getByRole("row").filter({ hasText: titulo })).toBeVisible();
    } finally {
      await client.from("activities").delete().eq("title", titulo);
    }
  });
});

test.describe("Atividades", () => {
  test("página monta e a lista carrega", async ({ page }) => {
    requireCreds();
    await page.goto("/activities");
    await expect(page.getByRole("heading", { name: "Atividades" })).toBeVisible();
    // A busca só renderiza depois da query montar a tela; prova que não quebrou
    // na derivação (um erro de campo deixaria a página em branco).
    await expect(page.getByPlaceholder("Buscar...")).toBeVisible({ timeout: 15_000 });
  });
});
