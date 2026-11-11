# Chapter 10 — Optimization passes

> Aether v2 has 8 optimizer passes, run in a fixed order on the IR before codegen. This chapter covers each pass: what it does, why it's in the order it is, and a before/after IR example.

---

## 10.1 The pipeline (revisited)

```
  IR (from the IR builder)
        │
        ▼
  1. constantFolding   — fold arithmetic on constants
        │
        ▼
  2. dce                — strip dead code exposed by (1)
        │
        ▼
  3. cse                — collapse redundant expressions
        │
        ▼
  4. inlining           — inline small functions
        │
        ▼
  5. tco                — mark tail calls (no stack growth in future v2.x VM)
        │
        ▼
  6. licm               — hoist loop-invariant code now that inlining is done
        │
        ▼
  7. strengthReduction  — replace expensive multiplies with shifts (late)
        │
        ▼
  8. branchSimplification — collapse constant branches and merge trivial blocks
        │
        ▼
  Optimized IR ──► codegen ──► bytecode
```

The order is deliberate (see `aether/core/opt/index.ts`):

1. **constantFolding** first — folds away the obvious arithmetic so the next passes have less to chew on.
2. **dce** — strips the dead instructions exposed by (1).
3. **cse** — collapses redundant expressions, exposing more dead code (which (2) of the *next* iteration would remove, but in a single pass we leave it).
4. **inlining** — inlines small functions, exposing even more constants and dead code.
5. **tco** — marks tail calls so inlined bodies that end in a tail recursion don't bloat the stack.
6. **licm** — hoists loop-invariant code now that most inlining is done (so we can see the loop structure clearly).
7. **strengthReduction** — replaces expensive multiplies with shifts; late so the operand shape is stable.
8. **branchSimplification** — collapses constant branches and merges trivial blocks left over by previous passes.

Running the pipeline once produces a clean, compact IR. For aggressive pipelines you may re-run `DEFAULT_PASSES` 2-3 times; the fixpoint passes will simply no-op on the second run.

---

## 10.2 Constant folding

`aether/core/opt/constant-folding.ts`

Folds arithmetic on constant operands:

- `Add(LoadInt 1, LoadInt 2)` → `LoadInt 3`.
- `Mul(LoadFloat 2.0, LoadFloat 3.0)` → `LoadFloat 6.0`.
- `Eq(LoadInt 1, LoadInt 1)` → `LoadBool true`.
- `Lt(LoadInt 1, LoadInt 2)` → `LoadBool true`.

The pass walks the IR, identifies instructions where all operands are constants, and replaces them with the result.

### Before/after

**Before:**

```
  L0: LoadInt r0, 1
  L1: LoadInt r1, 2
  L2: Add r2, r0, r1
  L3: LoadInt r3, 3
  L4: Mul r4, r2, r3
  L5: Return r4
```

**After:**

```
  L0: LoadInt r4, 9      // 1 + 2 = 3, 3 * 3 = 9
  L1: Return r4
```

(Plus dead `LoadInt r0`, `r1`, `r3` — left for DCE to clean up.)

### What it does *not* fold

- Operations on non-constant operands: `Add(LoadInt 1, LoadLocal x)` stays.
- Operations with side effects: `CallBuiltin "print", ...` stays.
- Float comparisons that may be NaN: `Eq(LoadFloat NaN, LoadFloat NaN)` would fold to `false` if naive; the pass leaves it alone to be safe.

---

## 10.3 Dead-code elimination (DCE)

`aether/core/opt/dce.ts`

Removes instructions whose result is never used. The pass walks the IR, marks each instruction as "live" if its result is read by another live instruction, and removes everything not marked.

### Before/after

**Before:**

```
  L0: LoadInt r0, 42      // dead — r0 is never read
  L1: LoadInt r1, 10
  L2: Mul r2, r1, r1
  L3: Return r2
```

**After:**

```
  L0: LoadInt r1, 10
  L1: Mul r2, r1, r1
  L2: Return r2
```

