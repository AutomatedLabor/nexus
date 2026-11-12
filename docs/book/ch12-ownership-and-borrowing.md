# Chapter 12 — Ownership and borrowing

> Aether v3 introduces a borrow checker: the compile-time analysis that enforces ownership discipline — every value has exactly one owner, you can have multiple shared references or one mutable reference, and references never outlive their referent. This chapter covers ownership, moves vs. copies, the `&T` and `&mut T` reference types, the borrow rules, non-lexical lifetimes (NLL), and `Drop`. Ten examples (good and bad) show what the checker accepts and rejects.

Borrow checking is the v3 feature that divides Aether from Python and JavaScript. Without it, Aether is a high-level language with manual memory management via reference counting. With it, Aether gets the *compile-time* guarantee that no two parts of the program can simultaneously modify the same data, no use-after-free, no dangling references, no data races. The cost: the programmer has to think about ownership and lifetimes, which is a real cognitive load. The benefit: a class of bugs that's pervasive in C/C++ is eliminated at compile time.

Aether's borrow checker is implemented in `aether/core/borrow/borrow.ts` (~1200 lines). It runs after type checking and before codegen, on the typed AST. It rejects programs that violate the rules; accepted programs compile to bytecode/WASM/x86 that the runtime can execute without runtime ownership checks.

The borrow checker uses *non-lexical lifetimes* (NLL): a reference's lifetime ends at its last use, not at the end of its lexical scope. This is the Rust 2018+ design; see ADR-19 for why we don't use the older lexical-lifetime model.

---

## 12.1 Ownership

Every value in Aether v3 has exactly one *owner* — the binding that's responsible for it. When the owner goes out of scope, the value is dropped (its `Drop` impl is called, if any, and its memory is reclaimed). The simplest case:

```aether
{
  let s = "hello";   // s owns the string
  print(s);
}   // s goes out of scope; the string is dropped
```

A value can be *moved* from one owner to another. After the move, the original owner is invalid; using it is a compile-time error.

### Example 1: move semantics for a string

```aether
let s1 = "hello";
let s2 = s1;       // s1 moved into s2; s1 is now invalid
print(s2);         // OK
// print(s1);      // ERROR: use of moved value `s1`
```

This is the key difference from Python/JS, where `s2 = s1` would just be a reference copy (both `s1` and `s2` point to the same string). In Aether, the string's ownership transfers; `s1` is no longer usable.

### Example 2: moves into functions

```aether
fn consume(s: string) -> () {
  print(s);
}   // s dropped here

let x = "hello";
consume(x);   // x moved into consume
// print(x);   // ERROR: use of moved value `x`
```

The function `consume` takes its argument by value, which means it *takes ownership*. After the call, `x` is invalid in the caller.

---

## 12.2 Copy types

Some types are `Copy` — assigning them copies the value instead of moving it. The built-in `Copy` types are `int`, `float`, `bool`, `char`, and `()`. Structs and enums are not `Copy` by default; you can mark them with `#[derive(Copy)]` if all their fields are `Copy`.

### Example 3: copy semantics for `int`

```aether
let a = 42;
let b = a;      // a is copied; a is still valid
print(a);       // OK
print(b);       // OK
```

`int` is `Copy`, so `let b = a` doesn't move — it copies. Both `a` and `b` are valid afterwards. The same is true for `float`, `bool`, `char`, `()`.

### Example 4: deriving `Copy` for a struct

```aether
#[derive(Copy)]
struct Point { x: int, y: int }

let p1 = Point { x: 1, y: 2 };
let p2 = p1;        // p1 copied; both valid
print(p1.x);        // OK
print(p2.x);        // OK
```

`Point` is `Copy` because both its fields (`int`) are `Copy`. The `#[derive(Copy)]` attribute generates an impl that copies each field. Without the attribute, `let p2 = p1` would move.

A struct with a non-`Copy` field can't be `Copy`:

```aether
#[derive(Copy)]
struct Labeled { name: string }   // ERROR: string is not Copy
```

The compiler rejects this with a clear error: "cannot derive Copy for Labeled: field `name` has non-Copy type `string`."

---

## 12.3 References: `&T` and `&mut T`

A reference is a pointer that doesn't own the data. `&T` is a shared reference (read-only); `&mut T` is a mutable reference (read-write). References are the way to use a value without taking ownership.

### Example 5: a shared reference

