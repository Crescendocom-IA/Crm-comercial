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
 * Avalia a lista de condições contra o payload do trigger, honrando o conector
 * `logic` (AND/OR) de cada condição, associativo à esquerda.
 *
 * Antes, o executor IGNORAVA o `logic` e tratava tudo como AND — uma automação
 * com "OU" no builder se comportava como "E", silenciosamente. Bug revelado por
 * automations.test ("OR: uma basta") e corrigido aqui.
 */
export function evaluateConditions(
  conditions: AutomationCondition[] | null | undefined,
  payload: Record<string, any> | null | undefined,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  let result = evalCondition(conditions[0], payload);
  for (let i = 1; i < conditions.length; i++) {
    const atual = evalCondition(conditions[i], payload);
    result = conditions[i].logic === "OR" ? result || atual : result && atual;
  }
  return result;
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
