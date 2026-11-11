# Language Basics

> Audience: someone who finished [getting-started.md](getting-started.md)
> and wants the full surface tour.
> Prerequisites: a browser, the playground open, 45 minutes.

This tutorial walks the Aether language surface in roughly the order
a beginner will meet it: bindings, primitive types, arithmetic,
control flow, functions, closures, strings, arrays, tuples, and
comments. Each section has runnable examples; paste them into the
playground and modify them.

The reference for what is described here lives in
[../spec/04-expressions.md](../spec/04-expressions.md) and
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).
For the type system (structs, enums, generics, pattern matching),
continue to [types-and-generics.md](types-and-generics.md).

## 1. The three binding forms

Aether has three ways to introduce a name: `let`, `let mut`, and
`const`.

```aether
let x: int = 42;            // immutable, annotated
let mut y: float = 3.14;    // mutable, annotated
const PI: float = 3.14159;  // compile-time constant
```

### 1.1 `let` — immutable bindings

`let` introduces a name that cannot be reassigned for the rest of
its scope. This is the default form; reach for it first.

```aether
let answer = 6 * 7;
print(answer);
// → 42
```

If you try to reassign a `let`-bound name, the type checker rejects
it:

```aether
let answer = 42;
answer = 43;
// → cannot assign to immutable variable 'answer'
```

This is the most common error new Aether programmers hit. The fix is
either to declare `let mut` (when you really do want to mutate) or
to introduce a new `let` (when you want a new value derived from the
old one):

```aether
let answer = 42;
let next   = answer + 1;   // new binding, no mutation
```

### 1.2 `let mut` — mutable bindings

`let mut` introduces a name that can be reassigned. This is the form
you need for loop counters, accumulators, and any state that
genuinely changes over time.

```aether
let mut count = 0;
count = count + 1;
count = count + 1;
print(count);
// → 2
```

You can also use compound-assignment operators on `mut` bindings:

```aether
let mut x = 10;
x += 5;   // x = 15
x -= 3;   // x = 12
x *= 2;   // x = 24
x /= 4;   // x = 6
x %= 4;   // x = 2
print(x);
// → 2
```

The full set: `+= -= *= /= %= &= |= ^= <<= >>=`. Bitwise compound
assignments (`&=`, `|=`, `^=`, `<<=`, `>>=`) require `int`
operands; arithmetic compound assignments work on `int` and `float`.

### 1.3 `const` — compile-time constants

`const` declares a value that is known at compile time. In v1, the
distinction between `const` and `let` is mostly cosmetic — both are
evaluated at runtime — but `const` signals intent: this value will
not change, ever, in any version of this program. The linter
(planned for v2) will eventually prefer `const` for physical
constants, configuration values, and other compile-time-known data.

```aether
const MAX_RETRIES: int = 3;
const PI: float = 3.14159;
const GREETING: string = "hello";

print(f"PI is roughly {PI}");
```

A `const` cannot be redeclared in the same scope (this is the same
rule as `let`).

## 2. Primitive types

Aether v1 has six primitive types: `int`, `float`, `bool`, `string`,
`char`, and `unit`.

| Type | Values | Default literal | Notes |
|------|--------|-----------------|-------|
| `int` | 64-bit signed integer | `42`, `0xFF`, `0b1010`, `0o17` | wraps on overflow |
| `float` | IEEE 754 double | `3.14`, `1e10` | saturates on overflow |
| `bool` | `true` / `false` | `true`, `false` | 1 byte |
| `string` | UTF-8 string | `"hi"`, `f"x={x}"` | growable |
| `char` | Unicode scalar value | `'a'`, `'\n'`, `'\u{1F600}'` | 4 bytes |
| `unit` | `()` | `()` | the only value of the `unit` type |

### 2.1 Integer literals

Integers can be written in decimal, hexadecimal, binary, or octal.
Underscores between digits are ignored, which is convenient for
readability:

```aether
let dec   = 1_000_000;
let hex   = 0xFF;
let bin   = 0b1010;
let oct   = 0o17;

print(dec);   // → 1000000
print(hex);   // → 255
print(bin);   // → 10
print(oct);   // → 15
```

The `int` type is 64-bit and wraps on overflow (this matches
JavaScript `Number` for values that fit; very large values lose
precision because Aether v1 represents `int` as a JavaScript number).

