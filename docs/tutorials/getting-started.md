# Getting started with Aether

> Audience: someone who just opened the playground and wants to write their first program.
> Time: ~25 minutes. Every example here is runnable — paste it into the playground and hit **Run** (or `Ctrl/Cmd + Enter`).

This tutorial walks you from zero to "I can write a small Aether program that compiles, runs, and prints something useful." You will learn how to use the playground, write your first program, declare variables, define functions, and read the four-stage compile pipeline when it complains.

---

## 1. What Aether is, in one paragraph

Aether is a statically-typed, expression-oriented language with influences from Rust, ML, and TypeScript. The v1 implementation is a tree-walking interpreter that runs in the browser — there is no install step, no compiler binary, no toolchain. You open the playground, write code, and press **Run**. Programs are single files. The type checker runs on every keystroke; runtime errors are surfaced inline. v1 ships ~200 stdlib functions across 10 modules (string, math, collections, io, datetime, regex, encoding, crypto, text, async — though `async` is host-only in v1, see the [concurrency tutorial](concurrency.md)).

If you want the full language tour, the [language-basics tutorial](language-basics.md) follows this one. For types and generics, see [types-and-generics.md](types-and-generics.md). For the v1 vs v2 plan (modules, async, bytecode VM, borrow checker, LSP), see the [decisions](../decisions/) and [RFCs](../rfcs/) directories.

---

## 2. The playground

The playground lives at the project root route (`/`) and is a single Next.js page. The left sidebar picks a *view*:

- **Playground** — the editor + output panel. This is where you spend 90% of your time.
- **Examples** — bundled `.ae` programs (fibonacci, fizzbuzz, primes, json parser, linked list). Click one to load it.
- **Stdlib** — searchable index of the 200+ stdlib functions, grouped by module.
- **Benchmarks** — runs six canned programs (`fib(20)`, `fib(25)`, sum 1..500K, string concat 5K, array build 10K, factorial(100)) and charts the elapsed milliseconds and step counts. Useful for getting a feel for the tree-walker's speed.
- **Explorer** — every example file in the repo, including the `.md` "readme" pairs.
- **About** — version, links.

The playground view has a toolbar (`Run | Clear | Format | Load Example | Share`), an editor on the left, and an output panel on the right with tabs: **Output**, **AST**, **Tokens**, **Errors**, and **Stats**.

### Running your first program

The playground opens with a default program. It's already runnable. Click **Run** (or press `Ctrl + Enter` / `Cmd + Enter` on macOS). You should see something like:

```
55
2
12.56636
12.0
hello, world!
fib(10) = 55
```

That's `fib(10)`, a counter, two shape areas, and two string interpolations. If you don't see that output, check the **Errors** tab — your playground may have been left in a broken state from a previous session.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Enter` | Run the current program |
| `Ctrl/Cmd + S` | Share (encodes the code in the URL hash) |
| `Ctrl/Cmd + K` | Clear the editor (depends on browser) |

There's no in-editor auto-format in v1 — `Format` in the toolbar pretty-prints the **AST** panel, not the source. A real Aether formatter is a v2 deliverable (see [RFC-005 LSP](../rfcs/rfc-005-lsp.md)).

---

## 3. Your first program — `hello, aether`

Type (or paste) the following into the editor and press **Run**:

```aether
let name: string = "aether";
print(f"hello, {name}!");
```

You should see `hello, aether!` in the Output tab.

Let's unpack that, because even a two-line program uses three Aether features:

- `let name: string = "aether";` declares an *immutable* binding called `name` of type `string` and initializes it with a string literal. The type annotation `: string` is optional (the compiler infers it from `"aether"`), but it's idiomatic on top-level bindings for readability.
- `print(...)` is an *inline builtin*. Aether has ~17 inline builtins (`print`, `println`, `range`, `len`, `type_of`, `assert`, `assert_eq`, `panic`, `str`, `int`, `float`, `min`, `max`, `abs`, `sqrt`, `push`, `pop`, `map`, `filter`, `reduce`) that are always in scope, plus the 200+ stdlib functions. See the [stdlib tour](stdlib-tour.md).
- `f"hello, {name}!"` is a *string interpolation* literal. The `f` prefix marks an interpolated string; `{name}` evaluates `name` and substitutes its display form. You can interpolate arbitrary expressions: `f"fib(10) = {fib(10)}"`, `f"sum = {1 + 2 + 3}"`.

### A slightly bigger program

```aether
fn square(x: int) -> int {
  x * x
}

