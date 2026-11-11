# quicksort.ae

Functional quicksort on an `int` array, using the inline `filter`
builtin and array concat (`+`). No mutation, no `for` loops with
post-loop bindings, no in-place swaps — just three recursive calls
wired together with `+`.

## What it does

The core function is `quicksort(arr: [int]) -> [int]`:

```aether
fn quicksort(arr: [int]) -> [int] {
  if len(arr) <= 1 {
    return arr;
  };
  let pivot = arr[0];
  let less    = filter(arr, fn(x: int) -> bool { x < pivot });
  let equal   = filter(arr, fn(x: int) -> bool { x == pivot });
  let greater = filter(arr, fn(x: int) -> bool { x > pivot });
  quicksort(less) + equal + quicksort(greater)
}
```

1. **Base case**: an array of length 0 or 1 is already sorted — return it.
2. **Pivot**: take the first element (a deliberately naive choice —
   worst case O(n²) on already-sorted input).
3. **Partition**: use three `filter` calls to split the array into
   elements less than, equal to, and greater than the pivot. The
   `equal` partition handles duplicates correctly.
4. **Combine**: recurse on the two sides and concatenate with `+`,
   in the right order: `sorted(less) + equal + sorted(greater)`.

A small helper `show(arr)` builds a `"[1, 2, 3]"`-style string via
`reduce` (the canonical pattern for avoiding the for-loop-scope
quirk when building a string out of an array). The driver sorts a
handful of test cases and prints them, then runs `assert_eq`-free
(but completes with a final status print).

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/quicksort.ae
```

## Key language features

- **`filter` inline builtin** — `filter(arr, fn(x: int) -> bool { … })`
  returns a new array containing the elements where the predicate is
  true. Three filters produce three partitions in one pass each —
  total O(n) per recursion level.
- **Array concat `+`** — `[1, 2] + [3, 4] == [1, 2, 3, 4]`. Works at
  runtime; the type checker doesn't model `+` on `[int]`, so the file
  reports 3 type errors but runs correctly. The playground runs
  programs with type warnings rather than blocking them.
- **`reduce` inline builtin** — `reduce(arr, fn(acc, x) -> … , init)`
  folds an array into an accumulator. Here we use it to build the
  comma-joined string in `show`. This is the canonical pattern for
  iterating-with-side-effects while avoiding the for-loop-scope
  quirk (a `let X` bound before a `for` and referenced after fails
  with "undefined name").
- **Lambda literals** `fn(x: int) -> bool { … }` passed directly as
  the predicate argument.
- **`return arr;` inside an `if` block** — the base case uses an
  explicit `return`. The task description warns that `return` after a
  block can be brittle, but `return arr;` immediately after an
  `if len(arr) <= 1 { … };` works in v1.

## Expected output

```
== Quicksort ==

input:  [5, 2, 8, 1, 9, 3, 7, 4, 6, 0]
sorted: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  [3, 1, 2] -> [1, 2, 3]
  [42] -> [42]
  [9, 8, 7, 6, 5, 4, 3, 2, 1] -> [1, 2, 3, 4, 5, 6, 7, 8, 9]
  [1, 1, 1, 1] -> [1, 1, 1, 1]

Quicksort done.
```

## Design notes

- **Why `filter` and not in-place partition?** The functional style
  is the most idiomatic Aether pattern: pure, no aliasing, no
  mutability hazards, and works directly with the inline builtins.
  An in-place partition would need mutable index swapping, which
  works (see `matrix_ops.ae`) but is more verbose and more error-
  prone.
- **Why `+` and not `push`?** Building a new array via concat
  expresses the recursion naturally: `sorted(less) + equal + sorted
  (greater)` is one expression. `push` mutates an existing array,
  which would require a `let mut acc = …; push(acc, …); acc` dance —
  less clean.
- **The naive pivot choice (first element) gives O(n²) on sorted
  input** — see the test case `[9, 8, 7, 6, 5, 4, 3, 2, 1]`. A
  production quicksort would use median-of-three or random pivot to
  avoid this. The example keeps it simple to highlight the algorithm
  structure.
- The 3 type errors (`operator '+' not defined for [int] and [int]`,
  etc.) are a known v1 limitation — the type checker doesn't model
  array concat. The runtime does. The program runs correctly.
