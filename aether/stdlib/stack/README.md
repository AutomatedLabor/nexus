# Aether stdlib — `stack`

A simple **LIFO stack** backed by a dynamic array. Elements enter
and leave at the top — the canonical "last in, first out" data
structure.

## Why a stack?

Stacks are the workhorse of recursion, parsing, and backtracking.
Real-world uses:

- **Expression evaluation**: Shunting-yard algorithm converts infix
  to postfix; postfix evaluation pops operands, applies the
  operator, pushes the result.
- **Function call frames**: every programming language runtime
  uses a call stack — each function's locals live in a stack frame.
- **Backtracking**: depth-first search, the classic "try this
  branch; if it fails, undo and try the next one". The stack holds
  the trail of decisions.
- **Undo / redo**: each user action pushes a record; undo pops it
  and pushes it on the redo stack.
- **Bracket / parenthesis matching**: push on open, pop on close,
  verify the kinds match.
- **Reversal**: push every element, then pop them all — output
  comes out in reverse order.
- **Browser back button history**: each page visit pushes the
  previous URL; back pops and navigates.

A stack is the simplest dynamic data structure — a dynamic array
with `push` (to the back) and `pop` (from the back) is a complete
implementation. This module wraps that with type checks and a
chainable API.

## Construction

```typescript
import * as Stk from "aether/stdlib/stack";

const s = Stk.stkNew();
Stk.stkPush(s, "a");
Stk.stkPush(s, "b");
Stk.stkPush(s, "c");
// Now: bottom -> a, b, c <- top
Stk.stkPop(s);   // -> "c"
Stk.stkPeek(s);  // -> "b"
```

`stkNew` returns a fresh empty stack. `stkPush(s, x)` adds `x` to
the top and returns the stack (chainable). `stkFromArr(xs)` builds
a stack from an array, copying the input (caller mutations don't
leak in). The first element of the input becomes the bottom; the
last becomes the top.

## Core operations

- `stkPush(s, x)` — append `x` to the top. O(1) amortised.
- `stkPop(s)` — remove and return the top. Returns `undefined`
  if the stack is empty. O(1) amortised.
- `stkPeek(s)` — read the top without removing it. O(1).
- `stkSize(s)` — number of elements. O(1).
- `stkEmpty(s)` — true when size is 0. O(1).
- `stkClear(s)` — empty the stack; chainable. O(1).

`stkPop` does NOT panic on an empty stack (it returns
`undefined`). If your domain treats `undefined` as a valid stack
element, check `stkEmpty` first.

## Conversion and inspection

- `stkToArray(s)` — a fresh array snapshot of the stack's
  contents, bottom to top. Does not mutate the stack.
- `stkToString(s)` — a human-readable dump, e.g. `Stack[1, 2, 3]`
  (bottom first, top last). Elements are JSON-stringified so
  nested objects render safely.

## Performance

| Operation | Amortised | Worst-case (single call) |
|-----------|-----------|--------------------------|
| `stkNew` | O(1) | O(1) |
| `stkPush` | O(1) | O(1) amortised; rare O(n) resize |
| `stkPop` | O(1) | O(1) amortised; rare O(n) shrink |
| `stkPeek` | O(1) | O(1) |
| `stkSize` / `stkEmpty` | O(1) | O(1) |
| `stkClear` | O(1) | O(1) |
| `stkToArray` | O(n) | O(n) |
| `stkFromArr` | O(n) | O(n) |
| `stkToString` | O(n) | O(n) |

## Worked example: balanced parentheses checker

```typescript
const s = Stk.stkNew();
const input = "((a+b)*(c-d))";
let balanced = true;
for (const ch of input) {
  if (ch === "(") Stk.stkPush(s, "(");
  else if (ch === ")") {
    if (Stk.stkEmpty(s)) { balanced = false; break; }
    Stk.stkPop(s);
  }
}
// balanced === true here iff parens matched AND stack is empty
```

The pattern generalises to multi-character brackets (`{}`, `[]`)
— just push the opening kind on the stack and check that the pop
returns the matching kind.

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| `stkNew` | `() -> Stack` | Create a fresh empty LIFO stack. |
| `stkPush` | `(s, x) -> Stack` | Push `x` to the top; chainable. |
| `stkPop` | `(s) -> any?` | Remove and return the top element, or `undefined` if empty. |
| `stkPeek` | `(s) -> any?` | Read the top element without removing. |
| `stkSize` | `(s) -> int` | Number of elements. |
| `stkEmpty` | `(s) -> bool` | True when empty. |
| `stkClear` | `(s) -> Stack` | Empty the stack; chainable. |
| `stkToArray` | `(s) -> [any]` | Fresh snapshot, bottom to top. |
| `stkFromArr` | `(xs) -> Stack` | Build from an array (first becomes bottom). |
| `stkToString` | `(s) -> string` | Human-readable rendering. |

## Validation

All functions throw a plain `Error` on invalid input (non-stack
object, missing fields). The Aether evaluator converts thrown
errors into Aether panics.
