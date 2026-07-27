import { test, expect } from "@playwright/test";
import { requireCreds, apiComoUsuario } from "./helpers";

/*
 * Prova de ponta a ponta do fix da Sessão D: o executor de automações IGNORAVA
 * o conector `logic` das condições e tratava "OU" como "E". Uma automação com
 * condição OU nunca disparava quando só a segunda cláusula batia.
 *
 * Montagem que discrimina o fix:
 *   - Cláusula 1: stage_id == "000"      → NUNCA bate (stage_id é um UUID)
 *   - Cláusula 2 (OU): deal_id != "000"  → SEMPRE bate (deal_id é um UUID)
 *   Com o bug (OU-como-E), a cláusula 1 reprovaria tudo → sem tarefa.
 *   Com o fix, a cláusula 2 basta → a ação create_task roda.
 *
 * Controle negativo: uma automação só com a cláusula que nunca bate. Prova que
 * as condições são de fato avaliadas (não ignoradas) — sem ele, um "positivo"
 * sozinho não distinguiria "OU funciona" de "condições são ignoradas".
 *
 * Por que invocar process-automation direto, e não arrastar no Kanban: o
 * dispatcher (fireAutomations) é client-side; um update de estágio via API NÃO o
 * aciona. Invocar a função deployada com o JWT do owner (via apiComoUsuario) é o
 * que o app faz por baixo e isola exatamente o que mudou — a avaliação de
 * condições no executor. A camada de dispatch já tem unit (matchAutomations) e o
 * automation.spec cobre o caminho de UI completo do create_task.
 */
test.describe("Automação — condição OU (fix da Sessão D)", () => {
  test("OU honra o conector: 2ª cláusula basta → tarefa criada; controle negativo não cria", async () => {
    requireCreds();

    const { client, orgId, userId } = await apiComoUsuario();
    const marker = Date.now();
    const tituloOK = `Tarefa auto OR ${marker}`;
    const tituloNeg = `Tarefa auto NEG ${marker}`;

    const { data: stages } = await client
      .from("pipeline_stages").select("id,order")
      .eq("org_id", orgId).order("order", { ascending: true });
    expect((stages?.length ?? 0) >= 2, "org de teste precisa de ao menos 2 estágios").toBeTruthy();
    const destino = stages![1];

    const autoIds: string[] = [];
    let dealId: string | null = null;

    // Invoca a process-automation DEPLOYADA como o dispatcher client-side faria.
    const invocar = (automationId: string) =>
      client.functions.invoke("process-automation", {
        body: { automation_id: automationId, org_id: orgId, trigger_payload: { deal_id: dealId, stage_id: destino.id } },
      });

    const contarTarefas = async (titulo: string) => {
      const { data } = await client.from("activities")
        .select("id").eq("org_id", orgId).eq("type", "task").eq("title", titulo);
      return data?.length ?? 0;
    };

    const esperarTarefa = async (titulo: string, ms = 5000) => {
      const inicio = Date.now();
      while (Date.now() - inicio < ms) {
        if ((await contarTarefas(titulo)) > 0) return true;
        await new Promise((r) => setTimeout(r, 300));
      }
      return false;
    };

    try {
      // Deal de teste — a cláusula deal_id != "000" bate por ser um UUID real.
      const { data: deal, error: dealErr } = await client.from("deals").insert({
        org_id: orgId, title: `E2E Deal OR ${marker}`,
        stage_id: stages![0].id, owner_id: userId, status: "open",
      }).select("id").single();
      expect(dealErr, `criar deal: ${dealErr?.message}`).toBeNull();
      dealId = deal!.id;

      // A) Automação com condição OU.
      const { data: autoOK, error: eOK } = await client.from("automations").insert({
        org_id: orgId, name: `Auto E2E OR ${marker}`, is_active: true,
        trigger: { type: "deal.stage_changed", config: {} },
        conditions: [
          { field: "stage_id", operator: "equals", value: "000" },
          { field: "deal_id", operator: "not_equals", value: "000", logic: "OR" },
        ],
        actions: [{ type: "create_task", config: { title: tituloOK, due_days: 1, priority: "high" } }],
        created_by: userId,
      }).select("id").single();
      expect(eOK, `criar automação OU: ${eOK?.message}`).toBeNull();
      autoIds.push(autoOK!.id);

      // B) Controle negativo: só a cláusula que nunca bate.
      const { data: autoNeg, error: eNeg } = await client.from("automations").insert({
        org_id: orgId, name: `Auto E2E OR-neg ${marker}`, is_active: true,
        trigger: { type: "deal.stage_changed", config: {} },
        conditions: [{ field: "stage_id", operator: "equals", value: "000" }],
        actions: [{ type: "create_task", config: { title: tituloNeg, due_days: 1, priority: "high" } }],
        created_by: userId,
      }).select("id").single();
      expect(eNeg, `criar automação de controle: ${eNeg?.message}`).toBeNull();
      autoIds.push(autoNeg!.id);

      const rOK = await invocar(autoOK!.id);
      expect(rOK.error, `invoke da automação OU falhou: ${rOK.error?.message}`).toBeFalsy();
      const rNeg = await invocar(autoNeg!.id);
      expect(rNeg.error, `invoke do controle falhou: ${rNeg.error?.message}`).toBeFalsy();

      // Positivo: o OU criou a tarefa (fix vivo em produção).
      expect(
        await esperarTarefa(tituloOK),
        "a tarefa da automação OU não apareceu — o fix do OU não está vivo na process-automation deployada",
      ).toBe(true);

      // Negativo: a automação com a cláusula que nunca bate NÃO criou tarefa —
      // logo, as condições são avaliadas de verdade (o positivo não é falso).
      expect(
        await contarTarefas(tituloNeg),
        "o controle negativo criou tarefa — as condições não estão sendo avaliadas",
      ).toBe(0);
    } finally {
      // Limpa tudo o que foi semeado (sessão do owner, sob RLS). Deletar a
      // automação leva junto os automation_logs (FK ON DELETE CASCADE).
      await client.from("activities").delete()
        .eq("org_id", orgId).eq("type", "task").in("title", [tituloOK, tituloNeg]);
      if (dealId) await client.from("deals").delete().eq("id", dealId);
      for (const id of autoIds) await client.from("automations").delete().eq("id", id);
    }
  });
});
