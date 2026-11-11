"use client";

import * as React from "react";
import {
  Gauge,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

/** A single benchmark — source code + label. */
interface Benchmark {
  id: string;
  label: string;
  description: string;
  code: string;
}

const BENCHMARKS: Benchmark[] = [
  {
    id: "fib-20",
    label: "fib(20)",
    description: "Recursive Fibonacci — naive exponential.",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(20);`,
  },
  {
    id: "fib-25",
    label: "fib(25)",
    description: "Recursive Fibonacci — heavier workload (~150k calls).",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(25);`,
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
  elapsedMs: number;
  steps: number;
  ok: boolean;
  error: string | null;
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
      const h = await runAether(b.code, { maxSteps: 50_000_000 });
      collected.push({
        id: b.id,
        label: b.label,
        description: b.description,
        elapsedMs: h.elapsedMs,
        steps: h.result.runtime?.steps ?? 0,
        ok: h.result.ok,
        error: h.result.runtime?.error?.message ?? null,
      });
      setProgress(((i + 1) / BENCHMARKS.length) * 100);
      setResults([...collected]);
      // Let the UI paint between iterations.
      await new Promise((r) => setTimeout(r, 30));
    }
    setRunning(false);
    setLastRun(Date.now());
  }

  const maxMs = Math.max(...results.map((r) => r.elapsedMs), 0.001);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Gauge className="size-5" />}
        title="Benchmark Dashboard"
        description="Run a fixed set of Aether programs in your browser and see how long each one takes. The tree-walking evaluator is synchronous, so each run blocks the UI briefly."
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

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Results"
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
              description="Press the Run benchmarks button to execute all six benchmarks in this browser."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2 font-medium">Benchmark</th>
                  <th className="py-2 pr-2 font-medium">Time (ms)</th>
                  <th className="py-2 pr-2 font-medium">Steps</th>
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
                      {r.elapsedMs.toFixed(2)}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {r.steps.toLocaleString()}
                    </td>
                    <td className="py-2">
                      {r.ok ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-emerald-600 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="size-3" />
                          ok
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          error
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard
          title="Comparison"
          description="Relative execution time per benchmark (lower is faster)."
          icon={<Gauge className="size-4" />}
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
                    formatter={(v: number) => [v.toFixed(2) + " ms", "Time"]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    payload={[
                      { id: "time", value: "Time (ms)", type: "square", color: "var(--primary)" },
                    ]}
                  />
                  <Bar dataKey="elapsedMs" name="Time (ms)" radius={[3, 3, 0, 0]}>
                    {results.map((r) => (
                      <Cell
                        key={r.id}
                        fill={r.ok ? "var(--primary)" : "var(--destructive)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Longest run: {maxMs.toFixed(2)} ms.
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Notes"
        description="About these benchmarks."
        icon={<Gauge className="size-4" />}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            All benchmarks run in the same browser tab as the playground, using
            the same synchronous tree-walking evaluator.
          </li>
          <li>
            Wall-clock time is measured with{" "}
            <code className="font-mono text-xs">performance.now()</code> and
            includes lex + parse + check + run.
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
