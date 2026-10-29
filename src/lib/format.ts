/*
 * Formatação pt-BR para valores do histórico de vendas. Nulo vira "—" em vez
 * de "R$ 0,00": no espelho do ERP, campo vazio e zero são coisas diferentes.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const qty = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function formatBRL(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : brl.format(Number(v));
}

export function formatQty(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : qty.format(Number(v));
}

/** Datas do ERP chegam como "AAAA-MM-DD" (sem fuso): formata sem converter. */
export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
}
