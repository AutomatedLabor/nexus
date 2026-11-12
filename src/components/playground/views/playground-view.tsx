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
  ListTree,
  Braces,
  Clock,
  Hash,
  Cpu,
  Zap,
  ScanLine,
  Wand2,
  Sparkles,
  Boxes,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useViewStore } from "@/lib/view-store";
import { runAether, formatValue } from "@/lib/aether-worker";
import type { CompileResult, Value, Program, Token } from "@aether/core";
import {
  compileToVm,
  type CompileVmResult,
  compileAndRunWasm,
  compileAndRunNative,
  compileIrToWasm,
  compileIrToX86,
  emitWasmText,
  emitAsm,
  lowerToIr,
  lexWithErrors,
  parse,
  type WasmModule,
  type X86Module,
  type WasmRunResult,
  type X86RunResult,
} from "@aether/core";
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

/** All four runtime backends exposed in the playground. */
type RuntimeMode = "tree-walker" | "bytecode" | "wasm" | "x86";

const MODE_STORAGE_KEY = "aether.playground.runtimeMode";
const LINT_ON_RUN_KEY = "aether.playground.lintOnRun";

const ALL_MODES: RuntimeMode[] = ["tree-walker", "bytecode", "wasm", "x86"];

function isMode(v: unknown): v is RuntimeMode {
  return v === "tree-walker" || v === "bytecode" || v === "wasm" || v === "x86";
}

interface RunState {
  status: "idle" | "running" | "ok" | "error";
  lastMs: number;
  output: string[];
  /** Tree-walker result (active when mode === "tree-walker"). */
  result: CompileResult | null;
  /** VM result (active when mode === "bytecode"). */
  vmResult: CompileVmResult | null;
  /** Bytecode disassembly text (bytecode mode only). */
  bytecodeText: string | null;
  /** WASM disassembly text (wasm mode only). */
  wasmText: string | null;
  /** WASM module (wasm mode only). */
  wasmModule: WasmModule | null;
  /** WASM run result (wasm mode only). */
  wasmResult: WasmRunResult | null;
  /** x86 disassembly text (x86 mode only). */
  x86Text: string | null;
  /** x86 module (x86 mode only). */
  x86Module: X86Module | null;
  /** x86 run result (x86 mode only). */
  x86Result: X86RunResult | null;
  /** AST + tokens — populated in all modes via lex+parse, so the AST/Tokens
   *  tabs work even when the runtime backend doesn't surface them. */
  ast: Program | null;
  tokens: Token[] | null;
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
  wasmText: null,
  wasmModule: null,
  wasmResult: null,
  x86Text: null,
  x86Module: null,
  x86Result: null,
  ast: null,
  tokens: null,
  errors: [],
  lastRunAt: null,
  mode: "tree-walker",
};

interface LintState {
  diagnostics: LintDiagnostic[] | null;
  ranAt: number | null;
}

interface AsyncDemoState {
  open: boolean;
  running: boolean;
  source: string | null;
  output: string[];
  error: string | null;
}

const INITIAL_ASYNC_DEMO: AsyncDemoState = {
  open: false,
  running: false,
  source: null,
  output: [],
  error: null,
};

