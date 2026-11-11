"use client";

import * as React from "react";
import {
  Play,
  Trash2,
  Share2,
  Loader2,
  FileCode2,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  ListTree,
  Braces,
  Clock,
  Hash,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import { useViewStore } from "@/lib/view-store";
import { runAether, formatValue } from "@/lib/aether-worker";
import type { CompileResult } from "@aether/core";
import { CodeEditor } from "../code-editor";
import { RunStatus } from "../header";

interface ExampleEntry {
  name: string;
  slug: string;
  code: string;
  readme: string | null;
  size: number;
}

interface RunState {
  status: "idle" | "running" | "ok" | "error";
  lastMs: number;
  output: string[];
  result: CompileResult | null;
  lastRunAt: number | null;
}

const INITIAL_RUN_STATE: RunState = {
  status: "idle",
  lastMs: 0,
  output: [],
  result: null,
  lastRunAt: null,
};

/**
 * PlaygroundView — the main interactive view of the Aether playground.
 *
 * Layout:
 *   toolbar (Run | Clear | Format | Load Example | Share)
 *   ┌─ editor ──────┬─ output panel ──┐
 *   │  textarea     │  Tabs:         │
 *   │  + gutter     │  Output / AST  │
 *   │               │  / Tokens /    │
 *   │               │  Errors / Stats│
 *   └───────────────┴────────────────┘
 *
 * The editor and output panel split horizontally on lg+ and stack
 * vertically on small screens.
 */
export function PlaygroundView() {
  const code = useViewStore((s) => s.code);
  const codeVersion = useViewStore((s) => s.codeVersion);
  const loadCode = useViewStore((s) => s.loadCode);
  const [editorCode, setEditorCode] = React.useState(code);

  const [run, setRun] = React.useState<RunState>(INITIAL_RUN_STATE);
  const [examples, setExamples] = React.useState<ExampleEntry[]>([]);
  const [examplesLoading, setExamplesLoading] = React.useState(true);

  // Compile + run the given source. Always reads from `editorCode` if no
  // argument is supplied (so the Run button stays in sync with edits).
  const runCode = React.useCallback(async (src?: string) => {
    const codeToRun = src ?? editorCode;
    setRun((r) => ({
      ...r,
      status: "running",
      output: [],
      result: null,
      lastRunAt: Date.now(),
    }));
    // The runtime's stdout callback receives every print() line. When a
    // callback is supplied the runtime's own `output` array stays empty
    // (see eval.ts), so we collect into `out` here and use that as the
    // source of truth for the Output tab.
    const out: string[] = [];
    const handle = await runAether(codeToRun, {
      onOutput: (line) => {
        out.push(line);
        setRun((r) => ({ ...r, output: [...out] }));
      },
    });
    setRun({
      status: handle.result.ok ? "ok" : "error",
      lastMs: handle.elapsedMs,
      output: out.length > 0
        ? out
        : (handle.result.runtime?.output ?? []),
      result: handle.result,
      lastRunAt: Date.now(),
    });
  }, [editorCode]);

  // Sync editor when a new example/share is loaded.
  React.useEffect(() => {
    setEditorCode(code);
  }, [code, codeVersion]);

  // Load examples list.
  React.useEffect(() => {
    let alive = true;
    setExamplesLoading(true);
    fetch("/api/examples")
      .then((r) => r.json())
      .then((j: { data?: ExampleEntry[] }) => {
        if (!alive) return;
        setExamples(j.data ?? []);
      })
      .catch(() => {
        if (alive) setExamples([]);
      })
      .finally(() => {
        if (alive) setExamplesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Auto-run on mount using the default code.
  React.useEffect(() => {
    runCode(code);
  }, []);

  // On mount, if URL hash contains base64-encoded code, load it.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash && hash.startsWith("#code=")) {
      const b64 = hash.slice("#code=".length);
      try {
        const decoded = decodeURIComponent(
          typeof atob === "function"
            ? atob(b64)
            : Buffer.from(b64, "base64").toString("utf8"),
        );
        loadCode(decoded);
        setEditorCode(decoded);
        toast.success("Loaded shared code from URL");
      } catch {
        // ignore
      }
    }
  }, []);

  function clearAll() {
    setEditorCode("");
    setRun(INITIAL_RUN_STATE);
  }

  function formatCode() {
    // Lightweight formatter: dedent common leading whitespace per block
    // and trim trailing spaces. Not a real parser-based formatter — but
    // enough to be useful for paste-mess.
    const lines = editorCode.split("\n");
    // Compute min indent across non-empty lines.
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim() === "") continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent < minIndent) minIndent = indent;
    }
    if (!isFinite(minIndent) || minIndent === 0) {
      // Just trim trailing whitespace.
      const trimmed = lines.map((l) => l.replace(/\s+$/, "")).join("\n");
      setEditorCode(trimmed);
      toast.success("Trimmed trailing whitespace");
      return;
    }
    const re = new RegExp("^" + " ".repeat(minIndent));
    const out = lines.map((l) => l.replace(re, "").replace(/\s+$/, "")).join("\n");
    setEditorCode(out);
    toast.success("Re-indented (dedented " + minIndent + " spaces)");
  }

  function shareCode() {
    if (typeof window === "undefined") return;
    try {
      const b64 = btoa(unescape(encodeURIComponent(editorCode)));
      const url = window.location.origin + window.location.pathname + "#code=" + b64;
      void navigator.clipboard?.writeText(url);
      window.history.replaceState(null, "", "#code=" + b64);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Couldn't generate share link");
    }
  }

  function loadExample(slug: string) {
    const ex = examples.find((e) => e.slug === slug);
    if (!ex) return;
    loadCode(ex.code);
    setEditorCode(ex.code);
    toast.success("Loaded example: " + ex.name);
    // Auto-run the example after load.
    setTimeout(() => runCode(ex.code), 0);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Toolbar
        onRun={() => runCode()}
        onClear={clearAll}
        onFormat={formatCode}
        onShare={shareCode}
        examples={examples}
        examplesLoading={examplesLoading}
        onExample={loadExample}
      />

      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Editor</span>
            <span>
              {editorCode.split("\n").length} lines · {editorCode.length} chars
            </span>
          </div>
          <CodeEditor
            value={editorCode}
            onChange={setEditorCode}
            onRun={() => runCode()}
            minLines={16}
            className="min-h-[280px]"
          />
        </div>

        <OutputPanel run={run} />
      </div>

      {/* Hidden status relay — Header reads it from a shared store in v2. */}
      <span className="sr-only" aria-live="polite">
        Status: {run.status}
        {run.lastRunAt ? ` · last run ${run.lastMs.toFixed(1)}ms` : ""}
      </span>
    </div>
  );
}

