# Language basics

> Audience: you've finished [getting-started.md](getting-started.md), you can run a program, and you want the full syntax tour.
> Time: ~45 minutes. Every example is runnable.

This tutorial is the reference for everyday Aether syntax: bindings, primitives, arithmetic, control flow, functions, closures, strings (with interpolation), arrays, tuples, and comments. We save types-and-generics, error handling, and the stdlib for their own tutorials. The goal is that after this file, you can read any of the example programs in the playground and know what every token does.

---

## 1. The shape of a program

An Aether program is a single file (v1 — see [ADR-05 no modules in v1](../decisions/adr-05-no-modules-in-v1.md)) consisting of a sequence of top-level *items* and *statements*:

```aether
// top-level items
fn add(a: int, b: int) -> int { a + b }
enum Color { Red, Green, Blue, }
struct Point { x: int, y: int }
type Age = int;

// top-level statements
let pi = 3.14159;
print(add(2, 3));
```

Items (`fn`, `enum`, `struct`, `type`) are hoisted — you can use a function or a type before its declaration in the source. Statements (`let`, `let mut`, `const`, expression statements) execute in source order. There is no `main` function; the program is the body. The runtime captures the *value of the last top-level expression* as the program's `value` field; `print` calls accumulate into the `output` array.

### Expression-oriented

Aether is *expression-oriented*: most constructs are expressions. `if`, `match`, and blocks are all expressions. A block `{ stmt; stmt; expr }` evaluates to its trailing expression. This is the Rust/ML influence.

```aether
let x = if true { 1 } else { 2 };   // x: int = 1
let y = {
  let a = 2;
  let b = 3;
  a * b
};                                 // y: int = 6
print(x);   // 1
print(y);   // 6
```

A block with no trailing expression has value `()` (unit). Statements always end with `;` except for the trailing expression of a block, which is *not* followed by `;` — the `;` would make it a statement (with value `()`) instead of an expression.

---

## 2. Comments

Two forms:

```aether
// a single-line comment

/* a multi-line comment
   that can span lines */

/* nested /* comments */ are allowed */
```

Block comments nest — the lexer counts `/*` depth and only ends at the matching `*/`. This is the OCaml/Rust rule.

There's no doc-comment syntax in v1 — `///` is just a sequence of `/` tokens that the parser will reject. The convention is `//` for everything; the v2 LSP will recognize `///` and surface it as hover documentation (see [RFC-005 LSP](../rfcs/rfc-005-lsp.md)).

---

## 3. Bindings: `let`, `let mut`, `const`

Three binding forms, all named, all typed (annotation optional when inferable).

### `let` — immutable binding

```aether
let x: int = 42;
let y = "hi";     // type inferred
// x = 43;        // ERROR: cannot assign to immutable variable 'x'
print(x);
```

The default. Use it for everything that doesn't need to change.

### `let mut` — mutable binding

```aether
let mut counter = 0;
counter = counter + 1;
counter += 1;     // compound assignment, same thing
print(counter);   // 2
```

`let mut` is the only way to get a reassignable binding. Reassignment still type-checks.

### `const` — compile-time constant

```aether
const PI: float = 3.14159;
const MAX_USERS: int = 1000;
print(PI * 2.0);
```

In v1, `const` is essentially a `let` of a literal-typed value — the compiler doesn't yet force a constant-expression initializer (see [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md) for the v2 plan where `const` participates in compile-time evaluation).

### Type annotations

Annotations look like `: type` after the binding name:

```aether
let x: int = 42;
let y: float = 3.14;
let z: [int] = [1, 2, 3];
let w: (int, string) = (1, "a");
let f: fn(int) -> int = fn(x: int) -> int { x + 1 };
```

When the initializer makes the type obvious (`42` for `int`, `"hi"` for `string`), you can omit the annotation. For function types and complex generics, it's idiomatic to write it.

---

## 4. Primitive types and literals

