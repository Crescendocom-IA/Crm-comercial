import { useState } from "react";
import { Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface FunnelStage {
  name: string;
  count: number;
  value: number;
  color: string;
}

type Metric = "count" | "value";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 11,
};

/**
 * Funil de vendas em formato de funil (trapézios), alternando entre
 * quantidade de negócios e valor em R$.
 *
 * `showConversion` mostra a % de passagem de cada etapa para a seguinte — só
 * faz sentido quando os dados são cumulativos ("chegou até a etapa", vindos de
 * deal_funnel). Na foto atual do pipeline uma etapa da frente pode ter mais
 * negócios que a anterior, e a % passaria de 100.
 */
export function SalesFunnelChart({
  stages,
  showConversion = false,
  height = 260,
}: {
  stages: FunnelStage[];
  showConversion?: boolean;
  height?: number;
}) {
  const [metric, setMetric] = useState<Metric>("count");
  const total = stages.reduce((s, st) => s + st[metric], 0);

  if (stages.length === 0 || total === 0) {
    return <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>;
  }

  // O Recharts some com trapézios de valor 0; um mínimo mantém a etapa visível
  // (o rótulo continua mostrando o número real).
  const maxVal = Math.max(...stages.map((s) => s[metric]));
  const data = stages.map((s, i) => {
    const prev = stages[i - 1];
    const conversion = showConversion && prev && prev.count > 0 ? Math.round((s.count / prev.count) * 100) : null;
    return {
      ...s,
      plot: Math.max(s[metric], maxVal * 0.04),
      label: metric === "count" ? `${s.count}` : fmtBRL(s.value),
      conversion,
    };
  });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ToggleGroup type="single" size="sm" value={metric} onValueChange={(v) => v && setMetric(v as Metric)}>
          <ToggleGroupItem value="count" className="h-6 px-2 text-xs">Quantidade</ToggleGroupItem>
          <ToggleGroupItem value="value" className="h-6 px-2 text-xs">Valor</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
        <ResponsiveContainer width="100%" height={height}>
          <FunnelChart>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(_v, _n, item) => {
                const p = item.payload as (typeof data)[number];
                return [`${p.count} negócios · ${fmtBRL(p.value)}`, p.name];
              }}
            />
            <Funnel dataKey="plot" nameKey="name" data={data} isAnimationActive lastShapeType="rectangle">
              {data.map((s) => <Cell key={s.name} fill={s.color} />)}
              <LabelList dataKey="label" position="center" fill="#fff" stroke="none" fontSize={11} fontWeight={600} />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
        <ul className="space-y-1 text-xs min-w-[120px]" aria-label="Etapas do funil">
          {data.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate font-medium">{s.name}</span>
              {s.conversion !== null && <span className="ml-auto text-muted-foreground">{s.conversion}%</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
