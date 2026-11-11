"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Tool } from "@/types/atlas";

interface ToolsCategoryBarProps {
  tools: Tool[];
}

const chartConfig: ChartConfig = {
  count: { label: "Tools", color: "var(--chart-2)" },
};

export function ToolsCategoryBar({ tools }: ToolsCategoryBarProps) {
  const map = new Map<string, { total: number; installed: number }>();
  for (const t of tools) {
    const cur = map.get(t.category) ?? { total: 0, installed: 0 };
    cur.total += 1;
    if (t.installed) cur.installed += 1;
    map.set(t.category, cur);
  }
  const data = Array.from(map.entries())
    .map(([category, c]) => ({
      category,
      total: c.total,
      installed: c.installed,
    }))
    .sort((a, b) => b.total - a.total);

  if (data.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-sm text-muted-foreground">
        No tools data.
      </div>
    );
  }

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="h-56 w-full" aria-label="Tool counts per category bar chart">
        <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
          <XAxis
            dataKey="category"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            allowDecimals={false}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={<ChartTooltipContent />}
            formatter={(value, name) => [`${value} tool(s)`, name === "total" ? "Total" : "Installed"]}
          />
          <Bar dataKey="total" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.category}>
            {d.category}: {d.installed}/{d.total} installed
          </li>
        ))}
      </ul>
    </div>
  );
}
