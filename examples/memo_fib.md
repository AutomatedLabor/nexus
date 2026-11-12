# memo_fib.ae

Memoized Fibonacci using parallel `(keys, values)` arrays as a
poor man's hash map. The memo persists across calls so the
second invocation of `fib(20)` is essentially a lookup.

## What it does

1. **`find(key)`** — linear search the `keys` array for `key`;
   return its index, or -1.
2. **`fib(n)`** — look up `n` in the memo; if missing, recurse
   `fib(n-1) + fib(n-2)`, store the result, and return it.
3. **Driver** — computes `fib(0) .. fib(35)` and asserts against
   known values.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/memo_fib.ae
```

## Key language features

- **Module-level `let`** for the persistent memo (`keys`,
  `vals`) — both initialised with the two base cases 0 and 1.
- **`push`** to append to the parallel arrays.
- **`while` loops** for the linear search (sidesteps the
  for-loop-scope quirk).
- **Recursion** in `fib` — the evaluator has tail-call
  optimisation, but Fibonacci is not tail-recursive, so each
  call adds a stack frame.

## Why parallel arrays?

A real stdlib-wired environment would use the stdlib `map`
(`mapNew`/`mapSet`/`mapGet`/`mapHas`). The v1 evaluator's
`compileAndRun` (used by the verify harness) only wires the
inline builtins, so `mapNew` is unavailable. Parallel arrays
are the simplest substitute — O(n) lookup, but n is small
(less than 50 distinct arguments across `fib(0) .. fib(35)`).

## Expected output

```
== Memoized Fibonacci ==

fib(0)  = 0
fib(1)  = 1
fib(2)  = 1
fib(10) = 55
fib(20) = 6765
fib(30) = 832040
fib(35) = 9227465

All assertions passed.
```

## Design notes

- Naïve (non-memoized) Fibonacci is O(2^n) — `fib(35)` would
  take ~30 million recursive calls. The memoized version is
  O(n) — each `fib(k)` is computed once, looked up thereafter.
- The memo survives across calls because `keys` and `vals`
  are module-level `let` bindings. This is a "global"
  memo; a real implementation would encapsulate it in a
  closure or a struct field.
- Lookup is O(n) — for large n, switch to a 2D array indexed
  by argument (see `ackermann_memo.ae` for that pattern).
