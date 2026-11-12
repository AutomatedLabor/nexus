# Aether stdlib — `bloom`

The `bloom` module implements a **Bloom filter**, a space-efficient
probabilistic data structure for set membership testing.  A Bloom
filter can tell you "this element is **definitely not** in the set"
(in zero false negatives) or "this element is **probably** in the
set" (with a tunable false-positive rate).  It's the right tool when
you want to skip a slow lookup for elements that definitely aren't
there — e.g., checking whether a URL has been crawled before
hitting the network, or whether a username is taken before
querying the database.

## Why a Bloom filter?

A Bloom filter represents a set of `n` elements in `m` bits
(typically `m ~ 10n` for a 1% false-positive rate) using `k` hash
functions.  To add an element, you set the `k` bits at positions
`hash_i(element) mod m`.  To query, you check the same `k` bits; if
all are set, the element is "probably in"; if any is unset, the
element is "definitely not in".  The catch: hashes can collide, so
the filter may report "probably in" for an element you never added
— but never the reverse.

## Construction

`bloom.new(expected, fp_rate)` creates a fresh Bloom filter sized
for `expected` elements with a target false-positive rate `fp_rate`
(default 0.01 = 1%).  The constructor computes the optimal bit
array size `m = -n·ln(p) / (ln 2)²` and the optimal hash count
`k = (m/n)·ln 2` from the standard formulas.  The bit array is
stored as a `Uint8Array` (8 bits per byte), so `m` is rounded up
to a multiple of 8.

```aether
let bf = bloom.bloomNew(1000)         // 1000 elements, 1% fp
let bf2 = bloom.bloomNew(1000, 0.001) // 1000 elements, 0.1% fp (more bits)
```

## Operations

`bloomAdd(bf, s)` sets the `k` bits for `s` and returns `bf`
(chainable).  `bloomContains(bf, s)` returns `true` if all `k` bits
are set (probably in) or `false` if any is unset (definitely not
in).  There are no false negatives — if `bloomContains` returns
`false`, `s` was definitely never added.

```aether
bloom.bloomAdd(bf, "apple")
bloom.bloomAdd(bf, "banana")
bloom.bloomContains(bf, "apple")   // true
bloom.bloomContains(bf, "cherry")   // false (definitely)
```

## Queries

`bloomFalsePositiveProb(bf)` computes the current false-positive
probability given the number of elements added, using the
standard formula `p ≈ (1 - e^(-kn/m))^k`.  As you add more
elements (past the design capacity), the fp rate climbs; this
function tells you when it's time to migrate to a larger filter.

`bloomCount(bf)` returns the number of elements added (the
filter's count, not the bit population).  `bloomCapacity(bf)`
returns the design capacity (the `expected` argument to
`bloomNew`).  `bloomHashFuncs(bf)` returns the number of hash
functions in use.

## Merging

`bloomMerge(a, b)` produces a new Bloom filter that is the union
of `a` and `b` (the bit-OR of the two bit arrays).  The two
filters must have the same `m` and `k` (use the same `expected`
and `fp_rate`).  The result represents the union of the two sets,
with the union's fp rate (approximately the maximum of the two
parents').

```aether
let a = bloom.bloomNew(100)
let b = bloom.bloomNew(100)
bloom.bloomAdd(a, "alpha")
bloom.bloomAdd(b, "beta")
let m = bloom.bloomMerge(a, b)
bloom.bloomContains(m, "alpha")  // true
bloom.bloomContains(m, "beta")   // true
```

## Implementation notes

The filter uses the Kirsch-Mitzenmacher double-hashing trick:
two independent hashes (`h1` = FNV-1a, `h2` = murmur-like) and
`k` derived hashes via `h_i(x) = h1(x) + i·h2(x)`.  This means
the cost of `k` hashes is just 2 actual hash computations plus
`k-1` cheap additions, instead of `k` independent hash
computations.  `k` is capped at 32 to keep hashing cheap.

The bit array is a `Uint8Array`; bits are accessed via
`bits[byteIdx] & (1 << bitIdx)` with `byteIdx = idx >>> 3` and
`bitIdx = idx & 7`.  This is the standard packed-bit layout and
minimizes memory use.

## When to use a Bloom filter vs a set

Use a Bloom filter when:

- The set is large (millions of elements), and you care about memory.
- False positives are tolerable (you'll do a slow confirmation
  lookup if the Bloom filter says "probably in").
- You only need membership testing — not iteration, not deletion.

Use `set` instead when:

- You need exact membership (no false positives).
- You need to iterate the elements.
- You need to delete elements.
- The set is small (Bloom's overhead isn't worth it).

## Common patterns

- **URL deduplication**: keep a Bloom filter of crawled URLs;
  before fetching, check the filter; if it returns false, fetch;
  if true, skip (with a small risk of skipping a fresh URL).
- **Username availability**: keep a Bloom filter of taken
  usernames; `contains(bf, candidate)` returning false means the
  candidate is definitely available; returning true means check
  the database.
- **Cache guard**: keep a Bloom filter of cache keys; if a key
  isn't in the filter, skip the cache lookup and go straight to
  the backing store.

The whole module is 8 functions, ~250 lines of TypeScript, no
dependencies.  Wired in by `registerAll` in `aether/stdlib/index.ts`.
