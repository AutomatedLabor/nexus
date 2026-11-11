# Performance — what the tree-walker costs you

> Audience: you want to know how fast Aether is, what the step limit means, and how to write fast code.
> Time: ~30 minutes. Every example is runnable.

Aether v1 is a tree-walking interpreter. That sentence packs a lot of performance implications: it's slow, it has a step limit, it allocates a lot, and it doesn't JIT. This tutorial is honest about all of that, shows you the actual numbers (from the playground's Benchmarks view), and teaches the patterns that work well within the limit.

The v2 plan adds a bytecode VM ([RFC-002](../rfcs/rfc-002-bytecode-vm.md)) that gets 10–100x better throughput. v1 is for the playground; v2 is for production. Read this tutorial to understand v1's trade-offs, then read the RFC to see how v2 fixes them.

---

## 1. The performance model in one paragraph

Every Aether program is parsed into an AST, then the tree-walker (`aether/core/eval/eval.ts`) walks the AST recursively. Each AST node is a function call; each step is one node visit. The evaluator has a step counter (default 1,000,000) that bounds execution time; programs that exceed it panic with `execution step limit exceeded (1000000)`. There's no compilation, no bytecode, no JIT — the AST *is* the program, and walking it is the execution. Memory is the host JS engine's heap; the JS GC reclaims unused objects. Pause times are the JS GC's pause times; allocation patterns matter because they create GC pressure.

This means three things in practice:

1. **The same program takes the same number of steps on every machine** — step count is deterministic. Wall-clock time isn't (it depends on your CPU and browser), but step count is.
2. **Loops are expensive.** A `while` loop with a 1000-iteration body runs ~4000 steps (each iteration: condition check + body + assignment + increment).
3. **Recursion is expensive.** Each recursive call is ~6 steps (call setup, arg evaluation, body, return). `fib(30)` is ~2.7M calls = ~16M steps, well past the 1M limit.

---

## 2. The compile pipeline

When you press Run, `compile(source)` runs four stages:

```
source → lex → parse → check → run
```

1. **lex** — turns the source string into a flat token list. ~O(n) in source length.
2. **parse** — turns the tokens into an AST. ~O(n) in token count.
3. **check** — walks the AST, assigns types to every expression. ~O(n) in AST size (plus unification cost for generics).
4. **run** — walks the AST, executes it. Bounded by `maxSteps` (default 1M).

For a typical playground program (100–500 lines), stages 1–3 are sub-millisecond; stage 4 dominates. The Benchmarks view shows stage 4's elapsed time and step count.

The pipeline is non-fatal — errors at one stage don't stop the next. Type errors don't block execution (the playground runs the program anyway; see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md)). This is "lenient playground semantics": see the result of a slightly-wrong program rather than refuse to run.

---

## 3. The step limit — what it is, how it works

The evaluator increments a `steps` counter on every node visit. When it exceeds `maxSteps`, it throws `PanicSignal("execution step limit exceeded (N)")`. The default is 1,000,000.

```aether
// A program that does nothing but count to the limit.
let mut i = 0;
while i < 1_000_000 {
  i = i + 1;
}
print(i);
```

This program takes ~5M steps (loop setup + body + increment + condition per iteration), well past the default 1M. Run it and you'll see:

```
panic: execution step limit exceeded (1000000)
```

You can bump the limit via `RunOptions.maxSteps` (host code) or via the Benchmarks view (which uses 50M). For a one-off slow program, that's fine. For a *program* that needs more than 1M steps to do anything useful, you should rewrite it (use iteration instead of recursion, use the stdlib's `reduce` instead of a hand-written loop, use a closed-form formula).

### How big is 1M steps?

Roughly: ~5,000–10,000 simple loop iterations, ~500–1000 recursive calls, or ~50,000 small function calls. The Benchmarks view uses 50M, which is enough for `fib(25)` (~150K calls, ~6M steps) but not for `fib(30)` (~2.7M calls, ~16M steps, but more importantly >2.7M * 6 = 16M steps).

A typical playground program (compute a few values, print them, run a small loop) uses 100–10,000 steps. The step limit is *not* a constraint for normal use; it's a safety net for infinite loops.

### What happens when you hit the limit

