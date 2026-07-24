import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { STORAGE, LOGGED_OUT } from "./helpers";

/*
 * Faz login uma vez, antes de toda a suíte, e grava a sessão de cada conta em
 * .auth/*.json. Os specs entram já logados via test.use({ storageState }), então
 * o número de sign-ins cai de "um por teste" para "um por conta por execução" —
 * que era a suspeita causal do flake por limite de taxa do GoTrue.
 *
 * Este setup NÃO cria as contas: quem faz isso é scripts/create-test-user.ts,
 * que precisa da service role key. Aqui só é preciso a publishable key e as
 * credenciais E2E, para que rodar os testes não exija o segredo de serviço.
 *
 * Ordem no Playwright: o webServer sobe e fica pronto ANTES do global-setup, então
 * o /login já responde quando chegamos aqui.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

async function loginEGravar(email: string, password: string, path: string) {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ baseURL: BASE });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByRole("tab", { name: "Entrar" }).click();
    await page.getByPlaceholder("seu@email.com").first().fill(email);
    await page.getByPlaceholder("••••••••").fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    /*
     * Ambas as contas caem em /dashboard: a principal limpa, a de onboarding com
     * o modal por cima (mas a URL é a mesma). Esperar a URL confirma que o login
     * passou antes de gravar — uma sessão vazia gravada aqui faria a suíte
     * inteira falhar depois com uma mensagem que não aponta para cá.
     */
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await context.storageState({ path });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig) {
  mkdirSync(".auth", { recursive: true });

  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  // Sem credenciais, os specs autenticados se pulam via requireCreds(); mas o
  // config aponta storageState para estes arquivos, então eles precisam existir.
  // Grava sessões vazias e sai — nada para logar.
  if (!email || !password) {
    writeFileSync(STORAGE.user, JSON.stringify(LOGGED_OUT));
    writeFileSync(STORAGE.onboarding, JSON.stringify(LOGGED_OUT));
    return;
  }

  await loginEGravar(email, password, STORAGE.user);

  await loginEGravar(
    process.env.E2E_ONB_EMAIL || "e2e-onb@flowcrm.test",
    process.env.E2E_ONB_PASSWORD || "E2eTest2026!",
    STORAGE.onboarding,
  );
}