| Type     | Literal form                  | Notes                                            |
|----------|-------------------------------|--------------------------------------------------|
| `int`    | `42`, `-7`, `0xFF`             | 64-bit. Truncates on float assignment.           |
| `float`  | `3.14`, `-2.0`, `1e10`         | 64-bit IEEE-754.                                 |
| `bool`   | `true`, `false`               |                                                  |
| `string` | `"hello"`, `f"x = {x}"`        | UTF-16 internally (JS `string`).                |
| `char`   | `'a'`, `'\n'`                 | Single code point. Stored as a 1-char string.    |
| `unit`   | `()`                          | The empty tuple, written `()`.                  |

### Numeric literals

```aether
let dec = 42;
let neg = -7;        // unary minus on `7`
let hex = 0xFF;      // 255
let float1 = 3.14;
let float2 = -2.0;
let sci = 1e10;      // 10000000000.0
```

Aether's `int` and `float` are both JS `number` under the hood (see `aether/core/eval/eval.ts` for the full discussion). The type checker treats them as distinct types; `int` widens to `float` (so `let f: float = 7;` is fine), but `float` does *not* narrow to `int` automatically (`let i: int = 3.14;` is a type error). Use `as int` to explicitly truncate: `let i: int = 3.14 as int;` (gives 3).

### Boolean literals and short-circuit

`true` and `false`. The logical operators `&&` (and), `||` (or), `!` (not) short-circuit. Truth is restricted to `bool` — `if 0 { ... }` is a type error, unlike Python/C.

### Strings — see §9

Aether strings are JS strings — UTF-16, immutable, indexed by code unit. See §9 for the full discussion including interpolation.

### Char

```aether
let c: char = 'a';
let newline: char = '\n';
print(c);      // a
print(type_of(c)); // char
```

A `char` literal is `'` ... `'` containing a single character or an escape (`'\n'`, `'\t'`, `'\\'`, `'\''`). At runtime a `char` is a 1-char `string` — the v1 evaluator doesn't distinguish them; only the type checker does.

### Unit

```aether
let u: () = ();
print(type_of(u)); // ()
```

`()` is the unit value, the empty tuple, the type of "no useful value". A function that doesn't return anything has type `()`. `print` returns `()`. Use it for side-effect-only functions.

---

## 5. Arithmetic and operators

### Arithmetic

```aether
print(2 + 3);    // 5
print(2 - 3);    // -1
print(2 * 3);    // 6
print(7 / 2);    // 3   — int division, truncates
print(7.0 / 2.0); // 3.5
print(7 % 3);    // 1   — modulo
```

