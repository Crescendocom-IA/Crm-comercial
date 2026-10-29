import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** Texto secundário (e-mail, cidade…) — também entra na busca. */
  hint?: string | null;
}

const MAX_VISIBLE = 50;

/** Minúsculas e sem acento, para "joao" achar "João". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Substitui o <Select> quando as opções são milhares (empresas e contatos
 * vindos do ERP). Filtra em memória e desenha no máximo 50 itens — um Select
 * comum montaria um nó por opção e ficaria lento.
 *
 * `fixed` são opções sempre visíveis no topo (ex.: "Nenhuma", "Todas"), com o
 * mesmo contrato de valor que o Select usava ("none", "all").
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  fixed = [],
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  fixed?: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const indexed = useMemo(
    () => options.map((o) => ({ ...o, key: norm(`${o.label} ${o.hint ?? ""}`) })),
    [options],
  );

  const { visible, total } = useMemo(() => {
    const q = norm(query.trim());
    const matches = q ? indexed.filter((o) => o.key.includes(q)) : indexed;
    return { visible: matches.slice(0, MAX_VISIBLE), total: matches.length };
  }, [indexed, query]);

  const selected = [...fixed, ...options].find((o) => o.value === value);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 text-sm"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
          {[...fixed, ...visible].map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => pick(o.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Check className={cn("h-4 w-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>}
                </span>
              </button>
            </li>
          ))}
          {total === 0 && <li className="px-2 py-3 text-center text-sm text-muted-foreground">Nada encontrado</li>}
          {total > MAX_VISIBLE && (
            <li className="px-2 py-1.5 text-center text-xs text-muted-foreground">
              Mostrando {MAX_VISIBLE} de {total.toLocaleString("pt-BR")} — digite para refinar
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
