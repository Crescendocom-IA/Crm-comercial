import { describe, it, expect } from "vitest";
import { clampScore } from "./scoring";

/*
 * O motor de scoring é POR EVENTO e incremental: casa uma regra ativa por
 * event_type e SOMA `points` ao lead_score (clamp 0–100). A tabela
 * lead_scoring_rules só tem event_type/label/points/is_active — NÃO há
 * condições, operadores (greater_than/contains/is_empty) nem AND/OR. Essa lógica
 * de condições vive no motor de AUTOMAÇÕES (ver automations.test.ts).
 *
 * O núcleo puro e testável do scoring é o clamp da soma — abaixo. A seleção da
 * regra ativa (e "regra desabilitada não conta") é feita por SQL
 * (.eq("is_active", true)) dentro de applyScoreEvent, coberta em integração.
 */
describe("clampScore — soma de pontos com limite 0–100", () => {
  it("regra simples: +10 sobre 0 → 10", () => {
    expect(clampScore(0, 10)).toBe(10);
  });

  it("eventos múltiplos somam (aplicação sequencial)", () => {
    // Cada evento aplica uma regra; o efeito acumula no lead_score.
    expect(clampScore(clampScore(0, 10), 5)).toBe(15);
  });

  it("pontos negativos subtraem", () => {
    expect(clampScore(50, -20)).toBe(30);
  });

  it("respeita o teto de 100", () => {
    expect(clampScore(95, 10)).toBe(100);
  });

  it("respeita o piso de 0 (não fica negativo)", () => {
    expect(clampScore(5, -10)).toBe(0);
  });

  it("score inicial nulo conta como 0", () => {
    expect(clampScore(null, 10)).toBe(10);
    expect(clampScore(undefined, 0)).toBe(0);
  });
});
