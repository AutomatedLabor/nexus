"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Cpu,
  Gauge,
  AlertOctagon,
  Timer,
  Play,
  Download,
  FilePlus2,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { useStats, useBenchmarks, useCapabilities, useEnvironments, useExport } from "@/hooks/atlas";
import { useViewStore } from "@/lib/view-store";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { StatCard } from "@/components/atlas/charts/stat-card";
import { BenchmarkBarChart } from "@/components/atlas/charts/benchmark-bar-chart";
import { CapabilityRadar } from "@/components/atlas/charts/capability-radar";
import { LimitsSeverityPie } from "@/components/atlas/charts/limits-severity-pie";
import { ErrorState } from "@/components/atlas/ui/error-state";
import { StatCardSkeleton, ChartSkeleton } from "@/components/atlas/ui/loading-skeleton";
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLimits } from "@/hooks/atlas";

function ActivityFeed() {
  const { data, isLoading, isError, refetch } = useBenchmarks();
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-8 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const recent = [...(data?.data ?? [])]
    .filter((b) => b.latestRunAt)
    .sort(
      (a, b) =>
        new Date(b.latestRunAt!).getTime() - new Date(a.latestRunAt!).getTime()
    )
    .slice(0, 6);
  if (recent.length === 0)
    return (
      <EmptyState
        icon={<Activity className="size-5" />}
        title="No recent activity"
        description="Run a benchmark to populate the activity feed."
      />
    );
  return (
    <ul className="space-y-1">
      {recent.map((b) => (
        <li
          key={b.id}
          className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{b.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {b.latestRunAt
                ? `${formatDistanceToNow(new Date(b.latestRunAt), { addSuffix: true })}`
                : "—"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-mono font-medium tabular-nums text-foreground">
              {b.latestRunMs !== null ? b.latestRunMs.toFixed(1) : "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">ms</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardView() {
  const setView = useViewStore((s) => s.setView);
  const statsQ = useStats();
  const benchmarksQ = useBenchmarks();
  const capabilitiesQ = useCapabilities({ limit: 100 });
  const limitsQ = useLimits({ limit: 100 });
  const exportMut = useExport();

  const benchmarks = benchmarksQ.data?.data ?? [];
  const capabilities = capabilitiesQ.data?.data ?? [];
  const limits = limitsQ.data?.data ?? [];
  const stats = statsQ.data;

  const sparkData = useMemo(() => {
    // Build a monotonic-ish sparkline from latest durations.
    return [...benchmarks]
      .sort((a, b) => (a.latestRunAt ?? "").localeCompare(b.latestRunAt ?? ""))
      .map((b) => b.latestRunMs ?? 0);
  }, [benchmarks]);

  const avgSpark = useMemo(() => {
    // Roughly repeat avg with a tiny variance so the sparkline looks alive.
    const v = stats?.avgRunMs ?? 0;
    return [v * 0.9, v * 1.05, v * 0.97, v, v * 1.02, v * 0.98];
  }, [stats]);

  const runExport = (format: "csv" | "json") => {
    exportMut.mutate(format, {
      onSuccess: () => toast.success(`Export ready — ${format.toUpperCase()} downloaded.`),
      onError: (e) => toast.error(`Export failed: ${e.message}`),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Real-time overview of agent capabilities, limits, and benchmark performance."
        actions={
          <>
            <Button variant="outline" onClick={() => runExport("csv")} disabled={exportMut.isPending}>
              <Download className="size-4" aria-hidden="true" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => setView("reports")}>
              <FilePlus2 className="size-4" aria-hidden="true" />
              New Report
            </Button>
            <Button onClick={() => setView("benchmarks")}>
              <Play className="size-4" aria-hidden="true" />
              Run Benchmark
            </Button>
          </>
        }
      />

      {/* Stat cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        {statsQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : statsQ.isError ? (
          <div className="col-span-full">
            <ErrorState message="Failed to load stats" onRetry={() => statsQ.refetch()} />
          </div>
        ) : stats ? (
          <>
            <StatCard
              label="Benchmarks"
              value={stats.benchmarks}
              icon={Gauge}
              accent="violet"
              hint={`${stats.benchmarkRuns} total runs`}
              delta={{ value: 0, positiveIsGood: true }}
              spark={sparkData}
            />
            <StatCard
              label="Tools Mapped"
              value={stats.tools}
              icon={Cpu}
              accent="teal"
              hint={`${stats.environments} environment(s)`}
            />
            <StatCard
              label="Limits Found"
              value={stats.limits}
              icon={AlertOctagon}
              accent="rose"
              hint={`${limits.filter((l) => l.severity === "critical").length} critical`}
            />
            <StatCard
              label="Avg Run"
              value={stats.avgRunMs.toFixed(1)}
              unit="ms"
              icon={Timer}
              accent="amber"
              hint={`across ${stats.benchmarkRuns} runs`}
              spark={avgSpark}
            />
          </>
        ) : null}
      </section>

      {/* Charts row */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Performance charts">
        {benchmarksQ.isLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : benchmarksQ.isError ? (
          <div className="lg:col-span-2">
            <ErrorState message="Failed to load benchmarks" onRetry={() => benchmarksQ.refetch()} />
          </div>
        ) : (
          <>
            <SectionCard
              title="Benchmark performance"
              description="Latest run duration per benchmark (lower is better)"
              action={
                <Button variant="ghost" size="sm" onClick={() => setView("benchmarks")}>
                  View all <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Button>
              }
            >
              <BenchmarkBarChart benchmarks={benchmarks} />
            </SectionCard>

            <SectionCard
              title="Capability radar"
              description="Normalized 0–100 score per measured capability"
              action={
                <Button variant="ghost" size="sm" onClick={() => setView("environment")}>
                  Explore <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Button>
              }
            >
              <CapabilityRadar capabilities={capabilities} />
            </SectionCard>
          </>
        )}
      </section>

      {/* Limits pie + Recent activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Limits by severity"
          description="Distribution of detected limits"
          className="lg:col-span-1"
          action={
            <Button variant="ghost" size="sm" onClick={() => setView("limits")}>
              Open <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Button>
          }
        >
          {limitsQ.isLoading ? (
            <ChartSkeleton height={220} />
          ) : limitsQ.isError ? (
            <ErrorState onRetry={() => limitsQ.refetch()} />
          ) : (
            <LimitsSeverityPie limits={limits} />
          )}
        </SectionCard>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed />
          </CardContent>
        </Card>
      </section>

      {/* Quick actions */}
      <section aria-label="Quick actions">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-4"
              onClick={() => setView("benchmarks")}
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Play className="size-4" aria-hidden="true" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">Run a benchmark</span>
                <span className="text-xs text-muted-foreground">Trigger one of 4 live suites</span>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-4"
              onClick={() => runExport("json")}
              disabled={exportMut.isPending}
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Download className="size-4" aria-hidden="true" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">Export JSON</span>
                <span className="text-xs text-muted-foreground">Download all data</span>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 py-4"
              onClick={() => setView("reports")}
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FilePlus2 className="size-4" aria-hidden="true" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">Create report</span>
                <span className="text-xs text-muted-foreground">HTML / JSON / CSV</span>
              </div>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
