"use client";

import * as React from "react";
import {
  Gauge,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Cpu,
  ListTree,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import { EmptyState } from "../ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { runAether } from "@/lib/aether-worker";
import { compileToVm } from "@aether/core";

/** A single benchmark — source code + label. */
interface Benchmark {
  id: string;
  label: string;
  description: string;
  code: string;
}

const BENCHMARKS: Benchmark[] = [
  {
    id: "fib-15",
    label: "fib(15)",
    description: "Recursive Fibonacci — 1973 calls.",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(15);`,
  },
  {
    id: "fib-20",
    label: "fib(20)",
    description: "Recursive Fibonacci — naive exponential.",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(20);`,
  },
  {
    id: "sum-50k",
    label: "sum 1..50k",
    description: "Sum integers from 1 to 50,000 via a for-loop.",
    code: `let mut s = 0;
for i in 1 .. 50001 { s = s + i; }
s;`,
  },
  {
    id: "sum-500k",
    label: "sum 1..500K",
    description: "Sum integers from 1 to 500,000 via a for-loop.",
    code: `let mut s = 0;
for i in 1 .. 500001 { s = s + i; }
s;`,
  },
  {
    id: "str-concat",
    label: "string concat 5k",
    description: "Build a 5,000-char string by concatenation.",
    code: `let mut s = "";
for i in 0 .. 5000 { s = s + "x"; }
len(s);`,
  },
  {
    id: "array-build",
    label: "array build 10k",
    description: "Construct a 10,000-element array with push.",
    code: `let mut a = [];
for i in 0 .. 10000 { push(a, i); }
len(a);`,
  },
  {
    id: "factorial-100",
    label: "factorial(100)",
    description: "100 calls of factorial (recursion).",
    code: `fn fact(n: int) -> int { if n <= 1 { 1 } else { n * fact(n - 1) } }
fact(100);`,
  },
];

interface BenchmarkResult {
  id: string;
  label: string;
  description: string;
  /** Tree-walker timing. */
  treeMs: number;
  treeSteps: number;
  treeOk: boolean;
  treeError: string | null;
  /** Bytecode VM timing. */
  vmMs: number;
  vmSteps: number;
  vmOk: boolean;
  vmError: string | null;
  /** Speedup = treeMs / vmMs (>=1 means VM is faster). */
  speedup: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function BenchmarksView() {
  const [results, setResults] = React.useState<BenchmarkResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [lastRun, setLastRun] = React.useState<number | null>(null);

  async function runAll() {
    setRunning(true);
    setProgress(0);
    const collected: BenchmarkResult[] = [];
    for (let i = 0; i < BENCHMARKS.length; i++) {
      const b = BENCHMARKS[i];
      // --- Tree-walker pass ---
      const treeHandle = await runAether(b.code, { maxSteps: 50_000_000 });
      // --- Bytecode VM pass ---
      let vmMs = 0;
      let vmSteps = 0;
      let vmOk = false;
      let vmError: string | null = null;
      try {
        const t0 = nowMs();
        const vmResult = compileToVm(b.code, { maxSteps: 50_000_000 });
        const t1 = nowMs();
        vmMs = t1 - t0;
        vmSteps = vmResult.runtime?.steps ?? 0;
        vmOk = vmResult.ok;
        vmError = vmResult.runtime?.error?.message ?? null;
      } catch (e) {
        vmError = (e as Error).message;
      }
      collected.push({
        id: b.id,
        label: b.label,
        description: b.description,
        treeMs: treeHandle.elapsedMs,
        treeSteps: treeHandle.result.runtime?.steps ?? 0,
        treeOk: treeHandle.result.ok,
        treeError: treeHandle.result.runtime?.error?.message ?? null,
        vmMs,
        vmSteps,
        vmOk,
        vmError,
        speedup: vmMs > 0 ? treeHandle.elapsedMs / vmMs : 0,
      });
      setProgress(((i + 1) / BENCHMARKS.length) * 100);
      setResults([...collected]);
      // Let the UI paint between iterations.
      await new Promise((r) => setTimeout(r, 30));
    }
    setRunning(false);
    setLastRun(Date.now());
  }

  const maxMs = Math.max(
    ...results.map((r) => Math.max(r.treeMs, r.vmMs)),
    0.001,
  );

  // Summary stats.
  const avgSpeedup =
    results.length > 0
      ? results.reduce((a, r) => a + r.speedup, 0) / results.length
      : 0;
  const vmWins = results.filter((r) => r.speedup > 1).length;
  const treeWins = results.filter((r) => r.speedup < 1).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Gauge className="size-5" />}
        title="Benchmark Dashboard"
        description="Run a fixed set of Aether programs on BOTH the v1 tree-walker and the v2 bytecode VM and compare timings side-by-side. Runs are synchronous, so the UI blocks briefly per benchmark."
        actions={
          <Button onClick={runAll} disabled={running}>
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {running ? "Running…" : "Run benchmarks"}
          </Button>
        }
      />

      {running && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <Progress value={progress} className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={<Zap className="size-4" />}
            label="Average speedup"
            value={avgSpeedup.toFixed(2) + "×"}
            hint="tree-walker ms / VM ms"
          />
          <SummaryCard
            icon={<Cpu className="size-4" />}
            label="VM wins"
            value={vmWins + " / " + results.length}
            hint="benchmarks where VM is faster"
          />
          <SummaryCard
            icon={<ListTree className="size-4" />}
            label="Tree-walker wins"
            value={treeWins + " / " + results.length}
            hint="benchmarks where tree-walker is faster"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Side-by-side results"
          description={
            lastRun
              ? `Last run completed at ${new Date(lastRun).toLocaleTimeString()}`
              : "Press Run benchmarks to populate this table."
          }
          icon={<Gauge className="size-4" />}
          className="lg:col-span-2"
        >
          {results.length === 0 ? (
            <EmptyState
              icon={<Gauge className="size-6" />}
              title="No results yet"
              description="Press the Run benchmarks button to execute all seven benchmarks on both runtimes in this browser."
            />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-background text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Benchmark</th>
                    <th className="py-2 pr-2 font-medium">Tree (ms)</th>
                    <th className="py-2 pr-2 font-medium">VM (ms)</th>
                    <th className="py-2 pr-2 font-medium">Speedup</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {r.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {r.description}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs tabular-nums">
                        {r.treeMs.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs tabular-nums">
                        {r.vmMs.toFixed(2)}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs tabular-nums">
                        <SpeedupBadge speedup={r.speedup} />
                      </td>
                      <td className="py-2">
                        {r.treeOk && r.vmOk ? (
                          <Badge
                            variant="outline"
                            className="gap-1 text-emerald-600 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="size-3" />
                            both ok
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            err
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="VM vs Tree-walker"
          description="Wall-clock ms per benchmark (lower is faster)."
          icon={<Cpu className="size-4" />}
        >
          {results.length === 0 ? (
            <EmptyState
              icon={<Gauge className="size-6" />}
              title="No chart yet"
              description="Run the benchmarks to see the comparison."
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={results}
                  margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickMargin={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickFormatter={(v) => v.toFixed(0)}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ opacity: 0.25 }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                    }}
                    formatter={(v: number, n: string) => [v.toFixed(2) + " ms", n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="treeMs" name="Tree-walker" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="vmMs" name="Bytecode VM" fill="var(--chart-2, #10b981)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Longest run: {maxMs.toFixed(2)} ms.
          </p>
        </SectionCard>

        <SectionCard
          title="Speedup by benchmark"
          description="Ratio tree-walker ms / VM ms (higher = VM faster)."
          icon={<Zap className="size-4" />}
          className="lg:col-span-3"
        >
          {results.length === 0 ? (
            <EmptyState
              icon={<Zap className="size-6" />}
              title="No chart yet"
              description="Run the benchmarks to see the speedup."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={results}
                  margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickMargin={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    tickFormatter={(v) => v.toFixed(1) + "×"}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ opacity: 0.25 }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                    }}
                    formatter={(v: number) => [v.toFixed(2) + "×", "Speedup"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="speedup"
                    name="Speedup (×)"
                    stroke="var(--chart-2, #10b981)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--chart-2, #10b981)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Notes"
        description="About these benchmarks."
        icon={<Gauge className="size-4" />}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Every benchmark runs twice — once on the v1 tree-walker
            (<code className="font-mono text-xs">compileAndRun</code>) and once
            on the v2 bytecode VM (<code className="font-mono text-xs">compileToVm</code>) —
            with the same source, same browser, same JIT warm-up.
          </li>
          <li>
            Wall-clock time is measured with{" "}
            <code className="font-mono text-xs">performance.now()</code> and
            includes lex + parse + check + (run | lower + codegen + interpret).
          </li>
          <li>
            The tree-walker is faster for small REPL workloads (low latency, no
            IR/codegen overhead); the VM is faster for hot loops and deep
            recursion (fib, sum, factorial). The mix is intentional — both
            runtimes ship together.
          </li>
          <li>
            Results vary by browser, machine, and whether the JIT has warmed
            up. Use them only as a rough relative guide.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-lg font-semibold text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}

function SpeedupBadge({ speedup }: { speedup: number }) {
  if (!isFinite(speedup) || speedup === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const tone =
    speedup >= 1.05
      ? "text-emerald-600 dark:text-emerald-400"
      : speedup <= 0.95
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <span className={tone}>
      {speedup >= 1 ? "×" : "×"}{speedup.toFixed(2)}
    </span>
  );
}
