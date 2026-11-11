"use client";

import { cn } from "@/lib/utils";

interface MiniSparklineProps {
  values: number[];
  className?: string;
  "aria-label"?: string;
}

export function MiniSparkline({ values, className, ...aria }: MiniSparklineProps) {
  if (values.length < 2) return null;
  const w = 112;
  const h = 32;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const polyline = pts.join(" ");
  const areaPath = `M ${pad},${h - pad} L ${pts.join(" L ")} L ${w - pad},${h - pad} Z`;

  const lastX = pad + (values.length - 1) * step;
  const lastY = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className={cn("overflow-visible", className)}
      role="img"
      aria-label={aria["aria-label"] ?? "Sparkline trend"}
      preserveAspectRatio="none"
    >
      <polygon points={areaPath} fill="currentColor" opacity={0.12} />
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={2.4} fill="currentColor" />
    </svg>
  );
}