### 2.2 Float literals

Floats are written with a decimal point or an exponent. A decimal
point with no fractional digits (`1.`) is a lexer error; write
`1.0`.

```aether
let pi    = 3.14159;
let avog  = 6.022e23;
let tenth = 0.1;
```

`int` widens to `float` automatically in mixed arithmetic:

```aether
let mixed = 1 + 0.5;
print(type_of(mixed));
// → float
```

The reverse (narrowing `float` to `int`) is not automatic; you must
use `as int`:

```aether
let f = 3.7;
let n = f as int;
print(n);
// → 3
```

The `as int` cast truncates toward zero. For other rounding modes,
use `floor`, `ceil`, or `round` from the `math` stdlib module.

### 2.3 Booleans

Booleans have two values: `true` and `false`. They are produced by
comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) and
combined by logical operators (`&&`, `||`, `!`).

```aether
let t = true;
let f = false;
print(t && f);  // → false
print(t || f);  // → true
print(!t);      // → false
```

`&&` and `||` short-circuit: the right operand is not evaluated if
the left already determines the result. This matters when the right
side has a side effect:

```aether
fn side_effect() -> bool { print("called"); true }

let a = false && side_effect();  // side_effect is NOT called
let b = true  || side_effect();  // side_effect is NOT called
print("done");
// → done
```

### 2.4 Strings

Strings are UTF-8 and growable. The string stdlib module has ~40
functions (`split`, `join`, `trim`, `replace`, `replace_all`,
`starts_with`, `ends_with`, `contains`, `index_of`, `slice`,
`char_at`, `repeat`, `pad_start`, `pad_end`, `reverse`, `len`,
`is_empty`, `to_int`, `format`, `to_upper`, `to_lower`, ...). See
[stdlib-tour.md](stdlib-tour.md) for a tour.

The two literal forms:

```aether
let plain = "hello, world";
let interp = f"hello, {name}!";
```

Interpolated strings begin with `f` and can contain any number of
`{expression}` interpolations:

```aether
let x = 5;
let y = 7;
print(f"{x} + {y} = {x + y}");
// → 5 + 7 = 12
```

The interpolation can contain arbitrary expressions, including
nested strings:

```aether
let name = "Alice";
print(f"greet({name}) = {f"hi, {name}"}");
// → greet(Alice) = hi, Alice
```

### 2.5 Chars

A `char` is a single Unicode scalar value. Char literals use single
quotes:

```aether
let a = 'a';
let nl = '\n';
let tab = '\t';
let emoji = '\u{1F600}';
```

The escape sequences are: `\n`, `\r`, `\t`, `\0`, `\\`, `\'`, `\"`,
`\u{...}`. A multi-code-point grapheme cluster in a `char` literal
is a lexer error; use a `string` instead.

The string stdlib exposes `char_code` and `from_char_code` for
converting between `char` and `int`:

```aether
let n = char_code("A", 0);
print(n);                       // → 65
print(from_char_code(66));       // → B
```

### 2.6 Unit

The `unit` type has exactly one value, written `()`. It is the type
of expressions that have no meaningful value to return: function
calls like `print`, `println`, `assert`, and the empty block `{}`.

```aether
let nothing: () = ();
print(type_of(nothing));
// → unit
```

`unit` is the return type of any function that does not declare a
return type:

```aether
fn say_hi() { print("hi"); }
let r = say_hi();
print(type_of(r));
// → unit
```

## 3. Arithmetic and operators

### 3.1 Arithmetic

The arithmetic operators are `+ - * / %`. They work on `int` and
`float`; mixing the two widens the result to `float`.

```aether
print(2 + 3);     // → 5
print(2.0 + 3);   // → 5
print(7 / 2);     // → 3.5  (always float division!)
print(7 % 3);     // → 1   (Python-sign modulo)
print(-7 % 3);    // → 2   (always non-negative)
```

Note that `/` is always floating-point division in v1, even on
`int` operands. For integer (truncating) division, cast the result
to `int`:

```aether
let n = (7 / 2) as int;
print(n);   // → 3
```

The modulo operator `%` follows Python's sign rule: the result
always has the same sign as the divisor, so `-7 % 3 == 2`, not
`-1`. This is the only correct choice for a language that wants
to be predictable across platforms; see
[../spec/04-expressions.md](../spec/04-expressions.md) §6 for the
rationale.

