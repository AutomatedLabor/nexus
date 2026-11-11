# Performance in Aether

> Audience: anyone wanting to know how fast Aether v1 is, what its
> limits are, and how to write code that respects them.
> Prerequisites: [language-basics.md](language-basics.md),
> [stdlib-tour.md](stdlib-tour.md). 35 minutes.

Aether v1 is a tree-walking interpreter running in the browser.
This has three performance consequences:

1. **It is slow** compared to a JIT-compiled or bytecode VM
   implementation. Typical overhead is 100-1000x over native
   code for tight loops.
2. **It has a step limit.** The evaluator aborts after 1,000,000
   steps by default. You can configure this up to 100,000,000 or
   so before the browser tab becomes unresponsive.
3. **It is deterministic.** The same program with the same input
   always takes the same number of steps. This is a feature
   (predictable) and a constraint (no parallelism to hide
   behind).

This document describes the v1 performance characteristics in
detail, then sketches the v2 plan (a bytecode VM with a GC).

For the design rationale behind "tree-walking for v1, bytecode
VM for v2", see
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md).
For the v2 VM plan, see
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

## 1. The tree-walking model

The v1 evaluator (`aether/core/eval/eval.ts`) walks the AST
directly. There is no bytecode, no JIT, no compilation step.
Each AST node is a JavaScript object, and each evaluation step
is a method dispatch on that object's kind tag.

The evaluator has a step counter. Every visited AST node
increments the counter by one. When the counter exceeds the
limit (default 1,000,000), the evaluator throws a panic:

```aether
let mut i = 0;
while true { i = i + 1; }
// → execution step limit exceeded (1000000)
```

You can configure the limit via the `maxSteps` option:

```ts
import { compileAndRun } from "aether/core";

const result = compileAndRun(source, { maxSteps: 10_000_000 });
```

But be careful: a higher limit means the playground can become
unresponsive if your program runs too long. The browser is
single-threaded; a long-running program freezes the UI.

## 2. What costs what

Here is a rough breakdown of where the evaluator spends its
steps, in order of cost:

| Operation | Steps per occurrence | Notes |
|-----------|----------------------|-------|
| Function call | 5-20 | pushing a frame, binding params, executing body, popping the frame |
| Closure invocation | 10-30 | same as function call + environment capture |
| Variable lookup | 1-5 | linear search of the environment chain |
| Field access | 1-3 | hash lookup on the struct's fields |
| Array index | 2-5 | bounds check + index |
| Map index | 3-7 | hash lookup |
| Pattern match arm | 5-20 | test the pattern, bind the variables |
| `if` evaluation | 2-4 | test the condition, jump to a branch |
| `while` iteration | 4-8 | test the condition, execute the body |
| `for` iteration | 6-12 | iterate, bind the variable, execute the body |
| `print` call | 5-15 | format the value, append to stdout |

These numbers are rough; they depend on the depth of the
environment chain and the size of the data. The takeaway:
**function calls and pattern matches are the most expensive
operations**. The way to make Aether v1 programs fast is to
minimize them.

## 3. The step limit in practice

The default step limit is 1,000,000. Here is how far that
gets you:

- **Simple arithmetic** (e.g., `print(2 + 2);`): a few dozen
  steps. The step limit is not a concern.
- **A loop over 1000 items** doing light work: 50,000-100,000
  steps. Well within the limit.
- **A loop over 10,000 items** doing light work: 500,000-1,000,000
  steps. Approaching the limit.
- **A loop over 100,000 items** doing light work: 5,000,000-10,000,000
  steps. Exceeds the limit.
- **`fib(30)`** (recursive, naive): about 2.7 million function
  calls, or about 50 million steps. Exceeds the limit.
- **`fib(25)`**: about 240,000 function calls, or about 4-5
  million steps. Exceeds the default limit; fits comfortably
  in a 10 million step budget.

For `fib(10) = 55`, the canonical Aether example, the step
count is about 5000 — well within the limit. For `fib(20) =
6765`, it is about 200,000 steps. For `fib(30) = 832040`, it
is about 50 million steps.

