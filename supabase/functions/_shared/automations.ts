/**
 * Lógica pura do executor de automações (process-automation), extraída para ser
 * testada sem instanciar a edge function (que importa esm.sh e fala com o banco).
 *
 * Aqui vive só o que é decisão pura: avaliar condições e resolver o status do
 * log a partir do resultado das ações. As ações em si (criar tarefa, mover deal,
 * mandar WhatsApp) continuam no index, porque tocam o banco.
 */

export interface AutomationCondition {
  field: string;
  operator: string;
  value: string;
  /** Conector com a condição ANTERIOR. Ausente na primeira. */
  logic?: "AND" | "OR";
}

/** Uma condição isolada é satisfeita? Espelha os operadores do builder. */
export function evalCondition(
  cond: AutomationCondition,
  payload: Record<string, any> | null | undefined,
): boolean {
  const fieldVal = payload?.[cond.field];
  switch (cond.operator) {
    case "equals": return String(fieldVal) === String(cond.value);
    case "not_equals": return String(fieldVal) !== String(cond.value);
    // `!(<=)` em vez de `>` preserva o comportamento original com NaN
    // (campo ausente): NaN <= x é falso, então a condição passava.
    case "greater_than": return !(Number(fieldVal) <= Number(cond.value));
    case "less_than": return !(Number(fieldVal) >= Number(cond.value));
    case "contains": return String(fieldVal).includes(String(cond.value));
    case "not_contains": return !String(fieldVal).includes(String(cond.value));
    // Operador desconhecido não reprova — comportamento atual do executor.
    default: return true;
  }
}

/**
 * Avalia a lista de condições contra o payload do trigger.
 *
 * COMPORTAMENTO ATUAL: AND puro — o conector `logic` (AND/OR) de cada condição é
 * IGNORADO. O builder oferece "E/OU", mas o executor trata tudo como E. Uma
 * automação com OU se comporta como E, silenciosamente. (Ver automations.test.)
 */
export function evaluateConditions(
  conditions: AutomationCondition[] | null | undefined,
  payload: Record<string, any> | null | undefined,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  for (const cond of conditions) {
    if (!evalCondition(cond, payload)) return false;
  }
  return true;
}

export interface ActionOutcome {
  status: "ok" | "skipped" | "error";
  [k: string]: unknown;
}

/**
 * Status do log a partir do resultado das ações (fix da Sessão B):
 * - algum erro            → "partial_error"
 * - só no-ops (skipped)   → "skipped"   (não mais "success" enganoso)
 * - pelo menos uma ok     → "success"
 */
export function computeLogStatus(
  actionsResult: ActionOutcome[],
): "success" | "skipped" | "partial_error" {
  const hasErrors = actionsResult.some((r) => r.status === "error");
  const allSkipped = actionsResult.length > 0 && actionsResult.every((r) => r.status === "skipped");
  return hasErrors ? "partial_error" : allSkipped ? "skipped" : "success";
}
