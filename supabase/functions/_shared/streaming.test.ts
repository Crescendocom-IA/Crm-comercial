import { describe, it, expect } from "vitest";
import { toOpenAIStream } from "./streaming";

// ── Helpers ────────────────────────────────────────────────────────────────
function streamDe(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function coletar(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

/** Extrai os textos (choices[0].delta.content) das linhas data: da saída. */
function conteudos(saida: string): string[] {
  return saida
    .split("\n")
    .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
    .map((l) => JSON.parse(l.slice(6)).choices[0].delta.content);
}

function deltaAnthropic(text: string): string {
  return `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n`;
}

// ── Testes ─────────────────────────────────────────────────────────────────
describe("toOpenAIStream — Anthropic SSE → OpenAI", () => {
  it("converte content_block_delta completos em choices[].delta.content", async () => {
    const saida = await coletar(toOpenAIStream(streamDe([deltaAnthropic("Olá"), deltaAnthropic(" mundo")])));
    expect(conteudos(saida)).toEqual(["Olá", " mundo"]);
  });

  it("remonta um evento cortado no meio entre dois chunks da rede", async () => {
    const linha = deltaAnthropic("fragmentado");
    const corte = Math.floor(linha.length / 2);
    const saida = await coletar(toOpenAIStream(streamDe([linha.slice(0, corte), linha.slice(corte)])));
    expect(conteudos(saida)).toEqual(["fragmentado"]);
  });

  it("lida com terminador \\r\\n", async () => {
    const linha = `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "crlf" } })}\r\n`;
    const saida = await coletar(toOpenAIStream(streamDe([linha])));
    expect(conteudos(saida)).toEqual(["crlf"]);
  });

  it("ignora eventos ping (e qualquer não-delta)", async () => {
    const chunks = [
      `data: ${JSON.stringify({ type: "ping" })}\n`,
      `data: ${JSON.stringify({ type: "message_start" })}\n`,
      deltaAnthropic("real"),
    ];
    const saida = await coletar(toOpenAIStream(streamDe(chunks)));
    expect(conteudos(saida)).toEqual(["real"]);
  });

  it("preserva aspas e barras escapadas no texto", async () => {
    const texto = 'ele disse "oi" e usou \\ barra';
    const saida = await coletar(toOpenAIStream(streamDe([deltaAnthropic(texto)])));
    // O conteúdo decodificado é idêntico ao original (round-trip do escape).
    expect(conteudos(saida)).toEqual([texto]);
  });

  it("sempre termina com [DONE], mesmo sem nenhum delta", async () => {
    const saida = await coletar(toOpenAIStream(streamDe([`data: ${JSON.stringify({ type: "ping" })}\n`])));
    expect(conteudos(saida)).toEqual([]);
    expect(saida.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