interface ToolbarProps {
  onRun: () => void;
  onClear: () => void;
  onFormat: () => void;
  onShare: () => void;
  examples: ExampleEntry[];
  examplesLoading: boolean;
  onExample: (slug: string) => void;
}

function Toolbar({
  onRun,
  onClear,
  onFormat,
  onShare,
  examples,
  examplesLoading,
  onExample,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onRun} size="default" className="gap-2">
        <Play className="size-4" />
        Run
        <span className="hidden text-xs text-primary-foreground/70 sm:inline">
          ⌘↵
        </span>
      </Button>
      <Button onClick={onFormat} variant="outline" size="default">
        <ArrowRightLeft className="size-4" />
        <span className="hidden sm:inline">Format</span>
      </Button>
      <Button onClick={onClear} variant="outline" size="default">
        <Trash2 className="size-4" />
        <span className="hidden sm:inline">Clear</span>
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Select
          onValueChange={onExample}
          value=""
          disabled={examplesLoading || examples.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue
              placeholder={
                examplesLoading
                  ? "Loading examples…"
                  : examples.length === 0
                    ? "No examples yet"
                    : "Load example…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {examples.map((e) => (
              <SelectItem key={e.slug} value={e.slug}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onShare} variant="outline" size="default">
          <Share2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </div>
  );
}

function OutputPanel({ run }: { run: RunState }) {
  return (
    <div className="flex min-h-[280px] min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Output</span>
        <RunStatus status={run.status} lastMs={run.lastMs} />
      </div>
      <Tabs defaultValue="output" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="output" className="gap-1.5">
            <FileCode2 className="size-3.5" /> Output
          </TabsTrigger>
          <TabsTrigger value="ast" className="gap-1.5">
            <Braces className="size-3.5" /> AST
          </TabsTrigger>
          <TabsTrigger value="tokens" className="gap-1.5">
            <ListTree className="size-3.5" /> Tokens
          </TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5">
            <AlertTriangle className="size-3.5" /> Errors
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5">
            <Clock className="size-3.5" /> Stats
          </TabsTrigger>
        </TabsList>
        <TabsContent value="output" className="min-h-0 flex-1">
          <OutputTab run={run} />
        </TabsContent>
        <TabsContent value="ast" className="min-h-0 flex-1">
          <AstTab run={run} />
        </TabsContent>
        <TabsContent value="tokens" className="min-h-0 flex-1">
          <TokensTab run={run} />
        </TabsContent>
        <TabsContent value="errors" className="min-h-0 flex-1">
          <ErrorsTab run={run} />
        </TabsContent>
        <TabsContent value="stats" className="min-h-0 flex-1">
          <StatsTab run={run} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-[200px] overflow-auto rounded-lg border bg-muted/20 p-4 scrollbar-thin">
      {children}
    </div>
  );
}

