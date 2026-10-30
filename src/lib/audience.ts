/*
 * Modelo do filtro de público-alvo. O formato é o que a função audience_search
 * do banco recebe e o que fica salvo em segments.filters (type = "audience").
 */

/** O que a regra procura: comprou, não comprou, pediu ou não pediu orçamento. */
export type RuleAction = "bought" | "not_bought" | "quoted" | "not_quoted";

export interface AudienceRule {
  action: RuleAction;
  product: string;
  brand: string;
  group: string;
  /** Meses para trás; "" = todo o histórico; "custom" usa from/to. */
  period: string;
  from: string;
  to: string;
  minValue: string;
  minQty: string;
}

export interface AudienceFilters {
  match: "all" | "any";
  rules: AudienceRule[];
  kind: string;
  cidade: string;
  estado: string;
  seller: string;
  hasEmail: boolean;
  hasPhone: boolean;
  onlyActive: boolean;
  /** Exclui contas internas do ERP, sem documento (CONSUMIDOR, TRANSFERENCIA). */
  hasDocument: boolean;
  minTotal: string;
  maxTotal: string;
  minOrders: string;
  minTicket: string;
  minDaysSince: string;
  maxDaysSince: string;
}

export const emptyRule = (): AudienceRule => ({
  action: "bought", product: "", brand: "", group: "", period: "", from: "", to: "", minValue: "", minQty: "",
});

export const emptyFilters = (): AudienceFilters => ({
  match: "all", rules: [emptyRule()], kind: "", cidade: "", estado: "", seller: "",
  hasEmail: false, hasPhone: false, onlyActive: true, hasDocument: true,
  minTotal: "", maxTotal: "", minOrders: "", minTicket: "", minDaysSince: "", maxDaysSince: "",
});

/** Regra sem nenhum critério não restringe nada: "comprou" vazio é ignorada. */
export function ruleIsEmpty(r: AudienceRule): boolean {
  return !r.product.trim() && !r.brand.trim() && !r.group && !r.period
    && !r.minValue && !r.minQty;
}

const ACTION_TO_QUERY: Record<RuleAction, { op: "bought" | "not_bought"; doc: "order" | "quote" }> = {
  bought: { op: "bought", doc: "order" },
  not_bought: { op: "not_bought", doc: "order" },
  quoted: { op: "bought", doc: "quote" },
  not_quoted: { op: "not_bought", doc: "quote" },
};

/** Converte o estado da tela no JSON de audience_search, sem campos vazios. */
export function toQuery(f: AudienceFilters): Record<string, unknown> {
  const rules = f.rules.filter((r) => !ruleIsEmpty(r)).map((r) => {
    const q: Record<string, unknown> = { ...ACTION_TO_QUERY[r.action] };
    if (r.product.trim()) q.product = r.product.trim();
    if (r.brand.trim()) q.brand = r.brand.trim();
    if (r.group) q.group = r.group;
    if (r.period === "custom") {
      if (r.from) q.from = r.from;
      if (r.to) q.to = r.to;
    } else if (r.period) {
      q.months = Number(r.period);
    }
    if (r.minValue) q.min_value = Number(r.minValue);
    if (r.minQty) q.min_qty = Number(r.minQty);
    return q;
  });

  const out: Record<string, unknown> = { match: f.match, rules };
  const text: Array<[string, string]> = [
    ["kind", f.kind], ["cidade", f.cidade.trim()], ["estado", f.estado.trim()], ["seller", f.seller],
    ["min_total", f.minTotal], ["max_total", f.maxTotal], ["min_orders", f.minOrders], ["min_ticket", f.minTicket],
    ["min_days_since", f.minDaysSince], ["max_days_since", f.maxDaysSince],
  ];
  for (const [k, v] of text) if (v) out[k] = v;
  if (f.hasEmail) out.has_email = true;
  if (f.hasPhone) out.has_phone = true;
  if (f.onlyActive) out.only_active = true;
  if (f.hasDocument) out.has_document = true;
  return out;
}

/** CSV com aspas escapadas e BOM (o Excel em pt-BR precisa dele para acentos). */
export function toCsv(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [headers.map(cell).join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}
