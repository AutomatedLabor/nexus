# chinese_remainder.ae

Chinese Remainder Theorem (CRT). Solve a system of simultaneous
congruences

```
x ≡ r_1 (mod n_1)
x ≡ r_2 (mod n_2)
...
x ≡ r_k (mod n_k)
```

for `x`, where the `n_i` are pairwise coprime.

## What it does

1. **`ext_gcd(a, b)`** — extended Euclidean (reused from
   `euclid_extended.ae`).
2. **`mod_inv(a, m)`** — modular multiplicative inverse: the
   `e` in `[0, m)` with `a*e ≡ 1 (mod m)`. Computed via
   `ext_gcd`: if `gcd(a, m) = 1` and `a*x + m*y = 1`, then
   `x mod m` is the inverse.
3. **`combine_crt(r1, n1, r2, n2)`** — fold two congruences
   into one: given `x ≡ r1 (mod n1)` and `x ≡ r2 (mod n2)`,
   return `x ≡ r' (mod n1*n2)` where `r'` is the unique
   solution in `[0, n1*n2)`.
4. **`crt(residues, moduli)`** — fold the whole system by
   repeatedly applying `combine_crt` pairwise.
5. **Driver** — solves the headline system
   `x ≡ 2 (mod 3), x ≡ 3 (mod 5), x ≡ 2 (mod 7)` → `x = 23`,
   plus a 4-residue system.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/chinese_remainder.ae
```

## Key language features

- **Pairwise fold pattern** via `combine_crt` — turns the
  potentially-confusing multi-residue CRT formula into a
  simple accumulator loop.
- **`assert_eq(g, 1)`** — aborts if the moduli aren't
  pairwise coprime (which would make the system unsolvable
  for a unique `x`).
- **`while e < 0 { e += m }`** to normalize the modular
  inverse to `[0, m)` — handles the negative-x case that
  `ext_gcd` may produce.

## Expected output

```
== Chinese Remainder Theorem ==

system:
  x = 2 (mod 3)
  x = 3 (mod 5)
  x = 2 (mod 7)

solution: x = 23 (mod 105)

  23 mod 3 = 2  (expected 2)  [ok]
  23 mod 5 = 3  (expected 3)  [ok]
  23 mod 7 = 2  (expected 2)  [ok]

system #2 solution: x = 759 (mod 770)

All assertions passed.
```

## Design notes

- The headline case `x ≡ 2 (mod 3), x ≡ 3 (mod 5), x ≡ 2 (mod 7)`
  has the unique solution `x = 23 mod 105` (since
  `3 * 5 * 7 = 105`). The driver verifies `23 mod 3 = 2`,
  `23 mod 5 = 3`, `23 mod 7 = 2` explicitly.
- The 4-residue system `[1, 4, 3, 0] mod [2, 5, 7, 11]` has
  the unique solution `x = 759 mod 770`. Verify:
  `759 mod 2 = 1`, `759 mod 5 = 4`, `759 mod 7 = 3`,
  `759 mod 11 = 0`. ✓
- The CRT formula
  `x = sum_i r_i * (N/n_i) * inv(N/n_i, n_i) mod N`
  is mathematically elegant but awkward to implement
  directly because it requires computing `inv` for every
  term. The pairwise `combine_crt` fold is the cleaner
  engineering formulation.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
