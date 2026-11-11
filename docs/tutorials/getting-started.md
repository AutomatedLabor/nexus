# Getting Started with Aether

> Audience: someone who has never written Aether before.
> Prerequisites: a modern browser. That's it.
> Time to read: 25 minutes. Time to finish the exercises: an afternoon.

This tutorial walks you through installing nothing, opening the
Aether playground, writing your first program, understanding the
compile pipeline, and reading the diagnostics the language produces.
Every code block in this file is runnable — paste it into the
playground, hit **Run**, and watch it produce the printed output.

Aether is a statically-typed, expression-oriented language with
first-class algebraic data types, pattern matching, generics, and a
small, curated standard library. The v1 implementation is a
tree-walking interpreter that runs in the browser, so there is no
`apt-get install`, no `brew install`, no `cargo install`. You open
the playground and you are programming.

For the language reference, see
[../spec/01-overview.md](../spec/01-overview.md). For an opinionated
tour of what "good" Aether looks like, see
[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md).

## 1. Install nothing

Aether v1 is a single web page. The compiler, the type checker, and
the evaluator are all bundled into a single JavaScript module that
loads in your browser. There is no command-line tool to install, no
language server to configure, no toolchain to manage.

This is deliberate. The first version of Aether is designed to be
**try-able** in under five seconds. If you have to install anything,
most people who would otherwise try the language will not. The price
of that decision is that v1 cannot write files, talk to the network,
or be embedded in a backend service. Those capabilities are planned
for v2 (see [../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md)).

If you *want* a command-line tool today, the closest thing is to
clone the repo and run the test suite with `bun test` — the test
runner exercises the same compiler pipeline that the playground uses.
See [../tutorials/tooling.md](../tutorials/tooling.md) for the
current state of the tooling and what is planned for v2.

## 2. The playground

Open the Aether playground. You should see three panes:

1. **Editor** (left) — a monospace text area where you type Aether
   source. The editor does not yet do syntax highlighting or
   autocomplete (see [../rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md));
   it is a plain textarea for v1.
2. **Output** (top right) — the captured stdout of your program,
   printed line by line as the evaluator runs.
3. **Inspector** (bottom right) — tabs for **Tokens**, **AST**,
   **Type errors**, and **Steps**. Each tab shows what that stage of
   the pipeline produced. The Inspector is the single most useful
   feature of the playground for learning the language: it makes the
   compiler pipeline visible instead of hiding it behind a single
   "compile" button.

Type this into the editor and hit **Run** (or `Ctrl+Enter` /
`Cmd+Enter`):

```aether
println("Hello, Aether!");
```

The Output pane should show:

```
Hello, Aether!
```

Congratulations. You have written your first Aether program. The rest
of this tutorial unpacks what just happened.

## 3. Hello, world — annotated

```aether
println("Hello, Aether!");
```

This is a single expression statement. `println` is a built-in
function in the inline-eval environment (see
[../spec/12-stdlib.md](../spec/12-stdlib.md) for the full stdlib
catalog). It takes one argument, prints it, and returns unit (`()`).

The string `"Hello, Aether!"` is a *plain* string literal. Aether
also has interpolated strings, which begin with `f`:

```aether
let name = "world";
println(f"Hello, {name}!");
```

The `{name}` is an interpolation; the inner source is parsed as an
expression, evaluated, and rendered into the string. You can
interpolate any expression that has a printable form:

```aether
let x = 5;
let y = 7;
println(f"{x} + {y} = {x + y}");
// → 5 + 7 = 12
```

The semicolon at the end of the statement is required for top-level
expression statements. Inside a block, a final expression *without* a
semicolon is the block's value (see
[../tutorials/language-basics.md](../tutorials/language-basics.md)).

## 4. Your first variables

Aether has three binding forms: `let`, `let mut`, and `const`.

```aether
let x: int = 42;           // immutable, type annotated
let mut y: float = 3.14;   // mutable, type annotated
const PI: float = 3.14159; // compile-time constant
```

`let` introduces an immutable binding. You cannot reassign it
later; the type checker rejects `x = 99` with the message
`cannot assign to immutable variable 'x'` (see
[../reference/error-catalog.md](../reference/error-catalog.md)).

`let mut` introduces a mutable binding. You can reassign it, and you
can use compound-assignment operators like `+=`, `-=`, `*=`, `/=`,
`%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`.

`const` declares a constant. In v1, the difference between `const`
and `let` is mostly cosmetic — both are evaluated at runtime — but
`const` signals intent and is the form the linter will eventually
prefer for compile-time-known values (see
[../decisions/adr-08-stdlib-as-typescript-functions.md](../decisions/adr-08-stdlib-as-typescript-functions.md)).

Type annotations are optional in most places. The compiler does
bidirectional type inference (see
[../spec/03-type-system.md](../spec/03-type-system.md)) and will
fill in the type from the initializer when it can:

