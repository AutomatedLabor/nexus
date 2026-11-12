# 06. GC Safety Proof Outline

## Theorem statement

**Theorem (GC Safety).**  The mark-sweep garbage collector (GC)
in Aether reclaims all unreachable heap objects without touching
reachable ones.  Formally:

1. **Reachability preservation.**  For any location `ℓ` reachable
   from the root set (the environment `ρ` plus any live
   continuations), `σ′(ℓ) = σ(ℓ)` after GC (the value is
   preserved).
2. **Unreachability reclamation.**  For any location `ℓ′` not
   reachable from the root set, `ℓ′ ∉ dom(σ′)` after GC (the
   location is reclaimed).

In words: the GC preserves reachable objects and reclaims
unreachable ones.  No reachable object is freed; no unreachable
object is retained (after a GC cycle).

## Background: the GC

Aether v1 uses a **mark-sweep** GC (in `aether/vm/gc/gc.ts`,
planned; the v1 implementation uses the JS engine's GC, but the
formal model is mark-sweep).  The algorithm:

```
function gc(ρ, σ):
  marks = {}                    // empty mark bitset
  worklist = []
  // Mark phase: starting from roots (the environment's locations
  // and any live continuations' locations), mark all reachable.
  for ℓ in roots(ρ):
    mark(ℓ)
  while worklist is not empty:
    ℓ = worklist.pop()
    v = σ(ℓ)
    for child in children(v):    // locations referenced by v
      mark(child)
  // Sweep phase: free all unmarked locations.
  σ′ = {}
  for ℓ in dom(σ):
    if marks[ℓ]:
      σ′[ℓ] = σ[ℓ]
  return σ′

function mark(ℓ):
  if ℓ in marks: return
  marks[ℓ] = true
  worklist.push(ℓ)
```

`roots(ρ)`: the locations in the environment `ρ` (the values bound
to variables) plus any live continuations' locations.

`children(v)`: the locations referenced by the value `v`.  For
compound values (arrays, structs, closures, etc.), the children
are the locations of their elements/fields/captured environment.
For atomic values (ints, floats, bools, etc.), no children.

## Proof outline

### Step 1: Reachability definition

A location `ℓ` is **reachable** from the root set `R` if there's a
path `ℓ_0 → ℓ_1 → … → ℓ_n = ℓ` where `ℓ_0 ∈ R` and each `ℓ_{i+1}` is
a child of `ℓ_i` (i.e., `σ(ℓ_i)` references `ℓ_{i+1}`).

The reachable set is the transitive closure of `R` under the
children relation.

### Step 2: Mark phase correctness

**Lemma (Mark-Reachable).**  After the mark phase, every reachable
location is marked.

Proof: by induction on the length of the reachability path.

- Base case (path length 0): `ℓ ∈ R` is marked by the initial
  `for ℓ in roots(ρ): mark(ℓ)` loop.  ✓.
- Inductive case (path length n+1): `ℓ_{n+1}` is a child of
  `ℓ_n`.  By IH, `ℓ_n` is marked.  By the mark phase's main loop,
  when `ℓ_n` is processed (popped from the worklist), its children
  (including `ℓ_{n+1}`) are marked.  ✓.

So the mark phase marks every reachable location.

**Lemma (Mark-Only-Reachable).**  After the mark phase, every
marked location is reachable.

Proof: by induction on the order of marking.

- The initial marks are on `R`, which is reachable (path length
  0).  ✓.
- Each subsequent mark is on a child of an already-marked
  location.  By IH, the parent is reachable; the child is
  reachable (one more step).  ✓.

So the mark phase marks exactly the reachable locations.

### Step 3: Sweep phase correctness

**Lemma (Sweep-Preserve-Marked).**  After the sweep phase, every
marked location `ℓ` has `σ′(ℓ) = σ(ℓ)`.

Proof: by the sweep phase's loop:

```
for ℓ in dom(σ):
  if marks[ℓ]:
    σ′[ℓ] = σ[ℓ]
```

Marked locations are copied to `σ′`.  So `σ′(ℓ) = σ(ℓ)` for marked
`ℓ`.  ✓.

**Lemma (Sweep-Reclaim-Unmarked).**  After the sweep phase, every
unmarked location `ℓ` is not in `dom(σ′)`.

Proof: by the sweep phase's loop, unmarked locations are not
copied.  So `ℓ ∉ dom(σ′)` for unmarked `ℓ`.  ✓.

### Step 4: The safety theorem

