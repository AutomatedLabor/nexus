"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Limit, LimitSeverity } from "@/types/atlas";

interface LimitsSeverityPieProps {
  limits: Limit[];
}

const chartConfig: ChartConfig = {
  critical: { label: "Critical", color: "#f43f5e" },
  warning: { label: "Warning", color: "#f59e0b" },
  info: { label: "Info", color: "#64748b" },
};

export function LimitsSeverityPie({ limits }: LimitsSeverityPieProps) {
  const counts: Record<LimitSeverity, number> = { critical: 0, warning: 0, info: 0 };
  limits.forEach((l) => {
    counts[l.severity] = (counts[l.severity] ?? 0) + 1;
  });
  const data = (Object.keys(counts) as LimitSeverity[])
    .map((k) => ({ name: k, value: counts[k] }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-sm text-muted-foreground">
        No limits recorded.
      </div>
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="mx-auto h-56 w-full" aria-label="Limits by severity pie chart">
        <PieChart>
          <ChartTooltip
            content={<ChartTooltipContent nameKey="name" />}
            formatter={(value, name) => [`${value} limit(s)`, name]}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={80}
            paddingAngle={2}
            strokeWidth={2}
            stroke="var(--background)"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={`var(--color-${d.name})`} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        {total} limits in total
      </p>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.name}>{d.name}: {d.value}</li>
        ))}
      </ul>
    </div>
  );
}
