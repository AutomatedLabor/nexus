# bloom_filter_demo.ae

A Bloom filter using `k` independent hash functions and a bit array of size `m`. We add 100 items (the strings `"item0"` .. `"item99"`), then probe 10 of them and 10 not-in-the-set items, reporting the false-positive count.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`hash_str(s, seed, m)`** — FNV-1a-inspired polynomial hash with a per-call seed offset. The mask `0x7fffffff` keeps the hash within JS double-safe integer range; the final result is `h % m`.
3. **`make_filter(m, k)`** — returns `(bits, m, k)` where `bits` is a 0/1 array of size `m` and `k` is the hash count.
4. **`bit_index(s, i, m)`** — compute the `i`-th hash of `s` for `i` in `[0, k)`. Different `i` mix into the seed so each hash differs.
5. **`add(f, s)`** — set all `k` hashed bits to 1.
6. **`contains(f, s)`** — for `i in [0, k)`, check the `i`-th hashed bit; if any is 0, return false. Return true only if all `k` bits are set.
7. **Driver** — builds a 2048-bit / 6-hash filter, adds `"item0"` .. `"item99"`, probes 10 of the in-set items (multiples of 9), then probes `"missing0"` .. `"missing9"` and reports the false-positive count.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bloom_filter_demo.ae
```

## Key language features

- **`charCode(s, i)`** — Aether builtin to get the numeric code of the `i`-th character. Used as input to the hash function.
- **Bitwise operators** `*`, `^`, `&` — Aether supports them. `& 0x7fffffff` masks to a 31-bit positive integer.
- **Tuple-typed state** — the filter is the 3-tuple `([int], int, int)`, threaded through every function.
- **`while (i < k) && all_set`** — short-circuits as soon as a missing bit is found, returning `false` early.
- **`let mut` for mutable bindings** — `in_count` and `fp_count` need `let mut` so we can increment them inside the loop.
- **f-string interpolation** — `f"contains({s}) -> {str(r)}{tag}"` builds the probe line.

## Expected output

```
== Bloom filter demo (100 items, 10 probes) ==

added 100 items (item0 .. item99) to a 2048-bit / 6-hash filter

probe 10 in-set items (should all be true):
  contains(item0) -> true
  contains(item9) -> true
  contains(item18) -> true
  contains(item27) -> true
  contains(item36) -> true
  contains(item45) -> true
  contains(item54) -> true
  contains(item63) -> true
  contains(item72) -> true
  contains(item81) -> true
in-set hit count: 10/10 (must be 10 — no false negatives)

probe 10 not-in-set items (false positives possible):
  contains(missing0) -> false
  contains(missing1) -> false
  contains(missing2) -> false
  contains(missing3) -> false
  contains(missing4) -> false
  contains(missing5) -> false
  contains(missing6) -> false
  contains(missing7) -> false
  contains(missing8) -> false
  contains(missing9) -> false
false positives: 0/10

All assertions passed.
```

## Design notes

- **No false negatives**: a Bloom filter always returns `true` for items that were added (every hashed bit was set). The driver asserts `in_count == 10` to verify this property.
- **False positives are random**: the not-in-set probe results are not guaranteed to all be `false` — they're random depending on hash collisions. With 100 items in a 2048-bit / 6-hash filter, the expected false-positive rate is approximately `(1 - e^(-k*n/m))^k = (1 - e^(-6*100/2048))^6 ≈ 0.0008`. On the 10 probes you'd expect 0.008 false positives, so 0/10 is the most likely outcome.
- **Hash function choice**: we use a single FNV-1a-style hash with a different seed per `i` — the standard "k hashes from one hash" trick. For stronger guarantees you'd want `k` independent hash functions.
- **`int(p * 9)` for index**: we probe every 9th item (`item0`, `item9`, `item18`, ...) to spread the probes across the inserted range.
- **Avoids for-loop-scope quirk**: every loop is `while i < n { ...; i = i + 1 }`.