function OutputTab({ run }: { run: RunState }) {
  if (run.status === "running" && run.output.length === 0) {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Running…
        </div>
      </TabShell>
    );
  }
  if (run.output.length === 0 && (!run.result || run.status === "idle")) {
    return (
      <TabShell>
        <div className="py-6 text-sm text-muted-foreground">
          Press <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">Run</kbd>{" "}
          to evaluate the code.
        </div>
      </TabShell>
    );
  }
  return (
    <TabShell>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
        {run.output.length === 0 ? (
          <span className="text-muted-foreground">
            (no output — the program produced no print statements)
          </span>
        ) : (
          run.output.map((line, i) => (
            <div key={i} className="min-h-[1.25rem]">
              {line === "" ? "\u00A0" : line}
            </div>
          ))
        )}
      </pre>
    </TabShell>
  );
}

function AstTab({ run }: { run: RunState }) {
  if (!run.result) return <EmptyTab label="No AST yet — run the code first." />;
  const astJson = JSON.stringify(run.result.ast, null, 2);
  return (
    <TabShell>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
        {astJson}
      </pre>
    </TabShell>
  );
}

function TokensTab({ run }: { run: RunState }) {
  if (!run.result) return <EmptyTab label="No tokens yet — run the code first." />;
  const tokens = run.result.tokens;
  if (tokens.length === 0) {
    return <EmptyTab label="No tokens — the lexer produced nothing." />;
  }
  return (
    <TabShell>
      <table className="w-full font-mono text-xs">
        <thead className="sticky top-0 bg-muted/80 text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">#</th>
            <th className="py-1 pr-2 font-medium">kind</th>
            <th className="py-1 pr-2 font-medium">value</th>
            <th className="py-1 font-medium">loc</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <tr key={i} className="border-b border-border/30 last:border-0">
              <td className="py-1 pr-2 text-muted-foreground tabular-nums">
                {i + 1}
              </td>
              <td className="py-1 pr-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {t.kind}
                </Badge>
              </td>
              <td className="py-1 pr-2 text-foreground">
                {t.kind === "String" ? (
                  <span className="text-foreground/80">"{describeString(t)}"</span>
                ) : (
                  <span>{truncate(t.value, 60)}</span>
                )}
              </td>
              <td className="py-1 text-muted-foreground tabular-nums">
                {t.loc.start.line}:{t.loc.start.col}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabShell>
  );
}

function ErrorsTab({ run }: { run: RunState }) {
  if (!run.result) return <EmptyTab label="No errors to show — run the code first." />;
  const errors = run.result.errors;
  if (errors.length === 0) {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          No errors — clean compile and run.
        </div>
      </TabShell>
    );
  }
  return (
    <TabShell>
      <ul className="space-y-2">
        {errors.map((e, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs"
          >
            <Badge
              variant={e.stage === "runtime" ? "destructive" : "outline"}
              className="shrink-0 font-mono text-[10px] uppercase"
            >
              {e.stage}
            </Badge>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {e.message}
            </pre>
          </li>
        ))}
      </ul>
    </TabShell>
  );
}

function StatsTab({ run }: { run: RunState }) {
  if (!run.result) return <EmptyTab label="No stats yet — run the code first." />;
  const r = run.result.runtime;
  const stats: Array<{ label: string; value: string; icon: React.ReactNode }> = [
    {
      label: "Status",
      value: run.result.ok ? "ok" : "errors",
      icon: run.result.ok ? (
        <CheckCircle2 className="size-4 text-emerald-500" />
      ) : (
        <AlertTriangle className="size-4 text-destructive" />
      ),
    },
    {
      label: "Wall time",
      value: run.lastMs.toFixed(2) + " ms",
      icon: <Clock className="size-4" />,
    },
    {
      label: "Eval steps",
      value: r ? r.steps.toLocaleString() : "—",
      icon: <Hash className="size-4" />,
    },
    {
      label: "Output lines",
      value: run.output.length.toLocaleString(),
      icon: <FileCode2 className="size-4" />,
    },
    {
      label: "Return value",
      value: r ? formatValue(r.value as any) : "—",
      icon: <Braces className="size-4" />,
    },
    {
      label: "Tokens",
      value: run.result.tokens.length.toLocaleString(),
      icon: <ListTree className="size-4" />,
    },
  ];
  return (
    <TabShell>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
          >
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              {s.icon}
              {s.label}
            </dt>
            <dd className="font-mono text-xs text-foreground">{s.value}</dd>
          </div>
        ))}
      </dl>
    </TabShell>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <TabShell>
      <div className="py-6 text-sm text-muted-foreground">{label}</div>
    </TabShell>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function describeString(t: { segments?: Array<{ kind: string; value: string }> }): string {
  if (!t.segments) return "";
  return t.segments
    .map((seg) => (seg.kind === "interp" ? "{" + seg.value + "}" : seg.value))
    .join("");
}
