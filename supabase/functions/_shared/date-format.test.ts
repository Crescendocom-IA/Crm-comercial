import { describe, it, expect } from "vitest";
import { prazo, passado, diffDias, parseData } from "./date-format";

// "Agora" fixo para determinismo: 27/07/2026 ao meio-dia UTC.
const AGORA = new Date("2026-07-27T12:00:00Z");

describe("prazo (data-alvo)", () => {
  it("data futura → 'faltam N dias'", () => {
    expect(prazo("2026-07-30", AGORA)).toBe("2026-07-30 (faltam 3 dias)");
  });

  it("falta 1 dia → singular", () => {
    expect(prazo("2026-07-28", AGORA)).toBe("2026-07-28 (faltam 1 dia)");
  });

  it("data de hoje → 'hoje' (ignora a hora)", () => {
    expect(prazo("2026-07-27", AGORA)).toBe("2026-07-27 (hoje)");
  });

  it("data passada → 'VENCIDA há N dias'", () => {
    expect(prazo("2026-07-14", AGORA)).toBe("2026-07-14 (VENCIDA há 13 dias)");
  });

  it("vencida há 1 dia → singular", () => {
    expect(prazo("2026-07-26", AGORA)).toBe("2026-07-26 (VENCIDA há 1 dia)");
  });

  it("null → 'não informado'", () => {
    expect(prazo(null, AGORA)).toBe("não informado");
  });

  it("string inválida → 'não informado'", () => {
    expect(prazo("não é data", AGORA)).toBe("não informado");
  });
});

describe("passado (evento anterior)", () => {
  it("hoje → 'hoje'", () => {
    expect(passado("2026-07-27", AGORA)).toBe("2026-07-27 (hoje)");
  });

  it("ontem → 'ontem'", () => {
    expect(passado("2026-07-26", AGORA)).toBe("2026-07-26 (ontem)");
  });

  it("N dias atrás → 'há N dias'", () => {
    expect(passado("2026-07-12", AGORA)).toBe("2026-07-12 (há 15 dias)");
  });

  it("null → 'não informado'", () => {
    expect(passado(undefined, AGORA)).toBe("não informado");
  });
});

describe("helpers de apoio", () => {
  it("diffDias ignora a hora do dia", () => {
    const a = new Date("2026-07-27T23:00:00Z");
    const b = new Date("2026-07-26T01:00:00Z");
    expect(diffDias(a, b)).toBe(1);
  });

  it("parseData devolve null para entrada vazia ou inválida", () => {
    expect(parseData(null)).toBeNull();
    expect(parseData("")).toBeNull();
    expect(parseData("xyz")).toBeNull();
    expect(parseData("2026-07-27")).toBeInstanceOf(Date);
  });
});
