# RFC-004 — Borrow checker for Aether v2

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [ADR-06 GC over borrow checker for v1](../decisions/adr-06-gc-over-borrow-checker-for-v1.md), [RFC-002 bytecode VM](rfc-002-bytecode-vm.md)

## Summary

Aether v2 adds an affine type system with ownership and borrowing, as an opt-in mode per module. Modules declared `edition = "v2-affine"` in their `aether.toml` get borrow checking; modules declared `edition = "v2"` (the default v2 mode) keep the GC. The borrow checker enforces: each value has exactly one owner; `&T` is a shared reference (no mutation), `&mut T` is an exclusive reference (mutation allowed); `Drop` runs when the owner goes out of scope; lifetimes are inferred (or written explicitly). The v1 GC code stays working; the affine-types code gets the safety and performance benefits.

This RFC specifies the type-system additions, the borrow-checking rules, the `Drop` trait, the lifetime inference, the relationship to the existing `Option`/`Result` enums, and the opt-in semantics.

## Motivation

Aether v1 uses garbage collection (see [ADR-06](../decisions/adr-06-gc-over-borrow-checker-for-v1.md)). This was the right choice for v1: small implementation, easy to teach, no lifetime errors to distract from the actual program. The cost: GC pauses, allocation pressure, no `Drop`, no zero-cost abstraction, no `unsafe`/FFI.

The motivation for v2 affine types is to enable:

1. **Zero-cost abstractions.** A `Box<T>` that owns its data is the same cost as a raw pointer; a `&[T]` borrow is the same cost as a pointer + length. No GC overhead.
2. **Deterministic destruction.** A `File` closes when it goes out of scope; a `Mutex` unlocks; a `Channel` closes. No relying on the GC's timing.
3. **Memory safety without GC.** No use-after-free, no double-free, no data races (in single-threaded code; the v2 async runtime adds the multi-threaded checks separately).
4. **FFI.** Calling C libraries requires passing pointers; the borrow checker ensures those pointers are valid for the duration of the call.
5. **Performance.** For hot loops, affine types let the compiler elide allocations, inline data layout, and specialize to known types.

The motivation is *not* to make every Aether program look like Rust. The v2 GC mode is the default; affine types are opt-in. Users who want the safety/performance trade-off opt in; users who want the simplicity stay on GC.

## Detailed design

### Affine types

Every value has an *affine* type: it can be used at most once (move semantics), or it can be `Copy` (used many times — primitives, tuples of `Copy` types, etc.). This is Rust's model.

```aether
// v2-affine sketch

let s = String::from("hello");   // s owns the string
let t = s;                       // s moves into t; s is no longer usable
// print(s);                     // ERROR: use of moved value 's'
print(t);                        // OK

let n = 42;                      // n is Copy (int is Copy)
let m = n;                       // n is still usable (int is Copy)
print(n);                        // OK
print(m);                        // OK
```

The `Copy` trait is implemented by: `int`, `float`, `bool`, `char`, `()`, tuples of `Copy` types, arrays of `Copy` types, `Option<T>` where `T: Copy`, etc. Structs and enums are *not* `Copy` by default; the user can `impl Copy for MyType` if all fields are `Copy`.

### References

`&x` is a shared reference (read-only); `&mut x` is a mutable reference (read-write).

