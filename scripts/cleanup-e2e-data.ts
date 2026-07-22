import { createClient } from "@supabase/supabase-js";

/*
 * Versão executável do scripts/cleanup-e2e-data.sql, via service-role (mesmo
 * padrão do create-test-user.ts). Remove os artefatos que a suíte E2E deixou na
 * org real e desvincula/deleta a conta de teste.
 *
 * Modos:
 *   DRY_RUN=1  -> só conta o que casaria, NÃO apaga (preview).
 *   CONFIRM=yes -> executa as deleções de verdade.
 *   (sem nenhum) -> recusa rodar, para não apagar por engano.
 *
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DRY_RUN=1 \
 *     npx tsx scripts/cleanup-e2e-data.ts
 */
const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const DRY = process.env.DRY_RUN === "1";
const CONFIRM = process.env.CONFIRM === "yes";
if (!DRY && !CONFIRM) {
  console.error("Recusando rodar sem DRY_RUN=1 (preview) ou CONFIRM=yes (executar).");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USER_ID = "3ee0cd5d-6fa4-4b2f-9075-3b6276e3eea1";
const totals: Record<string, number> = {};

/** Conta (dry) ou apaga (confirmado) e devolve o nº de linhas afetadas. */
async function run(
  label: string,
  table: string,
  apply: (q: any) => any,
): Promise<number> {
  if (DRY) {
    // await é obrigatório: o builder do supabase-js é thenable e só dispara a
    // requisição quando aguardado. Sem await, data vinha undefined -> tudo 0.
    const { data, error } = await apply(supabase.from(table).select("id"));
    if (error) throw new Error(`${label}: ${error.message}`);
    const n = data?.length ?? 0;
    totals[label] = n;
    console.log(`  [dry] ${label}: ${n} linha(s) casariam`);
    return n;
  }
  // Idem: sem await a query nem chega ao servidor — nada seria apagado.
  const { data, error } = await apply(supabase.from(table).delete()).select("id");
  if (error) throw new Error(`${label}: ${error.message}`);
  const n = data?.length ?? 0;
  totals[label] = n;
  console.log(`  ${label}: ${n} linha(s) apagada(s)`);
  return n;
}

console.log(DRY ? "=== DRY RUN (nada será apagado) ===" : "=== EXECUTANDO deleções ===");

// ── Bloco 1: tarefas criadas pela automação de teste ──
console.log("\nBloco 1 — tarefas 'Tarefa auto %'");
await run("activities(task)", "activities", (q) =>
  q.eq("type", "task").like("title", "Tarefa auto %"),
);

// ── Bloco 2: deals de teste + suas atividades ──
// Dois padrões, tratados separadamente com .like(). NÃO uso .or() aqui: no
// string do .or() o curinga do PostgREST é *, não %, e % viraria literal —
// apagaria zero linhas silenciosamente. O método .like() aceita % normal.
console.log("\nBloco 2 — deals de teste e atividades ligadas");
const dealPatterns = ["Deal ganhar %", "E2E Deal %"];
const dealIds: string[] = [];
for (const pat of dealPatterns) {
  const { data } = await supabase.from("deals").select("id").like("title", pat);
  dealIds.push(...(data || []).map((d) => d.id));
}
if (dealIds.length) {
  await run("activities(de deals)", "activities", (q) => q.in("deal_id", dealIds));
}
await run("deals(Deal ganhar)", "deals", (q) => q.like("title", "Deal ganhar %"));
await run("deals(E2E Deal)", "deals", (q) => q.like("title", "E2E Deal %"));

// ── Bloco 3: contatos do teste de CSV (título tem vírgula → dois deletes) ──
console.log("\nBloco 3 — contatos do CSV ('Diretor, Vendas %' / 'Gerente, Contas %')");
// A vírgula no valor quebraria o .or(), então dois filtros .like() separados.
// Sem o espaço antes do %: algumas linhas de uma iteração antiga do teste têm
// title "Diretor, Vendas" sem marcador. 'Diretor, Vendas%' casa com e sem
// marcador (0 contatos reais existem, então é seguro pegar todos).
await run("contacts(Diretor)", "contacts", (q) => q.like("title", "Diretor, Vendas%"));
await run("contacts(Gerente)", "contacts", (q) => q.like("title", "Gerente, Contas%"));

// ── Bloco 4: automações de teste + seus logs ──
console.log("\nBloco 4 — automações 'Auto E2E %' e seus logs");
const { data: testAutos } = await supabase
  .from("automations")
  .select("id")
  .like("name", "Auto E2E %");
const autoIds = (testAutos || []).map((a) => a.id);
if (autoIds.length) {
  await run("automation_logs", "automation_logs", (q) => q.in("automation_id", autoIds));
}
await run("automations", "automations", (q) => q.like("name", "Auto E2E %"));

// ── Bloco 5: desvincula a conta de teste ──
console.log("\nBloco 5 — desvincula a conta de teste");
await run("user_roles(teste)", "user_roles", (q) => q.eq("user_id", TEST_USER_ID));
await run("profiles(teste)", "profiles", (q) => q.eq("id", TEST_USER_ID));

// ── Bloco 6: deleta a conta auth (só no modo real) ──
console.log("\nBloco 6 — deleta a conta auth de teste");
if (DRY) {
  console.log(`  [dry] deletaria auth.users ${TEST_USER_ID}`);
} else {
  const { error } = await supabase.auth.admin.deleteUser(TEST_USER_ID);
  console.log(error ? `  ERRO ao deletar usuário: ${error.message}` : `  conta ${TEST_USER_ID} deletada`);
}

// ── Resumo ──
console.log("\n=== Resumo por bloco ===");
for (const [k, v] of Object.entries(totals)) console.log(`  ${k}: ${v}`);
console.log(DRY ? "\n(DRY RUN — nada foi alterado)" : "\n(deleções aplicadas)");