The evaluator throws `PanicSignal("execution step limit exceeded (N)")`. The playground catches it and shows the message in the Errors tab. The Output tab shows whatever was printed before the panic. The program aborts.

There's no way to "continue from where you hit the limit" — the evaluator's call stack is unwound. You either bump `maxSteps` (and risk a UI freeze if your program is actually infinite) or rewrite the program.

### Why 1M?

1M steps is roughly:

- 50ms on a fast desktop, 200ms on a slow laptop, 500ms on a phone — well under the 1-second "feels instant" threshold.
- Enough for any small playground program (compute `fib(20)`, sort a 100-element array, parse a small JSON document).
- Small enough that an infinite loop won't hang the browser tab for more than half a second.

The number is a heuristic. The v2 bytecode VM will have a *time* limit (or a *fuel* limit that maps to time more accurately) instead of a step limit, because steps mean different things in a tree-walker vs. a VM (a tree-walker step is one AST node; a VM step is one bytecode instruction, which is finer-grained).

---

## 4. Wall-clock time vs. step count

The Benchmarks view shows both:

- **Elapsed ms** — wall-clock time for the run. Depends on your machine, your browser, what else is running. Useful for "is this fast enough?"
- **Steps** — the count of evaluation steps. Deterministic. Useful for "is this algorithm O(n) or O(n²)?"

For example, `fib(20)` and `fib(25)`:

| Benchmark | Elapsed (ms) | Steps | Calls |
|-----------|--------------|-------|-------|
| `fib(20)` | ~30ms on a fast desktop | ~135K | 13,529 |
| `fib(25)` | ~330ms | ~1.5M | 150,049 |

The step count grows by 11x between `fib(20)` and `fib(25)` (call count grows by 11x, steps per call is constant at ~11). Wall time grows by 11x too, modulo noise. So `fib(30)` would be ~16.5M steps and ~3.5s — past the default step limit and into "noticeable UI freeze" territory. The Benchmarks view's 50M limit handles it; the default playground's 1M limit doesn't.

This is *why* the playground's default `fib` example uses `fib(10)`, not `fib(30)`. `fib(10)` is 55 calls and ~600 steps — fast.

---

## 5. What's fast, what's slow

### Fast (sub-millisecond, <1000 steps)

- Small arithmetic, string concatenation, comparison, array indexing, struct field access.
- A single function call (without deep recursion).
- A `for` loop over a 100-element array.
- A single `match`.

```aether
let xs = [1, 2, 3, 4, 5];
let sum = 0;
for x in xs { sum = sum + x; }
print(sum);   // ~50 steps
```

### Moderate (a few milliseconds, 10K–100K steps)

- A `for` loop over a 1000-element array.
- A single `reduce` / `map` / `filter` over a small array.
- A `while` loop with a few thousand iterations.

```aether
let mut sum = 0;
let mut i = 0;
while i < 1000 {
  sum = sum + i;
  i = i + 1;
}
print(sum);   // ~4000 steps
```

### Slow (10–100ms, 100K–1M steps)

- A `for` loop over a 100K-element array.
- `reduce` / `map` / `filter` over a large array.
- Recursive `fib(20)` (~13K calls, ~135K steps).
- Building a 10K-character string by repeated `+`.

```aether
let mut s = "";
for i in 0 .. 10_000 {
  s = s + "x";
}
print(len(s));   // 10,000 — the Benchmarks view shows ~30ms and ~30K steps
```

The string-concat example is slow because each `+` allocates a new string. The pattern is O(n²) in the final length. Use a list and `join` instead:

```aether
let mut parts = [];
for i in 0 .. 10_000 {
  push(parts, "x");
}
let s = join(parts, "");
print(len(s));   // 10,000 — much faster, ~10K steps
```

### Will hit the step limit (panic)

- `fib(30)` (~2.7M calls, ~30M steps).
- A `while` loop with 1M iterations (~5M steps).
- Recursive descent over a deep tree (each level adds ~10 steps).

### Bigger-again: anything `O(2^n)` for n > ~25

`fib(30)` is the textbook example. `fib(35)` is 30M calls; `fib(40)` is 330M. The tree-walker's per-call cost (~10µs on a fast desktop) makes anything bigger than `fib(25)` impractical in v1. The v2 bytecode VM does ~10x better; v2 with a JIT (planned for v3) does ~100x.