```aether
let z = 42;        // inferred int
let pi = 3.14;     // inferred float
let s = "hi";      // inferred string
let b = true;      // inferred bool
let u = ();        // inferred unit
```

Integer literals default to `int` and float literals default to
`float`. There is no `i32` vs `i64` distinction at the surface in v1
— the language has one `int` (64-bit) and one `float` (IEEE double).
See [../spec/03-type-system.md](../spec/03-type-system.md) §1.1 for
the rationale.

## 5. Your first function

```aether
fn add(a: int, b: int) -> int {
  a + b
}

print(add(2, 3));
// → 5
```

A function declaration has:

- a name (`add`),
- a parameter list `(a: int, b: int)`,
- an optional return type annotation `-> int`,
- a body `{ ... }`.

The body is a block. The **last expression** in the block (without
a trailing semicolon) is the function's return value. You do not
need to write `return` for the common case. If you do write
`return`, it must be `return EXPR;` — bare `return;` returns unit.

Functions are first-class values. You can pass them as arguments,
store them in variables, and return them from other functions:

```aether
fn apply(f: fn(int) -> int, x: int) -> int { f(x) }
fn inc(n: int) -> int { n + 1 }

print(apply(inc, 41));
// → 42
```

You can also write anonymous function literals (closures) with the
`fn` keyword:

```aether
let nums = [1, 2, 3];
let doubled = map(nums, fn(x: int) -> int { x * 2 });
print(doubled[0]); print(doubled[1]); print(doubled[2]);
// → 2
// → 4
// → 6
```

`map`, `filter`, `reduce`, `push`, `pop` are inline built-ins
provided by the evaluator (see
[../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md) for the
complete tour).

## 6. Running via the playground UI

The playground has three controls:

- **Run** (`Ctrl+Enter` / `Cmd+Enter`) — compiles and runs the
  current source.
- **Format** — disabled in v1 (planned for v2; see
  [../rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md)).
- **Share** — produces a URL that encodes the current source as a
  query parameter, so you can bookmark or send a program to a
  colleague.

The playground is a single route (`/`). There is no project view, no
multi-file editing, no terminal. This is intentional for v1; the
plan for v2 is a package manager and a multi-file module system
(see
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md)
and
[../decisions/adr-07-single-playground-route.md](../decisions/adr-07-single-playground-route.md)).

After you press **Run**, the Inspector populates. The four tabs
correspond to the four stages of the compiler pipeline:

| Tab | Stage | Source |
|-----|-------|--------|
| Tokens | lexer | `aether/core/lexer/lexer.ts` |
| AST | parser | `aether/core/parser/parser.ts` |
| Type errors | sema | `aether/core/sema/sema.ts` |
| Steps | eval | `aether/core/eval/eval.ts` |

The **Steps** tab shows how many evaluator steps the program took.
The v1 evaluator has a step limit (default 1,000,000 steps) and
aborts with `execution step limit exceeded (1000000)` if the
program runs longer than that. This is the single most important
performance constraint to understand about v1; see
[../tutorials/performance.md](../tutorials/performance.md).

## 7. The compile pipeline

When you hit **Run**, the playground calls `compileAndRun(source)`,
which is the public entry point of `aether/core/index.ts`. That
function runs four stages:

1. **Lex** — the lexer turns the source string into a list of tokens
   plus a list of lexer errors. Each token carries its source
   location (file, line, column, byte offset). The lexer is
   error-recovering: a bad character does not stop lexing.
2. **Parse** — the parser turns the token list into an AST plus a
   list of parse errors. The parser is also error-recovering: it
   skips to the next `;` or `}` and continues, so a single source
   file may produce multiple parse errors.
3. **Check** — the semantic analyzer (sema) walks the AST, resolves
   names, and infers types. Type errors are accumulated, not
   aborting: you see all type errors at once.
4. **Run** — the evaluator walks the AST and executes it. Runtime
   errors (panics) are caught and reported in `runtime.error`.

The pipeline is non-fatal at every stage: a lexer error does not
stop parsing, a parse error does not stop type-checking, and a type
error does not stop evaluation. This is a deliberate design choice
for a teaching language — you should see *all* your errors at once,
not one at a time. The tradeoff is that a program with type errors
may still produce output, which can be confusing. See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md)
for the rationale.

The shape of the result is:

```ts
{
  tokens: Token[];
  parseErrors: ParseError[];
  ast: Program;
  typeErrors: TypeError[];
  runtime: { output: string[]; value: Value; error: { message: string } | null; steps: number } | null;
  ok: boolean;
  errors: Array<{ stage: "lex" | "parse" | "type" | "runtime"; message: string }>;
}
```

`ok` is `true` iff every error list is empty. The playground uses
`ok` to color the Run button green or red.

