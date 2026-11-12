# aether-bits-extra

> Extra bit operations for the Aether language — 12 pure functions covering lookup-table popcount, parity, bit-reversal, bit-count helpers (bitOnes / bitZeros), bit-position extraction, range extract / insert / delete, left / right rotation within an arbitrary bit-width, and a general-purpose bitMask generator.

`aether-bits-extra` is a user-space Aether package for the bit-manipulation primitives that show up in systems programming, hashing, error-correction codes, and bitmap-indexed data structures. Aether's core ships no bit-ops builtins at all (other than the operators `& | ^ ~ << >>` themselves); this package builds the higher-level operations on top.

## Why a "bits-extra" package?

Aether's core arithmetic builtins (`+`, `-`, `*`, `/`, `%`) cover ordinary math; the bit-level operators (`& | ^ ~ << >>`) are also built in. But the higher-level "extract a 3-bit field at position 2", "rotate the low 8 bits left by 1", "count the set bits", "find the lowest set bit" — these aren't built in, and writing them inline every time gets tedious fast.

This package collects the common 32-bit bit-twiddling operations:

- **Popcount via lookup table** — the fastest non-instruction way to count set bits; build a 256-entry table once, then do 4 lookups for a 32-bit int.
- **Parity** — popcount mod 2; useful for error-detection codes.
- **Bit-reversal** — needed for FFT-style butterfly operations and CRC computation.
- **Bit position** — the position of the lowest set bit; the foundation for sparse-bitset traversal.
- **Range extract / insert / delete** — the canonical "manipulate a field of bits at a known position" trio.
- **Rotation** — needed for many cryptographic primitives (MD5, SHA-1, SHA-256) and for circular-buffer addressing.
- **Mask generation** — a one-line utility that's used by half the other functions internally.

## API

