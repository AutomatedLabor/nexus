# Chapter 2 — Your first program

> Hello, world in 30 seconds; variables, types, and the compile pipeline in 30 minutes; reading errors in the playground UI; the shape of every Aether program. By the end of this chapter you will be able to write a small program, run it on both backends, and understand what the playground is telling you when it complains.

---

## 2.1 The smallest possible program

Here is the smallest Aether program that produces output:

```aether
print("Hello, World!");
```

Run it. The playground prints `Hello, World!` in the Output panel. That's it. There's no `main` function, no `fn main() { }`, no entry-point convention. Aether source files are evaluated top-to-bottom, like a script. Top-level statements run in order. Top-level expressions (rare, but legal in some contexts) evaluate and discard.

The compiler pipeline for this one-line program is:

1. **Lexer** (`aether/core/lexer/lexer.ts`) — converts `"print(\"Hello, World!\");"` into 5 tokens: `print`, `(`, `"Hello, World!"`, `)`, `;`. The lexer also produces an `EOF` token and tracks `loc` (file:line:col) on every token.
2. **Parser** (`aether/core/parser/parser.ts`) — converts the tokens into an AST. This produces an `ExprStmt` wrapping a `Call` of the builtin `print` with one argument, the string literal `"Hello, World!"`.
3. **Type checker** (`aether/core/sema/sema.ts`) — walks the AST, builds a scope, resolves `print` as a builtin (`fn (any) -> ()`), checks the call, and records the type `()`.
4. **Tree-walker** (`aether/core/eval/eval.ts`, v1) **or codegen + VM** (`aether/vm/`, v2) — executes the AST or the bytecode, producing the side-effect of writing `Hello, World!` to the output buffer.

Both backends produce identical output for this program. Both take less than a millisecond.

---

## 2.2 Variables, mutability, and constants

Aether has three binding forms:

- `let x = expr;` — immutable binding. The value can't be reassigned.
- `let mut x = expr;` — mutable binding. The value can be reassigned (with `=`).
- `const NAME = expr;` — module-level constant. The name is conventionally upper-case; the value is evaluated at compile time when possible (otherwise at first evaluation).

Examples:

```aether
let x: int = 42;            // immutable, annotated
let mut y: float = 3.14;    // mutable, annotated
const PI: float = 3.14159;  // constant

// Reassignment:
y = y + 1.0;
y = y - x as float;

// This fails to compile:
// x = 10;   // cannot assign to immutable variable 'x'
```

The type annotation is optional when the compiler can infer the type:

```aether
let x = 42;            // inferred int
let mut y = 3.14;      // inferred float
let s = "hello";        // inferred string
let b = true;           // inferred bool
```

Aether's inference is "local": it looks at the initializer's type and uses it. There is no bidirectional inference across statements; each `let` stands alone. (Generic instantiation across function calls *does* propagate — see Chapter 6.)

### 2.2.1 When to use `mut`

Aether's style guide says: prefer immutability. Use `let mut` only when you actually reassign. The linter (Chapter 13) flags `let mut` bindings that are never reassigned with the rule `unused-mut`. The pattern in idiomatic Aether is to write the immutable version first, then add `mut` if the compiler complains.

### 2.2.2 Constants and compile-time evaluation

`const` bindings are evaluated once at the top of the module. They participate in constant folding (Chapter 10): if you write `const TWO_PI = 2 * PI;` and `PI` is a `const float = 3.14159;`, the constant-folding pass replaces `2 * PI` with `6.28318` at compile time.

`const` bindings cannot be generic (no `const PI<T> = ...`). They cannot depend on runtime values. They can depend on other `const` bindings and on literal arithmetic.

---

## 2.3 The primitive types

Aether has nine primitive types and several composite types. The primitives are:

