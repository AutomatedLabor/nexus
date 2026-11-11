# linked_list.ae

A functional singly-linked list of integers built from a **recursive enum**,
demonstrating Aether's algebraic data types and pattern matching.

## What it does

The list type is defined as:

```aether
enum List {
  Node(int, List),
  Nil,
}
```

A `List` value is either `Nil` (the empty list) or `Node(value, rest)` where
`rest` is itself a `List`. Because the enum's `Node` variant contains another
`List`, the type is **recursive** — and Aether's enums support this directly,
no `Box` or indirection needed at the language level (the runtime stores the
nested value as a tagged JS object).

The program implements five operations on this list, all **pure** (return new
lists, never mutate):

- `list_length(l)` — recursively counts nodes (`Node(_, rest) => 1 + len(rest)`).
- `list_to_string(l)` — builds a `"[1, 2, 3]"`-style rendering using a nested
  closure helper that tracks whether we're at the first element (to skip the
  leading comma).
- `list_prepend(l, x)` — cons, O(1): wrap `l` in `Node(x, l)`.
- `list_append(l, x)` — push-to-end, O(n): walk to `Nil` and replace it with
  `Node(x, Nil)`.
- `list_reverse(l)` — O(n) tail-recursive helper with an accumulator. We walk
  the input, prepending each element onto `acc`; when we hit `Nil`, `acc`
  holds the reversed list.

The driver builds `[10, 20, 30]` from `Nil` via three `append`s, then
prepends `5` to get `[5, 10, 20, 30]`, reverses it, and reverses again to
confirm we recover the original. It closes with `assert_eq` checks.

## How to run

```bash
bun /tmp/verify_examples.ts   # verifies all 12 examples at once
```

## Key language features

- **Recursive enums**: `enum List { Node(int, List), Nil }` — a variant can
  carry another value of the same enum, allowing algebraic data types.
- **Pattern matching** with `match` and variant patterns
  `List::Node(v, rest) => …`. The wildcard `_` discards a payload.
- **Block bodies in match arms**: `List::Node(v, rest) => { let sep = …; … }`
  — an arm body can be a `{ stmts; expr }` block, not just a single expr.
- **Nested function declarations** inside a function — Aether hoists `fn`
  declarations to the top of the enclosing function's body, so `helper` can be
  defined after it's first referenced in `list_to_string`'s return.
- **Closure capture**: `helper` captures the outer parameter `l` (or `acc`)
  implicitly via lexical scope.
- **`assert_eq(a, b)`** — the inline builtin that deep-compares values
  (structs, enums, arrays, primitives) and panics on mismatch.

## Expected output

```
== Singly-linked list (recursive enum) ==

after appends:   [10, 20, 30]  (len = 3)
after prepend 5:  [5, 10, 20, 30]  (len = 4)
reversed:        [30, 20, 10, 5]  (len = 4)
reverse twice:   [5, 10, 20, 30]  (len = 4)

All assertions passed.
```

## Design notes

- The list is **immutable** — every operation returns a fresh `List`. This
  is the natural fit for algebraic-data-type lists in a language like Aether
  and avoids aliasing surprises.
- `list_append` is O(n) because it has to walk to the end of the list. In a
  production library you'd typically `prepend` (O(1)) and `reverse` if you
  needed FIFO order; the demo does both to show the trade-off.
- `list_reverse` is written in **tail-recursive accumulator style**
  (`helper(l, acc)`). Aether's runtime is a tree-walking interpreter and
  doesn't perform tail-call optimization, so deep lists would blow the JS
  stack — but for a four-element demo this is fine.
- The string renderer uses a `first : bool` flag passed through the helper
  rather than stripping a leading comma afterward — same idea, no extra pass.
