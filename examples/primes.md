# primes.ae

A small Aether program that implements the **Sieve of Eratosthenes** and
prints every prime up to 50, 100, and 200.

## What it does

`sieve_of_eratosthenes(n)` returns an array of every prime in `[2, n]`:

1. Build a length-`(n+1)` array `flags` where `flags[k] = true` initially
   for every index. Clear `flags[0]` and `flags[1]` since 0 and 1 are not
   primes.
2. For each candidate `p` starting at 2, if `flags[p]` is still true,
   clear every multiple of `p` starting at `p * p` (smaller multiples of
   `p` were already cleared by smaller primes).
3. Collect the surviving indices — those still flagged `true` — into the
   result array.

The driver `print_primes` calls the sieve, then renders the resulting
prime list as a single comma-separated line and reports the count.

## How to run

```bash
bun /tmp/verify_examples.ts   # verifies all 12 examples at once
```

## Key language features

- `let mut flags = []` — empty array initialized without a type
  annotation; `push` extends it. (Annotated empty arrays like
  `let x: [int] = []` would also work, but the un-annotated form is the
  simplest.)
- `push(arr, v)` — the inline array-append builtin. Aether does not have
  an `arr.push(v)` method form; the free function is the canonical form.
- `arr[i] = v` — index-assign into an existing array element.
- Nested `while` loops with a simple `<=` comparison and an explicit
  `multiple = multiple + p` increment.
- `if cond { ... };` — when an `if` block is a non-trailing statement, it
  must be followed by `;`.
- `for p in primes { ... }` — iterating over an array of ints.
- String concatenation with `+` (works because at least one side is a
  string) and the `str(int)` builtin to convert ints to strings.
- `f"..."` interpolation, e.g. `f"Primes up to {up_to}:"` and
  `f"  (count = {len(primes)})"`.

## Expected output (excerpt)

```
== Sieve of Eratosthenes ==

Primes up to 50:
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47
  (count = 15)

Primes up to 100:
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
  (count = 25)

Primes up to 200:
  2, 3, 5, 7, 11, 13, 17, 19, 23, ... 191, 193, 197, 199
  (count = 46)
```

## Design notes

- The outer "clear multiples" loop runs while `p * p <= n`. This is the
  standard optimization: any composite `c ≤ n` has a prime factor `≤ √n`,
  so we only need to sieve with primes up to `√n`.
- We start the inner "clear multiples" loop at `p * p` rather than `2p`
  because smaller multiples of `p` were already cleared by `p`'s prime
  predecessors (e.g. when we sieve with 5, the multiples 10, 15, 20 were
  already cleared by 2 and 3 — only `5 * 5 = 25` is new).
- We use a `first : bool` flag instead of an index check to decide
  whether to insert a leading comma. Aether's `+` on strings is plain
  concatenation; there's no `join` builtin in the inline set, so we
  build the comma-separated string manually.
