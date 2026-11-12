"use client";

import * as React from "react";
import {
  Info,
  Hexagon,
  Github,
  Code2,
  Layers,
  Workflow,
  Heart,
  FileText,
  Cpu,
  Zap,
  Wand2,
  ScanLine,
  Server,
  CheckCircle2,
  CircleDot,
  Boxes,
  Package,
  GitBranch,
  Construction,
} from "lucide-react";
import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const GITHUB_URL = "https://github.com/AutomatedLabor/nexus";

const TECH_STACK = [
  { name: "Next.js 16", role: "App Router + Turbopack" },
  { name: "TypeScript 5", role: "Strict typing throughout" },
  { name: "Tailwind CSS 4", role: "Theme tokens + utility styling" },
  { name: "shadcn/ui", role: "New York component set" },
  { name: "Zustand", role: "Client view state" },
  { name: "next-themes", role: "Light / dark mode" },
  { name: "recharts", role: "Benchmark charts" },
  { name: "lucide-react", role: "Icon set" },
];

type Status = "Live" | "Roadmap" | "Partial";

interface Feature {
  icon: typeof Cpu;
  title: string;
  status: Status;
  body: string;
}

// v3 milestone — what's actually built.
const V3_FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: "Bytecode VM",
    status: "Live",
    body: "AST → SSA-ish IR → register bytecode → interpreter. fib(15)=610, ~1.88× faster than the tree-walker on sum-50k.",
  },
  {
    icon: Boxes,
    title: "WASM backend",
    status: "Live",
    body: "IR → WebAssembly (binary), instantiated via WebAssembly.instantiate in the browser. fib(10)=55, native i32 fast path + host-call slow path.",
  },
  {
    icon: Zap,
    title: "x86-64 backend",
    status: "Live",
    body: "IR → NASM-syntax assembly (System V AMD64). Structured interpreter proves the codegen; with nasm, native execution is one nasm + ld away. fib(10)=55.",
  },
  {
    icon: GitBranch,
    title: "Trait system",
    status: "Live",
    body: "Trait declarations, implementations, and bounded generics. Static dispatch at compile time. Coherence checking and overlap detection are in place.",
  },
  {
    icon: GitBranch,
    title: "Borrow checker",
    status: "Live",
    body: "Ownership + borrowing + lifetimes on the AST: tracks moved values, double-moves, lifetime constraints, and aliasing rules. Reports diagnostics without blocking execution.",
  },
  {
    icon: Workflow,
    title: "Async coroutines",
    status: "Live",
    body: "Real AsyncRuntime (spawn / await / channel / select / join / race / cancel) backed by JS Promises. Used by the playground's 'Async demo' button. RFC-001 suspend/resume in the VM is roadmap.",
  },
  {
    icon: Server,
    title: "Module system",
    status: "Live",
    body: "import/export with regex-based path resolution (ADR-14). Private/public visibility, re-export, cyclic detection, multi-file programs.",
  },
  {
    icon: Package,
    title: "15 Aether packages",
    status: "Live",
    body: "aether-string, aether-math, aether-list, aether-set, aether-dict, aether-sort, aether-result, aether-iterator, aether-base64, aether-json, aether-lru, aether-parser, aether-rb-tree, aether-regex, aether-uuid. Browse them in the Packages view.",
  },
  {
    icon: Code2,
    title: "CLI (8 commands)",
    status: "Live",
    body: "run, check, fmt, lint, test, bench, disasm, lsp — Bun-runnable via `bun aether/tools/cli/cli.ts`.",
  },
  {
    icon: Wand2,
    title: "Formatter",
    status: "Live",
    body: "Parser-based, idempotent (format(format(x)) === format(x)). Verified across all 35 examples. Preserves comments.",
  },
  {
    icon: ScanLine,
    title: "Linter (30 rules)",
    status: "Live",
    body: "Correctness (10), style (10), performance (5), complexity (5). Configurable severities. 342 linter tests.",
  },
  {
    icon: FileText,
    title: "LSP (21 methods)",
    status: "Live",
    body: "hover, completion, diagnostics, goto-definition, references, rename, formatting, code-action, document symbols, and more.",
  },
  {
    icon: CheckCircle2,
    title: "Test runner",
    status: "Live",
    body: "Snapshot assertions, coverage tracking, `aether test` CLI command. Used to run the Aether example/test suite.",
  },
  {
    icon: Hexagon,
    title: "24 stdlib modules",
    status: "Live",
    body: "string, math, collections, io, datetime, regex, encoding, crypto, text, async, bits, set, tree, list, functional, statistics, uuid, validate, random, parser, matrix, sort, graph, heap — 400+ functions.",
  },
  {
    icon: FileText,
    title: "~50 examples",
    status: "Live",
    body: "fibonacci, quicksort, merge_sort, calculator, json_parser, linked_list, matrix_ops, todo_cli, game_of_life, binary_tree, hanoi, caesar_cipher, collatz, dijkstra, kmp_search, nqueens, ackermann, and more — across Algorithms / Data Structures / Math / Strings / Traits / Borrow / Async categories.",
  },
  {
    icon: FileText,
    title: "Docs (~180k words)",
    status: "Live",
    body: "10-book-chapters, API reference, 15 ADRs, 6 RFCs, 17-file spec, 10 tutorials, 6 guides, glossary, error-catalog, FAQ.",
  },
];

