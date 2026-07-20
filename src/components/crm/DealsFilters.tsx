import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface DealFilters {
  search?: string;
  ownerId?: string;
  minValue?: number;
  maxValue?: number;
  closeDateFrom?: string;
  closeDateTo?: string;
}

interface DealsFiltersProps {
  filters: DealFilters;
  onFiltersChange: (f: DealFilters) => void;
  members: Profile[];
}

export function DealsFilters({ filters, onFiltersChange, members }: DealsFiltersProps) {
  /*
   * `search` faz parte de DealFilters mas é editado no header da página, fora
   * deste painel. Por isso não conta para "há filtros ativos" nem é apagado
   * pelo Limpar — senão o botão apareceria por causa de uma busca digitada em
   * outro lugar, e limpar os filtros zeraria a busca junto.
   */
  const hasFilters = Object.entries(filters)
    .some(([k, v]) => k !== "search" && v !== undefined && v !== "");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-xs">Responsável</Label>
        <Select
          value={filters.ownerId || "all"}
          onValueChange={(v) => onFiltersChange({ ...filters, ownerId: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Valor mín.</Label>
        <Input
          type="number"
          className="w-28 h-8 text-xs"
          placeholder="0"
          value={filters.minValue ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, minValue: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Valor máx.</Label>
        <Input
          type="number"
          className="w-28 h-8 text-xs"
          placeholder="∞"
          value={filters.maxValue ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, maxValue: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Fechamento de</Label>
        <Input
          type="date"
          className="w-36 h-8 text-xs"
          value={filters.closeDateFrom ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, closeDateFrom: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">até</Label>
        <Input
          type="date"
          className="w-36 h-8 text-xs"
          value={filters.closeDateTo ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, closeDateTo: e.target.value || undefined })}
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground"
          onClick={() => onFiltersChange({ search: filters.search })}
        >
          <X className="mr-1 h-3 w-3" />Limpar
        </Button>
      )}
    </div>
  );
}