### 3.2 Comparison

`==`, `!=`, `<`, `<=`, `>`, `>=`. They produce `bool`. The
comparison operators are defined for `int`, `float`, `char`, and
`string`; comparing incompatible types is a type error:

```aether
print(1 < 2);          // → true
print("a" < "b");      // → true
print(1 == 1.0);       // → true (int widens to float)
print(1 < "a");         // → cannot compare int with string
```

### 3.3 Logical

`&&`, `||`, `!`. Operands must be `bool`; the type checker rejects
non-bool operands:

```aether
print(true && false);  // → false
print(!true);          // → false
print(1 && 2);         // → left of '&&' must be bool, found int
```

### 3.4 Bitwise

`&`, `|`, `^`, `~`, `<<`, `>>`. Operands must be `int`:

```aether
print(12 & 10);    // → 8
print(12 | 10);    // → 14
print(12 ^ 10);    // → 6
print(~0);         // → -1
print(1 << 4);     // → 16
print(256 >> 2);   // → 64
```

`<<` and `>>` shift by the given number of bits. Negative shift
counts are not allowed and will panic at runtime.

### 3.5 Ranges and `as`

The `..` and `..=` operators produce ranges, mostly used in `for`
loops:

```aether
for i in range(0, 5) { print(i); }
// → 0 1 2 3 4
```

(`range` is a builtin, not a syntax form, in v1; the `..` operator
is reserved for future use as a range expression.)

The `as` operator performs explicit type conversions:

```aether
let n = 3.99 as int;          // → 3
let f = 42 as float;          // → 42.0
let s = 42 as string;         // → "42"
let s2 = true as string;      // → "true"
```

The full list of allowed conversions is in
[../spec/04-expressions.md](../spec/04-expressions.md) §13. Conversions
that are not allowed are type errors:

```aether
let bad = "hello" as int;
// → cannot cast string as int
```

## 4. Control flow

Aether has four control-flow constructs: `if`, `while`, `for`, and
`match`. Three of them (`if`, `match`, and the block) are
expressions — they produce values.

### 4.1 `if` / `else` — expression form

```aether
let n = 5;
let parity = if n % 2 == 0 { "even" } else { "odd" };
print(parity);
// → odd
```

The branches of an `if` are blocks. A block's value is its last
expression (without a semicolon). The two branches must produce
compatible types; otherwise the type checker rejects it.

You can chain `else if`:

```aether
fn classify(n: int) -> string {
  if n < 0 { "negative" }
  else if n == 0 { "zero" }
  else if n < 10 { "small" }
  else { "large" }
}

print(classify(-5));   // → negative
print(classify(0));    // → zero
print(classify(3));    // → small
print(classify(99));   // → large
```

`if` can also be used as a statement (in which case its value is
discarded):

```aether
let x = 5;
if x > 3 {
  print("big");
}
// → big
```

### 4.2 `while` — statement form

```aether
let mut i = 0;
let mut sum = 0;
while i < 10 {
  sum = sum + i;
  i = i + 1;
}
print(sum);
// → 45
```

`while` is a statement, not an expression. It produces `()`. The
condition must be `bool`; the type checker rejects non-bool
conditions:

```aether
while 1 { ... }
// → while condition must be bool, found int
```

`break` exits the loop; `continue` jumps to the next iteration:

```aether
let mut i = 0;
let mut evens = 0;
while i < 10 {
  i = i + 1;
  if i % 2 == 1 { continue; }
  evens = evens + 1;
}
print(evens);
// → 5
```

`break` and `continue` outside of a loop are errors:

```aether
break;
// → 'break' outside of a loop
```

### 4.3 `for` — over ranges and arrays

```aether
for i in range(0, 5) {
  print(i);
}
// → 0 1 2 3 4

for x in [10, 20, 30] {
  print(x);
}
// → 10 20 30
```

`range` is a builtin that produces an array of integers. It takes
one, two, or three arguments:

- `range(end)` → `0, 1, ..., end - 1`
- `range(start, end)` → `start, start + 1, ..., end - 1`
- `range(start, end, step)` → with a step

```aether
for i in range(10) { print(i); }       // 0..9
for i in range(2, 6) { print(i); }    // 2..5
for i in range(0, 10, 2) { print(i); } // 0, 2, 4, 6, 8
```

`for` also works over arrays:

```aether
let words = ["alpha", "beta", "gamma"];
for w in words {
  print(w);
}
```

`for` is a statement (returns unit). `break` and `continue` work
inside it.

### 4.4 `match` — expression form

`match` is the most powerful control-flow construct in Aether. It
performs pattern matching on a scrutinee and produces a value.

```aether
fn describe(n: int) -> string {
  match n {
    0       => "zero",
    1 | 2   => "small",
    _       => "many",
  }
}

print(describe(0));    // → zero
print(describe(2));    // → small
print(describe(99));   // → many
```

Arms are separated by commas; the trailing comma is optional. The
left side is a pattern (literal, identifier, `_`, tuple, struct,
enum variant, or `|`-separated alternation). The right side is an
expression (or block, which is an expression).

`match` is exhaustive in v1's linter sense — you must cover all
cases (with `_` if nothing else matches). v1 does not yet enforce
exhaustiveness for enums strictly; v2 will (see
[../spec/03-type-system.md](../spec/03-type-system.md) §6.6).

See [types-and-generics.md](types-and-generics.md) for the full
pattern-matching section, and
[error-handling.md](error-handling.md) for `Result`/`Option`
matching.

## 5. Functions

### 5.1 Declaration

```aether
fn add(a: int, b: int) -> int {
  a + b
}
```

A function declaration has:

- the `fn` keyword,
- a name (snake_case by convention),
- a parameter list `(a: int, b: int)`,
- an optional return-type annotation `-> int`,
- a body `{ ... }`.

The body is a block. The last expression (without a semicolon) is
the return value. You can use `return expr;` to return early from
anywhere in the body:

```aether
fn first_even(xs: [int]) -> int {
  for x in xs {
    if x % 2 == 0 { return x; }
  }
  return -1;
}

print(first_even([1, 3, 5, 6, 7]));   // → 6
print(first_even([1, 3, 5]));        // → -1
```

### 5.2 Functions are first-class

You can store a function in a variable, pass it as an argument, and
return it from another function:

```aether
fn add(a: int, b: int) -> int { a + b }
fn mul(a: int, b: int) -> int { a * b }

let ops = [add, mul];
print(ops[0](2, 3));    // → 5
print(ops[1](2, 3));    // → 6
```

The type of a function is `fn(T1, T2, ...) -> R`:

```aether
fn apply(f: fn(int, int) -> int, a: int, b: int) -> int {
  f(a, b)
}

print(apply(add, 2, 3));    // → 5
print(apply(mul, 2, 3));    // → 6
```

### 5.3 Generics

Functions can be generic over types:

```aether
fn id<T>(x: T) -> T { x }

print(id<int>(42));       // → 42
print(id<string>("hi"));  // → hi
print(id(7));             // → 7  (type inferred)
```

Most of the time you do not need to spell out the type arguments;
the compiler infers them from the argument types. The explicit form
with `<int>` (called turbofish in Rust) is rarely needed in v1.

### 5.4 Recursion

Functions can call themselves:

```aether
fn fact(n: int) -> int {
  if n <= 1 { 1 } else { n * fact(n - 1) }
}

print(fact(5));
// → 120
```

The evaluator has a step limit (1,000,000 by default) that bounds
how long a program can run. Deep recursion that exceeds this limit
aborts with `execution step limit exceeded (1000000)`. For very
deep recursion, see [performance.md](performance.md) for the
guidance on converting to a `while` loop.

Mutual recursion works:

```aether
fn is_even(n: int) -> bool {
  if n == 0 { true } else { is_odd(n - 1) }
}
fn is_odd(n: int) -> bool {
  if n == 0 { false } else { is_even(n - 1) }
}

print(is_even(10));    // → true
```

## 6. Closures

A closure is an anonymous function value that captures variables
from its enclosing scope. The syntax is `fn(params) -> ret { body }`.

```aether
let add = fn(a: int, b: int) -> int { a + b };
print(add(2, 3));
// → 5
```

### 6.1 Captures

Closures can read and write variables from their enclosing scope:

```aether
let mut counter = 0;
let inc = fn() -> int {
  counter = counter + 1;
  counter
};

print(inc());   // → 1
print(inc());   // → 2
print(inc());   // → 3
```

Read captures work too:

```aether
let base = 10;
let add_base = fn(x: int) -> int { x + base };
print(add_base(5));    // → 15
```

