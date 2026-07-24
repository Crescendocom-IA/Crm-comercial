import { test, expect, type Page } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Contatos depois da migração para React Query. Cobre os três caminhos que a
 * migração podia quebrar em silêncio: a busca (a chave de cache muda a cada
 * tecla), a paginação (idem, e o skeleton não pode voltar a piscar) e a criação
 * (a lista tem que se atualizar por invalidação, sem callback do pai).
 */

const nomeUnico = (prefixo: string) => `${prefixo}${process.env.E2E_RUN_ID || "e2e"}`;

const CONTADOR = /^\d+ contatos$/;

/*
 * O cabeçalho renderiza "0 contatos" antes de a query responder, e ler o
 * contador nesse instante faz o teste comparar contra o número errado.
 *
 * A espera é pela tabela, não pelo sumiço do skeleton: `waitFor({ hidden })`
 * também é satisfeito por um elemento que ainda NÃO montou, então logo após o
 * goto ele retorna na hora e o teste lê zero — foi a causa de duas execuções
 * vermelhas. A tabela, ao contrário, só é renderizada com `loading` falso, e
 * existe mesmo com zero contatos (com o empty state dentro).
 */
async function totalDeContatos(page: Page): Promise<number> {
  await expect(page.getByRole("table")).toBeVisible();
  const contador = page.getByText(CONTADOR);
  await expect(contador).toBeVisible();
  return Number((await contador.textContent())!.match(/\d+/)![0]);
}

test.describe("Contatos", () => {
  test("busca filtra no servidor e limpar restaura a lista", async ({ page }) => {
    requireCreds();
    await page.goto("/contacts");

    const totalAntes = await totalDeContatos(page);
    const contador = page.getByText(CONTADOR);

    const busca = page.getByPlaceholder("Buscar por nome, email...");
    // Termo que não casa com nada: o zero prova que o filtro chegou ao
    // servidor, não que a tela ficou parada.
    await busca.fill("zzzqqqxyz");
    await expect(contador).toHaveText("0 contatos");
    // O empty state de busca vazia é diferente do de base vazia — este não
    // oferece "Adicionar contato", porque o caminho aqui é ajustar o filtro.
    await expect(page.getByText("Nenhum contato encontrado")).toBeVisible();

    await busca.fill("");
    await expect(contador).toHaveText(`${totalAntes} contatos`);
  });

  test("criar contato aparece na lista sem recarregar a página", async ({ page }) => {
    requireCreds();
    await page.goto("/contacts");

    const antes = await totalDeContatos(page);
    const contador = page.getByText(CONTADOR);

    const nome = nomeUnico("QueryTeste");
    await page.getByRole("button", { name: "Criar novo contato" }).click();
    // Os labels do modal não usam htmlFor, então não dá para alcançar o campo
    // pelo texto; dentro do diálogo, o primeiro textbox é o Nome.
    await page.getByRole("dialog").getByRole("textbox").first().fill(nome);
    await page.getByRole("button", { name: "Criar Contato" }).click();

    // Só a invalidação da mutation pode fazer isto subir: a página não chama
    // mais refetch nenhum, e nada aqui recarrega o navegador.
    await expect(contador).toHaveText(`${antes + 1} contatos`);

    // E o registro existe de fato, não só a contagem.
    await page.getByPlaceholder("Buscar por nome, email...").fill(nome);
    await expect(page.getByText(nome, { exact: false }).first()).toBeVisible();
  });

  test("paginação avança sem piscar o skeleton", async ({ page }) => {
    requireCreds();

    /*
     * Semeia a massa que este teste precisa em vez de depender do que já houver
     * na org: create-test-user.ts a deixa vazia de propósito, e um teste que se
     * pula quando não encontra dados reporta verde sem ter testado nada.
     *
     * Marcador no email para o cleanup alcançar só o que este teste criou.
     */
    const marcador = `pag-${Date.now()}`;
    const { client, orgId, userId } = await apiComoUsuario();
    const semeados = Array.from({ length: 60 }, (_, i) => ({
      org_id: orgId, owner_id: userId,
      first_name: "Paginado", last_name: String(i).padStart(2, "0"),
      email: `${marcador}-${i}@exemplo.test`, status: "lead" as const,
    }));
    const { error } = await client.from("contacts").insert(semeados);
    expect(error, "falha ao semear contatos").toBeNull();

    try {
      await page.goto("/contacts");

      // Decidir antes da lista carregar daria sempre "não há paginador".
      const total = await totalDeContatos(page);
      expect(total).toBeGreaterThan(50);

      await verificarPaginacao(page);
    } finally {
      // Roda mesmo se o teste falhar: massa órfã desloca a contagem dos outros
      // testes de contatos na execução seguinte.
      await client.from("contacts").delete().like("email", `${marcador}-%`);
    }
  });
});

/** O miolo do teste de paginação, separado para o cleanup ficar visível. */
async function verificarPaginacao(page: Page) {
  const paginador = page.getByText(/^Página \d+ de \d+/);
  const skeleton = page.getByRole("status", { name: "Carregando dados" });
  await expect(paginador).toContainText("Página 1 de");

  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(paginador).toContainText("Página 2 de");
  // keepPreviousData: as linhas anteriores seguem na tela até as novas
  // chegarem. Sem isso a migração teria trocado a troca de página suave por um
  // flash de skeleton a cada clique.
  await expect(skeleton).toBeHidden();

  await page.getByRole("button", { name: "Página anterior" }).click();
  await expect(paginador).toContainText("Página 1 de");
}
