import { createClient } from "@supabase/supabase-js";

/*
 * Prepara as contas de teste E2E — não só o usuário, a organização inteira.
 *
 * Antes este script criava apenas a conta e parava aí. A org nascia sem
 * pipeline, e três specs (kanban, automation, role-after-onboarding) falhavam
 * na criação de um negócio: sem estágio, o modal de novo negócio nem renderiza.
 * A falha parecia bug do app e era falta de setup.
 *
 * Cria/reconfigura duas contas, porque os testes precisam de estados opostos:
 *
 *   e2e@flowcrm.test      onboarding COMPLETO   — a suíte geral entra direto
 *   e2e-onb@flowcrm.test  onboarding PENDENTE   — role-after-onboarding precisa
 *                                                 do modal aparecendo
 *
 * A conta principal termina com pipeline padrão + 6 estágios e ZERO contatos,
 * empresas e negócios: cada spec cria o que precisa, e resíduo de execução
 * anterior é a fonte clássica de teste que passa sozinho e falha na suíte.
 *
 * Idempotente: rodar de novo reconfigura o que já existe em vez de exigir
 * deleção manual no painel.
 *
 *   SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/create-test-user.ts
 */

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam VITE_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.env.E2E_EMAIL || "e2e@flowcrm.test";
const PASSWORD = process.env.E2E_PASSWORD || "E2eTest2026!";
const ONB_EMAIL = process.env.E2E_ONB_EMAIL || "e2e-onb@flowcrm.test";
const ONB_PASSWORD = process.env.E2E_ONB_PASSWORD || "E2eTest2026!";

/*
 * Trava: este script apaga dados da org inteira. Rodando com um E2E_EMAIL
 * apontado por engano para uma conta real, ele limparia a base de produção.
 * Só emails de teste passam.
 */
const DOMINIOS_PERMITIDOS = [".test", "@example.com"];
for (const email of [EMAIL, ONB_EMAIL]) {
  if (!DOMINIOS_PERMITIDOS.some((d) => email.endsWith(d))) {
    console.error(
      `Recusando rodar com "${email}": este script limpa a organização inteira e ` +
      `só aceita emails de teste (${DOMINIOS_PERMITIDOS.join(", ")}).`,
    );
    process.exit(1);
  }
}

const ESTAGIOS = [
  { name: "Prospecção", order: 1, win_probability: 10, color: "#94a3b8" },
  { name: "Qualificação", order: 2, win_probability: 25, color: "#60a5fa" },
  { name: "Proposta", order: 3, win_probability: 50, color: "#3b82f6" },
  { name: "Negociação", order: 4, win_probability: 75, color: "#8b5cf6" },
  { name: "Ganho", order: 5, win_probability: 100, color: "#22c55e" },
  { name: "Perdido", order: 6, win_probability: 0, color: "#ef4444" },
];

/** Cria a conta com email já confirmado, ou recupera o id se já existir. */
async function garantirUsuario(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (!error) {
    console.log(`  conta criada (${data.user?.id})`);
    return data.user!.id;
  }
  if (!/already been registered|already exists/i.test(error.message)) {
    throw new Error(`criar ${email}: ${error.message}`);
  }
  // A API admin não busca por email; pagina até achar.
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const achado = list.users.find((u) => u.email === email);
    if (achado) {
      console.log(`  conta já existia (${achado.id}) — reconfigurando`);
      // Garante a senha conhecida: uma troca manual no painel deixaria a suíte
      // falhando no login com uma mensagem que não diz nada sobre isso.
      await supabase.auth.admin.updateUserById(achado.id, { password, email_confirm: true });
      return achado.id;
    }
    if (!list.users.length) break;
  }
  throw new Error(`não foi possível localizar o id de ${email}`);
}

/** org_id do usuário, criada pelo trigger handle_new_user. */
async function esperarOrg(userId: string): Promise<string> {
  for (let tentativa = 1; tentativa <= 10; tentativa++) {
    const { data } = await supabase
      .from("user_roles").select("org_id").eq("user_id", userId).maybeSingle();
    if (data?.org_id) return data.org_id;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`org do usuário ${userId} não apareceu — trigger handle_new_user falhou?`);
}

