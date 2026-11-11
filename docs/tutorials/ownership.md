# Ownership, borrowing, and memory — honestly

> Audience: you've heard Aether is "Rust-like" and you want to know about ownership.
> **Short version:** Aether v1 has GC and immutability-by-default — *no borrow checker*. The v2 plan adds an affine type system with ownership and borrow checking. This tutorial is honest about v1 and the v2 design.

This tutorial covers what Aether v1 *does* have (garbage collection, immutable-by-default bindings, `mut` annotations, the `Option`/`Result` discipline that replaces null), what it *deliberately doesn't* have (a borrow checker, lifetime parameters, affine types, move semantics), and the v2 plan that introduces them — sketching the intended syntax, the trade-offs, and the relationship to the existing AST.

---

## 1. The honest summary

Aether v1 is **garbage-collected**. Every Aether value lives in the host JavaScript runtime's heap, and the JS garbage collector reclaims memory when no Aether reference holds it. There is no `free()`, no `drop`, no `Box`, no manual memory management. The v1 evaluator (in `aether/core/eval/eval.ts`) is a tree-walker: every binding lives in an `Env` (a lexical scope chain), every closure holds a reference to its `Env`, and the JS GC handles the rest.

Aether v1 is **immutable by default**. `let x = ...` introduces a binding you cannot reassign. `let mut x = ...` lets you reassign `x` itself. There is no "borrowed reference" (`&x`), no "mutable reference" (`&mut x`), no "move" — values are *copied* for primitives (int, float, bool, char, unit) and *shared by reference* for compound types (arrays, maps, closures, structs, enum variants). Sharing is fine because there's no mutation to coordinate (except through the binding's own `let mut`).

Aether v1 has **no `unsafe`**, **no FFI**, and **no raw pointers**. A program cannot, by construction, read freed memory, double-free, or have a use-after-free. The trade-off: no zero-cost abstractions over memory layout, no control over allocation, no `Drop` trait. Performance is the host JS engine's performance; pause times are the host GC's pause times.

The v2 plan (see [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md)) introduces an **affine type system** with ownership, borrowing, and lifetimes — closer to Rust. v2 will be opt-in per module, so v1 code keeps running on the GC runtime. We sketch the v2 syntax in §4.

---

## 2. What v1 actually has

### Garbage collection (host GC)

Aether v1's runtime is the JavaScript runtime. Every Aether value is a JS value: `int`/`float` are `number`, `string` is `string`, `bool` is `boolean`, `()` is `null`, arrays are `Array`, maps are `Map`, structs are `{ __struct: name, fields: {...} }`, enum variants are `{ __variant: name, variant: ..., data: [...] }`, closures are `{ __closure: ..., fn: FnDecl, env: Env }`. (See the `Value` type in `aether/core/eval/eval.ts`.) Memory management is delegated entirely to the JS GC.

This is documented in [ADR-06 GC over borrow checker for v1](../decisions/adr-06-gc-over-borrow-checker-for-v1.md). The decision was: for a teaching playground and a weekend-of-work v1 implementation, a borrow checker is the wrong cost/benefit. The borrow checker would have doubled the implementation size, would have made every tutorial example fail with a confusing lifetime error before getting to the actual point, and would have been largely irrelevant for the small programs the playground is for. The v2 plan brings it in carefully (RFC-004), keeping v1 working.

### Immutable by default

```aether
let x = 42;
// x = 43;       // ERROR: cannot assign to immutable variable 'x'

let mut y = 0;
y = y + 1;       // OK
print(y);        // 1
```

`let` introduces an immutable binding — the *binding* is immutable, the *value* may still be a mutable object. `let mut` introduces a mutable binding.

The type checker's check is in `aether/core/sema/sema.ts`:

```ts
if (info.kind !== "param") this.err(`cannot assign to immutable variable '${base.name}'`, s.loc);
```

A function parameter is always mutable (you can reassign it inside the function body) — this is a small ergonomic choice; parameters are local to the function and reassigning them doesn't affect the caller.

### Reference semantics for compound types

```aether
let xs = [1, 2, 3];
let ys = xs;          // ys and xs refer to the same array
let mut xs_mut = xs;
xs_mut[0] = 99;
print(xs[0]);        // 99 — xs sees the change!
print(ys[0]);        // 99 — ys too
```

Arrays, maps, structs, and enum variants are *references* — assigning one to a new binding shares the underlying object. There's no implicit copy.

