# bloom_filter.ae

A simple Bloom filter using `k` independent hash functions and a
bit array of size `m`. The filter supports `add(item)` (mark `k`
bits) and `contains(item)` (check `k` bits; false positives
possible, no false negatives). We hash strings with FNV-1a-style
mixing at different seed offsets to get `k` cheap
independent-ish hashes.

## What it does

1. **`repeat(n, v)`** — fresh array of `n` copies of `v`.
2. **`hash_str(s, seed, m)`** — FNV-1a-inspired polynomial hash
   with a per-call seed offset. The mask `0x7fffffff` keeps the
   hash within JS double-safe integer range; final result is
   `h % m`.
3. **`make_filter(m, k)`** — returns `(bits, m, k)` where `bits`
   is a 0/1 array of size `m` and `k` is the hash count.
4. **`add(filter, s)`** — for `i in [0, k)`, compute
   `idx = hash_str(s, 0x811c9dc5 + i * 2654435761, m)` and set
   `bits[idx] = 1`.
5. **`contains(filter, s)`** — for `i in [0, k)`, compute the
   same `idx`; if any `bits[idx] == 0`, return false. Return true
   only if all `k` bits are set.
6. **Driver** — builds a 64-bit filter, adds 3 items, probes 6
  strings, prints results. Then a 1024-bit / 4-hash filter with
  10 fruit names to confirm no false negatives.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/bloom_filter.ae
```

## Key language features

- **`charCode(s, i)`** — Aether builtin to get the numeric code
  of the `i`-th character. Used as input to the hash function.
- **Bitwise operators** `*`, `^`, `&` — Aether supports them.
  `& 0x7fffffff` masks to a 31-bit positive integer.
- **Tuple-typed state**: the filter is the 3-tuple
  `([int], int, int)`, threaded through every function.
- **`while (i < k) && all_set`** — short-circuits as soon as a
  missing bit is found, returning `false` early.

## Expected output

```
== Bloom filter ==

inserted: hello, world, aether

probe results:
  contains("hello") -> true  (maybe in set)
  contains("world") -> true  (maybe in set)
  contains("aether") -> true  (maybe in set)
  contains("missing") -> false  (definitely NOT in set)
  contains("world!") -> false  (definitely NOT in set)
  contains("Hello") -> false  (definitely NOT in set)

contains("missing") = false  (could be a false positive)

all 10 inserted items present (no false negatives): true

All assertions passed.
```

## Design notes

- The Bloom filter's defining property: **no false negatives**
  (every inserted item is always reported present) but possibly
  **false positives** (an uninserted item might happen to map to
  bits that other inserted items set). The driver asserts the
  no-false-negatives property for the stress test.
- The false-positive rate is approximately
  `(1 - e^(-k*n/m))^k`. With `m=64, k=3, n=3` we get ~`0.08`,
  so we shouldn't be surprised if "missing" comes back true.
  With `m=1024, k=4, n=10` we get ~`0.0001` — a much safer
  configuration.
- We use a single hash function with a different seed per `i`.
  This is the standard "k hashes from one hash" trick; for
  stronger guarantees you'd want `k` independent hashes.