| Type     | Examples                       | Notes                                                |
|----------|--------------------------------|------------------------------------------------------|
| `int`    | `42`, `0x2A`, `0o755`, `0b1010`| 64-bit-ish (host JS number). Truncates on operations.|
| `float`  | `3.14`, `6.022e23`, `1.0`      | IEEE-754 double.                                     |
| `bool`   | `true`, `false`                | Only these two. Truth is restricted to `bool`.       |
| `string` | `"hello"`, `f"x = {x}"`        | UTF-16 internally; Unicode-aware in `string` module.|
| `char`   | `'a'`, `' '`, `'\n'`           | Single UTF-16 code unit.                             |
| `unit`   | `()`                           | The unit value. The "no useful value" value.         |

Three "primitive composite" types are exposed at the syntax level:

- `tuple` — `(1, 2, "three")` has type `(int, int, string)`. Tuple field access is `t.0`, `t.1`, etc.
- `array` — `[1, 2, 3]` has type `int[]`. Arrays are homogeneous (all elements the same type).
- `map` — `{ "one": 1, "two": 2 }`. Created with `mapNew()` (see `collections` module). Indexing with `m[key]`.

The "type-system" types are:

- `option<T>` — `Option<T>` is the enum form. `Option::Some(42)`, `Option::None`.
- `result<T, E>` — `Result<T, E>` is the enum form. `Result::Ok(42)`, `Result::Err("bad")`.
- `fn(A, B) -> C` — function type. Closures have this type.
- `enum` and `struct` — user-defined nominal types (Chapter 5).

`int` *widens* to `float` automatically (Chapter 6). The reverse requires `as float` or `as int` (the latter truncates). `int` and `float` are *different types* — `42 + 1.0` works (the int widens), but `42 == 42.0` requires the int to widen too, which the compiler does automatically for comparison but not for assignment.

Examples:

```aether
let n: int = 42;
let f: float = n;       // OK — int widens to float
let g: float = 3.14;
let m: int = g as int;  // OK — explicit cast, truncates to 3
let h: int = n + 1;     // OK — int arithmetic
let p: float = n + g;   // OK — n widens
```

---

## 2.4 f-strings: string interpolation

Aether has f-strings, borrowed from Python:

```aether
let name = "Aether";
let version = 2;
print(f"Hello, {name}! This is v{version}.");
// Hello, Aether! This is v2.
```

The lexer tokenizes `f"..."` as a single string token, but with `segments` describing the literal parts and the embedded expressions. The parser re-lexes and re-parses the inner expression inside each `{...}`, so you can interpolate any expression:

```aether
let xs = [1, 2, 3];
print(f"sum = {reduce(xs, fn(a: int, x: int) -> int { a + x }, 0)}");
// sum = 6
```

The `{` and `}` inside the f-string must be balanced. An unmatched `}` ends the interpolation; an unmatched `{` is a lex error (`unterminated string interpolation`).

For printf-style formatting (with `%s`, `%d`, `%f`, `%x`), use `string.format` from the stdlib:

```aether
print(string_format("%s = %d (hex %x)", "answer", 42, 42));
// answer = 42 (hex 2a)
```

(The stdlib functions are usually registered without the module prefix — `format(...)` not `string.format(...)` — but for clarity in this book we sometimes use the prefix.)

---

## 2.5 The compile pipeline (in depth)

Every Aether program goes through four stages on its way to a result:

### Stage 1 — Lexing

The lexer (`aether/core/lexer/lexer.ts`) is a hand-written scanner. It produces an array of tokens, each with a `kind`, `value`, and `loc` (file:line:col). The lexer is *lenient*: on an unexpected character, it pushes an `Error` token and continues, so the parser can recover and report more than one error per run. (See ADR-09 for the lenient-semantics rationale.)