The immutable-binding rule protects the *binding*, not the *object*: `let xs = [1, 2, 3];` prevents `xs = [...]` but does *not* prevent `xs[0] = 99` (index-assign goes through the binding to the underlying array). To prevent the array itself from being mutated, you'd need a deeper-immutable wrapper, which v1 doesn't provide. (v2's borrow checker would express this as "the binding is a shared reference `&[T]`, not a mutable reference `&mut [T]`" — see §4.)

### `Option` and `Result` for safety

Aether has no `null`. The closest thing is the `Option<T>` enum, which explicitly marks "this might not have a value". You can't call `xs[5]` on a 3-element array and get `null` back — you get a panic. You can't dereference a missing map key — `mapGet` panics if the key is absent (use `mapHas` to check first).

```aether
fn find(xs: [int], target: int) -> Option<int> {
  let mut i = 0;
  while i < len(xs) {
    if xs[i] == target { return Option::Some(i); }
    i = i + 1;
  }
  Option::None
}

match find([1, 2, 3], 2) {
  Option::Some(i) => print(f"found at {i}"),
  Option::None => print("not found"),
}
```

`Result<T, E>` is the equivalent for fallible operations — see [error-handling.md](error-handling.md). The combination of "no nulls", "explicit Option/Result", and "panic on programmer errors" is the v1 safety story.

### Panics on programmer errors

```aether
let xs = [1, 2, 3];
print(xs[5]);      // panic: array index out of bounds: 5
panic("oh no");    // panic: oh no
```

Index out of bounds, missing map key, division by zero, modulo by zero, missing struct field, no match arm matched, the explicit `panic(msg)` call — all of these throw a `PanicSignal` (see `aether/core/eval/eval.ts` for the full list), which is caught at the top level and reported in `runtime.error`. The program aborts; the output captured before the panic is preserved.

There is no `try/catch` in v1 — panics are unrecoverable. The v2 plan adds `Result`-based error recovery (which v1 already has) and a structured-panic mechanism for unrecoverable cases; see [RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md).

### No `unsafe`, no FFI

Aether v1 has no way to write `unsafe` code, no way to call into JS or C, no way to read raw memory. A program cannot, by construction, have a memory-safety bug. The trade-off is that you can't do low-level systems work in v1: no in-place buffer manipulation, no zero-copy parsing, no SIMD intrinsics. v2's borrow checker (RFC-004) is the foundation that would make a future `unsafe` block meaningful, because it provides the safety baseline that `unsafe` is opting out of.

---

## 3. Why v1 doesn't have a borrow checker

The decision is documented in [ADR-06](../decisions/adr-06-gc-over-borrow-checker-for-v1.md). The short version:

1. **Implementation cost.** A borrow checker is roughly the size of the rest of the compiler. It would have doubled v1's implementation size and pushed the "weekend of work" goal out by months.
2. **Teaching friction.** Every tutorial example would have to explain lifetimes before it could explain anything else. "Hello, world" would compile but `let s = format("hello, {}", name);` would fail with a borrow error in a beginner's hands.
3. **Limited upside for v1.** The playground runs small programs in a single tab. Memory leaks are bounded by the tab's lifetime. The JS GC is good enough. Borrow checking buys you performance and predictability, neither of which v1 needs.
4. **No alternative safety net in place.** Rust's borrow checker is the *only* memory safety mechanism; if you turn it off (`unsafe`), you have nothing. Aether v1's GC plus immutable-by-default plus Option/Result discipline is the safety net — borrow checking is layered on top, not the foundation.

The decision is reversible. The AST is the same; v2 introduces affine types as an opt-in mode per module. v1 code keeps working on the GC runtime; v2 code opts in to the borrow checker and gets the safety/performance benefits. See [RFC-004](../rfcs/rfc-004-borrow-checker.md).

---

## 4. The v2 plan — affine types, borrowing, lifetimes

This is **design-only** — none of the syntax below runs in v1. It's the planned v2 surface, sketched in [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md).

### Affine types

In v2, every value has an *affine* type: it can be used at most once (move semantics), or it can be `Copy` (used many times — primitives, tuples of `Copy` types, etc.). This is Rust's model.

The intended syntax (subject to change — see the RFC for the latest):

```aether
// v2 sketch — does NOT run in v1

let s = String::from("hello");
let t = s;        // s moves into t; s is no longer usable
// print(s);      // ERROR: use of moved value 's'
print(t);         // OK

let n = 42;
let m = n;        // n is Copy — n is still usable
print(n);         // OK
print(m);         // OK
```

### References

`&x` is a shared reference (read-only); `&mut x` is a mutable reference (read-write).

```aether
// v2 sketch

fn sum(xs: &[int]) -> int {                // shared reference to an array
  let mut acc = 0;
  for x in xs { acc = acc + x; }
  acc
}

fn fill(xs: &mut [int], v: int) {          // mutable reference
  let mut i = 0;
  while i < len(xs) {
    xs[i] = v;
    i = i + 1;
  }
}

let mut arr = [0, 0, 0];
fill(&mut arr, 99);
print(sum(&arr));    // 297
print(arr);         // [99, 99, 99]
```

### Lifetimes

References have lifetimes — the scope in which the reference is valid. The compiler infers them in most cases; you can write them explicitly when needed.

```aether
// v2 sketch

struct Parser<'a> {                          // 'a is a lifetime parameter
  source: &'a string,
  pos: int,
}

fn parse<'a>(src: &'a string) -> Parser<'a> {  // Parser borrows from src
  Parser { source: src, pos: 0 }
}

let src = String::from("hello, world");
let p = parse(&src);                          // p borrows src
// drop(src);                                 // ERROR: src is borrowed by p
print(p.source);                             // OK
```

### Drop

When an owned value goes out of scope, its `Drop` implementation runs (if any). For most types this is a no-op; for types that wrap a resource (file handle, socket), it releases the resource.

```aether
// v2 sketch

fn write_file(path: string) -> Result<(), string> {
  let f = File::open(path)?;                  // f owns a file handle
  f.write("hello")?;
  // f's Drop closes the file here — no explicit close needed
  Result::Ok(())
}
```

### Traits

v2 will introduce traits — named interfaces that types can implement. `Copy`, `Drop`, `Display`, `Ord` are the built-in ones; user-defined traits are coming.

```aether
// v2 sketch

trait Display {
  fn fmt(self) -> string;
}

impl Display for int {
  fn fmt(self) -> string { str(self) }
}

fn print_any<T: Display>(x: T) {
  print(x.fmt());
}
```

This is the part of v2 most likely to change shape before implementation. See [RFC-004](../rfcs/rfc-004-borrow-checker.md) for the design discussion.

### Opt-in per module

v2 is designed so that v1 code keeps working. A module without `&`/`&mut`/`lifetime` annotations runs on the GC runtime exactly as v1 does. A module with them opts in to the borrow checker. Mixed modules (some functions borrow-checked, some not) are an open design question.

---

## 5. A v1 idiom that v2 would borrow-check

The classic example: a closure that captures a mutable reference and outlives the data it borrows.

In v1, this just works (because of the GC):

```aether
let mut counter = 0;
let bump = fn() -> int {
  counter = counter + 1;
  counter
};
// bump captures counter by reference; counter lives as long as bump does
// because they share the JS GC heap.
print(bump());  // 1
print(bump());  // 2
print(bump());  // 3
```

In v2, this would have to either (a) move `counter` into the closure (so the closure owns it and the outer scope can't use it anymore), or (b) borrow `counter` with a `&mut` reference (so the closure has a mutable borrow, and the outer scope can't use it while the borrow is alive — i.e., until the closure is dropped). The borrow checker would reject:

```aether
// v2 sketch — won't compile

let mut counter = 0;
let bump = fn() -> int {
  counter = counter + 1;     // borrows counter mutably
  counter
};
print(counter);              // ERROR: counter is borrowed by bump
print(bump());               // OK
```

because `counter` is borrowed by `bump` when we try to read it. The v1 GC version doesn't have this problem because there's no borrow tracking. The trade-off: the v1 version is easier to write, the v2 version is easier to reason about (you know `counter` isn't being mutated behind your back, because the borrow checker enforced it).

This is the *honest* version of the v1/v2 story: v1 doesn't have this problem because it doesn't try to solve it. The borrow checker in v2 is the price you pay for the safety guarantees.

---

## 6. When does the GC actually run?

Aether v1 doesn't run the GC — the host JS engine does. Aether programs allocate JS objects (arrays, struct-tagged dicts, variant-tagged dicts, closures) by constructing them, and never explicitly frees them. The V8 (or SpiderMonkey, or JSC) GC reclaims them when they're unreachable.

This has three practical consequences:

1. **Pause times are not under Aether's control.** A long-lived program with a big heap will see pauses when the JS GC runs a major collection. Aether can't mitigate this; the playground UI just freezes briefly.
2. **Allocation patterns matter for performance.** Repeatedly allocating small objects in a tight loop (e.g., `for i in 0 .. 1000 { push(out, Point { x: i, y: i }); }`) creates GC pressure. See [performance.md](performance.md) § on allocation.
3. **No `Drop`.** Resources are reclaimed by the GC, not by a destructor. If you open a file handle (in v2 with FFI) and the GC hasn't run, the handle stays open. v2's affine types plus `Drop` is the fix.

---

## 7. A memory-honesty checklist

If you're coming from Rust, here's what to expect:

| Concern                          | v1                                  | v2 (planned)                              |
|----------------------------------|-------------------------------------|-------------------------------------------|
| Memory safety                    | Yes (via GC)                        | Yes (via GC or borrow checker, opt-in)    |
| Deterministic destruction        | No                                  | Yes for affine types                      |
| Zero-cost abstraction            | No                                  | Yes for affine types                      |
| Move semantics                   | No (everything shared by reference)  | Yes for affine types                      |
| Borrow checking                  | No                                  | Yes, opt-in                               |
| Lifetimes                        | No                                  | Yes, opt-in                               |
| `unsafe` / FFI                   | No                                  | Yes, opt-in (post-RFC-004)                |
| `null`                           | No (use `Option`)                   | No                                        |
| Implicit memory leaks            | Bounded by GC; no leaks in practice | Bounded by GC for v1 code, manual for v2 |
| Drop order                       | Not defined (GC)                    | LIFO for affine scopes                    |

If you're coming from Python or JavaScript: Aether v1's memory model is exactly what you're used to. The only additions are the type checker (which catches a lot of bugs at compile time) and the immutable-by-default rule (which makes accidental mutation harder).

---

## 8. A worked example — a ref-counted counter, the v1 way

Aether v1 doesn't have reference counting (the GC handles it). But we can build a "counter" abstraction using a mutable captured binding:

```aether
fn make_counter(start: int) -> fn() -> int {
  let mut count = start;
  fn() -> int {
    count = count + 1;
    count
  }
}

let c1 = make_counter(0);
let c2 = make_counter(100);

print(c1());  // 1
print(c1());  // 2
print(c1());  // 3
print(c2());  // 101
print(c2());  // 102
print(c1());  // 4
```

`make_counter` returns a closure that captures `count` by reference. Each call to `make_counter` creates a *new* `count` and a *new* closure capturing it. `c1` and `c2` have independent counters. The closures and the `count` bindings live as long as the closures do — the GC reclaims them when the closures become unreachable.

This is the v1 way of building stateful objects. In v2, this would have to use a `Box<RefCell<int>>` (move semantics, interior mutability) or a more explicit pattern. The v1 version is simpler and works because of the GC.

---

## 9. A warning about `mut` arrays

```aether
let xs = [1, 2, 3];   // immutable binding, mutable array
let mut ys = xs;       // ys and xs are the same array
ys[0] = 99;
print(xs[0]);          // 99 — xs sees the change
```

The `let mut` on `ys` allows reassigning the *binding* `ys`. It does *not* give `ys` a fresh copy of the array. The array itself is mutable (because Aether's arrays are JS arrays, which are mutable), and `ys` and `xs` both refer to the same one.

If you want a fresh copy, write `let ys = [...xs]` (array spread) or use the stdlib `slice(xs, 0, len(xs))`:

```aether
let xs = [1, 2, 3];
let ys = [...xs];     // a new array, fresh copy
ys[0] = 99;
print(xs[0]);         // 1 — xs is unchanged
print(ys[0]);         // 99
```

This is the v1 way to express "copy the data" — explicit spread or `slice`. The v2 borrow checker would prevent the silent aliasing in the first example by requiring either `&` (shared borrow, no mutation) or `&mut` (exclusive borrow, mutation allowed but no other references).

---

## 10. What's next

- [ownership.md's sibling, error-handling.md](error-handling.md) — `Result<T, E>` and the `?` operator, which compose with the safety story above.
- [concurrency.md](concurrency.md) — the honest v1 story (synchronous) and the v2 plan (async/await with channels).
- [performance.md](performance.md) — what the GC and the tree-walker cost you in practice.
- [decisions/adr-06-gc-over-borrow-checker-for-v1.md](../decisions/adr-06-gc-over-borrow-checker-for-v1.md) — the decision document.
- [rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md) — the v2 design RFC.

Aether v1's memory story is, in three sentences: GC handles reclamation, immutable-by-default handles most of the safety, `Option`/`Result` handle the absence/error cases, and panics catch the rest. v2 adds affine types and a borrow checker, opt-in, layered on top — not replacing v1, augmenting it.