/** Pipeline padrão com os 6 estágios básicos. */
async function garantirPipeline(orgId: string) {
  let { data: pipeline } = await supabase
    .from("pipelines").select("id").eq("org_id", orgId).order("created_at").limit(1).maybeSingle();

  if (!pipeline) {
    const { data, error } = await supabase.from("pipelines")
      .insert({ org_id: orgId, name: "Pipeline de Vendas", is_default: true, currency: "BRL" })
      .select("id").single();
    if (error) throw new Error(`criar pipeline: ${error.message}`);
    pipeline = data;
    console.log("  pipeline criada");
  } else {
    console.log("  pipeline já existia");
  }

  const { data: existentes } = await supabase
    .from("pipeline_stages").select("name").eq("pipeline_id", pipeline!.id);
  const jaTem = new Set((existentes || []).map((s) => s.name));

  /*
   * Só insere os que faltam, sem apagar os extras: um estágio removido levaria
   * junto os negócios que apontam para ele.
   */
  const faltando = ESTAGIOS.filter((e) => !jaTem.has(e.name));
  if (faltando.length) {
    const { error } = await supabase.from("pipeline_stages")
      .insert(faltando.map((e) => ({ ...e, org_id: orgId, pipeline_id: pipeline!.id })));
    if (error) throw new Error(`criar estágios: ${error.message}`);
  }
  console.log(`  estágios: ${ESTAGIOS.length - faltando.length} existiam, ${faltando.length} criados`);
}

/**
 * Zera contatos, empresas e negócios da org de teste.
 *
 * Ordem importa: activities aponta para deals e contacts, e deals aponta para
 * contacts e companies. Apagar de fora para dentro evita violar as FKs.
 */
async function limparDados(orgId: string) {
  // deal_tags e contact_tags ficam de fora: não têm org_id e somem pelo cascade
  // do delete dos negócios e contatos.
  const tabelas = ["activities", "audit_logs", "deals", "contacts", "companies"];
  for (const tabela of tabelas) {
    const { error, count } = await supabase
      .from(tabela).delete({ count: "exact" }).eq("org_id", orgId);
    if (error) throw new Error(`limpar ${tabela}: ${error.message}`);
    console.log(`  ${tabela}: ${count ?? 0} removidos`);
  }
}

async function main() {
  // ── Conta principal ────────────────────────────────────────────────────
  console.log(`\n[1/2] ${EMAIL} — onboarding completo, org pronta para a suíte`);
  const userId = await garantirUsuario(EMAIL, PASSWORD);
  const orgId = await esperarOrg(userId);

  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
  await supabase.from("user_roles").update({ role: "owner" }).eq("user_id", userId);
  await garantirPipeline(orgId);
  await limparDados(orgId);

  // ── Conta de onboarding ────────────────────────────────────────────────
  /*
   * role-after-onboarding depende do modal APARECENDO. Depois que o teste roda
   * uma vez, o "Configurar depois" marca onboarding_completed = true e a
   * execução seguinte falharia — por isso o reset a cada preparação.
   */
  console.log(`\n[2/2] ${ONB_EMAIL} — onboarding pendente (reset a cada execução)`);
  const onbId = await garantirUsuario(ONB_EMAIL, ONB_PASSWORD);
  await esperarOrg(onbId);
  await supabase.from("profiles")
    .update({ onboarding_completed: false, onboarding_step: 0 }).eq("id", onbId);
  // Sem promoção manual a owner: o papel tem que vir do trigger
  // handle_new_user, que é justamente o que aquele teste verifica.
  await supabase.from("onboarding_progress").delete().eq("user_id", onbId);
  console.log("  onboarding_completed = false");

  // ── Conferência ────────────────────────────────────────────────────────
  const { data: papel } = await supabase
    .from("user_roles").select("role, org_id").eq("user_id", userId).maybeSingle();
  const { data: estagios } = await supabase
    .from("pipeline_stages").select("name").eq("org_id", orgId).order("order");
  const { data: onbPapel } = await supabase
    .from("user_roles").select("role").eq("user_id", onbId).maybeSingle();

  console.log("\nEstado final:");
  console.log(`  ${EMAIL}: role=${papel?.role}, org=${papel?.org_id}`);
  console.log(`  estágios: ${(estagios || []).map((s) => s.name).join(" > ")}`);
  console.log(`  ${ONB_EMAIL}: role=${onbPapel?.role} (vindo do trigger), onboarding pendente`);
}

main().catch((e) => {
  console.error("\nFalhou:", e.message);
  process.exit(1);
});