function readMode(): RuntimeMode {
  if (typeof window === "undefined") return "tree-walker";
  try {
    const v = window.localStorage.getItem(MODE_STORAGE_KEY);
    return isMode(v) ? v : "tree-walker";
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
 * Lex + parse the source and return the AST + tokens, swallowing errors.
 * Used to populate the AST/Tokens tabs in wasm/x86 mode (whose native
 * backends don't return the AST).
 */
function quickParse(src: string): { ast: Program | null; tokens: Token[] | null } {
  try {
    const { tokens, errors: lexErrs } = lexWithErrors(src, "<aether>");
    if (lexErrs.length > 0) return { ast: null, tokens };
    const { program } = parse(tokens, "<aether>");
    return { ast: program, tokens };
  } catch {
    return { ast: null, tokens: null };
  }
}

/** Compile a source string to a WASM module and produce the wasm-text
 *  disassembly. Returns both the module (for stats) and the text (for the
 *  WASM tab). Throws on lex/parse/lower/compile failure. */
function compileWasmForDisplay(src: string): { module: WasmModule; text: string } {
  const { tokens, errors: lexErrs } = lexWithErrors(src, "<aether>");
  if (lexErrs.length > 0) throw new Error(lexErrs[0].message);
  const { program, errors: parseErrs } = parse(tokens, "<aether>");
  if (parseErrs.length > 0 && program.body.length === 0) {
    throw new Error(parseErrs[0].message);
  }
  const ir = lowerToIr(program);
  const wasmModule = compileIrToWasm(ir);
  const text = emitWasmText(wasmModule);
  return { module: wasmModule, text };
}

/** Same as above for the x86 backend. */
function compileX86ForDisplay(src: string): { module: X86Module; text: string } {
  const { tokens, errors: lexErrs } = lexWithErrors(src, "<aether>");
  if (lexErrs.length > 0) throw new Error(lexErrs[0].message);
  const { program, errors: parseErrs } = parse(tokens, "<aether>");
  if (parseErrs.length > 0 && program.body.length === 0) {
    throw new Error(parseErrs[0].message);
  }
  const ir = lowerToIr(program);
  const x86Module = compileIrToX86(ir);
  const text = emitAsm(x86Module);
  return { module: x86Module, text };
}

/** Aether source for the v3 async coroutine demo. Uses the real v3
 *  CoroutineScheduler builtins (spawn / channel / send_ch / recv / join)
 *  wired into the tree-walker via registerCoroutineBuiltins. */
const ASYNC_DEMO_SOURCE = `// v3 async coroutine demo.
// Real CoroutineScheduler builtins: spawn / channel / send_ch / recv / join.
// Drives a producer + consumer through a buffered channel — fully
// synchronous from the Aether caller's perspective; the scheduler
// interleaves the coroutines underneath.

let ch = channel(0);
print("[main] channel created (capacity 0 = unbounded)");

let producer = spawn(fn() -> int {
  print("[producer] sending 1, 2, 3...");
  send_ch(ch, 1);
  send_ch(ch, 2);
  send_ch(ch, 3);
  print("[producer] done sending");
  0
});
print("[main] producer spawned");

let consumer = spawn(fn() -> int {
  print("[consumer] awaiting values...");
  let mut sum = 0;
  let mut i = 0;
  while i < 3 {
    let v = recv(ch);
    print("[consumer] received " + str(v));
    sum = sum + v;
    i = i + 1;
  };
  print("[consumer] sum = " + str(sum));
  sum
});
print("[main] consumer spawned");

let results = join([producer, consumer]);
print("[main] join resolved: producer -> " + str(results[0]) + ", consumer -> " + str(results[1]));
print("[main] demo complete.");`;

/**
 * Run the v3 async coroutine demo — real Aether execution in the
 * browser. The demo source uses the v3 `CoroutineScheduler` builtins
 * (`spawn`, `channel`, `send_ch`, `recv`, `join`) registered into the
 * tree-walker via `registerCoroutineBuiltins`. Returns the runtime
 * output (the program's `print` lines) plus the source for display.
 *
 * The sema (type checker) doesn't know about the coroutine builtins, so
 * it reports a few "undefined name" warnings — these don't block
 * execution (the playground's tree-walker is lenient), and we surface
 * only the real program output to the dialog.
 */
async function runAsyncDemo(): Promise<{ source: string; output: string[]; error: string | null }> {
  const out: string[] = [];
  let runtimeError: string | null = null;
  try {
    const handle = await runAether(ASYNC_DEMO_SOURCE, {
      maxSteps: 5_000_000,
      onOutput: (line) => out.push(line),
    });
    if (handle.result.runtime?.error) {
      runtimeError = handle.result.runtime.error.message;
    }
  } catch (e) {
    runtimeError = (e as Error).message;
  }
  return { source: ASYNC_DEMO_SOURCE, output: out, error: runtimeError };
}

/**
 * PlaygroundView — the main interactive view of the Aether playground.
 *
 * Layout:
 *   toolbar (Run | Format | Lint | Clear | Runtime mode | Load Example | Share | Async demo)
 *   ┌─ editor ──────┬─ output panel ──┐
 *   │  textarea     │  Tabs:         │
 *   │  + gutter     │  Output / AST  │
 *   │               │  / Tokens /    │
 *   │               │  Errors / Stats│
 *   │               │  / Bytecode /  │
 *   │               │  WASM / x86 /  │
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
  const [asyncDemo, setAsyncDemo] = React.useState<AsyncDemoState>(INITIAL_ASYNC_DEMO);

  // Persist mode + lint toggle.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);
  React.useEffect(() => {
    try {
      window.localStorage.setItem(LINT_ON_RUN_KEY, lintOnRun ? "1" : "0");
    } catch {
      /* ignore */
    }
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
            loc: {
              file: "<synthetic>",
              start: { line: 1, col: 1, offset: 0 },
              end: { line: 1, col: 1, offset: 0 },
            },
          },
        ],
        ranAt: Date.now(),
      });
    }
  }, []);

  // Compile + run the given source. Branches on the runtime mode:
  //   tree-walker → runAether (compileAndRun)
  //   bytecode    → compileToVm + disassemble
  //   wasm        → compileWasmForDisplay (sync) + compileAndRunWasm (async)
  //   x86         → compileX86ForDisplay + compileAndRunNative (sync)
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
        wasmText: null,
        wasmModule: null,
        wasmResult: null,
        x86Text: null,
        x86Module: null,
        x86Result: null,
        ast: null,
        tokens: null,
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
          wasmText: null,
          wasmModule: null,
          wasmResult: null,
          x86Text: null,
          x86Module: null,
          x86Result: null,
          ast: handle.result.ast,
          tokens: handle.result.tokens,
          errors: handle.result.errors,
          lastRunAt: Date.now(),
          mode,
        });
      } else if (mode === "bytecode") {
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
            wasmText: null,
            wasmModule: null,
            wasmResult: null,
            x86Text: null,
            x86Module: null,
            x86Result: null,
            ast: null,
            tokens: null,
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
          errors.push({
            stage: "runtime",
            message: vmResult.runtime.error.message,
          });
        }
        setRun({
          status: vmResult.ok ? "ok" : "error",
          lastMs: end - start,
          output: out.length > 0 ? out : (vmResult.runtime?.output ?? []),
          result: null,
          vmResult,
          bytecodeText,
          wasmText: null,
          wasmModule: null,
          wasmResult: null,
          x86Text: null,
          x86Module: null,
          x86Result: null,
          ast: vmResult.ast,
          tokens: vmResult.tokens,
          errors,
          lastRunAt: Date.now(),
          mode,
        });
      } else if (mode === "wasm") {
        // WASM mode: first compile for display (sync), then run (async).
        const parsed = quickParse(codeToRun);
        let wasmText: string | null = null;
        let wasmModule: WasmModule | null = null;
        let displayError: string | null = null;
        try {
          const { module, text } = compileWasmForDisplay(codeToRun);
          wasmText = text;
          wasmModule = module;
        } catch (e) {
          displayError = (e as Error).message;
        }
        // Stream an interim state so the user sees the disassembly appear.
        setRun((r) => ({
          ...r,
          wasmText,
          wasmModule,
          ast: parsed.ast,
          tokens: parsed.tokens,
        }));

        const out: string[] = [];
        let wasmResult: WasmRunResult;
        try {
          wasmResult = await compileAndRunWasm(codeToRun, []);
          // Stream the output lines as they appear (the WASM host doesn't
          // support streaming, so we just push them all here).
          for (const line of wasmResult.outputs) out.push(line);
        } catch (e) {
          wasmResult = {
            output: null,
            outputs: out,
            error: (e as Error).message,
          };
        }
        const end =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const errors: RunState["errors"] = [];
        if (displayError) {
          errors.push({ stage: "runtime", message: "wasm compile: " + displayError });
        }
        if (wasmResult.error) {
          errors.push({ stage: "runtime", message: wasmResult.error });
        }
        setRun({
          status: wasmResult.error || displayError ? "error" : "ok",
          lastMs: end - start,
          output: out,
          result: null,
          vmResult: null,
          bytecodeText: null,
          wasmText,
          wasmModule,
          wasmResult,
          x86Text: null,
          x86Module: null,
          x86Result: null,
          ast: parsed.ast,
          tokens: parsed.tokens,
          errors,
          lastRunAt: Date.now(),
          mode,
        });
      } else {
        // x86 mode.
        const parsed = quickParse(codeToRun);
        let x86Text: string | null = null;
        let x86Module: X86Module | null = null;
        let displayError: string | null = null;
        try {
          const { module, text } = compileX86ForDisplay(codeToRun);
          x86Text = text;
          x86Module = module;
        } catch (e) {
          displayError = (e as Error).message;
        }
        const out: string[] = [];
        let x86Result: X86RunResult;
        try {
          x86Result = compileAndRunNative(codeToRun, []);
          for (const line of x86Result.outputs) out.push(line);
        } catch (e) {
          x86Result = {
            output: null,
            outputs: out,
            error: (e as Error).message,
          };
        }
        const end =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const errors: RunState["errors"] = [];
        if (displayError) {
          errors.push({ stage: "runtime", message: "x86 compile: " + displayError });
        }
        if (x86Result.error) {
          errors.push({ stage: "runtime", message: x86Result.error });
        }
        setRun({
          status: x86Result.error || displayError ? "error" : "ok",
          lastMs: end - start,
          output: out,
          result: null,
          vmResult: null,
          bytecodeText: null,
          wasmText: null,
          wasmModule: null,
          wasmResult: null,
          x86Text,
          x86Module,
          x86Result,
          ast: parsed.ast,
          tokens: parsed.tokens,
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

  // Run the async coroutine demo (real Aether execution via the v3
  // CoroutineScheduler builtins wired into the tree-walker).
  const runAsyncDemoNow = React.useCallback(async () => {
    setAsyncDemo((s) => ({
      ...s,
      open: true,
      running: true,
      source: null,
      output: [],
      error: null,
    }));
    try {
      const result = await runAsyncDemo();
      setAsyncDemo((s) => ({
        ...s,
        running: false,
        source: result.source,
        output: result.output,
        error: result.error,
      }));
    } catch (e) {
      setAsyncDemo((s) => ({
        ...s,
        running: false,
        error: (e as Error).message,
      }));
    }
  }, []);

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
  }, [loadCode]);

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
      const url =
        window.location.origin + window.location.pathname + "#code=" + b64;
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
        onAsyncDemo={runAsyncDemoNow}
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

      <AsyncDemoDialog
        state={asyncDemo}
        onClose={() => setAsyncDemo((s) => ({ ...s, open: false }))}
      />

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
  onAsyncDemo: () => void;
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
  onAsyncDemo,
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

      {/* Runtime mode toggle — Tree-walker / Bytecode VM / WASM / x86. */}
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => {
          if (isMode(v)) onModeChange(v);
        }}
        variant="outline"
        size="sm"
        aria-label="Runtime mode"
      >
        <ToggleGroupItem value="tree-walker" className="gap-1.5">
          <ListTree className="size-3.5" />
          <span className="hidden sm:inline">Tree</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="bytecode" className="gap-1.5">
          <Cpu className="size-3.5" />
          <span className="hidden sm:inline">VM</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="wasm" className="gap-1.5">
          <Boxes className="size-3.5" />
          <span className="hidden sm:inline">WASM</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="x86" className="gap-1.5">
          <Zap className="size-3.5" />
          <span className="hidden sm:inline">x86</span>
        </ToggleGroupItem>
      </ToggleGroup>

      <Button
        onClick={onAsyncDemo}
        variant="outline"
        size="default"
        title="Run the v3 async coroutine demo (real AsyncRuntime execution in the browser)"
      >
        <Sparkles className="size-4" />
        <span className="hidden sm:inline">Async demo</span>
      </Button>

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

