/**
 * Converte o SSE da Anthropic para o formato OpenAI-compatible.
 *
 * O frontend do FlowCRM nasceu falando o dialeto da OpenAI
 * (`choices[0].delta.content` + `[DONE]`). Na migração para a Anthropic, em vez
 * de reescrever os parsers do cliente, a conversão passou a acontecer aqui — o
 * que mantém os componentes de chat intactos e concentra o formato num lugar só.
 *
 * Extraído de ai-copilot e ai-sales-manager, que tinham cópias idênticas: três
 * funções de streaming com o mesmo parser divergiriam na primeira correção
 * feita em apenas uma delas.
 *
 * @param body Stream cru vindo da API da Anthropic.
 * @param label Identificador nos logs, para saber qual função falhou.
 */
export function toOpenAIStream(
  body: ReadableStream<Uint8Array>,
  label = "stream",
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Processa linha a linha: um chunk da rede pode cortar um evento no
          // meio, então só o que vem antes de um \n está completo.
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (!payload) continue;

            try {
              const event = JSON.parse(payload);
              if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ choices: [{ delta: { content: event.delta.text } }] })}\n\n`,
                  ),
                );
              } else if (event.type === "error") {
                console.error(`[${label}] erro no stream da Anthropic:`, event.error);
              }
            } catch {
              // Evento parcial ou não-JSON: ignora e segue.
            }
          }
        }
      } catch (e) {
        console.error(`[${label}] falha lendo o stream:`, e);
      } finally {
        // O [DONE] sai sempre, inclusive em erro: sem ele o cliente fica
        // esperando para sempre por um fim que não vem.
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

export const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};
