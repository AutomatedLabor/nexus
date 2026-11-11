"use client";

import { useMemo, useState } from "react";
import { Play, Gauge, History, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  useBenchmarks,
  useBenchmark,
  useRunBenchmark,
} from "@/hooks/atlas";
import { useNotificationPrefs } from "@/lib/view-store";
import { PageHeader } from "@/components/atlas/ui/page-header";
import { SectionCard } from "@/components/atlas/ui/section-card";
import { EmptyState } from "@/components/atlas/ui/empty-state";
import { ErrorState } from "@/components/atlas/ui/error-state";
import { ChartSkeleton, TableSkeleton } from "@/components/atlas/ui/loading-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PerformanceTimeline } from "@/components/atlas/charts/performance-timeline";
import { BenchmarkBarChart } from "@/components/atlas/charts/benchmark-bar-chart";
import type { BenchmarkRun } from "@/types/atlas";

const LIVE_RUNNABLE = new Set([
  "csv_generate_1m",
  "sha256_10k",
  "fib_recursive_30",
  "matmul_100x100",
]);

function ResultCard({ run, name }: { run: BenchmarkRun; name: string }) {
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Gauge className="size-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">
              Completed at {new Date(run.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex w-full items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {run.durationMs.toFixed(2)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>
            </p>
          </div>
          {run.throughput !== null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Throughput</p>
              <p className="text-lg font-medium tabular-nums text-foreground">
                {run.throughput.toLocaleString()} ops/s
              </p>
            </div>
          )}
          <Badge variant="secondary" className="ml-auto border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Success
          </Badge>
        </div>
        {run.details && (
          <p className="text-xs text-muted-foreground">{run.details}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function BenchmarksView() {
  const benchmarksQ = useBenchmarks();
  const benchmarks = benchmarksQ.data?.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Derive the active selection — fall back to the first benchmark when none is selected.
  const activeId = selectedId ?? benchmarks[0]?.id ?? null;

  const detailQ = useBenchmark(activeId);
  const runMut = useRunBenchmark();
  const prefs = useNotificationPrefs();

  const [runnerName, setRunnerName] = useState<string>("");
  const [lastResult, setLastResult] = useState<BenchmarkRun | null>(null);
  const [lastResultName, setLastResultName] = useState<string>("");

  const selectedBenchmark = useMemo(
    () => benchmarks.find((b) => b.id === activeId) ?? null,
    [benchmarks, activeId]
  );

  const runBenchmark = () => {
    const name = runnerName || benchmarks.find((b) => LIVE_RUNNABLE.has(b.name))?.name;
    if (!name) {
      toast.error("No benchmark selected to run.");
      return;
    }
    if (!LIVE_RUNNABLE.has(name)) {
      toast.error(`"${name}" is not a live-runnable benchmark. Pick one of: ${Array.from(LIVE_RUNNABLE).join(", ")}.`);
      return;
    }
    runMut.mutate(
      { name },
      {
        onSuccess: (run) => {
          setLastResult(run);
          setLastResultName(name);
          if (prefs.toastOnBenchmarkComplete) {
            toast.success(`${name} finished in ${run.durationMs.toFixed(2)} ms`);
          }
        },
        onError: (e) => toast.error(`Run failed: ${e.message}`),
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benchmarks"
        description="Run live micro-benchmarks and inspect historical performance."
      />

      {/* Runner card */}
      <SectionCard
        title="Run a benchmark"
        description="Trigger a live micro-benchmark on the registered environment."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="bench-name">
              Benchmark
            </label>
            <Select value={runnerName} onValueChange={setRunnerName}>
              <SelectTrigger id="bench-name" className="w-full">
                <SelectValue placeholder="Select a benchmark" />
              </SelectTrigger>
              <SelectContent>
                {benchmarks.map((b) => (
                  <SelectItem key={b.id} value={b.name}>
                    {b.name}
                    {LIVE_RUNNABLE.has(b.name) ? "" : " (view only)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={runBenchmark}
            disabled={runMut.isPending}
            className="sm:w-auto"
          >
            <Play className="size-4" aria-hidden="true" />
            {runMut.isPending ? "Running…" : "Run now"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Live-runnable: <span className="font-mono">csv_generate_1m, sha256_10k, fib_recursive_30, matmul_100x100</span>.
          Other benchmarks are listed for inspection only.
        </p>
        {lastResult && (
          <div className="mt-4">
            <ResultCard run={lastResult} name={lastResultName} />
          </div>
        )}
      </SectionCard>

      {/* Comparison chart */}
      <SectionCard
        title="Benchmark comparison"
        description="Latest run duration across all benchmarks (lower is better)."
      >
        {benchmarksQ.isLoading ? (
          <ChartSkeleton />
        ) : benchmarksQ.isError ? (
          <ErrorState message="Failed to load benchmarks" onRetry={() => benchmarksQ.refetch()} />
        ) : (
          <BenchmarkBarChart benchmarks={benchmarks} />
        )}
      </SectionCard>

      {/* List + selected benchmark detail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="All benchmarks"
          description={`${benchmarks.length} benchmark suites registered`}
          className="lg:col-span-2"
        >
          {benchmarksQ.isLoading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : benchmarksQ.isError ? (
            <ErrorState message="Failed to load benchmarks" onRetry={() => benchmarksQ.refetch()} />
          ) : benchmarks.length === 0 ? (
            <EmptyState
              icon={<Gauge className="size-5" />}
              title="No benchmarks yet"
              description="Benchmarks appear here once they are registered."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {benchmarks.map((b) => {
                const active = b.id === activeId;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        active ? "bg-primary/5" : "hover:bg-muted"
                      }`}
                      aria-current={active ? "true" : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-mono text-sm font-medium text-foreground">
                            {b.name}
                          </p>
                          <Badge variant="outline" className="text-muted-foreground">
                            {b.category}
                          </Badge>
                          {LIVE_RUNNABLE.has(b.name) ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            >
                              Live
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {b.description ?? "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm tabular-nums text-foreground">
                          {b.latestRunMs !== null ? b.latestRunMs.toFixed(1) : "—"}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {b.runCount} run{b.runCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Performance history"
          description={
            selectedBenchmark
              ? `Run timeline for ${selectedBenchmark.name}`
              : "Select a benchmark"
          }
          action={
            selectedBenchmark ? (
              <Badge variant="outline" className="text-muted-foreground">
                {selectedBenchmark.runCount} run{selectedBenchmark.runCount === 1 ? "" : "s"}
              </Badge>
            ) : null
          }
        >
          {detailQ.isLoading ? (
            <ChartSkeleton height={200} />
          ) : detailQ.isError ? (
            <ErrorState message="Failed to load benchmark history" onRetry={() => detailQ.refetch()} />
          ) : !selectedBenchmark ? (
            <EmptyState
              icon={<History className="size-5" />}
              title="No benchmark selected"
              description="Pick a benchmark from the list to view its run history."
            />
          ) : (
            <div className="space-y-4">
              <PerformanceTimeline runs={detailQ.data?.runs ?? []} />
              <div className="rounded-lg border bg-card p-3 text-xs">
                <p className="text-muted-foreground">Latest run</p>
                <p className="mt-1 font-mono text-base font-medium text-foreground">
                  {selectedBenchmark.latestRunMs !== null
                    ? `${selectedBenchmark.latestRunMs.toFixed(2)} ms`
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