To verify, paste this into the playground and check the Steps
tab:

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

print(fib(20));
// → 6765
// (Steps: ~200,000)
```

You can run `fib(25)` in the playground with the default step
limit; you cannot run `fib(30)` without bumping the limit. The
playground UI exposes the step limit in the inspector; the
host code that calls `compileAndRun` can override `maxSteps`.

## 4. Writing fast Aether v1 code

The general principle: **minimize function calls and pattern
matches in hot loops**. Here are concrete techniques.

### 4.1 Prefer `while` over recursion for loops

Recursive functions are clean but expensive: each call costs
5-20 steps. A `while` loop costs 4-8 steps per iteration. For
tight loops, the difference is 2-5x.

```aether
// Slow: ~200,000 steps for sum(1000)
fn sum_recursive(n: int) -> int {
  if n == 0 { 0 } else { n + sum_recursive(n - 1) }
}
print(sum_recursive(1000));

// Fast: ~10,000 steps for sum(1000)
fn sum_iterative(n: int) -> int {
  let mut acc = 0;
  let mut i = 1;
  while i <= n {
    acc = acc + i;
    i = i + 1;
  }
  acc
}
print(sum_iterative(1000));
```

### 4.2 Use `reduce` instead of `while` for simple aggregations

The inline `reduce` builtin is implemented in TypeScript and
runs the loop natively, without per-iteration AST dispatch. It
is faster than a hand-written `while` loop for simple
aggregations.

```aether
// Slow: ~30,000 steps for sum(1000)
fn sum_while(xs: [int]) -> int {
  let mut acc = 0;
  let mut i = 0;
  while i < len(xs) {
    acc = acc + xs[i];
    i = i + 1;
  }
  acc
}

// Fast: ~5,000 steps for sum(1000)
fn sum_reduce(xs: [int]) -> int {
  reduce(xs, fn(a: int, b: int) -> int { a + b }, 0)
}
```

### 4.3 Use `map`, `filter`, `reduce` instead of `for` with mutation

The inline `map`/`filter`/`reduce` builtins are native loops.
Each step inside the loop is faster than the equivalent AST
node visit.

```aether
// Slow
let mut squares = [];
for x in xs {
  squares = push(squares, x * x);
}

// Fast
let squares = map(xs, fn(x: int) -> int { x * x });
```

### 4.4 Avoid repeated string concatenation in loops

String concatenation with `+` creates a new string each
time. In a loop, this is O(n²) in the total length. Use
`join` from the stdlib instead.

```aether
// Slow: O(n²)
let mut s = "";
for w in words {
  s = s + w + ", ";
}
print(s);

// Fast: O(n)
print(join(words, ", "));
```

See
[../guides/anti-patterns.md](../guides/anti-patterns.md) for
more anti-patterns and their fixes.

### 4.5 Hoist invariant computations out of loops

The evaluator does not do any optimization. Whatever you
write is what runs. Hoist loop invariants manually:

```aether
// Slow: computes length every iteration
let mut i = 0;
while i < len(long_array) {
  // ...
  i = i + 1;
}

// Fast: cache the length
let n = len(long_array);
let mut i = 0;
while i < n {
  // ...
  i = i + 1;
}
```

### 4.6 Use the right data structure

- **Array** for indexed access. `xs[i]` is O(1).
- **Map** for keyed access. `m[k]` is O(1) average.
- **Linear search** for membership in a small array (under
  100 elements).
- **Set** (stdlib `set_new`, `set_has`) for membership in a
  larger collection.

```aether
// Slow: O(n) membership
fn contains(xs: [int], v: int) -> bool {
  for x in xs {
    if x == v { return true; }
  }
  false
}