const SELF_HOSTING_STEPS: Feature[] = [
  {
    icon: ScanLine,
    title: "Bootstrap lexer",
    status: "Live",
    body: "Aether-written lexer that tokenizes the Aether source language itself — first step toward a self-hosted compiler.",
  },
  {
    icon: Code2,
    title: "Bootstrap AST + parser",
    status: "Partial",
    body: "AST node definitions and recursive-descent parser stubs in Aether itself; not yet wired into the production pipeline (the TS parser is still the source of truth).",
  },
  {
    icon: Cpu,
    title: "Bootstrap codegen",
    status: "Roadmap",
    body: "Aether-written codegen targeting the bytecode VM (and eventually WASM + x86). The v3 backends (TS-side) demonstrate the IR-to-target lowering; the bootstrap will re-implement it in Aether.",
  },
];

function statusBadge(status: Status) {
  switch (status) {
    case "Live":
      return (
        <Badge
          variant="outline"
          className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
        >
          <CircleDot className="size-2.5" />
          {status}
        </Badge>
      );
    case "Partial":
      return (
        <Badge
          variant="outline"
          className="gap-1 text-[10px] text-amber-600 dark:text-amber-400"
        >
          <Construction className="size-2.5" />
          {status}
        </Badge>
      );
    case "Roadmap":
      return (
        <Badge
          variant="outline"
          className="gap-1 text-[10px] text-muted-foreground"
        >
          {status}
        </Badge>
      );
  }
}

