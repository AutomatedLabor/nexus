"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BenchmarkRun } from "@/types/atlas";

interface PerformanceTimelineProps {
  runs: BenchmarkRun[];
}

const chartConfig: ChartConfig = {
  duration: { label: "Duration (ms)", color: "var(--chart-4)" },
};

export function PerformanceTimeline({ runs }: PerformanceTimelineProps) {
  const data = [...runs]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((r, i) => ({
      index: i + 1,
      createdAt: r.createdAt,
      duration: Number(r.durationMs.toFixed(2)),
      success: r.success,
    }));

  if (data.length === 0) {
    return (
      <div className="grid h-56 place-items-center text-sm text-muted-foreground">
        No benchmark runs recorded yet. Run a benchmark to populate this chart.
      </div>
    );
  }

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="h-56 w-full" aria-label="Benchmark run duration timeline">
        <LineChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
          <XAxis
            dataKey="index"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            allowDecimals={false}
            label={{ value: "Run #", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            unit="ms"
            width={56}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: 3 }}
            content={<ChartTooltipContent />}
            formatter={(value, _name, item) => {
              const p = item?.payload as { createdAt: string };
              return [`${value} ms`, new Date(p.createdAt).toLocaleString()];
            }}
          />
          <Line
            type="monotone"
            dataKey="duration"
            stroke="var(--color-duration)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-duration)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