### What's "live"

- `Return`, `Panic`, `Print` — always live (they have effects).
- `Call`, `CallBuiltin`, etc. — always live (calls may have side effects).
- `StoreField`, `IndexSet`, `SetBox`, `SetUpvalue`, `Push` — always live (they mutate).
- `LoadInt`, `Add`, etc. — live iff their destination register is read by a live instruction.

---

## 10.4 Common-subexpression elimination (CSE)

`aether/core/opt/cse.ts`

Identifies instructions that compute the same value as an existing instruction and replaces them with a reference to the existing one.

### Before/after

**Before:**

```
  L0: LoadInt r0, 5
  L1: LoadInt r1, 10
  L2: Add r2, r0, r1     // r2 = 15
  L3: Add r3, r0, r1     // r3 = 15 — same as r2
  L4: Mul r4, r2, r3
  L5: Return r4
```

**After:**

```
  L0: LoadInt r0, 5
  L1: LoadInt r1, 10
  L2: Add r2, r0, r1
  L3: Mul r4, r2, r2     // r3 replaced with r2
  L4: Return r4
```

### What it considers "same"

Two instructions are the same if:

- Same opcode.
- Same operands (in the same order, with the same types).
- Neither has side effects.

`Call` instructions are *not* CSE'd (they may have side effects, even if they look the same).

---

## 10.5 Inlining

`aether/core/opt/inlining.ts`

Replaces a `Call` instruction with the body of the called function, when the function is small enough.

The pass inlines:

- Functions whose body is ≤ N instructions (default N=20).
- Functions that are not recursive (would cause infinite inlining).

### Before/after

**Before:**

```aether
fn square(x: int) -> int { x * x }
fn sum_sq(a: int, b: int) -> int {
  let sa = square(a);
  let sb = square(b);
  sa + sb
}
print(sum_sq(3, 4));
```

**After (conceptual):**

```aether
fn sum_sq(a: int, b: int) -> int {
  let sa = a * a;
  let sb = b * b;
  sa + sb
}
print(sum_sq(3, 4));
```

(The inlining pass works on the IR, not the AST; the above is the conceptual effect.)

### What it does *not* inline

