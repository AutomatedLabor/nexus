"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MiniSparkline } from "./mini-sparkline";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  accent?: "emerald" | "rose" | "amber" | "slate" | "violet" | "teal";
  delta?: { value: number; positiveIsGood?: boolean };
  spark?: number[];
  hint?: string;
  className?: string;
}

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  teal: "bg-teal-500/12 text-teal-600 dark:text-teal-400",
};

export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  accent = "slate",
  delta,
  spark,
  hint,
  className,
}: StatCardProps) {
  const deltaUp = (delta?.value ?? 0) >= 0;
  const positiveIsGood = delta?.positiveIsGood ?? true;
  const good = deltaUp === positiveIsGood;

  return (
    <Card className={cn("gap-0 p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </span>
            {unit && (
              <span className="text-xs font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accentMap[accent])}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
      {(delta || (spark && spark.length > 1)) && (
        <div className="mt-4 flex items-end justify-between gap-3">
          {delta && (
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium tabular-nums",
                  good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
              >
                {deltaUp ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                )}
                {Math.abs(delta.value).toFixed(1)}%
              </span>
              <span className="text-muted-foreground">vs prev</span>
            </div>
          )}
          {spark && spark.length > 1 && (
            <MiniSparkline
              values={spark}
              className={cn("h-8 w-28", good ? "text-emerald-500" : "text-rose-500")}
              aria-label={`${label} trend`}
            />
          )}
        </div>
      )}
    </Card>
  );
}
