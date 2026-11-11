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

// v2 milestone — what's actually built, not just specced.
const V2_FEATURES = [
  {
    icon: Cpu,
    title: "Bytecode VM",
    status: "Live" as const,
    body: "AST → SSA-ish IR → register bytecode → interpreter. fib(15)=610, ~1.88x faster than the tree-walker on sum-50k, 13/15 examples at parity.",
  },
  {
    icon: Zap,
    title: "8 optimizer passes",
    status: "Live" as const,
    body: "Constant folding, dead-code elimination, common-subexpression elimination, loop-invariant code motion, branch simplification, strength reduction, inlining, tail-call optimization.",
  },
  {
    icon: Workflow,
    title: "Async runtime",
    status: "Live" as const,
    body: "async/await over Promises (not true suspend/resume — see ADR-13). Futures, task spawning, await/try semantics.",
  },
  {
    icon: Server,
    title: "Module system",
    status: "Live" as const,
    body: "import/export with regex-based path resolution (ADR-14). Private/public visibility, re-export, cyclic detection, multi-file programs.",
  },
  {
    icon: Code2,
    title: "CLI (8 commands)",
    status: "Live" as const,
    body: "run, check, fmt, lint, test, bench, disasm, lsp — Bun-runnable via `bun aether/tools/cli/cli.ts`.",
  },
  {
    icon: Wand2,
    title: "Formatter",
    status: "Live" as const,
    body: "Parser-based, idempotent (format(format(x)) === format(x)). Verified across all 35 examples. Preserves comments.",
  },
  {
    icon: ScanLine,
    title: "Linter (30 rules)",
    status: "Live" as const,
    body: "Correctness (10), style (10), performance (5), complexity (5). Configurable severities. 342 linter tests.",
  },
  {
    icon: FileText,
    title: "LSP (21 methods)",
    status: "Live" as const,
    body: "hover, completion, diagnostics, goto-definition, references, rename, formatting, code-action, document symbols, and more.",
  },
  {
    icon: CheckCircle2,
    title: "Test runner",
    status: "Live" as const,
    body: "Snapshot assertions, coverage tracking, `aether test` CLI command. Used to run the Aether example/test suite.",
  },
  {
    icon: Hexagon,
    title: "Stdlib (18 modules / 396 fns)",
    status: "Live" as const,
    body: "string, math, collections, io, datetime, regex, encoding, crypto, text, async, bits, set, tree, list, functional, statistics, uuid, validate — 396 functions.",
  },
  {
    icon: FileText,
    title: "35 examples",
    status: "Live" as const,
    body: "fibonacci, quicksort, merge_sort, calculator, json_parser, linked_list, matrix_ops, todo_cli, game_of_life, binary_tree, hanoi, caesar_cipher, collatz, and more.",
  },
  {
    icon: FileText,
    title: "Docs (~180k words)",
    status: "Live" as const,
    body: "10-book-chapters, API reference, 15 ADRs, 6 RFCs, 17-file spec, 10 tutorials, 6 guides, glossary, error-catalog, FAQ.",
  },
];

export function AboutView() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Info className="size-5" />}
        title="About Aether"
        description="An interactive playground for the Aether programming language — part of Project Nexus. Now running the v2 bytecode VM in your browser."
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
              — lexer, parser, semantic analyser, and (in v2) a bytecode VM —
              runs entirely in this browser, so the playground is fully
              interactive with no server round-trip.
            </p>
            <p>The language includes:</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>Statically-typed bindings (<code className="font-mono text-xs">let</code>, <code className="font-mono text-xs">let mut</code>, <code className="font-mono text-xs">const</code>)</li>
              <li>First-class closures and named functions</li>
              <li>Algebraic data types (<code className="font-mono text-xs">enum</code>) with pattern matching</li>
              <li>Struct records (<code className="font-mono text-xs">struct</code>)</li>
              <li>Option &amp; Result types and the <code className="font-mono text-xs">?</code> error-propagation operator</li>
              <li>Ranges, tuples, arrays, maps</li>
              <li><code className="font-mono text-xs">async</code> / <code className="font-mono text-xs">await</code> futures</li>
              <li>Module system (<code className="font-mono text-xs">import</code> / <code className="font-mono text-xs">export</code>)</li>
              <li>18 stdlib modules with 396 built-in functions</li>
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
              write, run, and explore Aether code in their browser, using
              either the v1 tree-walker or the v2 bytecode VM.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="v2 status — what's built"
          description="Bytecode VM, toolchain, stdlib, docs. Honest about v1 vs v2."
          icon={<Cpu className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {V2_FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col gap-2 rounded-lg border bg-background p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <f.icon className="size-4 text-primary" />
                    {f.title}
                  </div>
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
                  >
                    <CircleDot className="size-2.5" />
                    {f.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Two runtimes, one playground"
          description="Tree-walker (v1) and Bytecode VM (v2)."
          icon={<Workflow className="size-4" />}
          className="lg:col-span-2"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The playground's toolbar lets you switch between two execution
              backends for the same source code:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>
                <span className="font-medium">Tree-walker (v1)</span> — the
                original AST-walking evaluator. Lower latency for small REPL
                workloads; step budget 1,000,000. Still the default.
              </li>
              <li>
                <span className="font-medium">Bytecode VM (v2)</span> — lowers
                the AST to an SSA-ish IR, compiles to register bytecode, runs
                on a stack-free interpreter. Faster on hot loops, step budget
                20,000,000. The Bytecode tab shows the disassembly.
              </li>
            </ul>
            <p>
              The same code runs on both — switch the toggle and press Run to
              compare outputs and (in the Benchmarks view) timings.
            </p>
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
              <span className="text-foreground">Bytecode tab</span>
              <Badge variant="outline" className="text-[10px]">disassembly</Badge>
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
              The high-value core of the v2 brief is real and runs in your
              browser right now: the bytecode VM, the 8-pass optimizer, the
              async runtime, the module system, the CLI, the formatter, the
              linter, the LSP, the test runner, the 18-module / 396-function
              stdlib, the 35 examples, and ~180k words of docs.
            </p>
            <p>
              The parts of the original brief that are <span className="font-medium text-foreground">not</span> built — and are explicitly roadmap — include: the
              four native / WASM backends (the VM is a TS interpreter, not a
              native compiler), the full 60-package package registry, the 200+
              example target (we have 35), the 15K-test target (we have
              thousands, not 15K), and the five full language translations (the
              language is defined in English docs only). These are documented
              in the RFCs and ADRs as future work, not claimed as done.
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