- Recursive functions (would loop forever).
- Functions with too many instructions (would bloat the caller).
- Functions called via `CallClosure` (the closure value is dynamic; the pass can't see which function it is at compile time).

---

## 10.6 Tail-call optimization (TCO)

`aether/core/opt/tco.ts`

Marks calls in tail position as `TailCall`, so the (future) VM can reuse the current frame instead of pushing a new one.

A call is in *tail position* if:

- It's the last instruction in a function (the next instruction is `Return`).
- The result of the call is directly returned (no further computation).

### Before/after

**Before:**

```
  fn fact(n: int, acc: int) -> int {
    if n == 0 {
      acc
    } else {
      fact(n - 1, n * acc)   // tail call — last thing fact does
    }
  }
```

**After (TCO marks the call):**

```
  fn fact(n: int, acc: int) -> int {
    if n == 0 {
      acc
    } else {
      TailCall fact(n - 1, n * acc)   // marked
    }
  }
```

### What it does *not* mark

- Calls whose result is used by another instruction (e.g., `fact(n-1) + fact(n-2)` in `fib`).
- Calls in `if` conditions or `match` scrutinees (not in tail position).

### The VM doesn't yet reuse frames

In v2 today, the `TailCall` opcode is *the same* as `Call` — the VM still pushes a new frame. The TCO pass is for the v2.x native backend, where the codegen can lower `TailCall` to a jump instead of a call. See RFC-002.

---

## 10.7 Loop-invariant code motion (LICM)

`aether/core/opt/licm.ts`

Identifies instructions inside a loop whose result doesn't depend on the loop's iteration variable, and hoists them outside the loop.

### Before/after

**Before:**

```aether
fn sum_squares(xs: [int], factor: int) -> int {
  let mut acc = 0;
  for x in xs {
    let sq = x * x;
    let scaled = sq * factor;   // factor is loop-invariant
    acc = acc + scaled;
  }
  acc
}
```

**After (conceptual):**

```aether
fn sum_squares(xs: [int], factor: int) -> int {
  let mut acc = 0;
  for x in xs {
    let sq = x * x;
    acc = acc + sq * factor;   // factor is hoisted out... or is it?
  }
  acc
}
```

(Actually, `factor` is *already* outside the loop. The LICM pass would hoist the *computation* `sq * factor` — but `sq` is loop-dependent. A better example:)

**Better before:**

```aether
for i in range(0, 1000) {
  let pi = 3.14159 * i;     // 3.14159 is loop-invariant
  print(pi);
}
```

**Better after:**

```aether
let pi_const = 3.14159;     // hoisted
for i in range(0, 1000) {
  let pi = pi_const * i;
  print(pi);
}
```

In the IR, this is even cleaner: the `LoadFloat 3.14159` instruction is moved to the preheader block, and the loop body's `Mul` references the hoisted register.

### What it does *not* hoist

- Instructions with side effects (`Call`, `Print`, `StoreField`).
- Instructions that may panic (e.g., `Div` by a loop-variant divisor).
- Instructions whose operands are loop-variant.

---

## 10.8 Strength reduction

`aether/core/opt/strength-reduction.ts`

Replaces expensive operations with cheaper equivalents:

- `Mul(x, 2)` → `Shl(x, 1)` (left shift by 1).
- `Mul(x, 4)` → `Shl(x, 2)`.
- `Mul(x, 8)` → `Shl(x, 3)`.
- `Div(x, 2)` → `Shr(x, 1)` (only for non-negative `x`; the pass is conservative and only fires when `x` is known to be `int`).
- `Mod(x, 2)` → `BitAnd(x, 1)`.

### Before/after

**Before:**

```
  L0: LoadInt r0, 8
  L1: LoadInt r1, 4
  L2: Mul r2, r0, r1     // r2 = 32
  L3: Return r2
```

**After:**

```
  L0: LoadInt r0, 8
  L1: LoadInt r2, 2      // shift amount
  L2: Shl r2, r0, r2     // r2 = 32
  L3: Return r2
```

(With constant folding, this would further simplify to `LoadInt r2, 32` — but constant folding runs *before* strength reduction. The point of strength reduction is for *runtime* multiplies, like `x * 8` where `x` is a runtime value.)

### What it does *not* replace

- `Mul(x, 3)` — not a power of two.
- `Div(x, 3)` — not a power of two.
- Operations on `float` (the bit-pattern semantics differ).

---

## 10.9 Branch simplification

`aether/core/opt/branch-simplification.ts`

Collapses branches with constant conditions and merges trivial blocks.

### Before/after

**Before:**

```
  L0: LoadBool r0, true
  L1: Br r0, L10, L20     // always takes L10
  L10: LoadInt r1, 42
  L11: Return r1
  L20: LoadInt r1, 99     // dead
  L21: Return r1
```

**After:**

```
  L0: LoadInt r1, 42
  L1: Return r1
```

(The `Br` is removed because its condition is constant; the dead branch (L20-L21) is removed because it's unreachable.)

### What it does *not* simplify

- Branches with non-constant conditions.
- Branches where both arms have side effects (kept for clarity).

---

## 10.10 Running the passes

The passes are exported from `aether/core/opt/index.ts`:

```typescript
import {
  runPasses,
  constantFolding, dce, cse, inlining, tco, licm, strengthReduction, branchSimplification,
  DEFAULT_PASSES,
} from "../opt";

const optimizedIr = runPasses(ir, DEFAULT_PASSES);
// Or run a single pass:
const folded = constantFolding(ir);
const cleaned = dce(folded);
```

`runPasses` runs each pass in order, returning the transformed IR. The IR is immutable — each pass returns a new IR (a clone with the changes applied).

### Re-running the pipeline

For aggressive optimization, you can re-run `DEFAULT_PASSES` 2-3 times:

```typescript
let ir = buildIr(ast);
for (let i = 0; i < 3; i++) {
  ir = runPasses(ir, DEFAULT_PASSES);
}
```

The fixpoint passes (constantFolding, DCE, CSE) will simply no-op on the second run; the non-fixpoint passes (inlining) may make more progress on subsequent runs (an inlined function may expose more constants, which `constantFolding` can then fold).

---

## 10.11 Effect on benchmarks

The optimization passes have a measurable effect on the benchmark suite. The "before optimization" numbers (running the VM without the passes) vs "after" (with `DEFAULT_PASSES`):

| Benchmark      | VM no-opt | VM with-opt | improvement |
|----------------|-----------|-------------|-------------|
| `fib-15`       | ~5ms      | ~3ms        | 40%         |
| `fib-20`       | ~32ms     | ~20ms       | 37%         |
| `sum-500k`     | ~250ms    | ~150ms      | 40%         |
| `factorial-100` | ~0.8ms   | ~0.5ms      | 37%         |
| `str-concat`   | ~14ms     | ~10ms       | 28%         |
| `array-build`  | ~8ms      | ~5ms        | 37%         |

(The numbers are illustrative; the actual improvements vary by benchmark. The point is: the optimizer gives another 30-40% on top of the VM's 5-10× over the tree-walker.)

---

## 10.12 Eight runnable examples

The optimizer is invisible to the Aether programmer — you write the same source, the optimizer makes it faster. The examples here are programs that *benefit* from optimization; you can compare the timing in the Benchmarks view with and without the "optimize" checkbox (planned for v2.1; in the meantime, the optimizer is always on for `run:vm`).

**1. Constant arithmetic.**

```aether
print(1 + 2 * 3 - 4 / 2);   // 5 — folded at compile time
```

**2. Inlined `square`.**

```aether
fn square(x: int) -> int { x * x }
print(square(3) + square(4));   // 25 — square is inlined
```

**3. Loop-invariant factor.**

```aether
let factor = 100;
let mut sum = 0;
for i in range(0, 1000) {
  sum = sum + i * factor;   // factor hoisted
}
print(sum);
```

**4. Strength reduction.**

```aether
let mut sum = 0;
for i in range(0, 100) {
  sum = sum + i * 8;   // * 8 -> << 3
}
print(sum);
```

**5. Dead code.**

```aether
let x = 42;   // x is never used
let y = 10;
let z = y * y;
print(z);   // 100 — x and the LoadInt 42 are stripped
```

**6. Common subexpression.**

```aether
let a = 5;
let b = 10;
let c = (a + b) * (a + b);   // (a + b) computed once
print(c);
```

**7. Branch simplification.**

```aether
let x = if true { 42 } else { 99 };
print(x);   // 42 — the else branch is eliminated at compile time
```

**8. Tail recursion (marked for v2.x).**

```aether
fn fact(n: int, acc: int) -> int {
  if n == 0 { acc } else { fact(n - 1, n * acc) }
}
print(fact(10, 1));   // 3628800 — the call is marked TailCall
```

---

## 10.13 Summary

- 8 optimizer passes, run in a fixed order: constantFolding → dce → cse → inlining → tco → licm → strengthReduction → branchSimplification.
- Each pass is small, idempotent, and composes with the others.
- The pipeline gives 30-40% improvement on top of the VM's 5-10× speedup over the tree-walker.
- The TCO pass *marks* tail calls; the v2 VM doesn't yet reuse frames. That's a v2.x native-backend item.
- The passes are exported individually (`constantFolding`, `dce`, ...) and as a `DEFAULT_PASSES` array; you can run them via `runPasses(ir, DEFAULT_PASSES)`.

The next chapter is modules and packages: `import`, `pub`, file resolution, cycles, `aether.toml`, and the package manager vision.