// Fast: O(1) average
let s = set_new();
for x in xs { set_add(s, x); }
print(set_has(s, 42));
```

### 4.7 Avoid `print` in hot loops

`print` is expensive: it formats the value, builds a string,
and appends to the output buffer. Each call costs 5-15 steps,
plus the cost of formatting. In a hot loop, this dominates.

If you must print in a loop, batch the output:

```aether
// Slow: prints 1000 times
let mut i = 0;
let mut s = "";
while i < 1000 {
  s = s + str(i) + "\n";
  i = i + 1;
}
print(s);
```

(Better: avoid the loop entirely if you can compute the output
in closed form. But this is not always possible.)

## 5. Benchmarks

The playground has a Benchmarks view that runs a small set of
benchmarks and reports the step count for each. The benchmarks
are:

- **Arithmetic**: `1 + 2 * 3` — single expression, ~10 steps.
- **fib(10)**: 55, ~5,000 steps.
- **fib(20)**: 6765, ~200,000 steps.
- **Sum 1000**: reduce of `+` over `[1..1000]`, ~5,000 steps.
- **Sum 10000**: same, ~50,000 steps.
- **String concat 100**: building a string by appending in a
  loop, ~50,000 steps.
- **String join 100**: same with `join`, ~5,000 steps.
- **Map lookup 100**: 100 map lookups, ~1,000 steps.

Run the benchmarks to get a feel for the relative costs. The
numbers are deterministic; the same benchmark gives the same
step count every time.

(Note: in v1, the Benchmarks view is part of the playground UI.
Look for it in the Inspector or in a separate tab. If you
cannot find it, run the benchmarks manually by pasting the
code into the playground and reading the Steps tab.)

### 5.1 Wall-clock time

Wall-clock time is *not* a good metric for Aether v1 because
the evaluator runs in the host JavaScript runtime, which has
its own JIT and GC. The same program can take 10ms or 100ms
depending on whether the JIT has warmed up, what else the
browser is doing, and so on.

The step count is the *predictable* metric. Two different
runs of the same program always produce the same step count.
Wall-clock time can vary by 10x; step count is exact.

For benchmarking, use the step count. For estimating
"will this complete in a reasonable time?", use the step
count. For estimating "will the user perceive this as
fast?", you have to run it and see — but expect 100-1000x
slower than native code.

## 6. The v2 plan: bytecode VM

The v2 plan is to add a bytecode VM that replaces the
tree-walking interpreter for production use. The VM is
specified in
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md)
and the spec is at
[../spec/10-vm-and-bytecode.md](../spec/10-vm-and-bytecode.md).

The high-level shape:

- **Compilation** replaces interpretation. The AST is lowered
  to bytecode, which is then executed by a stack-based VM.
- **A register-based ISA** for compact code and fast
  dispatch.
- **Inline caching** for fast method dispatch and field
  access.
- **A generational GC** for short pauses. The spec is at
  [../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md).
- **Hot-spot optimization** for tight loops.

The expected speedup over v1 is 10-100x for typical programs.
The step limit becomes a time limit (typically 30 seconds for
a server, 5 seconds for the playground).

The VM is not in v1. The plan is in
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).
The AST walker (`aether/core/eval/eval.ts`) will remain for the
playground, the REPL, and the LSP, where compile latency
matters more than throughput.

## 7. The GC

Aether v1's GC is delegated to the host JavaScript runtime.
All Aether values are JavaScript values: strings are JS
strings, arrays are JS arrays, maps are JS `Map` objects,
structs are JS objects with a `__struct` tag, closures are JS
closures. The JavaScript GC reclaims them when they become
unreachable.

This means:

- **GC pauses are the JS engine's pauses.** V8 in Chrome and
  Node has a generational GC with sub-millisecond pauses for
  the young generation. Older generations pause for longer.
- **Allocation is fast.** Creating an array, struct, or
  closure is a single JS object allocation, typically
  100-500 ns.
- **Reference counting is not a thing.** The GC traces, not
  counts; cycles are handled correctly.

The v2 plan adds an Aether-specific GC (tricolor, generational)
to the VM, for two reasons: (1) to make GC behavior
predictable across hosts, and (2) to allow the VM to manage
its own heap. See
[../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md)
for the design.

## 8. Memory usage

Aether v1's memory usage is essentially the JavaScript heap
usage of the host. Each Aether value is a JS value, and the JS
runtime allocates and frees them.

A rough guide:

- An `int` or `float` is a JS number, 8 bytes.
- A `bool` is a JS boolean, ~16 bytes (boxed).
- A `string` is a JS string, ~2 bytes per char + overhead.
- An array is a JS array, ~8 bytes per slot + overhead.
- A map is a JS `Map`, ~50 bytes per entry.
- A struct is a JS object, ~16 bytes per field.
- A closure is a JS function with captured environment, varies.

For small programs (under 10,000 values), memory is not a
concern. For large programs, watch the array sizes — a
1,000,000-element int array is about 8 MB.

## 9. A worked example: optimizing a small program

Here is a small program that takes 2,000,000 steps in its
naive form. We will optimize it down to about 50,000 steps
(40x speedup).

### 9.1 The naive version

```aether
fn sum_of_squares(n: int) -> int {
  let mut acc = 0;
  let mut i = 1;
  while i <= n {
    acc = acc + i * i;
    i = i + 1;
  }
  acc
}

