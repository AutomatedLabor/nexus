"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, Info, Sliders } from "lucide-react";
import { useLimits } from "@/hooks/atlas";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { ErrorState } from "@/components/atlas/ui/error-state";
import { CardGridSkeleton } from "@/components/atlas/ui/loading-skeleton";
import { SeverityBadge, KindBadge } from "@/components/atlas/ui/status-badge";
import { BoundaryGauge } from "@/components/atlas/charts/boundary-gauge";
import { LimitsSeverityPie } from "@/components/atlas/charts/limits-severity-pie";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { Limit, LimitSeverity } from "@/types/atlas";

const severityMeta: Record<LimitSeverity, { ring: string; bg: string; text: string; icon: typeof AlertOctagon }> = {
  critical: {
    ring: "ring-rose-500/30",
    bg: "bg-rose-500/5",
    text: "text-rose-600 dark:text-rose-400",
    icon: AlertOctagon,
  },
  warning: {
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    icon: AlertTriangle,
  },
  info: {
    ring: "ring-slate-500/30",
    bg: "bg-slate-500/5",
    text: "text-slate-600 dark:text-slate-300",
    icon: Info,
  },
};

function LimitCard({ limit }: { limit: Limit }) {
  const meta = severityMeta[limit.severity] ?? severityMeta.info;
  const Icon = meta.icon;
  return (
    <Card className={`gap-2 p-5 ${meta.bg}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex size-8 items-center justify-center rounded-lg ${meta.bg} ${meta.text}`}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-sm font-medium text-foreground">
              {limit.resource}
            </p>
            <SeverityBadge severity={limit.severity} />
          </div>
        </div>
        <KindBadge kind={limit.kind} />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums text-foreground">
          {limit.limitValue}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {limit.unit}
          </span>
        </p>
      </div>
      {limit.details && (
        <p className="line-clamp-3 text-xs text-muted-foreground">{limit.details}</p>
      )}
    </Card>
  );
}

export function LimitsView() {
  const [severity, setSeverity] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const limitsQ = useLimits({ severity, kind, limit: 100 });

  const kinds = useMemo(() => {
    const set = new Set<string>();
    // Pull kinds from a broad query (using same query since limit=100 already)
    (limitsQ.data?.data ?? []).forEach((l) => set.add(l.kind));
    return Array.from(set).sort();
  }, [limitsQ.data]);

  // Memory limit explorer state
  const memoryLimitMb = useMemo(() => {
    const m = (limitsQ.data?.data ?? []).find((l) => l.resource === "memory");
    return m ? parseInt(m.limitValue, 10) || 4100 : 4100;
  }, [limitsQ.data]);

  const [sliderValue, setSliderValue] = useState<number>(2048);

  const limits = limitsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Limits Map"
        description="Resource, capability, and architectural limits detected on the environment."
      />

      {/* Boundary explorer */}
      <SectionCard
        title="Memory boundary explorer"
        description="Drag the slider to see how a memory allocation compares to the detected hard memory limit."
        action={<Sliders className="size-4 text-muted-foreground" aria-hidden="true" />}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 flex items-end justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Requested memory
                </span>
                <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                  {sliderValue.toLocaleString()} MB
                </span>
              </div>
              <Slider
                value={[sliderValue]}
                min={0}
                max={8192}
                step={64}
                onValueChange={(v) => setSliderValue(v[0] ?? 0)}
                aria-label="Requested memory in MB"
              />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>0 MB</span>
                <span>8192 MB</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Requested</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {sliderValue.toLocaleString()} MB
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hard limit</p>
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {memoryLimitMb.toLocaleString()} MB
                </p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Headroom</p>
                <p
                  className={`text-sm font-medium tabular-nums ${
                    sliderValue > memoryLimitMb
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {(memoryLimitMb - sliderValue).toLocaleString()} MB
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This is a visual exploration only — no allocation is actually performed.
            </p>
          </div>
          <BoundaryGauge
            value={sliderValue}
            max={8192}
            limit={memoryLimitMb}
            unit="MB"
            label="Memory"
          />
        </div>
      </SectionCard>

      {/* Filters + severity pie */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Limits by severity"
          description="Breakdown across all detected limits"
          className="lg:col-span-1"
        >
          {limitsQ.isLoading ? (
            <div className="grid h-56 place-items-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <LimitsSeverityPie limits={limits} />
          )}
        </SectionCard>

        <SectionCard
          title="All limits"
          description="Filter by severity or kind to narrow the list"
          className="lg:col-span-2"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={severity || "__all__"} onValueChange={(v) => setSeverity(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-32" aria-label="Filter by severity">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kind || "__all__"} onValueChange={(v) => setKind(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-40" aria-label="Filter by kind">
                  <SelectValue placeholder="Kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All kinds</SelectItem>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(severity || kind) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSeverity("");
                    setKind("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          }
        >
          {limitsQ.isLoading ? (
            <CardGridSkeleton count={6} />
          ) : limitsQ.isError ? (
            <ErrorState message="Failed to load limits" onRetry={() => limitsQ.refetch()} />
          ) : limits.length === 0 ? (
            <EmptyState
              icon={<AlertOctagon className="size-5" />}
              title="No limits match your filters"
              description="Try clearing the severity or kind filters."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {limits.map((l) => (
                <LimitCard key={l.id} limit={l} />
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