const MODE_LABELS: Record<RuntimeMode, string> = {
  "tree-walker": "Tree-walker",
  bytecode: "Bytecode VM",
  wasm: "WASM backend",
  x86: "x86-64 backend",
};

function OutputPanel({ run, lint }: OutputPanelProps) {
  // The disassembly tabs only make sense in their respective modes.
  const showBytecode = run.mode === "bytecode";
  const showWasm = run.mode === "wasm";
  const showX86 = run.mode === "x86";
  return (
    <div className="flex min-h-[280px] min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Output · {MODE_LABELS[run.mode]}</span>
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
          {showWasm && (
            <TabsTrigger value="wasm" className="gap-1.5">
              <Boxes className="size-3.5" /> WASM
            </TabsTrigger>
          )}
          {showX86 && (
            <TabsTrigger value="x86" className="gap-1.5">
              <Zap className="size-3.5" /> x86
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
        {showWasm && (
          <TabsContent value="wasm" className="min-h-0 flex-1">
            <WasmTab run={run} />
          </TabsContent>
        )}
        {showX86 && (
          <TabsContent value="x86" className="min-h-0 flex-1">
            <X86Tab run={run} />
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
  return (
    run.result !== null ||
    run.vmResult !== null ||
    run.wasmResult !== null ||
    run.x86Result !== null
  );
}

/** Return the AST from whichever mode ran. */
function getAst(run: RunState) {
  return (
    run.ast ??
    run.result?.ast ??
    run.vmResult?.ast ??
    null
  );
}

/** Return the tokens from whichever mode ran. */
function getTokens(run: RunState) {
  return (
    run.tokens ??
    run.result?.tokens ??
    run.vmResult?.tokens ??
    null
  );
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
  const tokens = getTokens(run);
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

function WasmTab({ run }: { run: RunState }) {
  if (run.mode !== "wasm") {
    return (
      <EmptyTab label="Switch to the WASM mode and Run to see the wasm-text disassembly." />
    );
  }
  if (run.status === "running") {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Compiling to WASM…
        </div>
      </TabShell>
    );
  }
  if (!run.wasmText) {
    return (
      <EmptyTab label="No WASM disassembly yet — run the code in WASM mode." />
    );
  }
  const fnCount = run.wasmModule?.funcs.length ?? 0;
  const importCount = run.wasmModule?.imports.length ?? 0;
  const exportCount = run.wasmModule?.exports.length ?? 0;
  return (
    <TabShell>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Boxes className="size-3.5" />
        <span>
          {fnCount} function(s) · {importCount} import(s) · {exportCount} export(s)
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
        {run.wasmText}
      </pre>
    </TabShell>
  );
}

function X86Tab({ run }: { run: RunState }) {
  if (run.mode !== "x86") {
    return (
      <EmptyTab label="Switch to the x86 mode and Run to see the NASM assembly." />
    );
  }
  if (run.status === "running") {
    return (
      <TabShell>
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Compiling to x86-64…
        </div>
      </TabShell>
    );
  }
  if (!run.x86Text) {
    return (
      <EmptyTab label="No x86 assembly yet — run the code in x86 mode." />
    );
  }
  const fnCount = run.x86Module?.funcs.length ?? 0;
  const rodataCount = run.x86Module?.rodata.length ?? 0;
  return (
    <TabShell>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Zap className="size-3.5" />
        <span>
          {fnCount} function(s) · {rodataCount} rodata string(s) · entry ={" "}
          {run.x86Module?.entry ?? "—"}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
        {run.x86Text}
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
  if (sev === "error")
    return (
      <Badge variant="destructive" className="text-[10px] uppercase">
        error
      </Badge>
    );
  if (sev === "warning")
    return (
      <Badge
        variant="outline"
        className="text-[10px] uppercase text-amber-600 dark:text-amber-400"
      >
        warn
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] uppercase">
      info
    </Badge>
  );
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
          <span className={severityTone("error")}>
            {counts.error} error{counts.error === 1 ? "" : "s"}
          </span>
        )}
        {counts.warning > 0 && (
          <span className={severityTone("warning")}>
            {counts.warning} warning{counts.warning === 1 ? "" : "s"}
          </span>
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
  const isWasm = run.mode === "wasm";
  const isX86 = run.mode === "x86";

  // Per-mode step / value extraction.
  let steps = 0;
  let returnValue: Value | null | undefined = null;
  let ok = false;
  if (isVm) {
    steps = run.vmResult?.runtime?.steps ?? 0;
    returnValue = run.vmResult?.runtime?.value;
    ok = run.vmResult?.ok ?? false;
  } else if (isWasm) {
    returnValue = run.wasmResult?.output ?? null;
    ok = !run.wasmResult?.error;
  } else if (isX86) {
    returnValue = run.x86Result?.output ?? null;
    ok = !run.x86Result?.error;
  } else {
    steps = run.result?.runtime?.steps ?? 0;
    returnValue = run.result?.runtime?.value;
    ok = run.result?.ok ?? false;
  }

  const tokensCount = getTokens(run)?.length ?? 0;
  const stats: Array<{ label: string; value: string; icon: React.ReactNode }> = [
    {
      label: "Runtime mode",
      value: MODE_LABELS[run.mode],
      icon: isVm ? (
        <Cpu className="size-4" />
      ) : isWasm ? (
        <Boxes className="size-4" />
      ) : isX86 ? (
        <Zap className="size-4" />
      ) : (
        <ListTree className="size-4" />
      ),
    },
    {
      label: "Status",
      value: ok ? "ok" : "errors",
      icon: ok ? (
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
      label: isVm ? "VM steps" : isWasm || isX86 ? "Native ops" : "Eval steps",
      value:
        isWasm || isX86
          ? "(native)"
          : steps.toLocaleString(),
      icon: <Hash className="size-4" />,
    },
    {
      label: "Output lines",
      value: run.output.length.toLocaleString(),
      icon: <FileCode2 className="size-4" />,
    },
    {
      label: "Return value",
      value:
        returnValue !== undefined && returnValue !== null
          ? formatValue(returnValue as Value)
          : returnValue === null
            ? "null"
            : "—",
      icon: <Braces className="size-4" />,
    },
    {
      label: "Tokens",
      value: tokensCount.toLocaleString(),
      icon: <ListTree className="size-4" />,
    },
    {
      label: isVm
        ? "Bytecode funcs"
        : isWasm
          ? "WASM funcs"
          : isX86
            ? "x86 funcs"
            : "Bytecode funcs",
      value: isVm
        ? (run.vmResult?.bytecode?.funcs.length ?? 0).toLocaleString()
        : isWasm
          ? (run.wasmModule?.funcs.length ?? 0).toLocaleString()
          : isX86
            ? (run.x86Module?.funcs.length ?? 0).toLocaleString()
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
      {isWasm && (
        <p className="mt-3 text-xs text-muted-foreground">
          WASM backend compiles IR → WebAssembly (binary), instantiates in the
          browser via <code className="font-mono text-xs">WebAssembly.instantiate</code>,
          and runs the main function natively. See the WASM tab for the
          wasm-text disassembly.
        </p>
      )}
      {isX86 && (
        <p className="mt-3 text-xs text-muted-foreground">
          x86-64 backend compiles IR → NASM-syntax assembly (System V AMD64).
          On systems without <code className="font-mono text-xs">nasm</code>, a
          structured interpreter walks the same IR faithfully. See the x86 tab
          for the assembly text.
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

function describeString(t: {
  segments?: Array<{ kind: string; value: string }>;
}): string {
  if (!t.segments) return "";
  return t.segments
    .map((seg) => (seg.kind === "interp" ? "{" + seg.value + "}" : seg.value))
    .join("");
}

/** Modal showing the v3 async coroutine demo output + source. */
function AsyncDemoDialog({
  state,
  onClose,
}: {
  state: AsyncDemoState;
  onClose: () => void;
}) {
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            v3 Async Coroutine Demo
          </DialogTitle>
          <DialogDescription>
            Real Aether execution in the browser. The source uses the v3{" "}
            <code className="font-mono text-xs">CoroutineScheduler</code>{" "}
            builtins (<code className="font-mono text-xs">spawn</code>,{" "}
            <code className="font-mono text-xs">channel</code>,{" "}
            <code className="font-mono text-xs">send_ch</code>,{" "}
            <code className="font-mono text-xs">recv</code>,{" "}
            <code className="font-mono text-xs">join</code>) wired into the
            tree-walker via <code className="font-mono text-xs">registerCoroutineBuiltins</code>.
            A producer coroutine sends 1, 2, 3 into a channel; a consumer
            drains it and sums the values; the main program joins both.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="output" className="mt-2">
          <TabsList>
            <TabsTrigger value="output" className="gap-1.5">
              <Sparkles className="size-3.5" /> Output
            </TabsTrigger>
            <TabsTrigger value="source" className="gap-1.5">
              <FileCode2 className="size-3.5" /> Source
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="output"
            className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 scrollbar-thin"
          >
            {state.running && state.output.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Spawning coroutines…
              </div>
            ) : state.error ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">
                {state.error}
              </pre>
            ) : state.output.length === 0 ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                (no output yet)
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {state.output.map((line, i) => (
                  <div key={i} className="min-h-[1.25rem]">
                    {line === "" ? "\u00A0" : line}
                  </div>
                ))}
              </pre>
            )}
          </TabsContent>
          <TabsContent
            value="source"
            className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 scrollbar-thin"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
              {state.source ?? "// loading…"}
            </pre>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
