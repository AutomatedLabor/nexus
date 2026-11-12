# 07. Termination of Pattern Compilation Proof Outline

## Theorem statement

**Theorem (Termination of Pattern Compilation).**  The pattern-
match compilation algorithm (which converts a `match scrut { arms }`
expression into a decision tree of tests and jumps) terminates for
every well-formed match expression.

Equivalently: the pattern compiler never loops forever on a
well-formed input.  This is a necessary precondition for the
compiler's correctness (a non-terminating compiler can't produce
bytecode).

## Background: pattern compilation

Aether's pattern compiler (in `aether/vm/codegen/codegen.ts` and
`aether/core/sema/sema.ts`'s pattern-handling code) takes a match
expression:

```
match scrut {
  p_1 if g_1 => b_1
  p_2 if g_2 => b_2
  ...
  p_n => b_n
}
```

and produces a decision tree:

```
Test(tag of scrut == K_1):
  Bind subpattern variables
  Test(guard g_1):
    Evaluate b_1
  Else: Test(next arm)
Else: Test(next arm)
```

The decision tree is then compiled to bytecode (Match opcodes with
match-table entries).

The algorithm is recursive: each pattern `p` is compiled by
matching its kind (Wildcard, Bind, Lit, Tuple, Array, Struct, Enum,
Or) and emitting the appropriate test.

## Proof outline

### Step 1: The measure

We define a **measure** `μ(p, scrut)` that strictly decreases at
each recursive call of the compiler.  The measure is:

- `μ(p, scrut) = size(p) + size(type(scrut))`

where `size(p)` is the size of the pattern (number of subpattern
nodes) and `size(type(scrut))` is the size of the scrutinee's type
(number of constructors + sum of constructor arities).

### Step 2: The recursive structure

The compiler dispatches on the pattern's kind:

- **Wildcard**: emits no test, no recursive call.  Base case.
- **Bind**: emits no test, no recursive call.  Base case.
- **Lit**: emits a single equality test, no recursive call.  Base
  case.
- **Tuple (p_1, …, p_n)**: emits a tuple-destructuring test, then
  recursively compiles each `p_i` against the corresponding tuple
  element.
- **Array [p_1, …, p_n, .., p_k]**: emits an array-destructuring
  test, then recursively compiles each `p_i` against the
  corresponding array element.
- **Struct S { f_1: p_1, …, f_n: p_n, .. }**: emits a struct-
  destructuring test, then recursively compiles each `p_i` against
  the corresponding field value.
- **Enum E::K(p_1, …, p_n)**: emits a tag-equality test, then
  recursively compiles each `p_i` against the corresponding
  payload value.
- **Or p_1 | p_2**: emits a "try p_1, else try p_2" structure, then
  recursively compiles `p_1` and `p_2` against the same scrutinee.
- **Rest `..`**: no recursive call (matches zero or more elements).

### Step 3: Termination of the recursive calls

**Lemma (Subpattern-Measure-Decreases).**  For each recursive call
`compile(p_i, scrut_i)`, `μ(p_i, scrut_i) < μ(p, scrut)`.

Proof:

- For Tuple, Array, Struct, Enum: `p_i` is a strict subpattern of
  `p`, so `size(p_i) < size(p)`.  The `scrut_i` is a sub-value of
  `scrut` (the i-th element, field, or payload), so `size(type(scrut_i))
  < size(type(scrut))` (the sub-value's type is a strict subterm of
  the scrutinee's type).  So `μ(p_i, scrut_i) < μ(p, scrut)`.  ✓.
- For Or: `p_1` and `p_2` are strict subpatterns of `p` (the Or
  pattern is a node with two children).  So `size(p_1), size(p_2) <
  size(p)`.  The scrutinee is the same, so `size(type(scrut))` is
  unchanged.  So `μ(p_1, scrut), μ(p_2, scrut) < μ(p, scrut)`.  ✓.

### Step 4: Termination of the algorithm

**Theorem (Compile-Termination).**  `compile(p, scrut)` terminates
for every well-formed `p` and `scrut`.

Proof: by well-founded induction on `μ(p, scrut)`.

- Base case (`μ = 0`): `p` is Wildcard, Bind, or Rest (size 0).  No
  recursive call; the compiler returns immediately.  ✓.
- Inductive case (`μ > 0`): the compiler dispatches on `p`'s kind
  and makes recursive calls with strictly smaller `μ` (by
  Subpattern-Measure-Decreases).  By IH, each recursive call
  terminates.  So the compiler terminates.  ✓.

### Step 5: Termination of the match-table construction

The compiler also builds the match table (the side data structure
that the VM's Match opcode uses).  The construction is a linear
walk over the arms; each arm is compiled by `compile(p, scrut)`,
which terminates by Compile-Termination.  So the match-table
construction terminates.  ✓.

### Step 6: Termination of the whole-pattern compilation

The whole match expression is compiled by compiling each arm in
order.  Each arm terminates (by Compile-Termination).  The number
of arms is finite (it's the AST's length).  So the whole
compilation terminates.  ✓.

## Assumptions

1. The pattern is well-formed (no infinite patterns — the AST is
   finite).
2. The scrutinee's type is well-formed (the type AST is finite).
3. The compiler is correctly implemented (it makes recursive calls
   with the right arguments).
4. No recursive pattern types (Aether doesn't have recursive
   types in v1; the formal model assumes finite types).

## Key lemmas

1. **Subpattern-Measure-Decreases**: each recursive call has a
   strictly smaller measure.
2. **Compile-Termination**: the compiler terminates for each
   pattern.
3. **Match-Table-Construction-Termination**: the match-table
   construction terminates.
4. **Whole-Match-Compilation-Termination**: the whole match
   expression compilation terminates.

## What's mechanized vs hand-waved

- **Mechanized** (in future Coq/Lean work): the measure definition,
  the Subpattern-Measure-Decreases lemma (a syntactic property of
  the pattern AST), the well-founded induction.  Estimated Coq
  effort: ~2000 lines.
- **Hand-waved**: the compiler's implementation correctness (the
  recursive calls have the right arguments).  This is a runtime
  check (the codegen tests cover it).  The well-formedness of the
  pattern and type (assumed by the parser and sema).

## Conclusion

Termination of pattern compilation is the guarantee that the
pattern compiler never loops forever on a well-formed input.
The proof reduces to:

1. Define a measure `μ(p, scrut) = size(p) + size(type(scrut))`.
2. Show that each recursive call strictly decreases the measure
   (Subpattern-Measure-Decreases).
3. Apply well-founded induction to conclude termination.

The proof is paper-style; full mechanization is future work.  The
key lemma is the measure-decrease, which is a syntactic property
of the pattern AST.  The mechanization is straightforward (define
the measure in Coq, prove the decrease, apply well-founded
induction).

This termination proof is a precondition for the compiler's
correctness: a non-terminating compiler can't produce bytecode, so
proving termination is the first step.  The next step (not in this
document) is to prove that the produced bytecode correctly
implements the match expression's semantics (a preservation
theorem for the compilation).

For Aether, the pattern compiler is small (~500 lines of TS) and
the termination proof is straightforward.  The proof's main value
is to establish that the compiler is total, which is a
prerequisite for reasoning about its correctness.
