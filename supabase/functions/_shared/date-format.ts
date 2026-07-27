/**
 * Formatação de datas do briefing de IA (ai-deal-summary), extraída para poder
 * ser testada sem instanciar a edge function inteira — que importa deno.land e
 * esm.sh e não roda no Node/vitest.
 *
 * O cálculo de prazo/idade vai pronto para o contexto do LLM: aritmética de data
 * é onde o modelo erra sem avisar ("está próxima" para algo 13 dias vencido). Se
 * o número já vem calculado, não há o que errar.
 *
 * `now` é injetável (default = agora) para os testes serem determinísticos.
 */

/** Diferença em dias inteiros, ignorando hora — datas do CRM são dia cheio. */
export function diffDias(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ua - ub) / 86_400_000);
}

export function parseData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data-alvo (prazo): "2026-07-10 (VENCIDA há 13 dias)". */
export function prazo(iso: string | null | undefined, now: Date = new Date()): string {
  const d = parseData(iso);
  if (!d) return "não informado";
  const dia = d.toISOString().slice(0, 10);
  const n = diffDias(d, now);
  if (n > 0) return `${dia} (faltam ${n} dia${n === 1 ? "" : "s"})`;
  if (n === 0) return `${dia} (hoje)`;
  return `${dia} (VENCIDA há ${-n} dia${-n === 1 ? "" : "s"})`;
}

/** Evento passado: "2026-06-08 (há 45 dias)". */
export function passado(iso: string | null | undefined, now: Date = new Date()): string {
  const d = parseData(iso);
  if (!d) return "não informado";
  const dia = d.toISOString().slice(0, 10);
  const n = diffDias(now, d);
  if (n === 0) return `${dia} (hoje)`;
  if (n === 1) return `${dia} (ontem)`;
  return `${dia} (há ${n} dias)`;
}
