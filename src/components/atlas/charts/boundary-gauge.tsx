"use client";

import { cn } from "@/lib/utils";

interface BoundaryGaugeProps {
  value: number;
  max: number;
  limit: number;
  unit?: string;
  label?: string;
  className?: string;
}

/**
 * A semicircle SVG gauge that shows `value` out of `max`, with a hard `limit`
 * marker drawn as a red arc tick at the corresponding angle.
 */
export function BoundaryGauge({
  value,
  max,
  limit,
  unit = "MB",
  label = "Memory",
  className,
}: BoundaryGaugeProps) {
  const clamped = Math.max(0, Math.min(value, max));
  const pct = max > 0 ? clamped / max : 0;
  const limitPct = max > 0 ? Math.min(limit, max) / max : 0;

  const w = 280;
  const h = 160;
  const cx = w / 2;
  const cy = h - 16;
  const r = 110;
  const startAngle = Math.PI; // 180°
  const endAngle = 0; // 0°

  const polar = (angleRad: number, radius: number) => ({
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  });

  const arcPath = (fromPct: number, toPct: number, radius: number) => {
    const fromAngle = startAngle + (endAngle - startAngle) * fromPct;
    const toAngle = startAngle + (endAngle - startAngle) * toPct;
    const a = polar(fromAngle, radius);
    const b = polar(toAngle, radius);
    const largeArc = Math.abs(toAngle - fromAngle) > Math.PI ? 1 : 0;
    const sweep = endAngle > startAngle ? 1 : 0;
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };

  // Coloured track from start → limit (green/amber), then red from limit → max
  const isOverLimit = clamped > limit;
  const valueEndPct = Math.min(pct, limitPct);
  const overPct = Math.max(0, Math.min(pct, 1) - limitPct);

  const needleAngle = startAngle + (endAngle - startAngle) * Math.min(pct, 1);
  const needle = polar(needleAngle, r - 12);
  const needleBase1 = polar(needleAngle + 0.04, 4);
  const needleBase2 = polar(needleAngle - 0.04, 4);

  const pctStr = (pct * 100).toFixed(1);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        role="img"
        aria-label={`${label} gauge: ${clamped} ${unit} used of ${max} ${unit}; hard limit ${limit} ${unit}; ${pctStr}% of capacity.`}
      >
        {/* Track */}
        <path
          d={arcPath(0, 1, r)}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Below-limit portion */}
        <path
          d={arcPath(0, valueEndPct, r)}
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {/* Over-limit portion (red) */}
        {overPct > 0 && (
          <path
            d={arcPath(limitPct, limitPct + overPct, r)}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={14}
            strokeLinecap="round"
          />
        )}
        {/* Remaining within-limit idle */}
        {valueEndPct < limitPct && (
          <path
            d={arcPath(valueEndPct, limitPct, r)}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.25}
          />
        )}
        {/* Over-limit warning zone */}
        {limitPct < 1 && (
          <path
            d={arcPath(limitPct, 1, r)}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.25}
          />
        )}

        {/* Hard limit marker tick */}
        {limitPct > 0 && limitPct < 1 && (
          <line
            x1={polar(startAngle + (endAngle - startAngle) * limitPct, r - 22).x}
            y1={polar(startAngle + (endAngle - startAngle) * limitPct, r - 22).y}
            x2={polar(startAngle + (endAngle - startAngle) * limitPct, r + 2).x}
            y2={polar(startAngle + (endAngle - startAngle) * limitPct, r + 2).y}
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}

        {/* Needle */}
        <polygon
          points={`${needle.x},${needle.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={isOverLimit ? "#f43f5e" : "var(--foreground)"}
          opacity={0.85}
        />
        <circle cx={cx} cy={cy} r={6} fill="var(--foreground)" />

        <text
          x={cx}
          y={cy - 44}
          textAnchor="middle"
          fontSize={28}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {clamped.toLocaleString()}
          <tspan fontSize={12} dx={4} fill="var(--muted-foreground)">
            {unit}
          </tspan>
        </text>
        <text
          x={cx}
          y={cy - 22}
          textAnchor="middle"
          fontSize={11}
          fill="var(--muted-foreground)"
        >
          {pctStr}% of {max.toLocaleString()} {unit}
        </text>
      </svg>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
            isOverLimit
              ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          )}
        >
          {isOverLimit ? "Over hard limit" : "Within hard limit"}
        </span>
        <span>
          Hard limit: <strong className="text-foreground tabular-nums">{limit.toLocaleString()} {unit}</strong>
        </span>
      </div>
    </div>
  );
}