fn sum_of_squares(n: int) -> int {
  let mut acc = 0;
  let mut i = 1;
  while i <= n {
    acc = acc + square(i);
    i = i + 1;
  }
  acc
}

print(sum_of_squares(5));   // 1 + 4 + 9 + 16 + 25 = 55
```

Three things to notice:

1. **Function bodies are expressions.** `square`'s body is just `x * x` — no `return`. The last expression in a block is the block's value. (You can write `return x * x;` if you prefer; both work.)
2. **`let mut`** declares a mutable binding. Plain `let` is immutable — you can't reassign it later. We use `mut` for `acc` and `i` because the loop updates them.
3. **`while`** is a statement; the loop body uses `=` (assignment) to update `acc` and `i`. You can't write `acc += square(i);` ... wait, you can — `+=` is a compound assignment that works on mutable bindings of numeric type. The example above uses `acc = acc + square(i);` to make the assignment explicit; either form works.

Run it. You should see `55`.

---

## 4. Variables — `let`, `const`, `let mut`

Aether has three binding forms. They look similar but have very different semantics.

### `let` — immutable binding

```aether
let x: int = 42;
let y = "hi";     // type inferred: string
// x = 43;        // ERROR: cannot assign to immutable variable 'x'
print(x);
```

A plain `let` is the default. Use it for everything that doesn't need to change. The type annotation `: int` is optional when the initializer makes the type obvious; the compiler will infer it.

### `let mut` — mutable binding

```aether
let mut counter = 0;
counter = counter + 1;
counter = counter + 1;
print(counter);   // 2
```

`let mut` declares a binding you can later reassign with `=`. Reassignment still has to type-check: `counter = "hi"` would fail because `counter` is `int`.

### `const` — compile-time constant

```aether
const PI: float = 3.14159;
const GREETING: string = "hello";
print(PI * 2.0);    // 6.28318
```

`const` declares a value that the compiler treats as a literal-like constant. In v1 the semantic difference between `const` and `let` of a literal type is mostly cosmetic — the type checker accepts both the same way, and the evaluator substitutes the value at the binding's use sites. The distinction matters more for readability ("this is a magic number I named") than for code generation. (The v2 plan is for `const` to require a constant-expression initializer and to participate in compile-time evaluation; see [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md).)

### Type inference on bindings

```aether
let a = 42;        // int
let b = 3.14;      // float
let c = "x";       // string
let d = true;      // bool
let e = [1, 2, 3]; // [int]
let f = (1, "a");  // (int, string)
print(type_of(a)); // "int"
print(type_of(b)); // "float"
```

`type_of` is an inline builtin that returns the type name of a value as a string — handy when you're not sure what the compiler inferred. Use it liberally while you're learning.

---

## 5. Functions — the workhorse

Aether functions are declared with `fn`. They take typed parameters and return a typed value. The body is a block, and the last expression in the block is the return value.

### Basic functions

```aether
fn add(a: int, b: int) -> int {
  a + b
}

fn greet(name: string) -> string {
  f"hello, {name}"
}

print(add(2, 3));        // 5
print(greet("aether")); // hello, aether
```

### Early return

The trailing-expression rule covers 95% of functions. For the other 5%, use `return`:

```aether
fn first_even(xs: [int]) -> int {
  for x in xs {
    if x % 2 == 0 {
      return x;
    }
  }
  -1
}

print(first_even([1, 3, 5, 8, 9])); // 8
print(first_even([1, 3, 5]));        // -1
```

`return expr;` exits the function with `expr`. `return;` (no expression) exits with `()`. A function whose body falls off the end without a trailing expression returns `()`.

### Generic functions

```aether
fn id<T>(x: T) -> T { x }

