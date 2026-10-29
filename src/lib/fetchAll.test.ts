import { describe, it, expect } from "vitest";
import { fetchAll } from "./fetchAll";

/** Fonte falsa que, como o PostgREST, devolve só a faixa pedida. */
const fonte = (total: number) => {
  const rows = Array.from({ length: total }, (_, i) => i);
  const chamadas: Array<[number, number]> = [];
  const build = (from: number, to: number) => {
    chamadas.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { build, chamadas };
};

describe("fetchAll", () => {
  it("junta todas as páginas além do limite de 1.000", async () => {
    const { build, chamadas } = fonte(2500);
    const rows = await fetchAll(build);
    expect(rows).toHaveLength(2500);
    expect(chamadas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("total múltiplo exato do tamanho da página faz uma ida extra vazia", async () => {
    const { build, chamadas } = fonte(2000);
    expect(await fetchAll(build)).toHaveLength(2000);
    expect(chamadas).toHaveLength(3);
  });

  it("propaga erro em vez de devolver lista parcial", async () => {
    const build = () => Promise.resolve({ data: null, error: { message: "falhou" } });
    await expect(fetchAll(build)).rejects.toEqual({ message: "falhou" });
  });
});