## 8. Reading errors

Aether errors are designed to be read by humans. Every error has:

- a **stage** (`lex`, `parse`, `type`, `runtime`),
- a **message** (a single line of plain English),
- a **location** (file, line, column).

Here is a real example. Type this into the playground:

```aether
let x: int = "hello";
```

The Type errors tab will show:

```
expected int, found string at <aether>:1:14
```

The location format is `file:line:column`. The file name is
`<aether>` (the default for playground source). The line and column
are 1-based, so `1:14` means line 1, column 14 — the start of the
`"hello"` literal.

The error messages are stable across versions; the catalog at
[../reference/error-catalog.md](../reference/error-catalog.md) lists
every message the lexer, parser, sema, and evaluator can produce,
with a bad → good example for each.

Here are the four most common kinds of error you will meet in your
first hour with the language.

### 8.1 Lexer errors

```aether
let x = "hello;
```

```
unterminated string literal
```

The lexer hit the end of the file while still inside a string. Add
the closing `"`.

### 8.2 Parse errors

```aether
fn add(a: int, b: int) -> int { a + b }
let r = add(1, 2)
```

```
expected ';', found '<eof>' at <aether>:2:21
```

The parser reached end-of-file while looking for a `;` to terminate
the `let r = add(1, 2)` statement. Add the semicolon.

### 8.3 Type errors

```aether
let x = 1 + "two";
```

```
operator '+' not defined for int and string at <aether>:1:13
```

The semantic analyzer could not find a `+` overload for `int + string`.
Either cast the string to int (`1 + (int("two") ?? 0)`) or convert
the int to a string (`(1 as string) + "two"`).

### 8.4 Runtime errors

```aether
let a = [1, 2, 3];
print(a[5]);
```

```
array index out of bounds: 5
```

The evaluator ran the program, hit the index access, and panicked.
Runtime errors are reported in the Output pane (not the Type errors
tab) because they happen at execution time, not at compile time.

For the full catalog, see
[../reference/error-catalog.md](../reference/error-catalog.md).

## 9. A bigger example

Here is a small but complete program that exercises most of what
this tutorial has covered. Paste it into the playground and run it.

```aether
// fib.ae — compute Fibonacci numbers, demonstrate recursion + match.

enum Option<T> { Some(T), None, }

fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 { Option::None }
  else if i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}

fn show(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v,
    Option::None   => -1,
  }
}

print(f"fib(10) = {fib(10)}");
print(f"xs[2]   = {show(lookup([10, 20, 30], 2))}");
print(f"xs[99]  = {show(lookup([10, 20, 30], 99))}");

let mut acc = 0;
let mut i = 0;
while i < 5 {
  acc = acc + fib(i);
  i = i + 1;
}
print(f"sum of fib(0..5) = {acc}");
```

Expected output:

```
fib(10) = 55
xs[2]   = 30
xs[99]  = -1
sum of fib(0..5) = 7
```

Notice:

- `enum Option<T> { Some(T), None, }` declares a generic sum type
  with two variants. The trailing comma after `None` is permitted.
- `match` over `Option` is exhaustive because we cover both `Some`
  and `None`.
- `if` is an expression: `if n < 2 { n } else { ... }` returns a
  value.
- `while` is a statement (returns unit) but uses `mut` bindings for
  the loop counter and accumulator.
- The `f"..."` string interpolates any expression that has a
  printable form.

This is most of the surface of Aether. The next tutorial,
[language-basics.md](language-basics.md), goes deeper into each of
these constructs with worked examples.

## 10. Where to go next

- **[language-basics.md](language-basics.md)** — variables, control
  flow, functions, closures, strings, arrays. The 6,000-word tour
  of the language surface.
- **[types-and-generics.md](types-and-generics.md)** — structs,
  enums, generics, pattern matching, type aliases. The 6,000-word
  tour of the type system.
- **[error-handling.md](error-handling.md)** — `Result`, `Option`,
  the `?` operator, panic vs. error, propagation patterns.
- **[ownership.md](ownership.md)** — what v1 has (immutability, GC,
  no borrow checker) and what v2 will have (affine types, borrow
  check, lifetimes).
- **[stdlib-tour.md](stdlib-tour.md)** — a tour of the ten stdlib
  modules with one runnable example each.
- **[testing.md](testing.md)** — `assert`, `assert_eq`, and how to
  write test functions that run in the playground.
- **[idiomatic-aether.md](../guides/idiomatic-aether.md)** — 20
  idiomatic patterns to internalize.
- **[faq.md](../reference/faq.md)** — 50+ common questions answered.

Welcome to Aether. Be patient with the v1 limits; the v2 plan is
[../rfcs/](../rfcs/) and the design decisions that got us here are
in [../decisions/](../decisions/).