`+`, `-`, `*`, `/`, `%`. `int / int` truncates (it's `Math.trunc` under the hood). `float / float` is real division. `int` operands automatically widen to `float` if the other side is `float`: `7 / 2.0` gives `3.5`, not `3`.

### Comparison

```aether
print(2 == 3);   // false
print(2 != 3);   // true
print(2 < 3);    // true
print(2 <= 2);   // true
print(2 > 3);    // false
print(2 >= 3);   // false
```

`==`, `!=`, `<`, `<=`, `>`, `>=`. All return `bool`. They work on any types that *compare* (int, float, string, char, bool); the type checker rejects `2 == "two"` with `cannot compare int with string`.

### Logical

```aether
print(true && false); // false
print(true || false); // true
print(!true);         // false
```

Short-circuit: `||` returns the left value if truthy, else the right. `&&` returns the left value if falsy, else the right. Operands must be `bool`.

### Bitwise (int only)

```aether
print(0xFF & 0x0F); // 15
print(0xFF | 0xF0); // 255
print(0xFF ^ 0x0F); // 240
print(~0);          // -1
print(1 << 4);      // 16
print(256 >> 4);    // 16
```

`&`, `|`, `^`, `~`, `<<`, `>>` — all require `int` operands. The type checker rejects `1.5 & 0x0F` with `bitwise '&' requires int operands, found float and int`. Under the hood these are JS bitwise ops, which truncate to 32-bit signed integers — so `1 << 32` is `1`, not `0`.

### Assignment and compound assignment

```aether
let mut x = 1;
x = x + 1;
x += 1;
x -= 1;
x *= 2;
x /= 2;
x %= 2;
x <<= 1;
x >>= 1;
x &= 0xFF;
x |= 0x10;
x ^= 0x01;
print(x);
```

All compound assignments are sugar: `x += y` is `x = x + y`. They require `x` to be `mut`. They work on `int`, `float`, and (for the bitwise forms) `int` only.

### Ranges

```aether
let r = 0 .. 10;     // [0, 10) — exclusive
let ri = 0 ..= 10;   // [0, 10] — inclusive
for i in 0 .. 5 { print(i); }   // 0 1 2 3 4
for i in 0 ..= 5 { print(i); }  // 0 1 2 3 4 5
```

`a .. b` is an exclusive range; `a ..= b` is inclusive. Ranges are first-class values (the evaluator represents them as `{ __range, start, end, step }`); the `for x in range` syntax accepts either a range expression or a `range(start, end, step)` call.

### Cast

```aether
let i: int = 3;
let f: float = i as float;     // 3.0
let n: int = 3.99 as int;      // 3 — truncates
let b: bool = 0 as bool;      // ERROR — bool isn't castable from int
```

`expr as Type` is an explicit conversion. `int as float` widens; `float as int` truncates. Other casts (e.g. `int as bool`) are rejected by the type checker with `cannot cast int as bool`.

### `?` postfix (error propagation)

```aether
fn parse_int(s: string) -> result<int, string> {
  // ... imagine a real implementation ...
  Result::Ok(42)
}

fn double(s: string) -> result<int, string> {
  let n = parse_int(s)?;     // unwrap Ok, propagate Err
  Result::Ok(n * 2)
}
```

`expr?` unwraps an `Ok`/`Some` value, or propagates the `Err`/`None` by returning from the enclosing function. See [error-handling.md](error-handling.md) for the full pattern.

---

## 6. Control flow

### `if` / `else if` / `else`

```aether
let n = 7;
if n < 0 {
  print("negative");
} else if n == 0 {
  print("zero");
} else if n < 10 {
  print("small");
} else {
  print("large");
}
```

`if cond { ... }` is an expression. The arms must agree on type if you use the result:

```aether
let s = if n % 2 == 0 { "even" } else { "odd" };
print(s);
```

The condition must be `bool`; `if 1 { ... }` is a type error.

### `while`

```aether
let mut i = 0;
while i < 5 {
  print(i);
  i = i + 1;
}
```

`while cond { body }` runs while `cond` is true. `break` exits the loop; `continue` skips to the next iteration. Both are statements (they return `never`).

Using `break` or `continue` outside of a loop is a type error: `'break' outside of a loop` or `'continue' outside of a loop`.

### `for in`

```aether
for i in range(0, 10) {
  print(i);
}

let nums = [10, 20, 30];
for n in nums {
  print(n);
}

for i in 0 .. 5 {
  print(i);
}

for i in 0 ..= 5 {
  print(i);
}
```

`for x in iterable { body }` iterates over:
- A `range(start, end, step)` call.
- A range expression `a .. b` or `a ..= b`.
- An array `[T]`.
- A string (iterates over code units, as 1-char strings).

The loop variable is immutable; you can't reassign `i` inside the loop body.

### `break` and `continue`

```aether
let mut sum = 0;
for i in 0 .. 100 {
  if i % 2 == 1 { continue; }   // skip odd
  if i > 50 { break; }           // stop at 51
  sum = sum + i;
}
print(sum);
```

Both work inside `while` and `for in`. Outside, they're type errors.

### `match`

```aether
enum Shape {
  Circle(float),
  Square(float),
  Rect(float, float),
}

fn area(s: Shape) -> float {
  match s {
    Shape::Circle(r)  => 3.14159 * r * r,
    Shape::Square(s)  => s * s,
    Shape::Rect(w, h) => w * h,
  }
}

print(area(Shape::Circle(2.0))); // 12.56636
```

`match expr { pattern => arm, ... }`. Arms are tried in order; the first matching pattern wins. Patterns can bind variables (the `r` in `Circle(r)`), use wildcards (`_`), nest (see [types-and-generics.md](types-and-generics.md) § on pattern matching).

A `match` is an expression; arms must agree on type if you use the result.

### `return`

```aether
fn first_even(xs: [int]) -> int {
  for x in xs {
    if x % 2 == 0 { return x; }
  }
  -1
}
```

`return expr;` exits the enclosing function with `expr`. `return;` (no expression) exits with `()`. `return` outside a function is a type error: `'return' outside of a function`.

### Blocks as expressions

```aether
let x = {
  let a = compute_a();
  let b = compute_b();
  a + b
};
```

A block is `{ stmt; stmt; expr }` — its value is the trailing expression. Statements inside the block end with `;`; the trailing expression does *not* end with `;` (a `;` would turn it into a statement and the block's value would be `()`).

---

## 7. Functions

We covered the basics in [getting-started.md](getting-started.md). Here's the full surface.

### Declaration

```aether
fn add(a: int, b: int) -> int {
  a + b
}
```

`fn name(params) -> ret_type { body }`. Parameters are `name: type`, comma-separated. The return type is `-> type`. The body is a block whose trailing expression is the return value. You can write `return` for early exit.

### No-parameter functions

```aether
fn greet() -> string {
  "hello, world"
}
```

Empty params are `()`. `fn greet() { ... }` (no return type) means return type `()`.

### Multiple return statements

```aether
fn classify(n: int) -> string {
  if n < 0 { return "negative"; }
  if n == 0 { return "zero"; }
  "positive"
}
```

A function with early returns still has a trailing expression for the fall-through case. The type checker verifies all `return expr;` and the trailing expression agree on type.

### Generic functions

```aether
fn id<T>(x: T) -> T { x }
fn first<T>(xs: [T], default: T) -> T {
  if len(xs) == 0 { default } else { xs[0] }
}
fn unwrap<T>(o: Option<T>, default: T) -> T {
  match o {
    Option::Some(v) => v,
    Option::None => default,
  }
}
```

`<T>` introduces a type parameter. Multiple: `<T, E>`. With constraint: `<T: Ord>` (the constraint is recorded but not enforced in v1 — see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md)). The compiler infers `T` at the call site from the argument types: `id(42)` instantiates `T = int`.

### Closures (anonymous functions)

```aether
let add = fn(a: int, b: int) -> int { a + b };
print(add(2, 3)); // 5

let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
print(doubled); // [2, 4, 6]
```

`fn(params) -> ret_type { body }` is a closure literal. It's a first-class value of type `fn(params) -> ret_type`. Parameter types are required in v1 (see [ADR-02 nominal types, structural functions](../decisions/adr-02-nominal-types-structural-functions.md) for the design rationale).

### Closures capture by reference

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

Closures see the *current* value of a captured `mut` binding — including mutations made after the closure was created. This is how you build local state in a language with no mutable struct fields in v1.

### Nested functions

```aether
fn fib_memo(n: int) -> int {
  let mut cache = [0, 1];
  fn helper(k: int) -> int {
    if k < len(cache) {
      cache[k]
    } else {
      let v = helper(k - 1) + helper(k - 2);
      push(cache, v);
      v
    }
  }
  helper(n)
}

print(fib_memo(20)); // 6765
```

A nested `fn` is just a closure that captures the enclosing scope. The example is from `examples/fibonacci.ae` — the memoization cache is a `let mut` in the outer function, captured by the inner helper.

---

## 8. Strings and interpolation

Aether strings are JS strings — UTF-16, immutable. The lexer recognizes:

### Plain string literals

```aether
let s = "hello, world";
let escaped = "with \"quotes\" and \\ backslash";
let multiline_supported = "no, single-line only in v1";
```

`"..."` with escape sequences `\"`, `\\`, `\n`, `\t`, `\r`. Multi-line strings are not supported in v1 — use `\n` in a single-line string, or build with concatenation.

### Interpolated string literals (`f"..."`)

```aether
let name = "aether";
let n = 42;
print(f"hello, {name}!");      // hello, aether!
print(f"n = {n}, n+1 = {n + 1}"); // n = 42, n+1 = 43
print(f"sum = {1 + 2 + 3}");    // sum = 6
```

`f"..."` is an interpolated string. `{expr}` evaluates `expr` and substitutes its display form. The expression inside the braces is parsed as a full Aether expression; it can include operators, function calls, even other interpolated strings (though nesting is awkward and rare).

The parser re-lexes the inner text of each `{...}` segment as a separate expression; a syntax error inside an interpolation produces `failed to parse interpolation '...': <message>`.

### String operations

```aether
let s = "hello";
print(len(s));          // 5
print(s + " world");    // hello world — + concatenates
print(s[0]);            // h — index by code unit
print(s == "hello");    // true
print(s != "world");    // true
print(s < "world");     // true — lexicographic
```

`len` (inline builtin) gives the code-unit length. `+` concatenates. `[i]` indexes by code unit (panics if out of bounds). `==`, `!=`, `<`, `<=`, `>`, `>=` compare lexicographically.

For richer string operations — `split`, `join`, `trim`, `replace`, `replaceAll`, `startsWith`, `endsWith`, `contains`, `indexOf`, `slice`, `charAt`, `repeat`, `padStart`, `padEnd`, `reverse`, `toUpper`, `toLower`, `toInt`, `format` — see the [stdlib tour](stdlib-tour.md) § string module.

### char vs string

```aether
let c: char = 'a';
let s: string = "a";
print(c == s);  // true at runtime (both are 1-char JS strings)
print(type_of(c)); // char
print(type_of(s)); // string
```

`char` and 1-char `string` are different types at compile time but indistinguishable at runtime. The type checker knows the difference; the evaluator doesn't. This is a deliberate v1 simplification — see [ADR-02 nominal types, structural functions](../decisions/adr-02-nominal-types-structural-functions.md).

---

## 9. Arrays

```aether
let empty: [int] = [];
let nums = [1, 2, 3];
let pairs: [(int, int)] = [(1, 2), (3, 4)];

print(nums[0]);    // 1
print(nums[2]);    // 3
print(len(nums));  // 3

let mut xs = [1, 2, 3];
xs[0] = 99;        // index-assign works on mut arrays
print(xs);         // [99, 2, 3]
```

An array is `[T]` — a homogeneous, mutable-by-default-reference (the array object is mutable; whether the *binding* is `mut` controls reassignment of the binding, not mutation of the array). Indexing by `int` returns the element; index-assign works if the binding is `mut` and the value type matches.

### Out-of-bounds

```aether
let xs = [1, 2, 3];
print(xs[5]);   // panic: array index out of bounds: 5
```

Runtime panics with `array index out of bounds: 5`. The type checker doesn't track array length, so this is a runtime error.

### Building arrays

```aether
let mut xs = [];
for i in 0 .. 10 { push(xs, i * i); }
print(xs);   // [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
print(len(xs)); // 10
```

`push(arr, v)` (inline builtin) appends. `pop(arr)` (inline builtin) drops the last element. Both are non-mutating on the binding (they mutate the array object in place) — see [ownership.md](ownership.md) for the v1 model.

### Higher-order array ops

```aether
let nums = [1, 2, 3, 4, 5];
let doubled = map(nums, fn(x: int) -> int { x * 2 });
let evens   = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
let sum     = reduce(nums, fn(acc: int, x: int) -> int { acc + x }, 0);

print(doubled); // [2, 4, 6, 8, 10]
print(evens);   // [2, 4]
print(sum);     // 15
```

`map`, `filter`, `reduce` are inline builtins that take a closure. See the [stdlib tour](stdlib-tour.md) for the larger collections module with `find`, `findIndex`, `every`, `some`, `includes`, `indexOf`, `flat`, `flatMap`, `zip`, `chunk`, `unique`, `sort`, `concat`, `reverse`, `slice`.

---

## 10. Tuples

```aether
let pair: (int, string) = (42, "aether");
print(pair.0);  // 42
print(pair.1);  // aether

let triple = (1, 2.0, "three");
print(triple.2); // three

let nested = ((1, 2), (3, 4));
print(nested.0.1); // 2

// destructuring in a let
let (a, b) = pair;
print(a);  // 42
print(b);  // aether
```

A tuple is `(T1, T2, ...)`. Field access by `.0`, `.1`, etc. — these are *field accesses on tuple-typed values*, evaluated by the `TupleField` AST node. Indexing `pair[0]` is also supported but the type checker distinguishes: tuple indexing by integer literal works (with a bounds check `tuple index 0 out of bounds (length 2)`), but `pair["0"]` is rejected.

Tuples can be destructured in `let`:

```aether
let pair = (1, "two");
let (n, s) = pair;
print(n); // 1
print(s); // two
```

They can also be destructured in `match`:

```aether
fn describe(p: (int, int)) -> string {
  match p {
    (0, 0) => "origin",
    (x, 0) => f"on x-axis at {x}",
    (0, y) => f"on y-axis at {y}",
    (x, y) => f"point ({x}, {y})",
  }
}

print(describe((0, 0)));  // origin
print(describe((3, 0)));  // on x-axis at 3
print(describe((2, 5)));  // point (2, 5)
```

---

## 11. Maps (dictionaries)

Aether has a `map[K]V` type. In v1, the surface syntax is awkward — you construct maps with the `mapNew` / `mapSet` / `mapGet` stdlib functions rather than a `{k: v, k: v}` literal, because the parser's `{` is reserved for blocks and struct literals:

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
print(mapGet(m, "one")); // 1
print(mapHas(m, "two")); // true
print(mapSize(m));        // 2

let keys = mapKeys(m);    // ["one", "two"]
for k in keys {
  print(f"{k} -> {mapGet(m, k)}");
}
```

The full map / set API is in the [stdlib tour](stdlib-tour.md) § collections module: `mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapDelete`, `mapKeys`, `mapValues`, `mapEntries`, `mapSize`, `setNew`, `setAdd`, `setHas`, `setDelete`, `setSize`, `setToArray`.

Map literal syntax is on the v2 list (see [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md)).

---

## 12. Putting it together — a small JSON-like value printer

Here's a 40-line program using every construct in this tutorial:

```aether
// shapes.ae — print a list of shapes, sorted by area, with names.

enum Shape {
  Circle(float),
  Square(float),
  Rect(float, float),
  Triangle(float, float), // base, height
}

fn area(s: Shape) -> float {
  match s {
    Shape::Circle(r)        => 3.14159 * r * r,
    Shape::Square(s)        => s * s,
    Shape::Rect(w, h)       => w * h,
    Shape::Triangle(b, h)   => 0.5 * b * h,
  }
}

fn name(s: Shape) -> string {
  match s {
    Shape::Circle(_)    => "circle",
    Shape::Square(_)    => "square",
    Shape::Rect(_, _)   => "rectangle",
    Shape::Triangle(_, _) => "triangle",
  }
}

fn describe(s: Shape) -> string {
  f"{name(s)} (area = {area(s)})"
}

let shapes = [
  Shape::Circle(2.0),
  Shape::Square(3.0),
  Shape::Rect(3.0, 4.0),
  Shape::Triangle(2.0, 5.0),
];

// Print each shape.
for s in shapes {
  print(describe(s));
}

// Compute the total area with reduce.
let total = reduce(shapes, fn(acc: float, s: Shape) -> float { acc + area(s) }, 0.0);
print(f"total area = {total}");
```

Output:

```
circle (area = 12.56636)
square (area = 9)
rectangle (area = 12)
triangle (area = 5)
total area = 38.56636
```

That uses `enum`, `match`, `fn`, closures, `for in`, `reduce`, `f"..."` interpolation, and arithmetic. You can read every line now.

---

## 13. What's next

- [types-and-generics.md](types-and-generics.md) — the type system in depth: tuples, arrays, maps, enums (ADTs), structs, option, result, generics, type inference, numeric widening, type aliases.
- [error-handling.md](error-handling.md) — `Result<T, E>`, the `?` operator, panic vs. error.
- [ownership.md](ownership.md) — honest about v1 (GC, immutability) and v2 (borrow checker).
- [stdlib-tour.md](stdlib-tour.md) — the 200+ stdlib functions.
- [reference/error-catalog.md](../reference/error-catalog.md) — every error message, decoded.
- [reference/glossary.md](../reference/glossary.md) — terms, defined.

If you want a longer worked example, the `examples/fibonacci.ae` file in the playground's Examples view shows three implementations of `fib` (recursive, iterative, memoized) using nested closures and array caching — a good test of "did this tutorial land?".
