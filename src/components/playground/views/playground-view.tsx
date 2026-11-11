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
  Cpu,
  Zap,
  ScanLine,
  Wand2,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { useViewStore } from "@/lib/view-store";
import { runAether, formatValue } from "@/lib/aether-worker";
import type { CompileResult } from "@aether/core";
import { compileToVm, type CompileVmResult } from "@aether/core";
import { disassemble } from "@aether/vm/bytecode/bytecode";
import { format } from "@aether/tools/formatter/formatter";
import { lint, type LintDiagnostic, type Severity } from "@aether/tools/linter/linter";
import { CodeEditor } from "../code-editor";
import { RunStatus } from "../header";

interface ExampleEntry {
  name: string;
  slug: string;
  code: string;
  readme: string | null;
  size: number;
}

type RuntimeMode = "tree-walker" | "bytecode";

const MODE_STORAGE_KEY = "aether.playground.runtimeMode";
const LINT_ON_RUN_KEY = "aether.playground.lintOnRun";

interface RunState {
  status: "idle" | "running" | "ok" | "error";
  lastMs: number;
  output: string[];
  /** Tree-walker result (active when mode === "tree-walker"). */
  result: CompileResult | null;
  /** VM result (active when mode === "bytecode"). */
  vmResult: CompileVmResult | null;
  /** Bytecode disassembly text (VM mode only). */
  bytecodeText: string | null;
  /** Flattened errors for the Errors tab — built from whichever mode ran. */
  errors: Array<{ stage: "lex" | "parse" | "type" | "runtime"; message: string }>;
  lastRunAt: number | null;
  mode: RuntimeMode;
}

const INITIAL_RUN_STATE: RunState = {
  status: "idle",
  lastMs: 0,
  output: [],
  result: null,
  vmResult: null,
  bytecodeText: null,
  errors: [],
  lastRunAt: null,
  mode: "tree-walker",
};

interface LintState {
  diagnostics: LintDiagnostic[] | null;
  ranAt: number | null;
}

function readMode(): RuntimeMode {
  if (typeof window === "undefined") return "tree-walker";
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    return v === "bytecode" ? "bytecode" : "tree-walker";
  } catch {
    return "tree-walker";
  }
}