```aether
fn length(s: &string) -> int {
  len(s)
}

let name = "alice";
print(length(&name));   // 5
print(name);             // OK — name was borrowed, not moved
```

`length` takes `&string` (a shared reference). The caller passes `&name` (a reference to `name`). After the call, `name` is still owned by the caller. The function `length` can read `s` but not modify it.

### Example 6: a mutable reference

```aether
fn pushChar(s: &mut string, c: int) -> () {
  s.push(fromCharCode(c));
}

let mut greeting = "hi";
pushChar(&mut greeting, 33);   // append '!'
print(greeting);               // hi!
```

`pushChar` takes `&mut string` (a mutable reference). The caller passes `&mut greeting`. After the call, `greeting` is `"hi!"`. The function can modify `s` (push to it) but doesn't own it — when the function returns, `greeting` is still owned by the caller.

---

## 12.4 The borrow rules

The borrow checker enforces three rules:

1. **One owner.** Each value has exactly one owner at a time.
2. **Multiple shared OR one mutable.** At any point, you can have either:
   - any number of `&T` references to the same value, or
   - exactly one `&mut T` reference to it.
   You can't mix the two.
3. **References don't outlive their referent.** A reference's lifetime must be contained within the owner's lifetime.

### Example 7: the "multiple shared OR one mutable" rule

```aether
let mut v = [1, 2, 3];
let r1 = &v;       // shared borrow
let r2 = &v;       // another shared borrow — OK
print(r1[0] + r2[0]);
// let r3 = &mut v;  // ERROR: can't mutably borrow while immutably borrowed
```

Two shared borrows `r1` and `r2` are fine. But a mutable borrow `&mut v` while `r1` and `r2` are alive is a violation — the checker rejects it.

### Example 8: one mutable borrow at a time

```aether
let mut v = [1, 2, 3];
let r1 = &mut v;   // mutable borrow
// let r2 = &mut v; // ERROR: can't have two mutable borrows
// let r3 = &v;     // ERROR: can't immutably borrow while mutably borrowed
print(r1[0]);
```

Once `r1` is a mutable borrow, no other borrow is allowed until `r1`'s last use. After `r1`'s last use, the borrow ends and `v` is free to be borrowed again.

### Example 9 (bad): use of moved value

```aether
fn drop_value(v: [int]) -> () {
  // v is dropped here
}

let xs = [1, 2, 3];
drop_value(xs);
// print(xs[0]);   // ERROR: xs was moved into drop_value
```

The function takes `xs` by value, which moves ownership into the function. After the call, `xs` is invalid in the caller. The fix: take a reference (`fn drop_value(v: &[int]) -> ()`) so the caller keeps ownership.

### Example 10 (bad): dangling reference

```aether
fn dangle() -> &int {
  let x = 42;
  &x          // ERROR: x goes out of scope at end of dangle; reference would dangle
}
```

