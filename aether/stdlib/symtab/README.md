# Aether stdlib — `symtab`

A lexical symbol table with scoped frames, designed to mirror the
Aether evaluator's environment chain in a more minimal, debuggable
form. Each symbol table is a stack of frames; pushing a frame
enters a new scope, popping a frame exits.

## Why a separate symbol table?

The evaluator itself uses environments linked by parent pointers
that already perform lexical lookups.  This module exists for two
reasons:

1. **Debugging & introspection.**  A flat stack of frames is easy
   to dump, inspect, and reason about.  `symtabToString` produces a
   per-frame dump that's invaluable when writing compiler passes
   or building language servers.

2. **Teaching / porting.**  The stack-of-frames shape is the
   textbook shape of a lexical symbol table; a hand-rolled
   interpreter (e.g. a port of Aether to another language) can
   reuse this module as a building block without depending on the
   evaluator.

## Data model

A symbol table is a plain object with a single `frames` array.
Each frame is a `{ bindings: Map<string, V> }` record.  The
deepest frame (last in the array) is the "current" scope.

```ts
type SymTab<V> = { frames: { bindings: Map<string, V> }[] };
```

This deliberately avoids a linked-list-of-environments shape so
that walking the chain from outer to inner (e.g. to compute the
visible bindings) is a simple iteration.

## Functions

| Function | Signature | Notes |
|---|---|---|
| `symtabNew` | `() -> SymTab` | Empty table; zero frames. |
| `symtabEnter` | `(t) -> SymTab` | Push a fresh frame; chainable. |
| `symtabExit` | `(t) -> bool` | Pop the deepest frame; returns false on empty. |
| `symtabInsert` | `(t, name, value) -> SymTab` | Insert/overwrite in current frame; throws if no active frame. |
| `symtabLookup` | `(t, name) -> any?` | Walk frames deepest-first; returns the first match. |
| `symtabLookupLocal` | `(t, name) -> any?` | Look up only in the current frame. |
| `symtabShadow` | `(t, name, value) -> bool` | Insert in current frame unless a local binding already exists. |
| `symtabCurrentDepth` | `(t) -> int` | Number of frames on the stack. |
| `symtabAll` | `(t) -> [{name, value, depth}]` | All visible bindings (inner shadows outer), sorted by name. |
| `symtabToString` | `(t) -> string` | Per-frame dump, useful for debugging. |

## Example

```aether
let t = symtabNew();
symtabEnter(t);
symtabInsert(t, "x", 1);
symtabInsert(t, "y", 2);
symtabEnter(t);
symtabInsert(t, "x", 99);  // shadows outer x
print(symtabLookup(t, "x"));   // 99
print(symtabLookup(t, "y"));   // 2 (inherited)
print(symtabLookupLocal(t, "x")); // 99
print(symtabLookupLocal(t, "y")); // nil
symtabExit(t);
print(symtabLookup(t, "x"));   // 1 (outer x visible again)
```

## Semantics

* **Lexical scoping.**  Lookups walk the frame chain from innermost
  to outermost.  Once `symtabExit` pops a frame, all of its
  bindings are gone.
* **Shadowing.**  `symtabInsert` in an inner frame creates a
  shadowing binding — `symtabLookup` returns the inner value until
  the inner frame is exited.
* **No mutation of outer frames from inner scopes.**  `symtabInsert`
  always writes to the *current* frame; it never mutates an outer
  binding.  To reassign an outer variable from an inner scope,
  the host must look up the right frame first.
* **`symtabShadow` vs `symtabInsert`.**  `symtabInsert` will
  *overwrite* an existing local binding, while `symtabShadow`
  refuses to insert if a local binding already exists.  The
  former matches the semantics of `let` re-declaration in some
  languages; the latter matches Rust-style "no shadowing of
  locals" patterns.

## Errors

All functions throw a plain `Error` on invalid input.  The Aether
evaluator converts thrown errors into panics.  Common error cases:

* Bad table object (not produced by `symtabNew`).
* Empty `name` string.
* Inserting or shadowing with no active frame.

## Performance

* **`symtabInsert` / `symtabLookupLocal`:**  O(1) amortised (Map
  ops).
* **`symtabLookup`:**  O(depth) worst case.
* **`symtabAll`:**  O(N log N) where N is the total number of
  visible bindings (sort step).
* **`symtabToString`:**  O(N log N) per frame plus output size.

## Tests

25 tests in `index.test.ts` cover construction, enter/exit,
insert/lookup/shadow semantics, depth tracking, the `symtabAll`
shadowing-and-sort behaviour, and validator errors.  Run them with:

```
bunx vitest run aether/stdlib/symtab
```

## Future work

A potential addition is *mutable* outer-frame assignment
(`symtabAssign(t, name, value)` — walk the chain and mutate the
first frame that has the binding, throwing if none does).  That
would mirror the evaluator's distinction between `let`
declarations (which create a new binding) and assignment
statements (which mutate an existing binding).