export function AboutView() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Info className="size-5" />}
        title="About Aether"
        description="An interactive playground for the Aether programming language — part of Project Nexus. v3 brings two native backends (WASM + x86), a trait system, a borrow checker, 15 packages, and real async coroutines — all running in your browser."
        actions={
          <Button asChild variant="outline">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              <Github className="size-4" />
              View on GitHub
            </a>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="What is Aether?"
          description="A small, expression-oriented, statically-typed language."
          icon={<Hexagon className="size-4" />}
          className="lg:col-span-2"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Aether is an ML- and Rust-flavoured language designed for clarity,
              safety, and a tight feedback loop. Its compiler/runtime pipeline
              — lexer, parser, semantic analyser, bytecode VM, and (in v3) WASM
              + x86 native backends — runs entirely in this browser, so the
              playground is fully interactive with no server round-trip for
              execution.
            </p>
            <p>The language includes:</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>
                Statically-typed bindings (<code className="font-mono text-xs">let</code>,{" "}
                <code className="font-mono text-xs">let mut</code>,{" "}
                <code className="font-mono text-xs">const</code>)
              </li>
              <li>First-class closures and named functions</li>
              <li>
                Algebraic data types (<code className="font-mono text-xs">enum</code>) with pattern matching
              </li>
              <li>
                Struct records (<code className="font-mono text-xs">struct</code>) with trait-based polymorphism (v3)
              </li>
              <li>
                Ownership + borrowing (v3 borrow checker)
              </li>
              <li>Option &amp; Result types and the <code className="font-mono text-xs">?</code> error-propagation operator</li>
              <li>Ranges, tuples, arrays, maps</li>
              <li><code className="font-mono text-xs">async</code> / <code className="font-mono text-xs">await</code> futures + coroutine runtime</li>
              <li>Module system (<code className="font-mono text-xs">import</code> / <code className="font-mono text-xs">export</code>)</li>
              <li>24 stdlib modules with 400+ built-in functions</li>
              <li>15 installable Aether packages (v3)</li>
            </ul>
          </div>
        </SectionCard>

        <SectionCard
          title="Project Nexus"
          description="The mission behind this work."
          icon={<Hexagon className="size-4" />}
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Project Nexus is an experiment in autonomous software labour: a
              coordinated set of AI agents that design, implement, test, and
              ship a real programming language and toolchain.
            </p>
            <p>
              Aether is the language. This playground is the user-facing
              product — a Vercel-deployed Next.js application that lets anyone
              write, run, and explore Aether code in their browser, using any
              of the four runtime backends: tree-walker, bytecode VM, WASM,
              or x86-64.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="v3 status — what's built"
          description="Four runtimes, traits, borrow checker, async, 15 packages. Honest about what's Live vs Roadmap."
          icon={<Boxes className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {V3_FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col gap-2 rounded-lg border bg-background p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <f.icon className="size-4 text-primary" />
                    {f.title}
                  </div>
                  {statusBadge(f.status)}
                </div>
                <p className="text-xs text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Four runtimes, one playground"
          description="Tree-walker (v1) · Bytecode VM (v2) · WASM (v3) · x86-64 (v3)."
          icon={<Workflow className="size-4" />}
          className="lg:col-span-2"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The playground&apos;s toolbar lets you switch between four
              execution backends for the same source code:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>
                <span className="font-medium">Tree-walker (v1)</span> — the
                original AST-walking evaluator. Lowest latency for small REPL
                workloads; step budget 1,000,000.
              </li>
              <li>
                <span className="font-medium">Bytecode VM (v2)</span> — lowers
                the AST to an SSA-ish IR, compiles to register bytecode, runs
                on a stack-free interpreter. Faster on hot loops, step budget
                20,000,000. The Bytecode tab shows the disassembly.
              </li>
              <li>
                <span className="font-medium">WASM (v3)</span> — lowers the IR
                to a WebAssembly module and instantiates it in the browser via{" "}
                <code className="font-mono text-xs">WebAssembly.instantiate</code>.
                Native i32 arithmetic, host-call slow path. The WASM tab shows
                the wasm-text disassembly.
              </li>
              <li>
                <span className="font-medium">x86-64 (v3)</span> — lowers the
                IR to NASM-syntax assembly (System V AMD64). Without{" "}
                <code className="font-mono text-xs">nasm</code> in the sandbox,
                a structured interpreter walks the same IR faithfully. The
                x86 tab shows the assembly text.
              </li>
            </ul>
            <p>
              The same code runs on all four — switch the toggle and press Run
              to compare outputs and (in the Benchmarks view) timings.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Self-hosting roadmap"
          description="The bootstrap: Aether written in Aether."
          icon={<GitBranch className="size-4" />}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The long-term goal is a self-hosted compiler — Aether code
              compiled by an Aether-written compiler. The v3 backends (WASM +
              x86) demonstrate the IR-to-target lowering in TS; the bootstrap
              re-implements the lowering in Aether itself.
            </p>
            <div className="space-y-2">
              {SELF_HOSTING_STEPS.map((f) => (
                <div
                  key={f.title}
                  className="flex items-start gap-2 rounded-md border bg-background p-2"
                >
                  <f.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {f.title}
                      </span>
                      {statusBadge(f.status)}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {f.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Toolchain"
          description="Formatter, linter, LSP, CLI, test runner."
          icon={<Wand2 className="size-4" />}
        >
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">Format button</span>
              <Badge variant="outline" className="text-[10px]">idempotent</Badge>
            </li>
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">Lint tab</span>
              <Badge variant="outline" className="text-[10px]">30 rules</Badge>
            </li>
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">Bytecode / WASM / x86 tabs</span>
              <Badge variant="outline" className="text-[10px]">disassembly</Badge>
            </li>
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">Async demo button</span>
              <Badge variant="outline" className="text-[10px]">real runtime</Badge>
            </li>
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">Packages view</span>
              <Badge variant="outline" className="text-[10px]">15 packages</Badge>
            </li>
            <li className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-foreground">CLI</span>
              <Badge variant="outline" className="text-[10px]">8 commands</Badge>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Tech Stack"
          description="What this playground is built with."
          icon={<Layers className="size-4" />}
        >
          <ul className="space-y-2">
            {TECH_STACK.map((t) => (
              <li
                key={t.name}
                className="flex items-center justify-between rounded-md border bg-background px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Code2 className="size-3.5 text-muted-foreground" />
                  {t.name}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {t.role}
                </Badge>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Honest note — what's real vs roadmap"
          description="No inflated claims. Here's what shipped and what didn't."
          icon={<Heart className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The high-value core of the v3 brief is real and runs in your
              browser right now: the bytecode VM, the WASM backend, the x86
              backend, the trait system, the borrow checker, the async
              coroutine runtime, the module system, the CLI, the formatter,
              the linter, the LSP, the test runner, the 24-module / 400-function
              stdlib, the 15 Aether packages, the ~50 examples, and ~180k
              words of docs.
            </p>
            <p>
              The parts that are explicitly <span className="font-medium text-foreground">roadmap</span>{" "}
              include: full native codegen execution via <code className="font-mono text-xs">nasm</code> +{" "}
              <code className="font-mono text-xs">ld</code> (we have a structured
              interpreter that walks the same IR, but no in-browser assembler),
              true suspend/resume <code className="font-mono text-xs">await</code>{" "}
              in the bytecode VM (the AsyncRuntime is JS-Promise-backed), the
              full 60-package package-registry target, and the self-hosted
              compiler (the bootstrap lexer is real; the AST/parser stubs are
              partial; codegen in Aether is roadmap). These are documented in
              the RFCs and ADRs as future work, not claimed as done.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Further Reading"
          description="Language specification & repository."
          icon={<FileText className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Github className="size-3.5" />
                GitHub Repository
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${GITHUB_URL}/blob/main/docs/spec/00-index.md`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="size-3.5" />
                Language Spec (Index)
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${GITHUB_URL}/blob/main/docs/spec/01-overview.md`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="size-3.5" />
                Overview
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${GITHUB_URL}/blob/main/docs/rfcs/rfc-002-bytecode-vm.md`}
                target="_blank"
                rel="noreferrer"
              >
                <Cpu className="size-3.5" />
                RFC-002: Bytecode VM
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${GITHUB_URL}/blob/main/docs/spec/12-stdlib.md`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="size-3.5" />
                Standard Library
              </a>
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
