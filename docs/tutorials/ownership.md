# Ownership, Borrowing, and Memory in Aether

> Audience: anyone wondering where Aether's borrow checker is.
> Prerequisites: a passing familiarity with Rust, Swift, or Go's
> GC. 30 minutes.

This tutorial is **honest** about Aether v1's memory model. Aether
v1 has **no ownership system, no borrow checker, no lifetimes**.
Memory is managed by a garbage collector. Mutability is opt-in via
`let mut`. There are no null-pointer dereferences because `Option`
replaces null. There is no `unsafe`. This is the *current* reality,
and this document is structured around it.

For the v2 plan — affine types, borrow checking, lifetimes — see
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).
For the design rationale behind "GC for v1, ownership for v2",
see
[../decisions/adr-06-gc-over-borrow-checker-for-v1.md](../decisions/adr-06-gc-over-borrow-checker-for-v1.md).

## 1. The v1 reality

Aether v1's memory model has three properties:

1. **Garbage collection.** All heap-allocated values (strings,
   arrays, maps, closures, structs, enum variants) are managed
   by a garbage collector (the host JavaScript runtime's GC, in
   v1). You do not free memory; the GC reclaims unreachable
   objects automatically.
2. **Immutability by default.** A `let` binding is read-only. A
   `let mut` binding is read-write. A `const` binding is a
   compile-time constant.
3. **No nulls, no exceptions.** The language uses `Option<T>` for
   "may be absent" and `Result<T, E>` for "may fail". There is no
   `null` value and no `throw`/`catch`.

These three properties together make Aether v1 "safe by default"
in a meaningful sense: you cannot dereference null, you cannot
use-after-free (because there is no `free`), you cannot double-free
(because there is no `free`), and you cannot forget to handle an
error (because `Result` is a value and `?` propagates).

What v1 *does not* have:

- **No borrow checker.** You can have as many references to a
  value as you want. The compiler does not track them. You can
  mutate through one while another reads.
- **No lifetimes.** A value lives as long as it is reachable from
  a root. There is no `'a` syntax.
- **No move semantics.** All values are reference types in v1.
  Assigning a value to a variable copies the reference, not the
  value. The GC reclaims the value when no references remain.
- **No affine types.** A `let` binding can be used zero, one, or
  many times. The compiler does not enforce "use exactly once".

## 2. The v2 plan

The v2 plan adds an **affine type system** and a **borrow checker**
to Aether. The design is sketched in
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).
The high-level shape is:

- **Affine types.** Each value has an *affinity*: copyable,
  movable, or unique. Most values are movable. `Copy` types (like
  `int`, `bool`, `char`) can be duplicated. Unique types (like
  `Channel<T>` handles) can be used exactly once.
- **Borrow check.** A `&T` reference is a shared borrow; a
  `&mut T` reference is an exclusive borrow. The compiler
  enforces "many readers XOR one writer".
- **Lifetimes.** Each reference has a lifetime, written `'a`. The
  compiler infers lifetimes in most cases; explicit annotations
  are needed only for function signatures that take or return
  references.
- **Move semantics.** Assigning a non-`Copy` value moves it; the
  old binding is no longer usable. For an explicit copy, use
  `clone()`.

This v2 design is closer to Rust's ownership system than to Go's
GC or Swift's ARC. The plan is to ship it as an opt-in mode in v2
and the default in v3, with the GC remaining for backward
compatibility and for code that does not need the borrow checker.

Why the split? Because building a borrow checker is a multi-year
project, and Aether v1 was supposed to ship *something runnable*
in a weekend. The GC was the right choice for v1; the borrow
checker is the right choice for v2. See
[../decisions/adr-06-gc-over-borrow-checker-for-v1.md](../decisions/adr-06-gc-over-borrow-checker-for-v1.md)
for the full argument.

The rest of this document describes the **v1 reality** in detail
and points at the **v2 plan** where appropriate.

## 3. Safe by default in v1

"Safe by default" in v1 means four concrete things.

### 3.1 Immutability by default

`let` bindings are immutable. To mutate, you must write `let mut`.
This makes mutation explicit at the binding site, which makes code
easier to read and reason about:

```aether
let x = 42;
x = 43;
// → cannot assign to immutable variable 'x'
```

