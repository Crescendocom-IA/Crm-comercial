import { describe, it, expect } from "vitest";
import { formatBRL, formatDate, formatQty } from "./format";

describe("formatBRL", () => {
  it("formata em reais", () => {
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
  it("nulo vira traço, não R$ 0,00", () => {
    expect(formatBRL(null)).toBe("—");
    expect(formatBRL(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });
});

describe("formatDate", () => {
  it("data do ERP sem conversão de fuso", () => {
    // new Date("2024-01-02") viraria 01/01 em UTC-3; aqui não pode.
    expect(formatDate("2024-01-02")).toBe("02/01/2024");
  });
  it("aceita timestamp e nulo", () => {
    expect(formatDate("2026-06-18T11:10:59.245Z")).toBe("18/06/2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("formatQty", () => {
  it("até 3 casas decimais", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(1.2345)).toBe("1,235");
  });
});
