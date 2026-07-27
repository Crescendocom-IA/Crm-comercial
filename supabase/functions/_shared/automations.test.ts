import { describe, it, expect } from "vitest";
import { evalCondition, evaluateConditions, computeLogStatus, type AutomationCondition } from "./automations";

const cond = (field: string, operator: string, value: string, logic?: "AND" | "OR"): AutomationCondition =>
  ({ field, operator, value, logic });

describe("evalCondition — operadores", () => {
  it("equals", () => {
    expect(evalCondition(cond("status", "equals", "won"), { status: "won" })).toBe(true);
    expect(evalCondition(cond("status", "equals", "won"), { status: "open" })).toBe(false);
  });

  it("not_equals", () => {
    expect(evalCondition(cond("status", "not_equals", "won"), { status: "open" })).toBe(true);
    expect(evalCondition(cond("status", "not_equals", "won"), { status: "won" })).toBe(false);
  });

  it("greater_than (numérico)", () => {
    expect(evalCondition(cond("value", "greater_than", "1000"), { value: 5000 })).toBe(true);
    expect(evalCondition(cond("value", "greater_than", "1000"), { value: 500 })).toBe(false);
  });

  it("less_than (numérico)", () => {
    expect(evalCondition(cond("value", "less_than", "1000"), { value: 500 })).toBe(true);
    expect(evalCondition(cond("value", "less_than", "1000"), { value: 5000 })).toBe(false);
  });

  it("contains / not_contains (texto)", () => {
    expect(evalCondition(cond("title", "contains", "urgente"), { title: "caso urgente" })).toBe(true);
    expect(evalCondition(cond("title", "not_contains", "urgente"), { title: "caso normal" })).toBe(true);
  });

  /*
   * A lista da sessão citava is_empty, mas o builder não oferece esse operador
   * (equals/not_equals/greater_than/less_than/contains/not_contains) e o executor
   * também não. Operador desconhecido NÃO reprova — comportamento atual.
   */
  it("operador desconhecido não reprova (não implementado)", () => {
    expect(evalCondition(cond("x", "is_empty", ""), { x: "algo" })).toBe(true);
  });
});

describe("evaluateConditions — combinação AND/OR", () => {
  it("sem condições → passa", () => {
    expect(evaluateConditions([], { any: 1 })).toBe(true);
    expect(evaluateConditions(undefined, {})).toBe(true);
  });

  it("AND: todas precisam bater", () => {
    const conds = [cond("status", "equals", "won"), cond("value", "greater_than", "1000", "AND")];
    expect(evaluateConditions(conds, { status: "won", value: 5000 })).toBe(true);
    expect(evaluateConditions(conds, { status: "won", value: 500 })).toBe(false);
  });

  it("OR: uma basta", () => {
    // status NÃO bate, mas value bate — com OU, deve passar.
    const conds = [cond("status", "equals", "won"), cond("value", "greater_than", "1000", "OR")];
    expect(evaluateConditions(conds, { status: "open", value: 5000 })).toBe(true);
    // nenhuma bate → reprova mesmo com OU.
    expect(evaluateConditions(conds, { status: "open", value: 500 })).toBe(false);
  });
});

describe("computeLogStatus — status do log (fix da Sessão B)", () => {
  it("todas ok → success", () => {
    expect(computeLogStatus([{ status: "ok" }, { status: "ok" }])).toBe("success");
  });

  it("só no-ops (skipped) → skipped, não 'success' enganoso", () => {
    expect(computeLogStatus([{ status: "skipped" }, { status: "skipped" }])).toBe("skipped");
  });

  it("qualquer erro → partial_error", () => {
    expect(computeLogStatus([{ status: "ok" }, { status: "error" }])).toBe("partial_error");
  });

  it("mistura ok + skipped (algo aconteceu) → success", () => {
    expect(computeLogStatus([{ status: "ok" }, { status: "skipped" }])).toBe("success");
  });

  it("sem ações → success (vazio não é 'skipped')", () => {
    expect(computeLogStatus([])).toBe("success");
  });
});