function readLintOnRun(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(LINT_ON_RUN_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

/**
 * PlaygroundView — the main interactive view of the Aether playground.
 *
 * Layout:
 *   toolbar (Run | Format | Lint | Clear | Runtime mode | Load Example | Share)
 *   ┌─ editor ──────┬─ output panel ──┐
 *   │  textarea     │  Tabs:         │
 *   │  + gutter     │  Output / AST  │
 *   │               │  / Tokens /    │
 *   │               │  Errors / Stats│
 *   │               │  / Bytecode /  │
 *   │               │  Lint          │
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
  const [lintState, setLintState] = React.useState<LintState>({
    diagnostics: null,
    ranAt: null,
  });
  const [examples, setExamples] = React.useState<ExampleEntry[]>([]);
  const [examplesLoading, setExamplesLoading] = React.useState(true);
  const [mode, setMode] = React.useState<RuntimeMode>(() => readMode());
  const [lintOnRun, setLintOnRun] = React.useState<boolean>(() => readLintOnRun());

  // Persist mode + lint toggle.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch { /* ignore */ }
  }, [mode]);
  React.useEffect(() => {
    try {
      window.localStorage.setItem(LINT_ON_RUN_KEY, lintOnRun ? "1" : "0");
    } catch { /* ignore */ }
  }, [lintOnRun]);

  // Run lint on the given source. Cheap and synchronous; never throws the
  // UI — if the linter itself blows up (e.g. a parser panic), we surface
  // a single synthetic diagnostic so the user sees something happened.
  const runLint = React.useCallback((src: string) => {
    try {
      const diags = lint(src);
      setLintState({ diagnostics: diags, ranAt: Date.now() });
    } catch (e) {
      setLintState({
        diagnostics: [
          {
            rule: "internal",
            severity: "error" as Severity,
            message: "linter crashed: " + (e as Error).message,
            line: 1,
            col: 1,
            loc: { file: "<synthetic>", start: { line: 1, col: 1, offset: 0 }, end: { line: 1, col: 1, offset: 0 } },
          },
        ],
        ranAt: Date.now(),
      });
    }
  }, []);

  // Compile + run the given source. Branches on the runtime mode:
  //   tree-walker → runAether (compileAndRun)
  //   bytecode    → compileToVm + disassemble
  const runCode = React.useCallback(
    async (src?: string) => {
      const codeToRun = src ?? editorCode;
      setRun((r) => ({
        ...r,
        status: "running",
        output: [],
        result: null,
        vmResult: null,
        bytecodeText: null,
        errors: [],
        lastRunAt: Date.now(),
        mode,
      }));
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      if (mode === "tree-walker") {
        const out: string[] = [];
        const handle = await runAether(codeToRun, {
          onOutput: (line) => {
            out.push(line);
            setRun((r) => ({ ...r, output: [...out] }));
          },
        });
        const end =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        setRun({
          status: handle.result.ok ? "ok" : "error",
          lastMs: end - start,
          output: out.length > 0 ? out : (handle.result.runtime?.output ?? []),
          result: handle.result,
          vmResult: null,
          bytecodeText: null,
          errors: handle.result.errors,
          lastRunAt: Date.now(),
          mode,
        });
      } else {
        // Bytecode VM mode.
        const out: string[] = [];
        let vmResult: CompileVmResult;
        try {
          vmResult = compileToVm(codeToRun, {
            stdout: (s) => out.push(s),
            maxSteps: 20_000_000,
          });
        } catch (e) {
          const end =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          setRun({
            status: "error",
            lastMs: end - start,
            output: out,
            result: null,
            vmResult: null,
            bytecodeText: null,
            errors: [
              {
                stage: "runtime",
                message: "compileToVm threw: " + (e as Error).message,
              },
            ],
            lastRunAt: Date.now(),
            mode,
          });
          return;
        }
        const end =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        // Disassemble the bytecode (guarded — lowering/codegen may have
        // produced a degenerate module).
        let bytecodeText: string | null = null;
        try {
          if (vmResult.bytecode) {
            bytecodeText = disassemble(vmResult.bytecode);
          }
        } catch (e) {
          bytecodeText = "; disassemble failed: " + (e as Error).message;
        }
        // Flatten errors for the Errors tab.
        const errors: RunState["errors"] = [];
        for (const te of vmResult.typeErrors) {
          errors.push({ stage: "type", message: te.message });
        }
        if (vmResult.runtime?.error) {
          errors.push({ stage: "runtime", message: vmResult.runtime.error.message });
        }
        setRun({
          status: vmResult.ok ? "ok" : "error",
          lastMs: end - start,
          output: out.length > 0 ? out : (vmResult.runtime?.output ?? []),
          result: null,
          vmResult,
          bytecodeText,
          errors,
          lastRunAt: Date.now(),
          mode,
        });
      }
      // Always lint after a run (the toggle gates whether the Lint tab
      // auto-populates; the button can still trigger it manually).
      if (lintOnRun) {
        runLint(codeToRun);
      }
    },
    [editorCode, mode, lintOnRun, runLint],
  );

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
  // (intentionally run once on mount; runCode is stable enough for this)
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
    setLintState({ diagnostics: null, ranAt: null });
  }

  function formatCode() {
    // Real parser-based formatter (aether/tools/formatter). Idempotent.
    try {
      const formatted = format(editorCode);
      if (formatted === editorCode) {
        toast.success("Already formatted — no changes");
      } else {
        setEditorCode(formatted);
        toast.success("Formatted");
      }
    } catch (e) {
      toast.error("Format failed: " + (e as Error).message);
    }
  }

  function lintCode() {
    runLint(editorCode);
    toast.success("Linted");
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
        onLint={lintCode}
        onShare={shareCode}
        examples={examples}
        examplesLoading={examplesLoading}
        onExample={loadExample}
        mode={mode}
        onModeChange={setMode}
        lintOnRun={lintOnRun}
        onLintOnRunChange={setLintOnRun}
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

        <OutputPanel run={run} lint={lintState} />
      </div>

      {/* Hidden status relay — Header reads it from a shared store in v2. */}
      <span className="sr-only" aria-live="polite">
        Status: {run.status} · mode: {run.mode}
        {run.lastRunAt ? ` · last run ${run.lastMs.toFixed(1)}ms` : ""}
      </span>
    </div>
  );
}

interface ToolbarProps {
  onRun: () => void;
  onClear: () => void;
  onFormat: () => void;
  onLint: () => void;
  onShare: () => void;
  examples: ExampleEntry[];
  examplesLoading: boolean;
  onExample: (slug: string) => void;
  mode: RuntimeMode;
  onModeChange: (m: RuntimeMode) => void;
  lintOnRun: boolean;
  onLintOnRunChange: (v: boolean) => void;
}

