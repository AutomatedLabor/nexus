"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Capability } from "@/types/atlas";

interface CapabilityRadarProps {
  capabilities: Capability[];
  max?: number;
}

const chartConfig: ChartConfig = {
  value: { label: "Capability", color: "var(--chart-3)" },
};

export function CapabilityRadar({ capabilities }: CapabilityRadarProps) {
  // Pick numeric capabilities, normalize each axis 0..100 by max value among selected.
  const numeric = capabilities.filter((c) => typeof c.value === "number" && isFinite(c.value));
  // Choose a representative set — prefer benchmark + filesystem with ms values (inverted so faster = bigger)
  // For radar we want larger = better, so we normalize and invert ms-based ones.
  const picked = numeric
    .filter((c) => c.unit === "ms" || c.unit === "count" || c.unit === "s")
    .slice(0, 8);

  if (picked.length < 3) {
    return (
      <div className="grid h-64 place-items-center text-sm text-muted-foreground">
        Not enough numeric capabilities to chart.
      </div>
    );
  }

  // For "ms" lower is better → invert; for count/s keep raw, normalize 0..100.
  const data = picked.map((c) => {
    const isLatency = c.unit === "ms" || c.unit === "s";
    // Use 1/value as score for latency so faster tasks score higher.
    return {
      name: c.name.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      raw: c.value,
      unit: c.unit,
      score: isLatency ? 1000 / Math.max(c.value, 1) : c.value,
    };
  });
  const maxScore = Math.max(...data.map((d) => d.score)) || 1;
  const normalized = data.map((d) => ({
    name: d.name,
    raw: d.raw,
    unit: d.unit,
    value: Math.round((d.score / maxScore) * 100),
  }));

  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="mx-auto h-64 w-full" aria-label="Capability radar chart">
        <RadarChart data={normalized} outerRadius="72%">
          <PolarGrid stroke="var(--border)" strokeOpacity={0.5} />
          <PolarAngleAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <ChartTooltip content={<ChartTooltipContent />} formatter={(value, _name, item) => {
            const p = item?.payload as { raw: number; unit: string };
            return [`${value}/100 (raw ${p.raw} ${p.unit})`, "Capability"];
          }} />
          <Radar
            dataKey="value"
            stroke="var(--color-value)"
            fill="var(--color-value)"
            fillOpacity={0.32}
            strokeWidth={2}
          />
        </RadarChart>
      </ChartContainer>
      <ul className="sr-only">
        {normalized.map((d) => (
          <li key={d.name}>
            {d.name}: score {d.value} of 100 (raw {d.raw} {d.unit})
          </li>
        ))}
      </ul>
    </div>
  );
}