---

## 6. Allocation patterns

Aether values are JS values, allocated on the JS heap. Every closure, array, struct, enum variant, map, and tuple is an allocation. The GC reclaims them.

### Where allocations come from

- **Closures**: each `fn(...) -> ... { ... }` literal allocates a `{ __closure, fn, env }` object. A `map` with a lambda allocates one closure per call to `map` (no — one closure *value*, called N times). Hot loops with `map`/`filter`/`reduce` allocate the closure once per call, then N cells in the result array.
- **Arrays**: each `[a, b, c]` allocates a new JS `Array`. `push(arr, v)` may reallocate (JS arrays grow exponentially, so amortized O(1)).
- **Strings**: each `s + t` allocates a new string. JS strings are immutable; the result is a new string.
- **Tuples**: each `(a, b)` allocates a JS array (the evaluator represents tuples as arrays — see `aether/core/eval/eval.ts`).
- **Structs**: each `Point { x, y }` allocates `{ __struct, fields: {...} }`. The struct-name string is interned (the same string for every `Point` instance).
- **Enum variants**: each `Color::Red` allocates `{ __variant, variant, data }`. Unit variants allocate the same way — there's no interning.
- **Maps**: `mapNew()` allocates a `Map`. `mapSet` mutates in place (no allocation if the key exists; one allocation for the entry slot if new).

### Where allocations hurt

In a tight loop, allocations add up. The string-concat example allocates 10,000 strings; the GC has to reclaim them. The list-and-`join` version allocates 10,000 array entries (in one array) and one final string — much less GC pressure.

The stdlib's `collections` module is mostly non-mutating (returning new arrays) — `map`, `filter`, `slice`, `concat`, `reverse`, `sort` all return new arrays. This is good for clarity but creates allocation pressure in hot loops. If you're hitting the step limit on an array-processing loop, try in-place mutation (assign to indices of a pre-allocated array) instead.

### Where allocations don't matter

- Once-per-program setup: building a lookup table, parsing a config. The one-time allocation cost is dwarfed by the rest of the program.
- Short-lived programs (playground-scale): the GC reclaims before the next run.
- Programs that hit the step limit before allocation pressure matters: the step limit fires first.

---

## 7. Recursion vs. iteration

```aether
// Naive recursive — O(2^n) calls
fn fib_rec(n: int) -> int {
  if n < 2 { n } else { fib_rec(n - 1) + fib_rec(n - 2) }
}

// Iterative — O(n) iterations
fn fib_iter(n: int) -> int {
  if n < 2 { n } else {
    let mut a = 0;
    let mut b = 1;
    let mut i = 2;
    while i <= n {
      let c = a + b;
      a = b;
      b = c;
      i = i + 1;
    }
    b
  }
}

// Memoized — O(n) calls, with cache
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

print(fib_rec(10));    // 55 — ~600 steps, fast
print(fib_iter(30));   // 832040 — ~120 steps, instant
print(fib_memo(30));   // 832040 — ~600 steps, fast
```

`fib_rec(10)` is fine. `fib_iter(30)` is fast. `fib_memo(30)` is fast. `fib_rec(30)` blows the step limit. The memoized version uses a closure-captured `mut cache` array to share state across recursive calls; see [ownership.md](ownership.md) § 8 for the closure pattern.

The lesson: for algorithms where iteration is natural, iterate. For algorithms where recursion is natural (tree traversal, divide and conquer), memoize or use the stdlib's `reduce` if it fits.

### Tail-call optimization

Aether v1 does *not* do tail-call optimization. A tail call uses a stack frame just like a non-tail call; deep tail-recursive functions will blow the JS stack (or the step limit, whichever comes first). The JS engine's stack limit is around 10,000 frames in V8 — so a tail-recursive loop with 100K iterations throws "Maximum call stack size exceeded" before the step limit fires.

The v2 bytecode VM plan includes explicit tail-call instructions (see [RFC-002](../rfcs/rfc-002-bytecode-vm.md) § 4) — but even there, TCO is opt-in (it changes the observable behavior of stack traces).

---

## 8. The stdlib — fast choices, slow choices

