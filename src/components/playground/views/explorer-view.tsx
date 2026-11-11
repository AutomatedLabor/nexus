"use client";

import * as React from "react";
import {
  Compass,
  ChevronRight,
  Braces,
  ListTree,
  GitBranch,
  Workflow,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "../ui/page-header";
import { SectionCard } from "../ui/section-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A grammar category: e.g. "Expressions", "Statements". */
interface GrammarCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  rules: GrammarRule[];
}

interface GrammarRule {
  name: string;
  /** Production summary in pseudo-EBNF (display only). */
  syntax: string;
  example: string;
  description: string;
}

const GRAMMAR: GrammarCategory[] = [
  {
    id: "expressions",
    label: "Expressions",
    icon: <Braces className="size-4" />,
    rules: [
      {
        name: "Literals",
        syntax: "Int | Float | Bool | String | Char | unit",
        example: '42    3.14    true    "hi"    \'a\'    unit',
        description:
          "Atomic values. Strings support interpolation via f\"…{expr}…\".",
      },
      {
        name: "Binary",
        syntax: "Expr op Expr    op ∈ + - * / % & | ^ << >> == != < > <= >= && ||",
        example: "1 + 2 * 3    x && y || z    a == b",
        description: "Standard operator precedence (* binds tighter than +).",
      },
      {
        name: "Unary",
        syntax: "op Expr    op ∈ - ! ~",
        example: "-x    !done    ~mask",
        description: "Negation, logical not, bitwise not.",
      },
      {
        name: "Call",
        syntax: "Expr ( args )",
        example: "fib(10)    add(1, 2)",
        description: "Function call. Closures and builtins are first-class.",
      },
      {
        name: "Lambda",
        syntax: "fn ( params ) [ -> Type ] { body }",
        example: "fn(x: int) -> int { x + 1 }",
        description: "Anonymous closure capturing its enclosing scope.",
      },
      {
        name: "If",
        syntax: "if Expr { Expr } [ else { Expr } ]",
        example: "if n < 0 { -1 } else { n }",
        description: "Conditional expression. The else branch is optional only when the result is unit.",
      },
      {
        name: "Match",
        syntax: "match Expr { pat => Expr, … }",
        example: "match o { Some(v) => v, None => 0 }",
        description: "Pattern-match a scrutinee against a sequence of arms.",
      },
      {
        name: "Range",
        syntax: "Expr .. Expr | Expr ..= Expr",
        example: "0 .. 10    1 ..= n",
        description: "Half-open or inclusive integer range (used by for-loops).",
      },
      {
        name: "As (cast)",
        syntax: "Expr as Type",
        example: "(7 / 2) as int    65 as char",
        description: "Explicit type conversion (numeric, int<->float, char<->int).",
      },
      {
        name: "Error propagation",
        syntax: "Expr ?",
        example: "unwrap?(maybe)",
        description: "Unwrap an Ok/Some; on Err/None, propagate it from the enclosing function.",
      },
    ],
  },
  {
    id: "statements",
    label: "Statements",
    icon: <ListTree className="size-4" />,
    rules: [
      {
        name: "let",
        syntax: "let [mut] name [: Type] = Expr ;",
        example: "let x = 42;    let mut y = 0;",
        description: "Bind an immutable (let) or mutable (let mut) value.",
      },
      {
        name: "const",
        syntax: "const name [: Type] = Expr ;",
        example: "const PI = 3.14159;",
        description: "Compile-time constant — never reassignable.",
      },
      {
        name: "fn",
        syntax: "fn name ( params ) [ -> Type ] { body }",
        example: "fn add(a: int, b: int) -> int { a + b }",
        description: "Named function declaration. Hoisted, so call-order is free.",
      },
      {
        name: "while",
        syntax: "while Expr { body }",
        example: "while n > 0 { n = n - 1; }",
        description: "Loop while a condition holds.",
      },
      {
        name: "for in",
        syntax: "for name in Expr { body }",
        example: "for i in 0 .. 10 { print(i); }",
        description: "Iterate over a range, array, or other iterable.",
      },
      {
        name: "return / break / continue",
        syntax: "return [Expr] ;  |  break ;  |  continue ;",
        example: "return x + 1;    break;    continue;",
        description: "Control-flow inside functions and loops.",
      },
      {
        name: "Block",
        syntax: "{ Stmt* [Expr] }",
        example: "{ let x = 1; x + 2 }",
        description: "Block expression — evaluates to its trailing expression.",
      },
    ],
  },
  {
    id: "declarations",
    label: "Declarations",
    icon: <GitBranch className="size-4" />,
    rules: [
      {
        name: "struct",
        syntax: "struct Name { field: Type, … }",
        example: "struct Point { x: float, y: float }",
        description: "Record type with named fields. Constructed via Name { field: value, … }.",
      },
      {
        name: "enum",
        syntax: "enum Name<T> { Variant(T), … }",
        example: "enum Option<T> { Some(T), None }",
        description:
          "Algebraic data type. Variants can be unit, tuple, or struct-shaped.",
      },
      {
        name: "type alias",
        syntax: "type Name = Type ;",
        example: "type Vec<T> = Array<T>;",
        description: "Type alias — purely a compile-time rename.",
      },
      {
        name: "import (parsed, unresolved in v1)",
        syntax: "import \"path\" [ names] ;",
        example: 'import "math" { sin, cos };',
        description:
          "Module import. Parsed by the lexer/parser; not resolved at runtime in v1 (single-file programs).",
      },
    ],
  },
  {
    id: "patterns",
    label: "Patterns",
    icon: <Workflow className="size-4" />,
    rules: [
      {
        name: "Wildcard",
        syntax: "_",
        example: "match n { _ => 99 }",
        description: "Matches anything, binds nothing.",
      },
      {
        name: "Bind",
        syntax: "name [: Type]",
        example: "Some(v) => v",
        description: "Binds the matched value to a new variable.",
      },
      {
        name: "Literal",
        syntax: "Int | Float | Bool | String | Char",
        example: "match n { 0 => \"zero\", 1 => \"one\", _ => \"many\" }",
        description: "Matches a constant literal value.",
      },
      {
        name: "Tuple / Array",
        syntax: "(pat, …)  |  [pat, …]",
        example: "(a, b) => a + b",
        description: "Destructure tuples and arrays positionally.",
      },
      {
        name: "Struct",
        syntax: "Name { field: pat, … }",
        example: "Point { x, y } => x + y",
        description: "Destructure a struct by field name.",
      },
      {
        name: "Enum",
        syntax: "Enum::Variant(pat, …)",
        example: "Option::Some(v) => v",
        description: "Match an enum variant and destructure its payload.",
      },
      {
        name: "Or",
        syntax: "pat | pat | …",
        example: "0 | 1 => \"small\"",
        description: "Match any of several alternatives.",
      },
    ],
  },
];

