import { defineConfig, devices } from "@playwright/test";

/*
 * E2E contra o app rodando localmente. O webServer sobe o Vite dev na 8080 e
 * reaproveita um servidor já aberto se houver. BASE_URL permite apontar para o
 * Vercel em vez do localhost.
 *
 * Credenciais NUNCA no código: E2E_EMAIL / E2E_PASSWORD vêm do ambiente. Sem
 * elas, os testes que dependem de login se marcam como skip com motivo, em vez
 * de falhar por engano.
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./src/test/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    // channel: "chrome" usa o Chrome do sistema em vez do binário do Playwright,
    // que não baixou neste ambiente. Sem download, sem espera.
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
  // Só sobe o servidor quando o alvo é localhost.
  webServer: BASE_URL.includes("localhost")
    ? {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