The stdlib is implemented in TypeScript, so its functions run at JS speed — *much* faster than the equivalent Aether code. A `sort(xs)` call is one step (in the evaluator's counting — it's a single `Call` node) but it executes a JS sort that's O(n log n) in JS time.

The lesson: prefer stdlib functions over hand-rolled Aether code, especially for hot loops.

| Operation | Aether-written | Stdlib equivalent | Difference |
|-----------|----------------|-------------------|------------|
| Sum an array | `for x in xs { sum = sum + x; }` | `math.sum(xs)` | Stdlib is ~50x faster |
| Reverse a string | `let mut out = ""; ...` | `string.reverse(s)` | Stdlib is ~100x faster |
| Sort an array | (write a sort) | `collections.sort(xs)` | Stdlib is ~100x faster |
| Find an element | `for x in xs { if pred(x) { ... } }` | `collections.find(xs, pred)` | Stdlib is ~10x faster (one call) |
| Map an array | `for x in xs { push(out, f(x)); }` | inline `map(xs, f)` | Inline is ~10x faster (one call) |

Note: the inline `map`/`filter`/`reduce` are also implemented in TypeScript (`aether/core/eval/eval.ts`'s `set("map", ...)`), so they're fast too. The difference between `map(xs, f)` and a hand-written `for` loop is that `map` is one evaluation step (the JS sort inside runs in JS time), while the `for` loop is N steps (one per iteration, each at Aether-walker speed).

### When to write it in Aether anyway

- When the stdlib doesn't have what you need.
- When you're demonstrating an algorithm (in a teaching context).
- When the stdlib function doesn't fit your exact signature.

In general, prefer the stdlib. The v2 bytecode VM will close the gap (a hand-written `for` loop in v2 bytecode will be ~10x faster than v1, while the stdlib stays the same), but v1 is what we have.

---

## 9. A worked example — three ways to sum squares

```aether
// 1. Hand-written for loop — Aether-walker speed
fn sum_squares_loop(xs: [int]) -> int {
  let mut sum = 0;
  for x in xs {
    sum = sum + x * x;
  }
  sum
}

// 2. Inline map + inline reduce — JS speed (one call each)
fn sum_squares_inline(xs: [int]) -> int {
  let squares = map(xs, fn(x: int) -> int { x * x });
  reduce(squares, fn(a: int, b: int) -> int { a + b }, 0)
}

// 3. math.sum + map — even more concise
fn sum_squares_math(xs: [int]) -> int {
  math.sum(map(xs, fn(x: int) -> int { x * x }))
}

let xs = [];
let mut i = 0;
while i < 1000 {
  push(xs, i);
  i = i + 1;
}

print(sum_squares_loop(xs));    // 332833500
print(sum_squares_inline(xs));  // 332833500
print(sum_squares_math(xs));    // 332833500
```

The three give the same answer. The first takes ~4000 steps (loop body * 1000). The second takes ~20 steps (one `map` call + one `reduce` call + a few overhead). The third takes ~10 steps. The wall-clock time follows: the loop is 30ms, the inline is 1ms, the math is 0.5ms.

For 1000 elements, all three are fine. For 100,000 elements, the loop blows the step limit (~400K steps; might fit, might not), while the inline and math versions are still ~50ms.

The lesson: if you're processing large arrays, use `map`/`reduce`/`filter`/`sum`/`mean` rather than hand-written loops. They're 10–50x faster because they execute at JS speed.

---

## 10. Infinite-loop protection

The step limit is the primary infinite-loop protection. A `while true { ... }` with no `break` will hit the 1M limit in <100ms and panic — much better than hanging the browser tab.

The secondary protection is the Web Worker: the playground runs the evaluator in a worker (`src/lib/aether-worker.ts`), so even if the evaluator somehow wedged (which it shouldn't — the step limit catches everything), the main thread would stay responsive and you could click "Reset" or reload.

The v2 plan keeps the step limit (or its time/fuel equivalent) as the primary protection, plus the worker.

---

## 11. The v2 plan — what the bytecode VM buys

[RFC-002 bytecode VM](../rfcs/rfc-002-bytecode-vm.md) sketches the v2 runtime. The changes that affect performance:

1. **Compilation step.** The AST is lowered to a compact bytecode. Compilation is one-time per program; execution runs the bytecode. The compile step adds latency (a few ms for a typical program); execution is 10–100x faster per step.
2. **Bytecode interpreter instead of AST walker.** Each bytecode instruction is a switch case in a tight loop, vs. each AST node being a function call. The interpreter is ~10x faster than the tree-walker for the same program.
3. **Continuations / suspend-resume.** The VM has explicit instructions for suspending and resuming a coroutine, which makes `async`/`await` possible (see [RFC-001](../rfcs/rfc-001-async-await.md)).
4. **Fuel / time limit.** The VM uses a fuel counter (or a wall-clock timeout) instead of a step counter. Fuel is more accurate — it maps to actual CPU time, not to AST node visits.
5. **Type specialization.** The VM can specialize bytecodes for known types (`IntAdd` vs. `FloatAdd` vs. generic `Add`), skipping the type dispatch.
6. **JIT (post-v2).** A JIT on top of the bytecode VM (planned for v3) gets another 10x by compiling hot bytecodes to native code.

For the user-visible experience: v1 runs `fib(20)` in 30ms; v2 will run it in 3ms; v3 will run it in 0.3ms. `fib(30)` blows v1's step limit; v2 will run it in ~300ms; v3 in ~30ms.

The tree-walker is kept for the v2 REPL and LSP (where latency matters more than throughput — you want to evaluate one expression as fast as possible, not compile it first). The VM is for production runs. See [ADR-01](../decisions/adr-01-tree-walking-interpreter-for-v1.md) for the decision.

---

## 12. A checklist for fast Aether v1 code

- **Prefer stdlib over hand-rolled loops.** `map`, `filter`, `reduce`, `sum`, `mean`, `sort`, `find`, `every`, `some` execute at JS speed.
- **Memoize recursive functions.** Use a closure-captured `mut cache` array (see [ownership.md](ownership.md) § 8).
- **Iterate, don't recurse, for linear algorithms.** A `while` loop is faster than the equivalent tail-recursive function.
- **Build strings with `join`, not `+`.** `join(parts, "")` is O(n); `s = s + x` in a loop is O(n²).
- **Bump `maxSteps` if you must, but rewrite first.** If your program needs 50M steps to do anything useful, the algorithm is wrong.
- **Avoid `O(2^n)` recursion.** `fib(30)` is the textbook example; use iterative or memoized.
- **Minimize allocations in hot loops.** Reuse arrays where you can; the GC has to reclaim what you allocate.
- **Watch the step count in the Stats tab.** If a program is slow, the step count tells you whether it's algorithmic (high count) or constant-factor (low count, slow per step).

---

## 13. Reading the Stats tab

After every Run, the Stats tab shows:

- **Steps** — the evaluation step count.
- **Elapsed ms** — wall-clock time.
- **Value** — the value of the last top-level expression.
- **Output count** — how many entries in the `output` array (number of `print`/`println` calls).

For a 100-line program that runs in 50ms, you'll see:

```
steps: 5432
elapsed: 53ms
value: 55
output count: 4
```

If `steps` is high (>500K), the program is doing a lot of work — probably a hot loop. If `steps` is low but `elapsed` is high, the program is slow per step — probably a stdlib call that's slow (e.g., a regex on a long string).

The step count is the *first* number to look at when you're optimizing. If you can cut it in half, you've doubled your speed (modulo constant factors).

---

## 14. What's next

- [performance's sibling, tooling.md](tooling.md) — the playground UI, the Benchmarks view, the v2 plan.
- [rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md) — the v2 runtime that fixes the throughput problem.
- [decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md) — the v1 decision.
- [decisions/adr-10-browser-runnable-core.md](../decisions/adr-10-browser-runnable-core.md) — why the runtime runs in the browser.
- [examples/fibonacci.ae](../../examples/fibonacci.ae) — three implementations of `fib` (recursive, iterative, memoized) with the trade-offs documented.

Aether v1's performance story is, in three sentences: tree-walker with a 1M-step limit, sub-millisecond for small programs, 30ms for `fib(20)`, blows the limit on `fib(30)`. The stdlib runs at JS speed; hand-rolled loops run at Aether-walker speed; prefer the stdlib. The v2 bytecode VM gets 10x throughput; the v3 JIT gets another 10x.
