import { describe, it, expect } from "vitest";
import { matchAutomations } from "./webhooks";

/*
 * matchAutomations é o coração puro do dispatcher client-side: dado o conjunto
 * de automações ATIVAS (o filtro is_active é feito no SQL, antes daqui), filtra
 * as que casam com o tipo do evento. O fetch e o invoke de process-automation
 * são integração e ficam de fora deste teste de unidade.
 */
const auto = (id: string, type: string) => ({ id, trigger: { type } });

describe("matchAutomations — filtro por tipo de trigger", () => {
  const autos = [
    auto("a", "deal.won"),
    auto("b", "deal.won"),
    auto("c", "contact.created"),
    auto("d", "deal.stage_changed"),
  ];

  it("deal.won seleciona só as automações de deal.won", () => {
    expect(matchAutomations(autos, "deal.won").map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("contact.created seleciona só a de contact.created", () => {
    expect(matchAutomations(autos, "contact.created").map((a) => a.id)).toEqual(["c"]);
  });

  it("evento sem automação casada → lista vazia", () => {
    expect(matchAutomations(autos, "deal.lost")).toEqual([]);
  });

  it("lista vazia de automações → lista vazia", () => {
    expect(matchAutomations([], "deal.won")).toEqual([]);
  });

  it("trigger malformado (sem type) não casa e não quebra", () => {
    const ruins = [{ id: "x", trigger: null }, { id: "y", trigger: {} }] as { id: string; trigger: unknown }[];
    expect(matchAutomations(ruins, "deal.won")).toEqual([]);
  });
});