```aether
// v2-affine sketch

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

- `&T` — shared reference. Multiple `&T` can coexist. The referent can be read but not written.
- `&mut T` — exclusive reference. Only one `&mut T` can exist at a time. The referent can be read and written.
- The compiler tracks borrows: you can have any number of `&T` to a value, *or* one `&mut T`, but not both.

The "aliasing vs. mutation" rule: at any time, a value is either aliased (multiple `&T`) or mutable (one `&mut T`), not both. This is the rule the borrow checker enforces.

### Lifetimes

References have lifetimes — the scope in which the reference is valid. The compiler infers them in most cases; you can write them explicitly when needed.

```aether
// v2-affine sketch

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
// p goes out of scope here; src is free again
```

- Lifetime parameters are written `'a`, `'b`, `'src`, etc.
- A reference's lifetime is the scope in which the referent is guaranteed to be alive.
- The compiler's lifetime inference is similar to Rust's; you only write lifetimes explicitly when needed (e.g., when the compiler can't infer them, or when documenting intent).

### `Drop`

When an owned value goes out of scope, its `Drop` implementation runs (if any). For most types this is a no-op; for types that wrap a resource (file handle, socket), it releases the resource.

```aether
// v2-affine sketch

trait Drop {
  fn drop(self) -> ();
}

impl Drop for File {
  fn drop(self) -> () {
    self.close();    // close the file handle
  }
}

fn write_file(path: string) -> Result<(), string> {
  let f = File::open(path)?;                  // f owns a file handle
  f.write("hello")?;
  // f's Drop closes the file here — no explicit close needed
  Result::Ok(())
}
```

`Drop` runs in LIFO order: the last-declared owned value drops first. This is the same as Rust.

### Traits

v2 introduces traits — named interfaces that types can implement. `Copy`, `Drop`, `Display`, `Ord`, `Eq`, `Hash` are the built-in ones; user-defined traits are coming.

```aether
// v2-affine sketch

trait Display {
  fn fmt(self) -> string;
}

impl Display for int {
  fn fmt(self) -> string { str(self) }
}

impl Display for string {
  fn fmt(self) -> string { self }
}

fn print_any<T: Display>(x: T) {
  print(x.fmt());
}

print_any(42);
print_any("hello");
```

Traits are how the borrow checker knows which values are `Copy`, which have `Drop`, which are `Display` (and thus printable), which are `Ord` (and thus comparable). The trait constraints you write (`<T: Ord>`) are enforced at the call site, not just recorded.

### Affine-type-aware enums and structs

`Option<T>` and `Result<T, E>` work with affine types: `Option::Some(v)` owns `v`; `Option::None` owns nothing. `&Option<T>` is a shared reference; `&mut Option<T>` is exclusive.

```aether
// v2-affine sketch

fn first(xs: &[int]) -> Option<&int> {        // returns a reference
  if len(xs) > 0 { Option::Some(&xs[0]) }
  else { Option::None }
}

let xs = [1, 2, 3];
match first(&xs) {
  Option::Some(r) => print(*r),               // *r dereferences the reference
  Option::None => print("empty"),
}
```

The `*` operator dereferences a reference. (In v1 GC mode, `*` is a no-op; in v2-affine, it's a real dereference.)

### Opt-in semantics

A module's `aether.toml` declares the edition:

```toml
[package]
name = "myapp"
edition = "v2-affine"   # or "v2" (GC) or "v1" (tree-walker)
```

- `v1` — the v1 tree-walker, sync, no modules, no affine types. Backward-compatible with all v1 code.
- `v2` — the v2 bytecode VM, async, modules, GC. Affine types are not enforced; `&`/`&mut` syntax is not parsed.
- `v2-affine` — the v2 bytecode VM, async, modules, affine types with borrow checking. `&`/`&mut` are parsed and enforced.

A v2-affine module can import a v2 (GC) module — the imports are treated as opaque values (no `&`/`&mut` to them). A v2 (GC) module can import a v2-affine module — the imports are GC-managed; the affine types are erased (the user can't borrow them).

### Borrow-checking rules

The borrow checker enforces:

1. **One owner.** Each value has exactly one owner (a binding, a field, a slot). When the owner goes out of scope, `Drop` runs.
2. **Move on assignment.** Assigning an owned value to a new binding moves it. The old binding is no longer usable (unless the type is `Copy`).
3. **Aliasing XOR mutation.** A value can have any number of `&T` shared references, *or* one `&mut T` exclusive reference, but not both at the same time.
4. **Reference lifetimes don't outlive the referent.** A `&'a T` is valid only for the lifetime `'a`, and `'a` must be shorter than the referent's lifetime.
5. **Drop order is LIFO.** Owned values drop in reverse-declaration order at scope exit.

These are the rules Rust enforces. The implementation in Aether v2 follows the same algorithm (MIR-based dataflow analysis — see [RFC-002](rfc-002-bytecode-vm.md) for the bytecode IR that the analysis runs on).

### Error messages

Borrow-checker errors look like:

```
error: cannot borrow `counter` as mutable because it is also borrowed as immutable
  --> src/main.ae:7:5
   |
 7 |     let r = &counter;
   |              ------- immutable borrow occurs here
 8 |     counter = 99;
   |     ^^^^^^^^ mutable borrow occurs here
 9 |     print(r);
   |          - immutable borrow later used here
```

The messages are designed to be diagnostic: they show the conflicting borrows with the source locations. This is the Rust style; we follow it.

## Alternatives considered

### Keep GC only (v1 model)

Don't add affine types; the v2 runtime keeps the GC. Advantages: simpler implementation, no new error messages to teach, no lifetime inference. Disadvantages: no `Drop`, no FFI, no zero-cost abstractions, no deterministic destruction. For production code, these matter. The v2 design adds affine types as opt-in, not as a replacement.

### Reference counting (ARC)

Replace GC with automatic reference counting. Advantages: deterministic destruction (refcount hits 0 → free), no GC pauses. Disadvantages: cycles aren't handled (need a cycle collector anyway), refcount updates have overhead per assignment, drop order is unpredictable (refcount can hit 0 from any decrement). The borrow checker with affine types is strictly better for the use cases we care about (resource management, FFI).

### Linear types (no `&T`/`&mut T`)

A simpler affine system: each value used exactly once, no borrows. This is Haskell's linear types. It's safer (no aliasing at all) but ergonomically painful (you can't pass a value to two functions in sequence without copying it). Rust's `&T`/`&mut T` is the right balance.

### Region-based system (Cyclone-style)

C simpler version of lifetimes: regions are explicitly named, values live in regions, references carry region annotations. Cyclone (a safe dialect of C) used this. The design is similar to Rust's lifetimes but coarser (regions vs. lifetimes). Aether v2 uses lifetimes (Rust's design) because they're more familiar and the implementation is well-understood.

### Manual memory management (C-style)

`malloc`/`free` with no compiler support. Not under consideration — Aether's safety story is that the compiler catches memory bugs at compile time, not that the user writes `free` calls.

## Drawbacks

- **Implementation cost.** A borrow checker is the size of the rest of the compiler. The v2 implementation cost is large (months).
- **Teaching friction.** Every tutorial example in v2-affine mode would have to explain lifetimes. The mitigation is that v2 (GC) mode is the default; affine types are opt-in.
- **Function color revisited.** v2-affine functions can call v2 (GC) functions; v2 (GC) functions can call v2-affine functions (with affine types erased). The "color" boundary is awkward but not blocking.
- **No `unsafe` yet.** A real FFI needs `unsafe` blocks to opt out of the borrow checker. The v2 design tracks this; `unsafe` is planned post-borrow-checker.
- **Borrow-checker errors are hard.** Even experienced Rust programmers fight the borrow checker. Aether's error messages will improve on Rust's (we can learn from 10 years of Rust tooling), but the fundamental difficulty remains.
- **Two type systems in one language.** v2 (GC) and v2-affine (borrow checker) are different type systems. A user has to know which one their module is in. The mitigation is the `edition` field in `aether.toml` makes it explicit.

## Open questions

1. **Generic lifetime inference.** How much can the compiler infer? Rust infers most lifetimes; Aether will start conservative (require explicit lifetimes in struct definitions) and relax over time.
2. **`Pin` for self-referential structs.** Aether v2 needs `Pin<T>` for async (self-referential futures). The design follows Rust's.
3. **`Rc<T>` / `Arc<T>`.** Shared ownership. The stdlib will provide both; the borrow checker allows them (their internal mutation is hidden).
4. **Trait coherence.** Two `impl Display for int` from different modules — coherence rules prevent this. The design follows Rust's orphan rule.
5. **Closure capture modes.** `move |x| { ... }` (move captures) vs `|x| { ... }` (borrow captures). The design follows Rust's.
6. **Higher-ranked types.** `for<'a> fn(&'a int) -> &'a int`. The v2 design defers these to v3+.

## Cross-references

- [ADR-06 GC over borrow checker for v1](../decisions/adr-06-gc-over-borrow-checker-for-v1.md) — the v1 decision.
- [RFC-002 bytecode VM](rfc-002-bytecode-vm.md) — the runtime that the borrow checker analyzes.
- [RFC-001 async/await](rfc-001-async-await.md) — the async runtime that needs affine types for `Future`'s self-references.
- [../tutorials/ownership.md](../tutorials/ownership.md) § 4 — the v2 plan from the tutorial angle.

## Prior art

- **Rust** — the direct inspiration. The borrow checker, `&T`/`&mut T`, lifetimes, `Drop`, traits. Aether v2-affine is a Rust-flavored affine type system.
- **Cyclone** — region-based memory safety for C. The region system is a precursor to lifetimes.
- **ATS** — linear types + proofs. More powerful than Rust's affine types; less ergonomic.
- **Idris** / **Linear Haskell** — linear types in a Haskell setting.
- **OCaml** (with the `mod` parameter) — module-level affine types, less common.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the borrow-checking algorithm against the bytecode IR (RFC-002's IR) for a small subset of Aether (functions, structs, references — no async, no closures). If the prototype correctly accepts a test suite of "should-compile" programs and rejects a test suite of "should-fail" programs with the right error messages, the RFC moves to stage 1 (Implementation sketch).
