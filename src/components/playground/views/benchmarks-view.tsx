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
  Boxes,
  XCircle,
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
import {
  compileToVm,
  compileAndRunWasm,
  compileAndRunNative,
} from "@aether/core";

/** A single benchmark — source code + label. */
interface Benchmark {
  id: string;
  label: string;
  description: string;
  code: string;
}

const BENCHMARKS: Benchmark[] = [
  {
    id: "fib-25",
    label: "fib(25)",
    description: "Recursive Fibonacci — 242,785 calls (heavy recursion).",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(25);`,
  },
  {
    id: "sum-100k",
    label: "sum 1..100k",
    description: "Sum integers from 1 to 100,000 via a for-loop.",
    code: `let mut s = 0;
for i in 1 .. 100001 { s = s + i; }
s;`,
  },
  {
    id: "matrix-10x10",
    label: "matrix 10×10",
    description: "Multiply two 10×10 integer matrices (1,000 mults).",
    code: `// Build two 10x10 matrices and multiply them.
fn build(n: int) -> [[int]] {
  let mut m = [];
  let mut i = 0;
  while i < n {
    let mut row = [];
    let mut j = 0;
    while j < n {
      push(row, (i + j) % 7);
      j = j + 1;
    };
    push(m, row);
    i = i + 1;
  };
  m
}

fn mul(a: [[int]], b: [[int]], n: int) -> [[int]] {
  let mut out = [];
  let mut i = 0;
  while i < n {
    let mut row = [];
    let mut j = 0;
    while j < n {
      let mut s = 0;
      let mut k = 0;
      while k < n {
        s = s + a[i][k] * b[k][j];
        k = k + 1;
      };
      push(row, s);
      j = j + 1;
    };
    push(out, row);
    i = i + 1;
  };
  out
}

let a = build(10);
let b = build(10);
mul(a, b, 10);`,
  },
  {
    id: "string-concat-1k",
    label: "string concat 1k",
    description: "Build a 1,000-char string by concatenation.",
    code: `let mut s = "";
for i in 0 .. 1000 { s = s + "x"; }
len(s);`,
  },
  {
    id: "fib-15",
    label: "fib(15)",
    description: "Recursive Fibonacci — 1,973 calls (warm-up / sanity check).",
    code: `fn fib(n: int) -> int { if n < 2 { n } else { fib(n - 1) + fib(n - 2) } }
fib(15);`,
  },
  {
    id: "sum-50k",
    label: "sum 1..50k",
    description: "Sum integers from 1 to 50,000 via a for-loop.",
    code: `let mut s = 0;
for i in 1 .. 50001 { s = s + i; }
s;`,
  },
];

interface ModeResult {
  ms: number;
  ok: boolean;
  error: string | null;
}

interface BenchmarkResult {
  id: string;
  label: string;
  description: string;
  /** Tree-walker timing. */
  tree: ModeResult;
  /** Bytecode VM timing. */
  vm: ModeResult;
  /** WASM backend timing. */
  wasm: ModeResult;
  /** x86 native backend timing. */
  x86: ModeResult;
  /** Speedup of the fastest backend over tree-walker. */
  bestSpeedup: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const MODE_COLORS: Record<keyof Omit<BenchmarkResult, "id" | "label" | "description" | "bestSpeedup">, string> = {
  tree: "var(--primary)",
  vm: "var(--chart-2, #10b981)",
  wasm: "var(--chart-3, #f59e0b)",
  x86: "var(--chart-4, #ec4899)",
};

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
      let treeMs = 0;
      let treeOk = false;
      let treeError: string | null = null;
      try {
        const t0 = nowMs();
        const treeHandle = await runAether(b.code, { maxSteps: 100_000_000 });
        const t1 = nowMs();
        treeMs = t1 - t0;
        treeOk = treeHandle.result.ok;
        treeError = treeHandle.result.runtime?.error?.message ?? null;
      } catch (e) {
        treeError = (e as Error).message;
      }

      // --- Bytecode VM pass ---
      let vmMs = 0;
      let vmOk = false;
      let vmError: string | null = null;
      try {
        const t0 = nowMs();
        const vmResult = compileToVm(b.code, { maxSteps: 100_000_000 });
        const t1 = nowMs();
        vmMs = t1 - t0;
        vmOk = vmResult.ok;
        vmError = vmResult.runtime?.error?.message ?? null;
      } catch (e) {
        vmError = (e as Error).message;
      }

      // --- WASM pass (async) ---
      let wasmMs = 0;
      let wasmOk = false;
      let wasmError: string | null = null;
      try {
        const t0 = nowMs();
        const wasmResult = await compileAndRunWasm(b.code, []);
        const t1 = nowMs();
        wasmMs = t1 - t0;
        wasmOk = !wasmResult.error;
        wasmError = wasmResult.error ?? null;
      } catch (e) {
        wasmError = (e as Error).message;
      }

      // --- x86 native pass (sync, falls back to structured interpreter) ---
      let x86Ms = 0;
      let x86Ok = false;
      let x86Error: string | null = null;
      try {
        const t0 = nowMs();
        const x86Result = compileAndRunNative(b.code, []);
        const t1 = nowMs();
        x86Ms = t1 - t0;
        x86Ok = !x86Result.error;
        x86Error = x86Result.error ?? null;
      } catch (e) {
        x86Error = (e as Error).message;
      }

      const times = [treeMs, vmMs, wasmMs, x86Ms].filter((t) => t > 0);
      const minTime = times.length > 0 ? Math.min(...times) : 0.001;
      const bestSpeedup = treeMs > 0 ? treeMs / minTime : 0;

      collected.push({
        id: b.id,
        label: b.label,
        description: b.description,
        tree: { ms: treeMs, ok: treeOk, error: treeError },
        vm: { ms: vmMs, ok: vmOk, error: vmError },
        wasm: { ms: wasmMs, ok: wasmOk, error: wasmError },
        x86: { ms: x86Ms, ok: x86Ok, error: x86Error },
        bestSpeedup,
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
    ...results.map((r) => Math.max(r.tree.ms, r.vm.ms, r.wasm.ms, r.x86.ms)),
    0.001,
  );

  // Summary stats.
  const valid = results.filter((r) => r.tree.ms > 0);
  const avgSpeedup =
    valid.length > 0
      ? valid.reduce((a, r) => a + r.bestSpeedup, 0) / valid.length
      : 0;
  const fastestMode = (() => {
    if (results.length === 0) return "—";
    const counts: Record<string, number> = { tree: 0, vm: 0, wasm: 0, x86: 0 };
    for (const r of results) {
      const times: Array<[string, number]> = [
        ["tree", r.tree.ms],
        ["vm", r.vm.ms],
        ["wasm", r.wasm.ms],
        ["x86", r.x86.ms],
      ].filter((x) => Number(x[1]) > 0) as Array<[string, number]>;
      if (times.length === 0) continue;
      times.sort((a, b) => a[1] - b[1]);
      counts[times[0][0]]++;
    }
    let best = "tree";
    for (const k of Object.keys(counts)) {
      if (counts[k] > counts[best]) best = k;
    }
    return { name: best, wins: counts[best] };
  })();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Gauge className="size-5" />}
        title="Benchmark Dashboard"
        description="Run a fixed set of Aether programs on all four runtime backends — tree-walker, bytecode VM, WASM, and x86-64 — and compare wall-clock timings side-by-side. Runs are sequential, so the UI blocks briefly per benchmark."
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
            label="Average best speedup"
            value={avgSpeedup.toFixed(2) + "×"}
            hint="tree-walker ms / fastest backend ms"
          />
          <SummaryCard
            icon={<Boxes className="size-4" />}
            label="WASM wins"
            value={
              results.filter((r) => {
                const times: Array<[string, number]> = [
                  ["wasm", r.wasm.ms],
                  ["vm", r.vm.ms],
                  ["tree", r.tree.ms],
                  ["x86", r.x86.ms],
                ].filter((x) => Number(x[1]) > 0) as Array<[string, number]>;
                times.sort((a, b) => a[1] - b[1]);
                return times.length > 0 && times[0][0] === "wasm";
              }).length +
              " / " +
              results.length
            }
            hint="benchmarks where WASM is fastest"
          />
          <SummaryCard
            icon={<Cpu className="size-4" />}
            label="Most wins"
            value={
              fastestMode === "—"
                ? "—"
                : `${fastestMode.name} (${fastestMode.wins}/${results.length})`
            }
            hint="backend with the most first-place finishes"
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="4-way results"
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
              description="Press the Run benchmarks button to execute every benchmark on all four backends in this browser."
            />
          ) : (
            <div className="max-h-96 overflow-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-background text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Benchmark</th>
                    <th className="py-2 pr-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <ListTree className="size-3" /> Tree
                      </span>
                    </th>
                    <th className="py-2 pr-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Cpu className="size-3" /> VM
                      </span>
                    </th>
                    <th className="py-2 pr-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Boxes className="size-3" /> WASM
                      </span>
                    </th>
                    <th className="py-2 pr-2 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Zap className="size-3" /> x86
                      </span>
                    </th>
                    <th className="py-2 font-medium">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const times: Array<[string, number]> = [
                      ["tree", r.tree.ms],
                      ["vm", r.vm.ms],
                      ["wasm", r.wasm.ms],
                      ["x86", r.x86.ms],
                    ].filter((x) => Number(x[1]) > 0) as Array<[string, number]>;
                    times.sort((a, b) => a[1] - b[1]);
                    const bestKey = times.length > 0 ? times[0][0] : null;
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/40 last:border-0"
                      >
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
                        <ModeCell
                          res={r.tree}
                          isBest={bestKey === "tree"}
                        />
                        <ModeCell res={r.vm} isBest={bestKey === "vm"} />
                        <ModeCell res={r.wasm} isBest={bestKey === "wasm"} />
                        <ModeCell res={r.x86} isBest={bestKey === "x86"} />
                        <td className="py-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase"
                          >
                            {bestKey ?? "—"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="4-way comparison"
          description="Wall-clock ms per benchmark (lower is faster)."
          icon={<Boxes className="size-4" />}
        >
          {results.length === 0 ? (
            <EmptyState
              icon={<Gauge className="size-6" />}
              title="No chart yet"
              description="Run the benchmarks to see the comparison."
            />
          ) : (
            <div className="h-80 w-full">
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
                  <Bar dataKey="tree.ms" name="Tree-walker" fill={MODE_COLORS.tree} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="vm.ms" name="Bytecode VM" fill={MODE_COLORS.vm} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="wasm.ms" name="WASM" fill={MODE_COLORS.wasm} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="x86.ms" name="x86-64" fill={MODE_COLORS.x86} radius={[3, 3, 0, 0]} />
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
          description="Ratio tree-walker ms / fastest backend ms (higher = backend wins)."
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
                    dataKey="bestSpeedup"
                    name="Best speedup (×)"
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
            Every benchmark runs on all four backends — the v1{" "}
            <code className="font-mono text-xs">compileAndRun</code>{" "}
            tree-walker, the v2 <code className="font-mono text-xs">compileToVm</code>{" "}
            bytecode VM, the v3 <code className="font-mono text-xs">compileAndRunWasm</code>{" "}
            WASM backend, and the v3{" "}
            <code className="font-mono text-xs">compileAndRunNative</code>{" "}
            x86-64 backend (which falls back to a structured interpreter when{" "}
            <code className="font-mono text-xs">nasm</code> isn&apos;t installed).
          </li>
          <li>
            Wall-clock time is measured with{" "}
            <code className="font-mono text-xs">performance.now()</code> and
            includes lex + parse + check + (run | lower + codegen + interpret | lower + WASM instantiate | lower + interp).
          </li>
          <li>
            The WASM backend runs via{" "}
            <code className="font-mono text-xs">WebAssembly.instantiate</code> in
            the browser — it pays a one-time compile + instantiate cost per
            benchmark. fib(25) runs in ~50ms natively (vs ~5s on the tree-walker).
          </li>
          <li>
            The x86 backend produces NASM-syntax assembly; without{" "}
            <code className="font-mono text-xs">nasm</code> in the sandbox, it
            executes via a faithful structured interpreter that walks the same
            IR. The asm text is shown in the playground&apos;s x86 tab.
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

function ModeCell({ res, isBest }: { res: ModeResult; isBest: boolean }) {
  return (
    <td className="py-2 pr-2 font-mono text-xs tabular-nums">
      {res.ms > 0 ? (
        <span
          className={
            isBest
              ? "font-semibold text-emerald-600 dark:text-emerald-400"
              : "text-foreground"
          }
        >
          {res.ms.toFixed(2)}
          {res.ok ? "" : "!"}
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-destructive">
          <XCircle className="size-3" />
          <span className="sr-only">error</span>
        </span>
      )}
    </td>
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
        <span className="font-mono text-lg font-semibold text-foreground">
          {value}
        </span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}
