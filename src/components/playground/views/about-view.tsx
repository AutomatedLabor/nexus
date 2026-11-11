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

export function AboutView() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Info className="size-5" />}
        title="About Aether"
        description="An interactive playground for the Aether programming language — part of Project Nexus."
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
              — lexer, parser, semantic analyser, and tree-walking evaluator —
              runs entirely in this browser, so the playground is fully
              interactive with no server round-trip.
            </p>
            <p>
              The v1 language includes:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>Statically-typed bindings (<code className="font-mono text-xs">let</code>, <code className="font-mono text-xs">let mut</code>, <code className="font-mono text-xs">const</code>)</li>
              <li>First-class closures and named functions</li>
              <li>Algebraic data types (<code className="font-mono text-xs">enum</code>) with pattern matching</li>
              <li>Struct records (<code className="font-mono text-xs">struct</code>)</li>
              <li>Option &amp; Result types and the <code className="font-mono text-xs">?</code> error-propagation operator</li>
              <li>Ranges, tuples, arrays, maps</li>
              <li>10 stdlib modules with 200+ built-in functions</li>
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
              write, run, and explore Aether code in their browser.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          title="Compiler Pipeline"
          description="From source to value in four stages."
          icon={<Workflow className="size-4" />}
          className="lg:col-span-2"
        >
          <ol className="space-y-3 text-sm">
            {[
              {
                n: 1,
                title: "Lex",
                body: "Source text is tokenised into keywords, identifiers, literals, and punctuation. Every token records its source location for error reporting.",
              },
              {
                n: 2,
                title: "Parse",
                body: "A hand-written recursive-descent parser produces an AST — a discriminated union of ~80 node kinds (expressions, statements, patterns, types).",
              },
              {
                n: 3,
                title: "Check",
                body: "The semantic analyser resolves names and infers types. Type errors do not block execution (lenient playground semantics).",
              },
              {
                n: 4,
                title: "Run",
                body: "A tree-walking evaluator executes the AST with first-class closures, pattern matching, ADTs, and panic/error propagation.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="flex gap-3 rounded-lg border bg-background p-3"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {s.n}
                </div>
                <div>
                  <p className="font-medium text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
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
          title="Honest Note"
          description="Who built this."
          icon={<Heart className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Heart className="size-6 text-rose-500" />
            <p className="text-sm text-muted-foreground">
              The Aether language core, standard library, examples, and this
              playground were all written by autonomous AI agents as part of
              Project Nexus. The work is real, the code is shipped, and you
              are running it right now in your browser.
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
                href={`${GITHUB_URL}/blob/main/docs/spec/03-type-system.md`}
                target="_blank"
                rel="noreferrer"
              >
                <FileText className="size-3.5" />
                Type System
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