```aether
let mut y = 42;
y = 43;   // OK
print(y);   // → 43
```

The type checker enforces this at compile time. There is no
runtime cost — the immutability check happens entirely in
`aether/core/sema/sema.ts`.

This catches a class of bugs: typos that overwrite a value you
meant to keep, accidental mutation in a closure, and shared-state
race conditions (in single-threaded v1, this last one is moot, but
in v2 with async it will matter).

### 3.2 No null via `Option`

There is no `null` literal in Aether. The way to represent "may be
absent" is `Option<T>`:

```aether
enum Option<T> { Some(T), None, }

fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 { Option::None }
  else if i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}

match lookup([1, 2, 3], 5) {
  Option::Some(v) => print(f"found {v}"),
  Option::None    => print("not found"),
}
// → not found
```

The compiler does not let you use an `Option<T>` as if it were a
`T`. You must extract the inner value, either by pattern matching
or by using a function like `unwrap`:

```aether
let x: Option<int> = Option::Some(42);
print(x + 1);
// → operator '+' not defined for Option<int> and int
```

Compare this to TypeScript, where `x` might be `null` and `x + 1`
would silently produce `1` or `NaN` at runtime. Aether's static
check eliminates a whole class of null-pointer bugs.

### 3.3 Error handling via `Result`

Computation that can fail returns `Result<T, E>`. There is no
`throw`/`catch`:

```aether
enum Result<T, E> { Ok(T), Err(E), }

fn parse_int(s: string) -> Result<int, string> {
  // Imagine parsing logic.
  if s == "42" { Result::Ok(42) } else { Result::Err("not 42") }
}

match parse_int("42") {
  Result::Ok(n)   => print(f"got {n}"),
  Result::Err(e)  => print(f"error: {e}"),
}
// → got 42
```

The `?` operator propagates errors:

```aether
fn double_it(s: string) -> Result<int, string> {
  let n = parse_int(s)?;
  Result::Ok(n * 2)
}

match double_it("21") {
  Result::Ok(n)  => print(f"doubled: {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
// → doubled: 42
```

See [error-handling.md](error-handling.md) for the full
`Result`/`Option` story.

### 3.4 No `unsafe`, no `free`, no raw pointers

There is no `unsafe` block, no manual `free`, no raw pointer
arithmetic, no FFI. You cannot shoot yourself in the foot with
memory safety in Aether v1, because there are no feet-shooting
tools available.

The trade-off: Aether v1 cannot directly call C libraries, cannot
allocate raw buffers, cannot write a garbage collector in itself.
Those are all v2 (and later) concerns. The FFI plan is in
[../spec/14-interoperability.md](../spec/14-interoperability.md).

## 4. What mutation looks like

Aether v1 has three kinds of mutation:

### 4.1 Reassigning a `let mut` binding

```aether
let mut x = 0;
x = x + 1;
print(x);   // → 1
```

### 4.2 Compound assignment on a `let mut` binding

```aether
let mut x = 10;
x += 5;
x *= 2;
print(x);   // → 30
```

The full set: `+= -= *= /= %= &= |= ^= <<= >>=`.

### 4.3 Index-assigning into an array or map

```aether
let mut xs = [1, 2, 3];
xs[1] = 99;
print(xs);   // → [1, 99, 3]

let mut m = { "a": 1 };
m["b"] = 2;
print(m["b"]);   // → 2
```

The index-assign works because `xs` and `m` are reference types —
the underlying object is shared, and the binding `xs` is just a
pointer. In v2 with the borrow checker, you will need to mark the
binding `mut` to do this (or use a `&mut` reference). In v1, the
binding does not need to be `mut` for index-assignment because the
binding itself is not reassigned; the underlying object is mutated
through the reference.

This is one of the rough edges of v1 that the v2 borrow checker
will fix. For now, the convention is to use `let mut` for any
binding you intend to mutate through, even though the compiler
does not require it.

### 4.4 Mutating struct fields

Struct fields can be mutated through `let mut`:

```aether
struct Counter { count: int }

let mut c = Counter { count: 0 };
c.count = c.count + 1;
c.count = c.count + 1;
print(c.count);   // → 2
```