fn first<T>(xs: [T], default: T) -> T {
  if len(xs) == 0 { default } else { xs[0] }
}

print(id(42));              // 42
print(id("hello"));         // hello
print(first([1, 2, 3], 0)); // 1
print(first([], 0));        // 0
```

`<T>` after the function name introduces a type parameter. The compiler infers `T` at each call site — `id(42)` instantiates `T = int`, `id("hello")` instantiates `T = string`. You don't need to write the type argument explicitly (you can: `id<int>(42)` works too).

### Closures

A `fn` declaration is just sugar for a `let` of a closure:

```aether
let add = fn(a: int, b: int) -> int { a + b };
print(add(2, 3)); // 5
```

Closures capture their enclosing scope by reference, so a `let mut` counter captured by a closure is shared:

```aether
let mut counter = 0;
let bump = fn() -> int {
  counter = counter + 1;
  counter
};
print(bump()); // 1
print(bump()); // 2
print(bump()); // 3
print(counter); // 3
```

The closure body uses `counter = counter + 1` — an assignment to the *captured* mutable binding. The compiler knows `counter` is `mut` because it was declared `let mut counter`. Closures are how you build local state in a language with no `class` and no mutable struct fields (yet — see [ownership.md](ownership.md) for the v1/v2 story).

### Higher-order functions

Functions are first-class values. The `map`, `filter`, and `reduce` inline builtins take closures:

```aether
let nums = [1, 2, 3, 4, 5];
let doubled = map(nums, fn(x: int) -> int { x * 2 });
let evens   = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
let sum     = reduce(nums, fn(acc: int, x: int) -> int { acc + x }, 0);

