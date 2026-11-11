# todo_cli.ae

A tiny in-memory todo list manager written in pure Aether. Each todo is a `Todo` struct, the collection is a flat array of records, and the program walks through a simulated session of adding, completing, and removing items.

## What it does

1. Declares `struct Todo { id: int, text: string, done: bool }`.
2. Implements four operations on an array of `Todo` values:
   - `add_todo(todos, text, next_id)` builds a `Todo` with `done: false` and pushes it onto the array.
   - `list_todos(todos)` prints each todo with a `[x]` (done) or `[ ]` (open) marker and a padded id.
   - `complete(todos, id)` flips `done` to `true` on the matching id; returns `false` if not found.
   - `remove(todos, id)` builds a filtered copy without the matching id.
3. Runs a small transcript: adds 4 todos, completes #2, attempts a bogus complete on #99, removes #1, completes #4, removes #3, then asserts the final state.

## Key language features

- **Struct definition and construction**: `Todo { id: ..., text: ..., done: false }` uses Aether's brace-style struct literals. Field assignment (`todos[i].done = true`) and field access (`t.id`) work as expected.
- **Arrays of structs**: typed with `[Todo]`. The empty-array initializer `[]` against a typed binding produces one inference warning (the empty literal gets a fresh element type variable that the checker can't unify with the annotation); the program still runs. This is a known v1 limitation.
- **Mutability**: the array contents are mutated by `push`; `done` flags are flipped via index+field assignment. The id counter `next_id` is a top-level `mut` integer bumped between calls.
- **String interpolation**: `f"  [{mark}] #{id_str}  {t.text}"` renders each row, with `mark` and `id_str` computed inline.
- **Conditional expressions**: `let mark = if t.done { "x" } else { " " };` — `if` is an expression in Aether.
- **Early return**: `complete` uses `return false;` on a missing id; `list_todos` uses `return;` to short-circuit the empty case.

## Notes on style

- `add_todo` returns the same array it was given (push mutates in place), so the caller's `todos = add_todo(...)` assignment is stylistic, not functional — it makes the operation chain read like a state-transition log.
- `remove` uses a manual `for` loop rather than the higher-order `filter` builtin, because `filter`'s type unification through a struct-typed array bound is brittle in v1.