function Toolbar({
  onRun,
  onClear,
  onFormat,
  onLint,
  onShare,
  examples,
  examplesLoading,
  onExample,
  mode,
  onModeChange,
  lintOnRun,
  onLintOnRunChange,
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

      {/* Runtime mode toggle — Tree-walker vs Bytecode VM. */}
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (v === "tree-walker" || v === "bytecode") onModeChange(v);
        }}
        variant="outline"
        size="sm"
        aria-label="Runtime mode"
      >
        <ToggleGroupItem value="tree-walker" className="gap-1.5">
          <ListTree className="size-3.5" />
          <span className="hidden sm:inline">Tree-walker</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="bytecode" className="gap-1.5">
          <Cpu className="size-3.5" />
          <span className="hidden sm:inline">Bytecode VM</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Button onClick={onFormat} variant="outline" size="default" title="Format code (parser-based)">
        <Wand2 className="size-4" />
        <span className="hidden sm:inline">Format</span>
      </Button>
      <Button onClick={onLint} variant="outline" size="default" title="Lint code (30 rules)">
        <ScanLine className="size-4" />
        <span className="hidden sm:inline">Lint</span>
      </Button>
      <Button onClick={onClear} variant="outline" size="default">
        <Trash2 className="size-4" />
        <span className="hidden sm:inline">Clear</span>
      </Button>

      {/* Lint-on-run toggle. */}
      <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
        <Switch
          id="lint-on-run"
          checked={lintOnRun}
          onCheckedChange={onLintOnRunChange}
          className="scale-90"
        />
        <Label htmlFor="lint-on-run" className="text-xs text-muted-foreground">
          Lint on run
        </Label>
      </div>

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

interface OutputPanelProps {
  run: RunState;
  lint: LintState;
}