The reference `&x` would outlive `x` (which is dropped at the end of `dangle`). The borrow checker rejects this. The fix: return `x` by value (move the int — it's `Copy`, so the move is a copy).

---

## 12.5 Non-lexical lifetimes (NLL)

The borrow checker uses *non-lexical lifetimes*: a reference's lifetime ends at its *last use*, not at the end of its lexical scope. This is more permissive than the lexical-lifetime model (Rust 2015) and matches what programmers naturally expect.

### Example 11: NLL allows this pattern

```aether
let mut v = [1, 2, 3];
let r = &v;       // shared borrow starts
print(r[0]);      // last use of r
let r2 = &mut v;  // mutable borrow — OK, r is no longer used
r2[0] = 99;
print(v[0]);
```

In the lexical-lifetime model, `r` would be alive until the end of its scope (which encloses the `let r2 = &mut v;` line), so the mutable borrow would conflict. In NLL, `r` ends at its last use (the `print(r[0])` line), so the mutable borrow is fine.

This is why Aether v3 chose NLL over lexical lifetimes (ADR-19): NLL matches programmer intuition, rejects fewer correct programs, and has been proven sound (the RustBelt project).

---

## 12.6 `Drop`

A type can implement the `Drop` trait to run custom cleanup when the owner goes out of scope. This is the Aether analogue of C++ destructors, Python `__del__`, and Rust `Drop`.

```aether
trait Drop {
  fn drop(self) -> ();
}

struct File { path: string }

impl Drop for File {
  fn drop(self) -> () {
    print("closing " + self.path);
  }
}

{
  let f = File { path: "/tmp/x".to_string() };
  print("using file");
}   // f dropped here; prints "closing /tmp/x"
print("done");
```

Output:

```
using file
closing /tmp/x
done
```

The `Drop::drop` method is called automatically when the owner goes out of scope. You don't call it yourself; the compiler inserts the call at the close brace.

### Drop ordering

When a struct is dropped, its fields are dropped in *reverse declaration order* (last field first, then the struct itself). This matches C++ and Rust and ensures that fields can refer to earlier fields in their `Drop` impls.

```aether
struct Pair { a: File, b: File }
{
  let p = Pair { a: File { path: "a" }, b: File { path: "b" } };
}   // b dropped first, then a, then p
```

---

## 12.7 The borrow checker in practice

The borrow checker is the v3 feature that takes the most getting used to. Most Aether v1/v2 code "just works" — the borrow checker accepts everything that doesn't violate the three rules. The common patterns that *do* trip up new v3 users:

1. **Holding a borrow across a function call that re-borrows.** The function call needs a mutable borrow; you're holding a shared borrow. Fix: end the shared borrow before the call.
2. **Storing a reference in a struct.** The struct's lifetime must be at most the referent's lifetime. Fix: use lifetime parameters (v3.1; for v3, copy the value).
3. **Self-referential structs.** A struct that holds a reference to its own field. Fix: this is impossible in safe Aether; use an index or an `Rc<T>` (future package).

The borrow checker's error messages name the conflicting borrows and the lines where they start and end. Reading the error usually makes the fix obvious.

### Example 12: a realistic borrow-checker rejection

```aether
let mut v = [1, 2, 3];
let first = &v[0];
v.push(4);                 // ERROR: mutable borrow while `first` is alive
print(first);
```

The fix: drop `first` before `v.push(4)`:

```aether
let mut v = [1, 2, 3];
let first = v[0];           // copy the int (int is Copy)
v.push(4);                  // OK — no borrow held
print(first);
```

Or, if you need the reference:

```aether
let mut v = [1, 2, 3];
{
  let first = &v[0];
  print(first);
}   // first's lifetime ends here
v.push(4);                  // OK
```

---

## 12.8 How the checker works internally

The borrow checker is a forward data-flow analysis over the typed AST:

1. **Build a control-flow graph (CFG)** of each function. Nodes are basic blocks; edges are jumps.
2. **Initialize** each binding's state as "uninitialized" or "moved."
3. **Walk** the CFG, propagating borrows. At each `&x` or `&mut x` expression, record the borrow with its lifetime (start = the expression, end = last use).
4. **Check** for conflicts at each point: if two `&mut x` are alive simultaneously, or a `&mut x` and `&x` are alive simultaneously, report an error.
5. **Check** for use-after-move: if a moved binding is used, report an error.
6. **Check** for use-after-drop: if a dropped binding is used, report an error.

The analysis is *intraprocedural* — it doesn't cross function boundaries. Function signatures declare whether arguments are moved, borrowed, or copied; the checker trusts the signatures at the call site.

The NLL part is step 3: a borrow's lifetime ends at its *last use*, not at the end of its scope. The "last use" is computed by a backwards walk from each borrow to find the next use of the same variable.

---

## 12.9 Summary

- **Ownership** — each value has exactly one owner; when the owner goes out of scope, the value is dropped.
- **Moves** — assignment and pass-by-value move the value; the original is invalid afterwards.
- **Copies** — `Copy` types (`int`, `float`, `bool`, `char`, `()`, and structs derived `Copy`) copy on assignment instead of moving.
- **`&T`** is a shared reference (read-only); **`&mut T`** is a mutable reference (read-write).
- **The borrow rules** — one owner; multiple shared XOR one mutable; references don't outlive their referent.
- **NLL** — a reference's lifetime ends at its last use, not at its scope end. Matches intuition, rejects fewer correct programs. (ADR-19)
- **`Drop`** — custom cleanup when the owner goes out of scope. Called automatically by the compiler.
- **The borrow checker** is a forward data-flow analysis on the CFG. Intraprocedural, trusts function signatures.

The next chapter (Chapter 13) covers the v3 async runtime — which uses the borrow checker's guarantees to make coroutines safe (no two coroutines can simultaneously mutate the same data).
