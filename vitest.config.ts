import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Motores no frontend (src/lib) + helpers puros das edge functions. As
    // edge functions só entram por arquivos SEM import Deno/esm.sh — a lógica
    // testável foi extraída para supabase/functions/_shared/*.ts, que são TS
    // puro e importam no Node. Os handlers (index.ts) ficam fora, no E2E.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
    ],
    // Os specs de Playwright (src/test/e2e) usam test.describe do @playwright/test
    // e explodem sob o vitest — a suíte E2E roda pelo próprio Playwright.
    exclude: [...configDefaults.exclude, "src/test/e2e/**"],
    coverage: {
      // Só reporta, sem threshold ainda. Mede os arquivos efetivamente testados.
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/scoring.ts",
        "src/lib/webhooks.ts",
        "supabase/functions/_shared/automations.ts",
        "supabase/functions/_shared/date-format.ts",
        "supabase/functions/_shared/streaming.ts",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