Lex errors (Chapter 7's error catalog has the full list):

- `unexpected character 'X'`
- `unterminated block comment`
- `invalid number literal 'X'`
- `unterminated char literal`
- `empty char literal`
- `unterminated string interpolation`
- `unterminated string literal`

### Stage 2 — Parsing

The parser (`aether/core/parser/parser.ts`) is a recursive-descent parser with Pratt-style precedence for expressions. It produces an AST (`aether/core/ast/ast.ts`). It's also lenient — on an unexpected token, it reports the error, attempts to recover (skip to the next `;` or `}`), and continues.

Parse errors include:

- `expected 'X', found 'Y' at <file>:line:col`
- `expected identifier, found 'X'`
- `expected type, found 'X'`
- `expected pattern, found 'X'`
- `expected 'in', found 'X'`
- `expected parameter name, found 'X'`
- `expected field name, found 'X'`
- `unexpected end of input`
- `unexpected token 'X'`
- `failed to parse interpolation 'X': <message>`
- `expected ',' or '}' after match arm`
- `expected ';' or '}' in block`

### Stage 3 — Type checking

The type checker (`aether/core/sema/sema.ts`) is a Hindley-Milner-style inference engine with explicit annotations. It walks the AST, builds scopes, resolves names, infers types, and reports type errors. It also does *generic instantiation* — when you call `id(42)`, it instantiates `T = int` for that call site.

Type errors include:

- `unknown primitive type 'X'`
- `undefined name 'X'`
- `expected <T>, found <U>` (let binding)
- `expected return type <T>, found <U>`
- `cannot assign to immutable variable 'X'`
- `cannot assign <T> to <U>`
- `? operator can only be applied to Result or Option, found <T>`
- `left of '<op>' must be bool, found <T>`
- `cannot compare <T> with <U>`
- `operator '<op>' not defined for <T> and <U>`
- `cannot call non-function of type <T>`
- `expected N arguments, found M`
- `argument N: expected <T>, found <U>`
- `array index must be int, found <T>`
- `tuple index N out of bounds (length M)`
- `struct <Name> has no field '<field>'`
- `unknown enum '<Name>'`
- `enum <Name> has no variant '<variant>'`
- `cannot cast <T> as <U>`
- `cannot unify <T> with <U>`

### Stage 4 — Execution

The execution stage differs by backend. v1's tree-walker walks the AST directly. v2's codegen lowers the AST to IR, runs the eight optimizer passes, lowers the IR to bytecode, and the VM interprets the bytecode.

Runtime errors (panic-shaped) include:

- `panic: <message>` (from user `panic(msg)`)
- `array index out of bounds: N`
- `string index out of bounds: N`
- `map key not found: <key>`
- `division by zero`
- `modulo by zero`
- `no match arm matched`
- `execution step limit exceeded (N)`
- `assertion failed` / `assertion failed: <a> != <b>`

The error catalog (`docs/reference/error-catalog.md`) lists 60+ errors with cause/fix/example for each.

---

## 2.6 The playground UI

The playground is a single-page Next.js app at the URL. The main views are:

- **Playground** — editor on the left, output on the right, tabs for Output / Errors / Stats / IR / Bytecode. The Run button (and ⌘-Enter) runs the program. The VM checkbox toggles backends.
- **Examples** — 17 canned programs. Click to load into the editor.
- **Stdlib** — 18-module browser. Click a function to see its signature and a one-line example.
- **Benchmarks** — six canned benchmarks. Run to see elapsed ms and step counts, bar-charted.
- **Explorer** — walks the AST of the current program. Good for learning what the parser produces.
- **About** — language overview.

### Reading errors

The Errors tab shows each error with its stage (`lex`, `parse`, `type`, `runtime`) and source location. Click an error to scroll the editor to the relevant line. Errors are color-coded by stage.

**Important:** Aether's "lenient playground semantics" (ADR-09) mean type errors don't block execution. The program runs anyway, and you see both the type error and the runtime output. This is intentional — in a teaching playground, it's instructive to see what a slightly-typed-wrong program does at runtime. The runtime may itself panic with a type-related error; that's a separate runtime error.

### The Stats tab

The Stats tab shows two numbers:

- **Steps** — the number of evaluation steps. For v1, this is the number of `eval*` calls; for v2, the number of bytecode instructions executed. The default step limit is 1,000,000. Programs that exceed this panic with `execution step limit exceeded (N)`.
- **Elapsed** — wall-clock time in milliseconds. This is noisy (depends on the host's JIT state, GC pressure, etc.); use the Benchmarks view for stable comparisons.

---

## 2.7 Reading errors — three examples

Let's work through three common errors and how to read them.

### Example 1 — missing semicolon

```aether
let x = 42
let y = 43;
```

The parser reports:

```
parse: expected ';', found 'let' at <aether>:2:1
```

The fix: add a `;` at the end of line 1.

### Example 2 — type mismatch

```aether
let x: int = "hello";
```

The type checker reports:

```
type: expected int, found string at <aether>:1:14
```

(The `1:14` is the location of the initializer expression `"hello"`.)

The fix: change either the annotation or the value:

```aether
let x: string = "hello";
// or
let x: int = 42;
```

### Example 3 — runtime panic

```aether
let xs = [1, 2, 3];
print(xs[5]);
```

No errors at lex/parse/type time. The program runs and panics:

```
runtime: array index out of bounds: 5
```

The fix: check the length first.

```aether
let xs = [1, 2, 3];
if 5 < len(xs) { print(xs[5]); } else { print("oob"); }
```

---

## 2.8 Eight runnable examples

**1. Hello world, with type annotation.**

```aether
let greeting: string = "Hello, World!";
print(greeting);
```

**2. Arithmetic with mixed types.**

```aether
let a: int = 7;
let b: float = 2.0;
let c = a as float / b;   // 3.5 — a widens to float, / is float division
let d = a / 3;             // 2 — integer division truncates
print(c);
print(d);
```

**3. A tuple.**

```aether
let p = (1, 2, "three");
print(p.0);    // 1
print(p.1);    // 2
print(p.2);    // three
```

**4. An array and a `for in`.**

```aether
let xs = [10, 20, 30, 40];
let mut sum = 0;
for x in xs { sum = sum + x; }
print(sum);   // 100
```

**5. A closure capturing a variable.**

```aether
let base = 10;
let add_base = fn(x: int) -> int { x + base };
print(add_base(5));   // 15
```

**6. An enum and a match expression.**

```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
  }
}
print(name(Color::Red));   // red
```

**7. A `Result` with `?`.**

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("bad") }
}
fn double_parse(s: string) -> result<int, string> {
  let n = parse_int(s)?;
  Result::Ok(n * 2)
}
print(double_parse("42"));   // Ok(84)
print(double_parse("x"));    // Err("bad")
```

**8. Recursive factorial.**

```aether
fn fact(n: int) -> int {
  if n <= 1 { 1 } else { n * fact(n - 1) }
}
print(fact(5));   // 120
```

---

## 2.9 Summary

- The smallest Aether program is `print("Hello, World!");`. No `main`, no boilerplate.
- Bindings: `let` (immutable), `let mut` (mutable), `const` (module-level constant).
- Nine primitive types: `int`, `float`, `bool`, `string`, `char`, `unit`, `tuple`, `array`, `map` — plus `option`, `result`, `fn`, `enum`, `struct` for composite.
- `int` widens to `float` automatically; the reverse requires `as int` (truncates).
- The compile pipeline is lex → parse → sema → execute (v1 tree-walker or v2 bytecode VM).
- Errors are reported by stage: lex, parse, type, runtime. The playground's lenient semantics mean type errors don't block execution; you see both the type error and the runtime output.
- The Errors tab shows the stage and `line:col` of each error; click to scroll the editor.
- The Stats tab shows step count (default limit 1M) and elapsed milliseconds.

The next chapter is control flow: `if`/`else` as an expression, `while`, `for in`, `match` (deep), `break`/`continue`, and the early-return vs expression-style trade-off.