**Theorem (Reachability-Preservation).**  For any reachable
location `ℓ`, `σ′(ℓ) = σ(ℓ)` after GC.

Proof: by Mark-Reachable, `ℓ` is marked.  By Sweep-Preserve-Marked,
`σ′(ℓ) = σ(ℓ)`.  ✓.

**Theorem (Unreachability-Reclamation).**  For any unreachable
location `ℓ′`, `ℓ′ ∉ dom(σ′)` after GC.

Proof: by Mark-Only-Reachable, `ℓ′` is not marked.  By Sweep-
Reclaim-Unmarked, `ℓ′ ∉ dom(σ′)`.  ✓.

### Step 5: Observational equivalence

**Theorem (GC-Observational-Equivalence).**  For any well-typed
program `P` and any execution `⟨P, ρ, σ⟩ ⟹ v`, interleaving GC
cycles during the execution doesn't change the result: `⟨P, ρ,
σ⟩ ⟹ v` with GC equals `⟨P, ρ, σ⟩ ⟹ v` without GC (modulo the
freshness of allocated locations).

Proof: by the reachability preservation, the GC doesn't modify
any reachable location.  So the program's evaluation, which only
accesses reachable locations (by the type-safety invariant "no
dangling locations"), is unaffected by GC.  ✓.

### Step 6: Termination of the GC

**Lemma (GC-Termination).**  The mark phase terminates.

Proof: the mark phase visits each location at most once (the
`if ℓ in marks: return` check).  The number of locations is
finite (bounded by the store's size).  So the mark phase
terminates.  ✓.

**Lemma (Sweep-Termination).**  The sweep phase terminates.

Proof: the sweep phase iterates over `dom(σ)` once.  The store is
finite.  So the sweep phase terminates.  ✓.

## Assumptions

1. The store is finite (the heap has bounded size).  In practice,
   the JS engine's heap is bounded by available memory; in a
   standalone VM, the heap would be bounded by the configured
   max.
2. The `children` function correctly identifies all locations
   referenced by a value.  This is the key soundness assumption —
   if `children(v)` misses a child, the GC might reclaim a
   reachable location.
3. The `roots` function correctly identifies all root locations
   (the environment plus any live continuations).  If `roots` is
   incomplete, the GC might reclaim a reachable location.
4. No finalizers in v1 (the GC just reclaims; no `Drop` is called).
5. No pointer arithmetic (the only way to reference a location is
   through the store, which `children` traverses).
6. The mark bitset is large enough (no overflow).

## Key lemmas

1. **Mark-Reachable**: the mark phase marks every reachable
   location.
2. **Mark-Only-Reachable**: the mark phase marks only reachable
   locations.
3. **Sweep-Preserve-Marked**: the sweep phase preserves marked
   locations.
4. **Sweep-Reclaim-Unmarked**: the sweep phase reclaims unmarked
   locations.
5. **GC-Termination**: the GC terminates (both phases).
6. **GC-Observational-Equivalence**: interleaving GC doesn't
   change the program's result.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the mark phase's
  correctness (Mark-Reachable, Mark-Only-Reachable), the sweep
  phase's correctness (Sweep-Preserve-Marked, Sweep-Reclaim-
  Unmarked), the termination lemmas.  Estimated Coq effort: ~4000
  lines.
- **Hand-waved**: the `children` function's correctness (depends
  on the value representation, which is implementation-specific).
  The `roots` function's completeness (depends on the runtime's
  data structures).  The JS engine's GC (used in v1 in lieu of the
  standalone GC; assumed sound).

## Conclusion

GC safety is the guarantee that Aether's garbage collector
reclaims all unreachable objects without touching reachable ones.
The proof reduces to:

1. Mark-Reachable: every reachable location is marked.
2. Mark-Only-Reachable: only reachable locations are marked.
3. Sweep-Preserve-Marked: marked locations are preserved.
4. Sweep-Reclaim-Unmarked: unmarked locations are reclaimed.
5. GC-Termination: the GC terminates.
6. GC-Observational-Equivalence: interleaving GC doesn't change
   the program's result.

The proof is paper-style; full mechanization is future work.  The
key lemmas are standard mark-sweep invariants; the theorems are
direct consequences.

The v1 implementation uses the JS engine's GC (which is sound for
JS values); the standalone GC (for a non-JS backend) follows the
formal model.  The formal proof establishes the standalone GC's
correctness.

Together with the type-safety proofs (`01`, `02`) and the borrow
safety proof (`03`), GC safety ensures that Aether programs don't
have memory-safety bugs (no use-after-free, no double-free, no
leaked reachable objects).
