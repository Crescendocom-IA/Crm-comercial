import { test, expect, type Page } from "@playwright/test";
import { requireCreds, login, apiComoUsuario } from "./helpers";

/*
 * Empresas depois da migração para React Query. A tela não tinha nenhuma
 * cobertura E2E antes — o que mais pesa aqui é o último teste, que exercita a
 * desatualização do drawer que a migração corrige.
 */

const CONTADOR = /^\d+ empresas$/;

/*
 * Espera a tabela, não o sumiço do skeleton: `waitFor({ hidden })` também é
 * satisfeito por um elemento que ainda NÃO montou, e logo após o goto retorna
 * na hora — o teste leria "0 empresas". A tabela só renderiza com `loading`
 * falso e existe mesmo com zero linhas.
 */
async function totalDeEmpresas(page: Page): Promise<number> {
  await expect(page.getByRole("table")).toBeVisible();
  const contador = page.getByText(CONTADOR);
  await expect(contador).toBeVisible();
  return Number((await contador.textContent())!.match(/\d+/)![0]);
}

test.describe("Empresas", () => {
  test("busca filtra no servidor e mostra o empty state certo", async ({ page }) => {
    requireCreds();
    await login(page);
    await page.goto("/companies");

    const total = await totalDeEmpresas(page);
    const contador = page.getByText(CONTADOR);

    await page.getByPlaceholder("Buscar empresas...").fill("zzzqqqxyz");
    await expect(contador).toHaveText("0 empresas");
    // Busca sem resultado não é base vazia: este empty state não oferece
    // "Adicionar empresa", porque o caminho aqui é ajustar o filtro.
    await expect(page.getByText("Nenhuma empresa encontrada")).toBeVisible();

    await page.getByPlaceholder("Buscar empresas...").fill("");
    await expect(contador).toHaveText(`${total} empresas`);
  });

  test("criar empresa aparece na lista sem recarregar a página", async ({ page }) => {
    requireCreds();
    const nome = `Empresa Query ${Date.now()}`;
    const { client } = await apiComoUsuario();

    try {
      await login(page);
      await page.goto("/companies");

      const antes = await totalDeEmpresas(page);
      const contador = page.getByText(CONTADOR);

      await page.getByRole("button", { name: "Criar nova empresa" }).click();
      // Os labels do modal não usam htmlFor; dentro do diálogo o primeiro
      // textbox é o Nome.
      await page.getByRole("dialog").getByRole("textbox").first().fill(nome);
      await page.getByRole("button", { name: "Criar Empresa" }).click();

      // Só a invalidação da mutation pode fazer isto subir: a página não chama
      // mais refetch nenhum.
      await expect(contador).toHaveText(`${antes + 1} empresas`);
    } finally {
      await client.from("companies").delete().eq("name", nome);
    }
  });

  test("editar no drawer atualiza o cabeçalho sem fechar e reabrir", async ({ page }) => {
    requireCreds();
    const nome = `Empresa Edit ${Date.now()}`;
    const renomeada = `${nome} RENOMEADA`;
    const { client, orgId } = await apiComoUsuario();

    const { error } = await client.from("companies").insert({ org_id: orgId, name: nome });
    expect(error, "falha ao semear empresa").toBeNull();

    try {
      await login(page);
      await page.goto("/companies");
      await totalDeEmpresas(page);

      // Busca para garantir que a empresa semeada está na página visível,
      // independente de quantas outras existam.
      await page.getByPlaceholder("Buscar empresas...").fill(nome);
      await page.getByRole("cell", { name: nome }).click();

      const drawer = page.getByRole("dialog");
      await expect(drawer.getByRole("heading", { name: nome })).toBeVisible();

      await drawer.getByRole("button", { name: "Editar empresa" }).click();
      const campoNome = drawer.getByRole("textbox").first();
      await expect(campoNome).toHaveValue(nome);
      await campoNome.fill(renomeada);
      await drawer.getByRole("button", { name: /salvar/i }).click();

      /*
       * O ponto do teste: antes da migração o cabeçalho continuava com o nome
       * antigo até fechar e reabrir o drawer, porque ele renderizava a linha
       * que a lista tinha em mãos no momento da abertura. Agora o detalhe é uma
       * query própria, e a invalidação da mutation o traz de volta atualizado.
       */
      await expect(drawer.getByRole("heading", { name: renomeada })).toBeVisible();
    } finally {
      await client.from("companies").delete().like("name", `${nome}%`);
    }
  });
});
