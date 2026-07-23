import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Marca registros que vêm do ERP.
 *
 * A política desta fase é: o ERP sobrescreve o CRM no próximo sync, sem merge
 * nem preservação de edições locais. O badge existe justamente para isso não
 * ser uma surpresa — quem edita um registro marcado precisa saber que a
 * alteração pode ser desfeita.
 *
 * Não renderiza nada quando a origem é o próprio CRM, então dá para chamar
 * direto na lista sem condicional no call site.
 */
export function ErpBadge({ syncSource }: { syncSource?: string | null }) {
  if (syncSource !== "erp") return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-xs font-normal cursor-help">
            ERP
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          Este registro é sincronizado do ERP — alterações podem ser sobrescritas
          no próximo sync.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
