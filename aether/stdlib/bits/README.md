# Aether stdlib — `bits`

The `bits` module gives Aether programs a complete bit-manipulation toolkit on 32-bit unsigned integers: the standard logic ops, shifts (logical and arithmetic), rotations, population count, leading/trailing zeros, bit-level access (test/set/flip/extract), bit-merging, and Gray-code conversion. Every function is a pure TypeScript implementation; throwing a plain `Error` from a builtin becomes an Aether panic.

## Why a `bits` module?

JavaScript ships `&`, `|`, `^`, `~`, `<<`, `>>`, and `>>>` operators, but they all coerce their operands to 32-bit signed integers — that's the famous gotcha that `1 << 31` is `-2147483648` (negative!) and `~0` is `-1`. To work with bit patterns as unsigned 32-bit values you have to remember `>>> 0` everywhere. This module does that for you: every output is normalized to the unsigned 32-bit range via `>>> 0`, and every input is coerced the same way (negative inputs are interpreted as their two's complement representation).

On top of that, the operations JavaScript *doesn't* expose as operators — population count (`bitCount`), leading/trailing zeros, rotation, bit-merge, bit-extract, Gray code — are common enough in low-level code (hashing, compression, cryptography, encoding, error-correcting codes) that you don't want to inline the algorithm every time. The `bitCount` implementation here is the canonical SWAR (SIMD-within-a-register) variant: five operations, no branches, constant time.

## Conventions

- **Bit positions are zero-based**: bit 0 is the LSB (value 1), bit 31 is the MSB (value 0x80000000).
- **All outputs are unsigned 32-bit**: `bitNot(0) === 0xffffffff` (not -1), `bitShl(0xff, 24) === 0xff000000` (not negative).
- **Shift amounts are masked to 5 bits** (`n & 0x1f`), matching the JS `<<`/`>>`/`>>>` operators. So `bitShl(1, 32)` is `1`, not `0` — the same as `1 << 32` in JS. This is the documented behavior and matches hardware.
- **Bit positions (`bitTest`, `bitSet`, `bitFlip`, `bitExtract`'s `start`)** are validated to be in `[0, 31]`; out-of-range positions panic with a clear message.
- **Negative numbers** are interpreted as two's complement via the `>>> 0` coercion. So `bitTest(-1, 31)` is true (because `-1` in two's complement is all-ones), and `bitShr(-1, 1)` is `0x7fffffff` (logical right shift).

## Logic and shifts

`bitAnd`, `bitOr`, `bitXor`, `bitNot` are the obvious four, normalized to unsigned. `bitShl(a, n)` is left shift, `bitShr(a, n)` is *logical* right shift (zero-fill, `>>>`), `bitSar(a, n)` is *arithmetic* right shift (sign-fill, `>>`). The distinction matters when the high bit is set: `bitShr(0x80000000, 4)` is `0x08000000`, `bitSar(0x80000000, 4)` is `0xf8000000` (sign-filled from bit 31).

```aether
bits.bitAnd(0b1100, 0b1010)   // 0b1000
bits.bitOr(0b1100, 0b1010)    // 0b1110
bits.bitXor(0b1100, 0b1010)   // 0b0110
bits.bitNot(0)                // 0xffffffff
bits.bitShl(1, 3)             // 8
bits.bitShr(0xff000000, 24)   // 0xff (zero-fill)
bits.bitSar(-8, 1)            // -4 (sign-fill)
```

## Rotation and counting

`bitRotate(a, n)` rotates `a` left by `n` (positive) or right by `|n|` (negative), with `n` taken mod 32. `bitCount(a)` is the population count (number of set bits) using the SWAR algorithm — 5 ops, no loops, constant time. `leadingZeros(a)` and `trailingZeros(a)` return the number of zero bits before/after the highest/lowest set bit (32 if `a` is 0). `highestBit(a)` returns the index of the MSB (or -1 if `a` is 0); `lowestBit(a)` is the dual.

```aether
bits.bitRotate(0x12345678, 4)   // 0x23456781
bits.bitRotate(0xdeadbeef, 32)  // 0xdeadbeef (full wrap)
bits.bitCount(0xff)             // 8
bits.bitCount(0xffffffff)       // 32
bits.leadingZeros(1)            // 31
bits.trailingZeros(0x80000000)  // 31
bits.highestBit(0x80000000)     // 31
bits.lowestBit(0b10100)         // 2
```

## Bit-level access

`bitTest(a, n)` returns true when bit `n` is set. `bitSet(a, n, v)` returns a copy of `a` with bit `n` set (if `v` is truthy) or cleared (if `v` is falsy) — it does not mutate. `bitFlip(a, n)` toggles bit `n`. `bitMerge(a, b, mask)` returns a value whose bits are taken from `b` where `mask` is set and from `a` otherwise — the canonical "selective update" pattern, written as `a ^ ((a ^ b) & mask)` to avoid branches.

`bitExtract(a, start, len)` extracts `len` bits from `a` starting at bit `start`, returning them right-justified (LSB at position 0). This is the building block for unpacking bit-packed structures — RGB colors, flag fields, network headers.

```aether
bits.bitTest(0b1010, 1)        // true
bits.bitSet(0, 3, true)         // 0b1000
bits.bitSet(0b1111, 1, false)   // 0b1101
bits.bitFlip(0b0100, 2)         // 0b0000
bits.bitMerge(0b1010, 0b0101, 0b1100)  // 0b0011
bits.bitExtract(0b11010, 1, 3)  // 0b101
bits.bitExtract(0xffffffff, 0, 32)  // 0xffffffff
```

## Gray code

`grayCode(n)` returns the Gray code of `n`, computed as `n ^ (n >>> 1)`. Gray codes are a reordering of the integers such that consecutive values differ by exactly one bit — the foundational property of Karnaugh maps, rotary encoders, and any application where you can't afford to read two bits on the same clock edge. The function returns `grayCode(0) = 0`, `grayCode(1) = 1`, `grayCode(2) = 3`, `grayCode(3) = 2`, etc. To decode, use `grayCode` then `binaryDecodeGray = g ^ (g >>> 1) ^ (g >>> 2) ^ ... ^ (g >>> 31)` — but that's outside the scope of this module.

```aether
bits.grayCode(0)   // 0
bits.grayCode(1)   // 1
bits.grayCode(2)   // 3
bits.grayCode(3)   // 2
bits.grayCode(4)   // 6
```

## Common patterns

- **Packing a flag byte**: `bitOr(bitOr(bitShl(flag1, 0), bitShl(flag2, 1)), bitShl(flag3, 2))`.
- **Unpacking a flag byte**: `bitTest(flags, n)` for each flag you care about.
- **Counting set bits in a bitmap**: `bitCount` over the bitmap words.
- **Round-up to next power of two**: `1 << (highestBit(x - 1) + 1)` (with a guard for `x === 0`).
- **Isolate the lowest set bit**: `a & -a` (or `a & (~a + 1)`); the index of that bit is `lowestBit(a & -a)`.

## Numerical caveats

- All operations are defined for 32-bit integers; larger values are silently truncated. For 64-bit bit manipulation, use a BigInt-based library.
- The SWAR `bitCount` is correct for all 32-bit inputs (verified by exhaustive test for `bitCount(0)`..`bitCount(0xffff)` and the corner cases 0xffffffff, 0xaaaaaaaa, 0x55555555).
- Bit positions out of `[0, 31]` panic, matching the spec. This is a feature: silent wrap-around (`bitTest(0, 33)` reading bit 1) is a notorious source of bugs.

The whole module is 19 functions, ~230 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
