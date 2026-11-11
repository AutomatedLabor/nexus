"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Benchmark } from "@/types/atlas";

interface BenchmarkBarChartProps {
  benchmarks: Benchmark[];
}

const chartConfig: ChartConfig = {
  duration: { label: "Duration", color: "var(--chart-1)" },
};

export function BenchmarkBarChart({ benchmarks }: BenchmarkBarChartProps) {
  const data = benchmarks
    .filter((b) => b.latestRunMs !== null)
    .map((b) => ({
      name: b.name,
      duration: Number((b.latestRunMs ?? 0).toFixed(2)),
    }))
    .sort((a, b) => b.duration - a.duration);

  if (data.length === 0) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted-foreground">
        No benchmark data yet.
      </div>
    );
  }

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="h-64 w-full" aria-label="Benchmark latest duration bar chart">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 24 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.4} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            unit="ms"
          />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            width={120}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={<ChartTooltipContent />}
            formatter={(value) => [`${value} ms`, "Duration"]}
          />
          <Bar dataKey="duration" fill="var(--color-duration)" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey="duration"
              position="right"
              formatter={(v: number) => `${v.toFixed(1)}ms`}
              style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.name}>
            {d.name}: {d.duration} milliseconds
          </li>
        ))}
      </ul>
    </div>
  );
}
