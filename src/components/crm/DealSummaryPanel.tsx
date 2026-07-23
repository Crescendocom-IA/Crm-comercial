import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/crm/Markdown";
import { Copy, Check, Sparkles, RotateCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUMMARY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-deal-summary`;

interface Props {
  dealId: string;
  dealTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealSummaryPanel({ dealId, dealTitle, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Aborta o stream se o painel fechar no meio — sem isto a resposta continua
  // chegando e escrevendo em estado de componente que ninguém mais vê.
  const abortRef = useRef<AbortController | null>(null);

  const gerar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    setTexto("");

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Precisa do access_token da sessão: a publishable key não representa um
      // usuário e a função responde 401.
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(SUMMARY_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ deal_id: dealId }),
      });

      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        setErro(d.error || "Não foi possível gerar o resumo.");
        setCarregando(false);
        return;
      }
      if (!resp.body) {
        setErro("Resposta vazia do servidor.");
        setCarregando(false);
        return;
      }

      // Mesmo parser do AICopilot: a função converte o SSE da Anthropic para o
      // formato OpenAI-compatible antes de mandar.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const chunk = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (chunk) setTexto((t) => t + chunk);
          } catch {
            // Evento cortado no meio: devolve ao buffer e espera o resto.
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setErro("Erro de conexão. Verifique sua internet.");
      }
    } finally {
      setCarregando(false);
    }
  }, [dealId]);

  // Gera ao abrir; aborta ao fechar.
  useEffect(() => {
    if (open) void gerar();
    else abortRef.current?.abort();
    return () => abortRef.current?.abort();
  }, [open, gerar]);

  const copiar = () => {
    void navigator.clipboard.writeText(texto);
    setCopiado(true);
    toast({ title: "Resumo copiado" });
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Resumo com IA
          </SheetTitle>
          <SheetDescription className="truncate">{dealTitle}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {erro && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{erro}</p>
            </div>
          )}

          {/* Enquanto nada chegou, skeleton. Assim que o primeiro token cai, o
              texto aparece e cresce — é o streaming visível ao usuário. */}
          {carregando && !texto && !erro && (
            <div className="space-y-3" role="status" aria-label="Gerando resumo">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-4 w-1/4 mt-4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}

          {texto && (
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_p]:text-sm [&_li]:text-sm">
              <Markdown>{texto}</Markdown>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={copiar} disabled={!texto || carregando}>
              {copiado ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              Copiar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void gerar()} disabled={carregando}>
              <RotateCw className={`mr-1 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
              Gerar de novo
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