In v1, this works because the struct is a reference type and the
binding is `mut`. In v2, the struct will need to be declared with
`mut` fields if you want to mutate them after construction.

## 5. What is shared and what is copied

This is the part that is most different from Rust and most similar
to JavaScript / Python / Lua.

### 5.1 Reference semantics

Strings, arrays, maps, structs, and enum variants are **reference
types**. Assigning one to a variable copies the reference, not the
value. Two variables can refer to the same object:

```aether
let mut xs = [1, 2, 3];
let ys = xs;          // ys and xs refer to the same array
xs[0] = 99;
print(ys[0]);        // → 99  (ys sees the change!)
```

In Rust, this code would either move `xs` (and then `xs` would be
unusable) or borrow `xs` (and then `xs[0] = 99` would require a
`&mut`). In Aether v1, both `xs` and `ys` are valid, and both see
the mutation.

This is the JS/Python model. It is simpler to learn, but it
allows a class of bugs where you accidentally mutate something
that someone else is reading. The v2 borrow checker will catch
these at compile time.

### 5.2 Value semantics

Primitives (`int`, `float`, `bool`, `char`, `unit`) have value
semantics. Assignment copies the value:

```aether
let x = 42;
let y = x;
y = 99;
print(x);   // → 42  (unchanged)
print(y);   // → 99
```

Tuples have value semantics if all their elements do (i.e., if
they contain only primitives):

```aether
let p = (1, 2);
let q = p;
// ... q.0 = 99 is not allowed anyway because tuples are immutable
```

### 5.3 Cloning

In v1, there is no `clone()` method; you must clone manually. For
arrays, the stdlib `collections` module provides a `slice(arr, 0,
len(arr))` that produces a shallow copy. For maps, you can build
a new map from the entries:

```aether
let xs = [1, 2, 3];
let ys = slice(xs, 0, len(xs));
xs[0] = 99;
print(ys[0]);    // → 1  (ys is a separate array)
```

In v2, the plan is to provide a `clone()` method on all types and
a `Copy` trait that types can implement to indicate that they are
cheap to copy.

## 6. Closures and captures

A closure captures variables from its enclosing scope. In v1, the
capture is **by reference**: the closure holds a reference to the
captured variable, and mutations through the closure are visible
to the outer scope.

```aether
let mut counter = 0;
let inc = fn() -> int {
  counter = counter + 1;
  counter
};

print(inc());   // → 1
print(inc());   // → 2
print(inc());   // → 3
print(counter);  // → 3  (outer scope sees the change)
```

This is the JavaScript model. In v2 with the borrow checker, the
capture mode will be inferred: `&T` for read-only captures,
`&mut T` for read-write captures, and `move T` for captures that
outlive the scope. See
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md)
for the plan.

A common gotcha: a closure that captures a `let mut` variable
will continue to mutate it after the variable goes out of scope.
This is fine in v1 because the GC keeps the variable alive; in
v2, the borrow checker will require the closure to take ownership
or borrow explicitly.

```aether
fn make_counter() -> fn() -> int {
  let mut counter = 0;
  fn() -> int {
    counter = counter + 1;
    counter
  }
}

let c = make_counter();
print(c());   // → 1
print(c());   // → 2
```

In Rust, this would not compile because `counter` does not live
long enough. In Aether v1, the closure keeps `counter` alive via
the GC. In Aether v2, this will compile but require an explicit
`move`:

```aether
// v2 sketch (not v1 syntax):
fn make_counter() -> fn() -> int {
  let mut counter = 0;
  move fn() -> int {
    counter = counter + 1;
    counter
  }
}
```

## 7. What the v1 type checker enforces

The v1 type checker (`aether/core/sema/sema.ts`) enforces these
memory-related rules:

- `let` bindings cannot be reassigned.
- Compound assignment requires a `let mut` (or `let mut`-equivalent
  like a function parameter — but parameters are not mutable in
  v1).
- `break` and `continue` are only valid inside a loop.
- `return` is only valid inside a function.
- Array indices must be `int`.
- Map keys must match the map's key type.
- Struct field access must refer to a declared field.

The checker does **not** enforce:

- Borrow discipline (multiple mutable references are fine).
- Use-after-move (there is no move).
- Lifetime constraints (there are no lifetimes).
- Move-out-of-borrow (because there is no move).
- Definite assignment (you can read an uninitialized variable and
  get a runtime panic).

These are all v2+ concerns. See
[../spec/03-type-system.md](../spec/03-type-system.md) §6 for the
v2 plan.

## 8. What the v1 evaluator does at runtime

The v1 evaluator (`aether/core/eval/eval.ts`) runs the program by
walking the AST. Memory management is delegated to the host
JavaScript runtime:

- Strings are JavaScript strings (immutable, GC'd).
- Arrays are JavaScript arrays (mutable, GC'd).
- Maps are JavaScript `Map` objects (mutable, GC'd).
- Structs and enum variants are JavaScript objects with a
  `__struct` or `__enum` discriminator (mutable, GC'd).
- Closures are JavaScript closures (GC'd, capturing the lexical
  scope).

The evaluator does not allocate memory manually; it creates
JavaScript objects and lets the host GC reclaim them. This is the
simplest possible implementation, and it is fast enough for the
playground (see [performance.md](performance.md) for numbers).

The runtime panics that the evaluator can throw are listed in
[../reference/error-catalog.md](../reference/error-catalog.md)
under "Runtime errors". The most common ones are:

- `array index out of bounds: N`
- `map key not found: ...`
- `division by zero`
- `modulo by zero`
- `execution step limit exceeded (1000000)`
- `assertion failed: A != B`
- `panic: <message>`

## 9. Migrating from Rust mental model

If you are coming from Rust, here is what to keep and what to
discard.

### 9.1 Keep

- `enum` with `Option` and `Result` is the same shape.
- `match` is the same shape, with the same exhaustiveness intent.
- `let` and `let mut` mean what you expect.
- The `?` operator works on `Result` and `Option`.
- String slices and array slices are similar conceptually.

### 9.2 Discard

- There is no `&`, no `&mut`, no `*`. References are implicit.
- There is no `move`. All values are reference types in v1.
- There is no `clone()`. Copy manually or use the stdlib.
- There is no `Copy` trait. Primitives are value types
  automatically.
- There is no `Drop`. The GC handles cleanup.
- There is no `unsafe`.
- There are no lifetimes (`'a`).
- There is no `Box`, `Rc`, `Arc`. Everything is GC'd.
- Struct fields are mutable through `let mut` bindings; there is
  no `&mut self` distinction.

### 9.3 What this means in practice

In Rust, you would write:

```rust
fn main() {
    let mut v = Vec::new();
    for i in 0..10 {
        v.push(i);
    }
    let sum: i32 = v.iter().sum();
    println!("{}", sum);
}
```

In Aether v1, you write:

```aether
let mut v: [int] = [];
for i in range(0, 10) {
  v = push(v, i);
}
let sum = reduce(v, fn(a: int, b: int) -> int { a + b }, 0);
print(sum);
// → 45
```

Note that `push` in v1 is *non-mutating* — it returns a new array
with the element appended. To get the Rust-like "push in place"
behavior, you assign the result back: `v = push(v, i)`. The
stdlib's `push` is the inline builtin; it actually does mutate
the array in place under the hood, but the type system treats it
as non-mutating for clarity. See
[../tutorials/stdlib-tour.md](stdlib-tour.md) §3 for the
explanation.

(Yes, this is slightly confusing. The v2 plan is to introduce
methods like `v.push(i)` that mutate in place and a `&mut` borrow
that makes this explicit. For v1, the convention is to assign
back.)

## 10. Migrating from the JavaScript / Python mental model

If you are coming from JS or Python, Aether v1 should feel
familiar. The main differences:

- **Static types.** You can write `let x = 42` and let the
  compiler infer, or `let x: int = 42` to be explicit. You
  cannot write `x = "hello"` later; the type was fixed at
  declaration.
- **No `null`, no `undefined`.** Use `Option<T>` and `Result<T, E>`.
- **No exceptions.** Use `Result` and `?`.
- **Immutability by default.** `let` is read-only; write `let mut`
  to mutate.
- **No `for ... in` over objects.** Use the stdlib `map_keys` /
  `map_values` / `map_entries` to iterate over a map.

See
[../guides/migration-from-typescript.md](../guides/migration-from-typescript.md)
and
[../guides/migration-from-python.md](../guides/migration-from-python.md)
for the full mapping tables.

## 11. The lifecycle of an Aether object

Here is what happens to an Aether object from creation to
collection:

1. **Creation.** You write `let xs = [1, 2, 3];`. The evaluator
   creates a JavaScript array `[1, 2, 3]` and binds the name `xs`
   to it. The binding lives in the current environment record.
2. **Use.** You write `print(xs[0]);`. The evaluator looks up
   `xs`, finds the array, indexes it, prints the result.
3. **Aliasing.** You write `let ys = xs;`. The evaluator copies
   the reference; now `xs` and `ys` both point to the same
   JavaScript array.
4. **Going out of scope.** The block in which `xs` and `ys` were
   declared ends. The environment record is discarded. The
   JavaScript references from the environment are gone.
5. **Collection.** When no references to the array remain, the
   JavaScript GC reclaims it. This happens at some
   implementation-defined time after step 4.

You do not need to worry about any of this. The compiler does not
expose it. There is no `Drop` trait, no `defer`, no `finally`. The
v2 plan adds `defer` for resource cleanup (closing files, etc.);
see [../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md)
for the design.

## 12. A worked example: a small linked list

Here is a small program that builds a singly linked list and sums
it. The interesting bit is that this *just works* in v1 without
any borrow checker worry:

```aether
enum List<T> {
  Empty,
  Cons(T, List<T>),
}

fn sum(l: List<int>) -> int {
  match l {
    List::Empty         => 0,
    List::Cons(h, t)    => h + sum(t),
  }
}

fn from_array(xs: [int]) -> List<int> {
  if len(xs) == 0 { List::Empty }
  else { List::Cons(xs[0], from_array(slice(xs, 1, len(xs)))) }
}

let l = from_array([1, 2, 3, 4, 5]);
print(sum(l));
// → 15
```

In Rust, this would not compile with the standard `Box<List<T>>`
approach because of the borrow checker and lifetime rules. You
would need to use `Rc` or `Box` carefully. In Aether v1, the GC
just handles it: each `Cons` variant is a heap-allocated object
that the GC reclaims when it becomes unreachable.

This is the *power* of GC for v1: recursive data structures are
trivial. The cost is performance (GC pauses, allocation overhead)
and a class of bugs (mutation through shared references). For v2,
the plan is to provide `Rc<T>` and `Box<T>` for explicit control
when you need it; the GC remains the default.

## 13. The honest tradeoff

Aether v1 chooses:

- **Simplicity over control.** No borrow checker means no borrow
  checker errors. It also means no compile-time guarantee of
  memory safety in the Rust sense.
- **GC over manual management.** The GC handles cleanup. You do
  not need to think about free, drop, or ownership. The cost is
  GC pauses, allocation overhead, and a larger runtime footprint.
- **Immutability as the default** for the binding, not for the
  value. The binding is read-only by default; the underlying
  object is still mutable through other references.

For the playground, the documentation site, and learning the
language, this is the right tradeoff. For shipping a high-
performance server, you would want the v2 borrow checker. The
plan is to get there, but to do it without sacrificing the v1
simplicity for users who do not need it. See
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md)
for the v2 design and
[../decisions/adr-06-gc-over-borrow-checker-for-v1.md](../decisions/adr-06-gc-over-borrow-checker-for-v1.md)
for the v1 decision.

## 14. Where to go next

- **[error-handling.md](error-handling.md)** — `Result`, `Option`,
  the `?` operator. The other half of "safe by default".
- **[concurrency.md](concurrency.md)** — what v1's
  single-threaded evaluator means and what v2 async looks like.
- **[performance.md](performance.md)** — what the GC and the
  tree-walking interpreter cost in practice.
- **[../decisions/adr-06-gc-over-borrow-checker-for-v1.md](../decisions/adr-06-gc-over-borrow-checker-for-v1.md)**
  — the design decision behind v1's choice.
- **[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md)**
  — the v2 design for ownership.

Aether v1 is "safe by default" in the small, "no guarantees" in
the large. v2 will close the gap. Until then, the playground is
the right place to learn the language; production use should
wait for v2.
