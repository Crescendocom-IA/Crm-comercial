import { describe, it, expect } from "vitest";
import { emptyFilters, emptyRule, ruleIsEmpty, toCsv, toQuery } from "./audience";

describe("toQuery", () => {
  it("monta o exemplo: comprou mangueira nos últimos 6 meses acima de R$ 1.000", () => {
    const f = emptyFilters();
    f.rules = [{ ...emptyRule(), product: " mangueira ", period: "6", minValue: "1000" }];
    expect(toQuery(f)).toEqual({
      match: "all",
      only_active: true,
      has_document: true,
      rules: [{ op: "bought", doc: "order", product: "mangueira", months: 6, min_value: 1000 }],
    });
  });

  it("orçamento sem compra vira duas regras com documentos diferentes", () => {
    const f = emptyFilters();
    f.rules = [
      { ...emptyRule(), action: "quoted", product: "correia" },
      { ...emptyRule(), action: "not_bought", product: "correia" },
    ];
    expect(toQuery(f).rules).toEqual([
      { op: "bought", doc: "quote", product: "correia" },
      { op: "not_bought", doc: "order", product: "correia" },
    ]);
  });

  it("ignora regra vazia e campos em branco", () => {
    const q = toQuery({ ...emptyFilters(), onlyActive: false, hasDocument: false });
    expect(q).toEqual({ match: "all", rules: [] });
  });

  it("período personalizado usa as datas, não meses", () => {
    const f = emptyFilters();
    f.rules = [{ ...emptyRule(), period: "custom", from: "2025-01-01", to: "2025-12-31" }];
    expect(toQuery(f).rules).toEqual([{ op: "bought", doc: "order", from: "2025-01-01", to: "2025-12-31" }]);
  });
});

describe("ruleIsEmpty", () => {
  it("só a ação não é critério", () => {
    expect(ruleIsEmpty({ ...emptyRule(), action: "not_bought" })).toBe(true);
    expect(ruleIsEmpty({ ...emptyRule(), group: "2" })).toBe(false);
  });
});

describe("toCsv", () => {
  it("escapa aspas e começa com BOM", () => {
    expect(toCsv([{ Nome: 'MANGUEIRA 1/2"', Valor: 10 }])).toBe('﻿"Nome","Valor"\n"MANGUEIRA 1/2""","10"');
  });
  it("lista vazia não gera arquivo", () => {
    expect(toCsv([])).toBe("");
  });
});
