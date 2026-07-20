import { Suspense, lazy } from "react";

const ReactMarkdown = lazy(() => import("react-markdown"));

/**
 * react-markdown carrega junto o remark/unified inteiro. Importado no topo dos
 * dois chats de IA, ia parar no bundle do shell e era baixado por todo mundo no
 * first paint — inclusive por quem nunca abre o Copilot.
 *
 * O fallback é o próprio texto: enquanto o chunk chega, a resposta já aparece
 * legível, só sem formatação. Nada de spinner no meio de uma mensagem.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </Suspense>
  );
}