print(doubled); // [2, 4, 6, 8, 10]
print(evens);   // [2, 4]
print(sum);     // 15
```

Note that the lambda has to declare its parameter and return types explicitly: `fn(x: int) -> int { ... }`. v1 does not infer lambda parameter types from the higher-order function's signature. (The v2 plan, [RFC-005 LSP](../rfcs/rfc-005-lsp.md), includes bidirectional inference that would close this gap.)

---

## 6. The compile pipeline

When you press **Run**, the playground calls `compile(source)`, which runs four stages and returns a single result object. Understanding the pipeline makes the error messages legible.

```
source → lex → parse → check → run
```

### Stage 1: lex

The lexer turns the source string into a flat list of *tokens* (keywords, identifiers, literals, operators, punctuation, with positions). It also emits *lexer errors* for things it can't recover from: unterminated strings, bad number literals, unknown characters. You can see the tokens by switching to the **Tokens** tab in the playground.

A lexer error example — try this:

```aether
let s = "unterminated;
```

You'll see the message `unterminated string literal` in the Errors tab. The token stream stops at the bad literal, but the lexer keeps going (recovery) so the parser can still try to make sense of the rest.

### Stage 2: parse

The parser takes the token stream and builds an *abstract syntax tree* (AST) — a tree of `IntLit`, `Binary`, `FnDecl`, `Match`, … nodes. The full node vocabulary is ~80 kinds (see `aether/core/ast/ast.ts`). The parser accumulates errors like `expected ';'`, `expected 'in'`, `unexpected token`; it tries to recover at statement boundaries so a single typo doesn't kill the rest of the parse.

A parser error example:

```aether
let x = 42
let y = 43;
```

You'll see `expected ';', found 'let' at <aether>:2:1` — the parser expected a semicolon after `42` and found `let` instead. The fix is to add the missing semicolon.

The AST is visible in the **AST** tab as a tree-like view; switching there is often the fastest way to understand what the parser actually saw (vs. what you thought you wrote).

### Stage 3: type-check (sema)

The semantic analyzer (`sema`) walks the AST and assigns types to every expression. It also accumulates *type errors* — but unlike the parser, sema doesn't block the runtime. If your program has type errors, the runtime still runs (this is "lenient playground semantics"; see [ADR-09 vitest for implementation tests](../decisions/adr-09-vitest-for-implementation-tests.md)). The reasoning: in a teaching playground, it's often instructive to see *what* a slightly-typed-wrong program does at runtime.

A type error example:

```aether
let x: int = "hello";
```

You'll see `expected int, found string`. The fix is to either change the annotation to `string` or change the initializer to an integer.

### Stage 4: run

The tree-walking evaluator walks the AST, executing statements and evaluating expressions. It captures `print`/`println` output, accumulates a step counter (default limit 1,000,000 steps), and catches runtime errors (`panic`, division by zero, out-of-bounds index, missing struct field, no match arm matched, etc.) into a `runtime.error` field that surfaces in the Errors tab.

A runtime error example:

```aether
let xs = [1, 2, 3];
print(xs[5]);
```

You'll see `array index out of bounds: 5` in the Errors tab. The Output tab will show nothing — the panic aborted the program before any `print` ran. (Well, in this case there's no `print` before the panic, but in general, output emitted before a panic is still visible.)

### The `CompileResult` shape

The full result object returned by `compile(source)` is:

```ts
{
  tokens: Token[],       // from lex
  parseErrors: ParseError[],
  ast: Program,          // always present, even on parse errors
  typeErrors: TypeError[],
  runtime: RunResult | null,   // null if parsing hard-failed
  ok: boolean,           // true iff no errors at all
  errors: Array<{ stage: "lex" | "parse" | "type" | "runtime"; message: string }>,
}
```

`runtime` is `{ value, output, error?, steps }`. `value` is the last top-level expression's value; `output` is the array of strings captured by `print`/`println`; `error` is the first runtime error (or absent); `steps` is the step count.

---

## 7. Reading errors

Aether tries to make errors legible. Here is the anatomy of an error message:

```
[aether]:type:7:5: expected int, found string
```

That's:

- `[aether]:type` — the stage that emitted it (here, type checker).
- `7:5` — line 7, column 5 (1-based) of the source.
- `expected int, found string` — what the checker expected and what it found.

The Errors tab in the playground shows the same information, color-coded: lex errors in one color, parse errors in another, type errors in a third, runtime errors in a fourth. The position links to the editor — clicking an error scrolls the editor to the offending line (depending on playground version).

### Three real error scenarios

**Scenario A: missing semicolon.**

```aether
let x = 42
print(x)
```

Errors:

```
expected ';', found 'print' at <aether>:2:1
```

The fix is obvious: add `;` after `42`. The parser recovers at the statement boundary, so the second line parses fine — but you'll also see `expected ';', found '<eof>'` at the end of the file because the parser expects every statement to terminate.

**Scenario B: wrong argument type.**

```aether
fn add(a: int, b: int) -> int { a + b }
print(add(2, "three"));
```

Errors:

```
argument 2: expected int, found string
```

The message tells you which argument (2nd) and what was expected vs. what was passed.

**Scenario C: no match arm matched (runtime).**

```aether
enum Color { Red, Green, Blue, }

fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
  }
}

print(name(Color::Green));
```

The type checker doesn't enforce match exhaustiveness in v1, so this passes type-check. At runtime:

```
no match arm matched
```

The fix is to add arms for `Green` and `Blue`, or a wildcard `_ => "unknown"` arm. See [error-handling.md](error-handling.md) for the full pattern.

---

## 8. A complete first program

Let's put it all together with a runnable program that exercises bindings, functions, generics, enums, pattern matching, and string interpolation — the same constructs the default playground program uses, but written from scratch so you know what every line does.

```aether
// temperature.ae — convert between Celsius and Fahrenheit with an enum
// to mark the unit, and a small dispatch function.

enum Temp {
  C(float),
  F(float),
}

fn to_c(t: Temp) -> float {
  match t {
    Temp::C(c) => c,
    Temp::F(f) => (f - 32.0) * 5.0 / 9.0,
  }
}

fn to_f(t: Temp) -> float {
  match t {
    Temp::C(c) => c * 9.0 / 5.0 + 32.0,
    Temp::F(f) => f,
  }
}

fn describe(t: Temp) -> string {
  let c = to_c(t);
  let f = to_f(t);
  f"{c} C = {f} F"
}