function OutputPanel({ run, lint }: OutputPanelProps) {
  // The Bytecode tab only makes sense in VM mode.
  const showBytecode = run.mode === "bytecode";
  return (
    <div className="flex min-h-[280px] min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Output · {run.mode === "bytecode" ? "Bytecode VM" : "Tree-walker"}
        </span>
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
          {showBytecode && (
            <TabsTrigger value="bytecode" className="gap-1.5">
              <Cpu className="size-3.5" /> Bytecode
            </TabsTrigger>
          )}
          <TabsTrigger value="lint" className="gap-1.5">
            <ScanLine className="size-3.5" /> Lint
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
        {showBytecode && (
          <TabsContent value="bytecode" className="min-h-0 flex-1">
            <BytecodeTab run={run} />
          </TabsContent>
        )}
        <TabsContent value="lint" className="min-h-0 flex-1">
          <LintTab lint={lint} />
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
  if (run.output.length === 0 && (!hasResult(run) || run.status === "idle")) {
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

function hasResult(run: RunState): boolean {
  return run.result !== null || run.vmResult !== null;
}

/** Return the AST from whichever mode ran. */
function getAst(run: RunState) {
  return run.result?.ast ?? run.vmResult?.ast ?? null;
}

function AstTab({ run }: { run: RunState }) {
  const ast = getAst(run);
  if (!ast) return <EmptyTab label="No AST yet — run the code first." />;
  const astJson = JSON.stringify(ast, null, 2);
  return (
    <TabShell>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
        {astJson}
      </pre>
    </TabShell>
  );
}

function TokensTab({ run }: { run: RunState }) {
  const tokens = run.result?.tokens ?? run.vmResult?.tokens ?? null;
  if (!tokens) return <EmptyTab label="No tokens yet — run the code first." />;
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
  if (!hasResult(run) && run.errors.length === 0) {
    return <EmptyTab label="No errors to show — run the code first." />;
  }
  const errors = run.errors;
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

function BytecodeTab({ run }: { run: RunState }) {
  if (run.mode !== "bytecode") {
    return (
      <EmptyTab label="Switch to Bytecode VM mode and Run to see the disassembly." />
    );
  }
  if (run.status === "running") {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Compiling to bytecode…
        </div>
      </TabShell>
    );
  }
  if (!run.bytecodeText) {
    return <EmptyTab label="No bytecode yet — run the code in Bytecode VM mode." />;
  }
  return (
    <TabShell>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Cpu className="size-3.5" />
        <span>
          {run.vmResult?.bytecode?.funcs.length ?? 0} function(s) ·
          entry = {run.vmResult?.bytecode?.entry ?? "—"}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
        {run.bytecodeText}
      </pre>
    </TabShell>
  );
}

function severityTone(sev: Severity): string {
  switch (sev) {
    case "error":
      return "text-destructive";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

function severityBadge(sev: Severity) {
  if (sev === "error") return <Badge variant="destructive" className="text-[10px] uppercase">error</Badge>;
  if (sev === "warning") return <Badge variant="outline" className="text-[10px] uppercase text-amber-600 dark:text-amber-400">warn</Badge>;
  return <Badge variant="outline" className="text-[10px] uppercase">info</Badge>;
}

function LintTab({ lint }: { lint: LintState }) {
  if (!lint.diagnostics) {
    return (
      <EmptyTab label="No lint diagnostics yet — click Lint or enable Lint on run." />
    );
  }
  const diags = lint.diagnostics;
  if (diags.length === 0) {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          No lint diagnostics — clean code.
        </div>
      </TabShell>
    );
  }
  // Summary counts.
  const counts = { error: 0, warning: 0, info: 0 } as Record<Severity, number>;
  for (const d of diags) counts[d.severity]++;
  return (
    <TabShell>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="gap-1">
          <ScanLine className="size-3" />
          {diags.length} diagnostic{diags.length === 1 ? "" : "s"}
        </Badge>
        {counts.error > 0 && (
          <span className={severityTone("error")}>{counts.error} error{counts.error === 1 ? "" : "s"}</span>
        )}
        {counts.warning > 0 && (
          <span className={severityTone("warning")}>{counts.warning} warning{counts.warning === 1 ? "" : "s"}</span>
        )}
        {counts.info > 0 && (
          <span className={severityTone("info")}>{counts.info} info</span>
        )}
      </div>
      <ul className="space-y-2">
        {diags.map((d, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs"
          >
            {severityBadge(d.severity)}
            <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
              {d.rule}
            </Badge>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
              {d.line}:{d.col}
            </span>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {d.message}
            </pre>
          </li>
        ))}
      </ul>
    </TabShell>
  );
}

function StatsTab({ run }: { run: RunState }) {
  if (!hasResult(run)) return <EmptyTab label="No stats yet — run the code first." />;
  const isVm = run.mode === "bytecode";
  const steps = isVm
    ? run.vmResult?.runtime?.steps ?? 0
    : run.result?.runtime?.steps ?? 0;
  const returnValue = isVm
    ? run.vmResult?.runtime?.value
    : run.result?.runtime?.value;
  const tokensCount =
    run.result?.tokens.length ?? run.vmResult?.tokens.length ?? 0;
  const stats: Array<{ label: string; value: string; icon: React.ReactNode }> = [
    {
      label: "Runtime mode",
      value: isVm ? "Bytecode VM (v2)" : "Tree-walker (v1)",
      icon: isVm ? <Cpu className="size-4" /> : <ListTree className="size-4" />,
    },
    {
      label: "Status",
      value: (isVm ? run.vmResult?.ok : run.result?.ok) ? "ok" : "errors",
      icon: (isVm ? run.vmResult?.ok : run.result?.ok) ? (
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
      label: isVm ? "VM steps" : "Eval steps",
      value: steps.toLocaleString(),
      icon: <Hash className="size-4" />,
    },
    {
      label: "Output lines",
      value: run.output.length.toLocaleString(),
      icon: <FileCode2 className="size-4" />,
    },
    {
      label: "Return value",
      value: returnValue !== undefined && returnValue !== null
        ? formatValue(returnValue as any)
        : (returnValue === null ? "null" : "—"),
      icon: <Braces className="size-4" />,
    },
    {
      label: "Tokens",
      value: tokensCount.toLocaleString(),
      icon: <ListTree className="size-4" />,
    },
    {
      label: "Bytecode funcs",
      value: isVm
        ? (run.vmResult?.bytecode?.funcs.length ?? 0).toLocaleString()
        : "—",
      icon: <Zap className="size-4" />,
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
      {isVm && (
        <p className="mt-3 text-xs text-muted-foreground">
          VM step budget: 20,000,000 (vs 1,000,000 for the tree-walker).
          Bytecode disassembly is in the Bytecode tab.
        </p>
      )}
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