const PIPELINE_STAGES = [
  {
    name: "Lex",
    icon: <ListTree className="size-4" />,
    color: "text-sky-500",
    desc: "Source text → a stream of tokens (keywords, identifiers, literals, punctuation). The lexer records the source location of every token and supports nested string interpolation and block comments.",
  },
  {
    name: "Parse",
    icon: <Braces className="size-4" />,
    color: "text-violet-500",
    desc: "Tokens → an AST. A hand-written recursive-descent parser produces the typed discriminated-union of ~80 AST node kinds (expressions, statements, patterns, types).",
  },
  {
    name: "Check",
    icon: <GitBranch className="size-4" />,
    color: "text-amber-500",
    desc: "AST + symbol tables → type-checked AST. The semantic analyser infers types, resolves names, and reports type errors. Type errors do not block execution (lenient playground semantics).",
  },
  {
    name: "Run",
    icon: <Workflow className="size-4" />,
    color: "text-emerald-500",
    desc: "AST → value + output. A tree-walking evaluator executes the program with first-class closures, pattern matching, ADTs, and panic/error propagation.",
  },
];

export function ExplorerView() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <PageHeader
        icon={<Compass className="size-5" />}
        title="Language Explorer"
        description="Browse Aether's grammar, type system, and compiler pipeline. Click any rule to see its syntax and a runnable example."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Compiler Pipeline"
          description="How Aether turns source text into a value."
          icon={<Workflow className="size-4" />}
          className="lg:col-span-3"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.name} className="relative">
                <div className="flex h-full flex-col gap-2 rounded-lg border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md bg-muted",
                        stage.color,
                      )}
                    >
                      {stage.icon}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {stage.name}
                    </span>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      stage {i + 1}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {stage.desc}
                  </p>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ArrowRight className="absolute -right-2 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground/40 lg:block" />
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Grammar Browser"
          description="The four grammar categories of Aether."
          icon={<Braces className="size-4" />}
          className="lg:col-span-2"
        >
          <Accordion type="multiple" className="w-full">
            {GRAMMAR.map((cat) => (
              <AccordionItem key={cat.id} value={cat.id}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{cat.icon}</span>
                    {cat.label}
                    <Badge variant="secondary" className="text-[10px]">
                      {cat.rules.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-2">
                    {cat.rules.map((rule) => (
                      <li
                        key={rule.name}
                        className="rounded-md border bg-background p-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronRight className="size-3 text-muted-foreground" />
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {rule.name}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rule.description}
                        </p>
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Syntax
                          </p>
                          <pre className="overflow-x-auto rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px] text-foreground scrollbar-thin">
                            {rule.syntax}
                          </pre>
                        </div>
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Example
                          </p>
                          <pre className="overflow-x-auto rounded bg-muted/60 px-2 py-1.5 font-mono text-[11px] text-foreground scrollbar-thin">
                            {rule.example}
                          </pre>
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </SectionCard>

        <SectionCard
          title="Type Lattice"
          description="How Aether's primitive and composite types compose."
          icon={<GitBranch className="size-4" />}
        >
          <TypeLattice />
        </SectionCard>
      </div>
    </div>
  );
}

/** Compact visual representation of Aether's type system. */
function TypeLattice() {
  return (
    <div className="space-y-3 text-xs">
      <LatticeRow label="Primitive" types={["int", "float", "bool", "char", "string", "unit"]} />
      <LatticeRow label="Composite" types={["(T, U)", "[T]", "Map<K,V>", "struct { … }"]} />
      <LatticeRow label="Algebraic" types={["enum { … }", "Option<T>", "Result<T,E>"]} />
      <LatticeRow label="Function" types={["fn(P) -> R"]} />
      <div className="rounded-md border bg-background p-3">
        <p className="font-medium text-foreground">Widening</p>
        <p className="mt-1 text-muted-foreground">
          <code className="font-mono">int</code> widens to{" "}
          <code className="font-mono">float</code> automatically. The reverse
          direction requires an explicit <code className="font-mono">as int</code>{" "}
          cast.
        </p>
      </div>
      <div className="rounded-md border bg-background p-3">
        <p className="font-medium text-foreground">Generics</p>
        <p className="mt-1 text-muted-foreground">
          Type parameters are erased at runtime:{" "}
          <code className="font-mono">id&lt;int&gt;(42)</code> and{" "}
          <code className="font-mono">id(42)</code> call the same closure.
        </p>
      </div>
    </div>
  );
}

function LatticeRow({
  label,
  types,
}: {
  label: string;
  types: string[];
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="mb-2 font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => (
          <code
            key={t}
            className="rounded bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
          >
            {t}
          </code>
        ))}
      </div>
    </div>
  );
}
