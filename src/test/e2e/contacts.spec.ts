import { test, expect, type Page } from "@playwright/test";
import { requireCreds, login } from "./helpers";

/*
 * Contatos depois da migração para React Query. Cobre os três caminhos que a
 * migração podia quebrar em silêncio: a busca (a chave de cache muda a cada
 * tecla), a paginação (idem, e o skeleton não pode voltar a piscar) e a criação
 * (a lista tem que se atualizar por invalidação, sem callback do pai).
 */

const nomeUnico = (prefixo: string) => `${prefixo}${process.env.E2E_RUN_ID || "e2e"}`;

const CONTADOR = /^\d+ contatos$/;

/*
 * O cabeçalho renderiza "0 contatos" antes de a query responder. Ler o contador
 * nesse instante devolve zero e o teste passa a comparar contra o número errado
 * — foi exatamente o que aconteceu na primeira execução. Espera o skeleton sair
 * antes de ler.
 */
async function totalDeContatos(page: Page): Promise<number> {
  await page.getByRole("status", { name: "Carregando dados" }).waitFor({ state: "hidden" });
  const contador = page.getByText(CONTADOR);
  await expect(contador).toBeVisible();
  return Number((await contador.textContent())!.match(/\d+/)![0]);
}

test.describe("Contatos", () => {
  test("busca filtra no servidor e limpar restaura a lista", async ({ page }) => {
    requireCreds();
    await login(page);
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
    await login(page);
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
    await login(page);
    await page.goto("/contacts");

    // Decidir antes da lista carregar daria sempre "não há paginador" e o teste
    // se pularia sozinho, reportando verde sem ter testado nada.
    const total = await totalDeContatos(page);
    test.skip(total <= 50, `org tem ${total} contatos, menos de uma página`);

    const paginador = page.getByText(/^Página \d+ de \d+/);
    const skeleton = page.getByRole("status", { name: "Carregando dados" });
    await expect(paginador).toContainText("Página 1 de");

    await page.getByRole("button", { name: "Próxima página" }).click();
    await expect(paginador).toContainText("Página 2 de");
    // keepPreviousData: as linhas anteriores seguem na tela até as novas
    // chegarem. Sem isso a migração teria trocado a troca de página suave por
    // um flash de skeleton a cada clique.
    await expect(skeleton).toBeHidden();

    await page.getByRole("button", { name: "Página anterior" }).click();
    await expect(paginador).toContainText("Página 1 de");
  });
});