All 12 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they never mutate their inputs and operate on 32-bit integers (JavaScript's bitwise ops are 32-bit). Bit positions are 0-based (bit 0 is the LSB). Iteration uses `while` with explicit indices to avoid the v1 evaluator's for-loop-scope quirk.

### Popcount / parity

| Function | Signature | Description |
| --- | --- | --- |
| `popcountLookup(x)` | `(int) -> int` | Population count (number of set bits) of `x` via a 256-entry lookup table. 4 lookups for a 32-bit int. |
| `parity(x)` | `(int) -> int` | `popcountLookup(x) % 2` — 0 for even, 1 for odd. |

`popcountLookup` builds a 256-entry table at call time, then walks the four bytes of `x` (using `& 255` and `int(/256)` to extract each byte) and sums the table entries. The table construction is `O(256)` per call, which is acceptable for a small library; a future version may cache the table via a `pub const` lazily-initialized via `pub use`.

### Reverse

| Function | Signature | Description |
| --- | --- | --- |
| `reverseBits(x, n)` | `(int, int) -> int` | Reverse the low `n` bits of `x`. Bits above `n` are zeroed. Panics if `n < 0` or `n > 32`. |

`reverseBits` walks bit-by-bit: for each of `n` iterations, it shifts the result left by 1 and ORs in the LSB of the current value, then shifts the value right by 1. This is `O(n)` — there's a faster `O(log n)` variant that swaps byte-pairs, then nibble-pairs, then bit-pairs, but the `O(n)` version is the most readable for textbook use.

### Bit-count helpers

| Function | Signature | Description |
| --- | --- | --- |
| `bitOnes(x)` | `(int) -> int` | Alias for `popcountLookup`. |
| `bitZeros(x, n)` | `(int, int) -> int` | Count of zero bits in the low `n` bits of `x`. Computed as `n - popcountLookup(x & ((1<<n) - 1))`. |

`bitOnes` is provided as an alias because some code reads better with "ones" / "zeros" naming (e.g. "the bit count of the mask of ones and the bit count of the mask of zeros should sum to the width").

### Position

| Function | Signature | Description |
| --- | --- | --- |
| `bitPosition(x)` | `(int) -> int` | Position of the lowest set bit in `x` (0-based), or -1 if `x == 0`. Equivalent to `log2(x & -x)` for nonzero `x`. |

`bitPosition` walks the bits LSB-to-MSB until it finds a set bit. This is `O(popcount)` on average for sparse inputs and `O(log n)` in the worst case. A faster variant uses `x & -x` (which isolates the lowest set bit) and then a single popcount-style lookup, but the linear walk is the most readable.

### Range operations

| Function | Signature | Description |
| --- | --- | --- |
| `bitRange(x, start, len_)` | `(int, int, int) -> int` | Extract the `len_` bits of `x` starting at bit position `start`. Result is right-justified (extracted bits occupy positions 0..len_-1). |
| `bitInsert(x, start, len_, value)` | `(int, int, int, int) -> int` | Return `x` with the `len_` bits at position `start` replaced by the low `len_` bits of `value`. |
| `bitDelete(x, start, len_)` | `(int, int, int) -> int` | Return `x` with the `len_` bits at position `start` cleared to 0. |

`bitRange` is `(x >> start) & ((1 << len_) - 1)` — the canonical extraction. `bitInsert` clears the field with `x & ~(mask << start)` then ORs in the value: `cleared | ((value & mask) << start)`. `bitDelete` is just the clearing step (`x & ~(mask << start)`). Together they cover the three operations you do on bit fields: read, write, clear.

### Rotation

| Function | Signature | Description |
| --- | --- | --- |
| `bitRotateLeft(x, n, width)` | `(int, int, int) -> int` | Rotate the low `width` bits of `x` left by `n` positions. Panics if `width < 1` or `width > 32` or `n < 0`. |
| `bitRotateRight(x, n, width)` | `(int, int, int) -> int` | Rotate the low `width` bits of `x` right by `n` positions. Inverse of `bitRotateLeft`. |

Rotation within a fixed `width` is what cryptographic primitives need: rotating a 32-bit integer left by 1 keeps all 32 bits, while a plain `<<` would shift the high bit out. The implementation computes `n mod width` first (so `n >= width` works), then splits the rotation into a left shift (which leaves the high bits to be wrapped) and a right shift of the wrapped bits.

`bitRotateRight(x, n, width)` is implemented as `bitRotateLeft(x, width - (n mod width), width)`, which is the standard identity.

### Mask generation

| Function | Signature | Description |
| --- | --- | --- |
| `bitMask(start, len_)` | `(int, int) -> int` | A mask with `len_` consecutive 1-bits starting at bit position `start`, all other bits 0. `((1 << len_) - 1) << start`. |

`bitMask` is used by `bitRange`, `bitInsert`, `bitDelete`, `bitZeros` internally; it's exposed as a `pub fn` because callers frequently need masks directly (e.g. for `&` against a constant).

## How to use

### As a dependency

```toml
[dependencies]
aether-bits-extra = "0.1.0"
```

```aether
import { popcountLookup, bitRange, bitInsert, bitRotateLeft } from "aether-bits-extra";

let x = 0b10110110;
print(popcountLookup(x));          // 5
print(bitRange(x, 2, 3));          // 1 (bits 2..4 = 0b001)
print(bitInsert(0, 4, 4, 0b1010)); // 0b10100000 (160)
print(bitRotateLeft(0b1010, 1, 4)); // 0b0101 (5)
```

### Running the test suite

```sh
aether test aether-packages/aether-bits-extra/tests
# PASS aether-packages/aether-bits-extra/tests/tests.ae
# 1 passed, 0 failed
```

The test file contains 25+ `assert_eq` cases covering every `pub fn`, including edge cases (zero, all-ones, full-width rotations, insert/delete at field boundaries).

### Running the example

```sh
aether run aether-packages/aether-bits-extra/examples/example.ae
```

## Design notes

### Why 32-bit and not 64-bit?

Aether's bitwise operators (`& | ^ ~ << >>`) are JavaScript's, and JavaScript's bitwise ops coerce to 32-bit signed integers. So `<<` and `>>` work on 32-bit values. Operating on 64-bit values would require building a `BigInt` abstraction, which is out of scope for this package. Callers who need 64-bit bit-ops can compose two 32-bit values; a future `aether-bits-64` package could provide that.

### Why a lookup table for popcount?

There are three reasonable popcount implementations:

1. **Bit-by-bit walk.** `while v != 0 { c += v & 1; v >>= 1; }` — `O(bits)` per call. Simplest, slowest.
2. **Brian Kernighan's trick.** `while v != 0 { c += 1; v &= v - 1; }` — `O(popcount)` per call. Faster for sparse inputs, but still loop-bound.
3. **Lookup table.** 4 lookups per 32-bit int. The fastest in pure-Aether (no instruction-level popcount), at the cost of building the 256-entry table once.

The package ships option 3 for the public `popcountLookup` and uses option 2 (Kernighan's trick) internally to *build* the table. This gives callers a fast path while keeping the implementation pure-Aether.

### Why `bitRotateLeft` and `bitRotateRight` with a `width` parameter?

Most languages' rotation primitives operate on a fixed word size (32 or 64 bits). Aether's `int` doesn't have a fixed bit-width — it's a JS `number`, which behaves as 32-bit for bitwise ops but can store much larger values. So rotation has to take a `width` parameter that says "rotate within the low `width` bits, leave the rest alone". This matches what callers typically want (rotate within a 4-bit nibble, an 8-bit byte, a 16-bit half-word, a 32-bit word), and it's the same convention used in cryptographic primitives' pseudocode.

## Future work

- A `bits-64` companion package operating on `[int, int]` pairs (lo, hi).
- A `grayCode(x)` and `grayDecode(g)` pair for Gray-code conversion.
- A `ctz(x)` (count trailing zeros) and `clz(x)` (count leading zeros) — the standard "find first set / find first zero" primitives.
- A `BitSet` ADT backed by a sparse array of integers, with `add`, `remove`, `contains`, `union`, `intersection`, `difference` — the natural follow-up to this package.

## License

MIT — same as the Aether language.