### 6.2 Higher-order functions

Closures are the building blocks of higher-order functions like
`map`, `filter`, and `reduce`:

```aether
let nums = [1, 2, 3, 4, 5];

let doubled = map(nums, fn(x: int) -> int { x * 2 });
print(doubled);              // → [2, 4, 6, 8, 10]

let evens = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
print(evens);                // → [2, 4]

let sum = reduce(nums, fn(a: int, b: int) -> int { a + b }, 0);
print(sum);                  // → 15
```

The type of a closure is the same as the type of a named function:
`fn(T) -> R`. You can pass closures to functions that expect
function types:

```aether
fn apply_twice(f: fn(int) -> int, x: int) -> int {
  f(f(x))
}

let r = apply_twice(fn(n: int) -> int { n + 1 }, 5);
print(r);
// → 7
```

### 6.3 Returning closures

A function can return a closure. The returned closure captures
the function's locals:

```aether
fn make_adder(n: int) -> fn(int) -> int {
  fn(x: int) -> int { x + n }
}

let add5 = make_adder(5);
let add10 = make_adder(10);

print(add5(1));    // → 6
print(add10(1));   // → 11
```

In v1, closures are heap-allocated (the GC manages them); there is
no borrow checker to worry about. See
[ownership.md](ownership.md) for the v1 memory model and the v2
plan.

## 7. Strings and interpolation

### 7.1 Plain strings

```aether
let s = "hello, world";
print(s);
print(len(s));      // → 12
```

The stdlib `string` module has the full set of operations. The
most common ones, with examples:

```aether
let s = "  hello, world  ";
print(trim(s));                       // → hello, world
print(to_upper(s));                   // →   HELLO, WORLD
print(replace(s, "world", "aether"));  // →   hello, aether
print(starts_with(s, "  he"));        // → true
print(slice(s, 2, 7));                // → hello
```

### 7.2 String concatenation

Use `+` to concatenate strings:

```aether
let first = "hello";
let second = "world";
print(first + ", " + second + "!");
// → hello, world!
```

For joining many strings, prefer the stdlib `join` function over
repeated `+`:

```aether
let parts = ["alpha", "beta", "gamma"];
print(join(parts, ", "));
// → alpha, beta, gamma
```

Repeated `+` in a loop is an anti-pattern — see
[../guides/anti-patterns.md](../guides/anti-patterns.md).

### 7.3 Interpolated strings

The `f"..."` form interpolates any expression:

```aether
let name = "Alice";
let age = 30;
print(f"{name} is {age} years old");
// → Alice is 30 years old
```

The interpolation can contain any expression, including function
calls:

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

for i in range(0, 10) {
  print(f"fib({i}) = {fib(i)}");
}
```

For a printf-style format, see the stdlib `format` function in
[stdlib-tour.md](stdlib-tour.md).

## 8. Arrays

An array is a contiguous, growable list of values. The type is
`[T]` where `T` is the element type.

```aether
let nums = [1, 2, 3];
print(nums[0]);     // → 1
print(nums[2]);     // → 3
print(len(nums));   // → 3
```

### 8.1 Construction

```aether
let empty: [int] = [];
let three = [1, 2, 3];
let mixed: [int] = [1, 2, 3, 4, 5];   // all elements same type
```

All elements must have the same type. A heterogeneous list is a
type error:

```aether
let bad = [1, "two", true];
// → elements of array literal must have a common type
```

(If you really need a heterogeneous list, use an enum or a sum
type — see [types-and-generics.md](types-and-generics.md).)

### 8.2 Indexing and assignment

```aether
let mut xs = [10, 20, 30];
print(xs[1]);      // → 20
xs[1] = 99;
print(xs[1]);      // → 99
```

Out-of-bounds indexing is a runtime panic:

```aether
let xs = [1, 2, 3];
print(xs[10]);
// → array index out of bounds: 10
```

The element type can itself be an array (nested arrays):

```aether
let grid = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
print(grid[1][2]);   // → 6
```

### 8.3 Iteration and higher-order methods

```aether
let nums = [1, 2, 3, 4, 5];

for x in nums { print(x); }

let squares = map(nums, fn(x: int) -> int { x * x });
print(squares);          // → [1, 4, 9, 16, 25]