print(describe(Temp::C(0.0)));   // 0 C = 32 F
print(describe(Temp::F(212.0))); // 100 C = 212 F
print(describe(Temp::C(23.0)));  // 23 C = 73.4 F
```

Paste that in, run it, and you should see three lines of output. Try adding a `Kelvin` variant — the type checker will tell you that `to_c` doesn't handle it... actually wait, it *won't* (v1 doesn't enforce exhaustiveness), so the runtime will. That's a feature of the v1 type checker — see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md) for the discussion.

---

## 9. Common gotchas in the first hour

### Missing semicolons

Every statement ends with `;`. The parser is strict about this. The error message tells you the *line and column* where it expected the semicolon, and what token it found instead.

### `print` takes a single expression

`print` is one argument. To print two things, use `print(f"{x} {y}")` or call `print` twice. `print(1, 2)` is a type error: `expected 1 arguments, found 2`.

### Lambda parameter types are required

`fn(x) -> int { x * 2 }` will fail with `expected type, found ')'` because the parser requires a type annotation on every lambda parameter. Write `fn(x: int) -> int { x * 2 }` instead. (This is a v1 simplification; v2 may infer them. See [RFC-005 LSP](../rfcs/rfc-005-lsp.md).)

### `int` truncates on float assignment

```aether
let x: int = 7 / 2;       // 3 — int division
let y: float = 7.0 / 2.0; // 3.5 — float division
let z: int = 3.5;         // ERROR — int and float are different types
```

You can explicitly convert with `as`: `let z: int = 3.5 as int;` (this truncates). `int` widens to `float` automatically in the other direction: `let f: float = 7;` is fine (7 widens to 7.0). See [types-and-generics.md](types-and-generics.md) § on numeric widening.

### `match` doesn't enforce exhaustiveness

You can write a `match` that doesn't cover all variants. The compiler won't complain, but the runtime will panic with `no match arm matched` if execution reaches an uncovered case. This is documented as a v1 limitation; see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md).

### Closures capture by reference

A closure sees the *current* value of a captured `mut` binding, including mutations made after the closure was created. See the `bump()` example in §5.

### The step limit is 1,000,000

A program that runs forever (infinite loop, deep recursion) is killed at 1,000,000 evaluation steps and the runtime reports `execution step limit exceeded (1000000)`. `fib(30)` (~2.7M calls) hits this. `fib(20)` (~13.5K calls) is fine. See [performance.md](performance.md) for the full story.

---

## 10. What to read next

- [language-basics.md](language-basics.md) — the full tour of syntax: every operator, every control-flow construct, every literal.
- [types-and-generics.md](types-and-generics.md) — tuples, arrays, maps, enums (ADTs), structs, option/result, generics, type inference, numeric widening.
- [error-handling.md](error-handling.md) — `Result<T, E>`, the `?` operator, panic vs. error, propagation patterns.
- [ownership.md](ownership.md) — *honest* version: v1 has GC and immutability-by-default, not borrow checking. The v2 plan is there too.
- [concurrency.md](concurrency.md) — *honest* version: v1 is synchronous. The v2 async/await design is there.
- [stdlib-tour.md](stdlib-tour.md) — the 200+ stdlib functions, organized by module.
- [testing.md](testing.md) — `assert`, `assert_eq`, the planned test runner.
- [tooling.md](tooling.md) — the playground, planned REPL/LSP/formatter/linter/pkg.
- [performance.md](performance.md) — the tree-walker's speed, the step limit, what to do about `fib(30)`.
- [reference/error-catalog.md](../reference/error-catalog.md) — every error message the implementation can produce, with a cause and a fix for each.
- [reference/glossary.md](../reference/glossary.md) — 150+ terms you'll meet in the docs.
- [reference/faq.md](../reference/faq.md) — 50+ real Q&A.

When you're ready to write something larger, the Examples view in the playground has five working programs from 30 to 350 lines each. The `fibonacci.ae` example in particular shows three implementations of the same function (recursive, iterative, memoized) and is a good benchmark for "can I read idiomatic Aether?".

Welcome to Aether. Press Run.