print(sum_of_squares(10000));
// → 333383335000
// Steps: ~200,000
```

This is 200,000 steps for 10,000 iterations, or about 20 steps
per iteration. The bulk of those steps are the `while`
condition test, the `i = i + 1` assignment, the multiplication,
and the addition.

### 9.2 Use `reduce` over `range`

```aether
fn sum_of_squares(n: int) -> int {
  reduce(range(1, n + 1), fn(a: int, b: int) -> int { a + b * b }, 0)
}

print(sum_of_squares(10000));
// → 333383335000
// Steps: ~50,000
```

`range(1, n + 1)` builds the array `[1, 2, ..., n]` in one
operation (about 10,000 steps). `reduce` runs the loop in
native JavaScript, with one Aether closure invocation per
element (about 30,000 steps). Total is about 50,000 steps —
4x faster than the naive version.

### 9.3 Use a closed form

If the goal is to compute the sum of squares (not to test
the language), use the closed form:

```aether
fn sum_of_squares(n: int) -> int {
  n * (n + 1) * (2 * n + 1) / 6
}

print(sum_of_squares(10000));
// → 333383335000
// Steps: ~20
```

This is 10,000x faster than the loop version. The lesson:
when a closed form exists, use it. Aether does not do
algebraic optimization; you have to do it yourself.

## 10. Performance checklist

Before optimizing an Aether v1 program, ask:

1. **Does it run within the step limit?** If yes, you may not
   need to optimize.
2. **Is the step count surprising?** If a 1000-iteration loop
   takes 1,000,000 steps, something is wrong — probably a
   function call inside the loop that you can inline.
3. **Are you using `+` on strings in a loop?** Switch to `join`.
4. **Are you using recursion where a loop would do?** Switch
   to a `while` or `for`.
5. **Are you computing a loop invariant in each iteration?**
   Hoist it out.
6. **Are you using `reduce`, `map`, `filter` instead of
   hand-written loops?** They are faster.
7. **Are you using `print` in a hot loop?** Batch the output.

The general principle: Aether v1 is a teaching language, not
a high-performance one. Optimize only when the step limit
forces you to. When you do optimize, prefer algorithmic
changes (use a better data structure, use a closed form) over
micro-optimizations (reorder operations).

## 11. Where to go next

- **[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md)**
  — the v2 bytecode VM plan.
- **[../spec/10-vm-and-bytecode.md](../spec/10-vm-and-bytecode.md)**
  — the VM spec.
- **[../spec/11-memory-and-gc.md](../spec/11-memory-and-gc.md)**
  — the GC spec.
- **[../guides/anti-patterns.md](../guides/anti-patterns.md)**
  — performance anti-patterns.
- **[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md)**
  — why tree-walking for v1.

Aether v1 is slow. That is the price of being a small
implementation that runs in the browser. The v2 plan adds a
bytecode VM; until then, the step count is your friend.