let sum = reduce(nums, fn(a: int, b: int) -> int { a + b }, 0);
print(sum);              // → 15

let evens = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
print(evens);            // → [2, 4]
```

The full list of array builtins: `push` (mutating), `pop`
(mutating), `len`, `map`, `filter`, `reduce`. The stdlib
`collections` module adds `slice`, `concat`, `reverse`, `sort`,
`find`, `find_index`, `every`, `some`, `includes`, `flat`,
`flat_map`, `zip`, `chunk`, `unique`. See
[stdlib-tour.md](stdlib-tour.md).

### 8.4 Array concatenation

```aether
let a = [1, 2] + [3, 4];
print(a);    // → [1, 2, 3, 4]
```

For more than two arrays, use `concat` from the stdlib:

```aether
let one = [1];
let two = [2];
let three = [3];
let all = concat(concat(one, two), three);
print(all);   // → [1, 2, 3]
```

## 9. Tuples

A tuple is a fixed-size, heterogeneous collection. The type is
`(T1, T2, ..., Tn)`.

```aether
let p = (1, 2, 3);
print(p.0);   // → 1
print(p.1);   // → 2
print(p.2);   // → 3
```

Field access is `.0`, `.1`, `.2`, ... — by position, not name.
Out-of-bounds access is a type error:

```aether
let p = (1, 2);
print(p.5);
// → tuple field .5 out of bounds (length 2)
```

Tuples are structural: two tuples with the same element types are
the same type. They are also immutable — there is no field
assignment:

```aether
let mut p = (1, 2);
p.0 = 99;   // type error
```

To "update" a tuple, build a new one:

```aether
let p = (1, 2);
let q = (p.0 + 1, p.1);
print(q);   // → (2, 2)
```

Tuples are most useful for returning multiple values from a
function:

```aether
fn div_mod(a: int, b: int) -> (int, int) {
  (a / b, a % b)
}

let (q, r) = div_mod(17, 5);
print(q);   // → 3
print(r);   // → 2
```

Tuple patterns in `let` and `match` destructure by position; see
[types-and-generics.md](types-and-generics.md).

## 10. Comments

Aether has two comment forms:

- `//` to end of line
- `/* ... */` block, which nests (so `/* a /* b */ c */` is one
  comment)

```aether
// This is a line comment.

/* This is a block comment
   spanning multiple lines. */

let x = 42; /* inline comment */

/* outer /* nested */ outer */
```

Block comments that are not terminated produce the lexer error
`unterminated block comment`. Nested block comments are useful for
commenting out blocks of code that themselves contain block
comments:

```aether
/*
fn old() {
  /* inner comment */
  print("disabled");
}
*/
```

There is no doc-comment syntax (`///` or `/**`) in v1; the spec
plans to introduce them in v2 alongside a doc generator.

## 11. A worked example

Here is a small but complete program that exercises most of what
this tutorial has covered:

```aether
// stats.ae — compute simple statistics over an array of ints.

fn mean(xs: [int]) -> float {
  let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
  (total as float) / (len(xs) as float)
}

fn max_of(xs: [int]) -> int {
  let mut best = xs[0];
  for x in xs {
    if x > best { best = x; }
  }
  best
}

fn summary(xs: [int]) -> string {
  let m = mean(xs);
  let h = max_of(xs);
  f"mean={m}, max={h}, n={len(xs)}"
}

let data = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
print(summary(data));
// → mean=3.9, max=9, n=10
```

Run this in the playground. Then modify it:

1. Add a `min_of` function and include it in `summary`.
2. Convert `mean` to use a `while` loop instead of `reduce`.
3. Add a `median` function (sort the array, take the middle
   element; average the two middle elements if the length is
   even).

## 12. Where to go next

- **[types-and-generics.md](types-and-generics.md)** — structs,
  enums, generics, pattern matching, type aliases. The type system
  tour.
- **[error-handling.md](error-handling.md)** — `Result`, `Option`,
  the `?` operator, panic vs. error.
- **[ownership.md](ownership.md)** — what "no borrow checker" means
  in v1 and what v2 will add.
- **[stdlib-tour.md](stdlib-tour.md)** — the ten stdlib modules.
- **[idiomatic-aether.md](../guides/idiomatic-aether.md)** —
  20 patterns to internalize.

You now have enough Aether to write small programs. The rest of the
tutorials go deeper; the guides give you opinions.
