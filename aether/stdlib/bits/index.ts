/**
 * Aether stdlib — `bits` module.
 *
 * Bit-manipulation primitives on 32-bit unsigned integers (JS `>>>` domain).
 * Inputs are coerced to the 32-bit unsigned range via `>>> 0`; negative
 * inputs are interpreted as two's complement via that same coercion.
 *
 * Every function panics with a clear message on non-number or non-finite
 * input.  Bit positions are zero-based (bit 0 is the LSB).
 */

// ---------------------------------------------------------------------------
// Logic & shifts
// ---------------------------------------------------------------------------

export function bitAnd(a: number, b: number): number {
  return (toU32(a, "bitAnd") & toU32(b, "bitAnd")) >>> 0;
}
export function bitOr(a: number, b: number): number {
  return (toU32(a, "bitOr") | toU32(b, "bitOr")) >>> 0;
}
export function bitXor(a: number, b: number): number {
  return (toU32(a, "bitXor") ^ toU32(b, "bitXor")) >>> 0;
}
/** Bitwise NOT within 32-bit unsigned range: returns (~a) mod 2^32. */
export function bitNot(a: number): number {
  return (~toU32(a, "bitNot")) >>> 0;
}

/** Left shift: a << n (n is masked to 5 bits to match JS `<<`). */
export function bitShl(a: number, n: number): number {
  return (toU32(a, "bitShl") << toShift(n, "bitShl")) >>> 0;
}
/** Logical right shift: a >>> n (zero-fills). */
export function bitShr(a: number, n: number): number {
  return toU32(a, "bitShr") >>> toShift(n, "bitShr");
}
/** Arithmetic right shift: a >> n (sign-fills from the MSB of the 32-bit value). */
export function bitSar(a: number, n: number): number {
  return toS32(a, "bitSar") >> toShift(n, "bitSar");
}

/** Rotate a 32-bit value left by `n` (n mod 32). */
export function bitRotate(a: number, n: number): number {
  const x = toU32(a, "bitRotate");
  const k = ((toShift(n, "bitRotate") % 32) + 32) % 32;
  if (k === 0) return x >>> 0;
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

// ---------------------------------------------------------------------------
// Counting & locating
// ---------------------------------------------------------------------------

/** Population count (number of 1 bits). */
export function bitCount(a: number): number {
  let x = toU32(a, "bitCount");
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return ((x * 0x01010101) >>> 24) & 0x3f;
}

/** Number of leading zeros in the 32-bit representation. */
export function leadingZeros(a: number): number {
  const x = toU32(a, "leadingZeros");
  if (x === 0) return 32;
  let n = 0;
  let v = x;
  // Binary search for the highest set bit.
  if ((v & 0xffff0000) === 0) n += 16, v <<= 16;
  if ((v & 0xff000000) === 0) n += 8, v <<= 8;
  if ((v & 0xf0000000) === 0) n += 4, v <<= 4;
  if ((v & 0xc0000000) === 0) n += 2, v <<= 2;
  if ((v & 0x80000000) === 0) n += 1;
  return n;
}

/** Number of trailing zeros in the 32-bit representation. */
export function trailingZeros(a: number): number {
  const x = toU32(a, "trailingZeros");
  if (x === 0) return 32;
  let n = 0;
  let v = x;
  if ((v & 0x0000ffff) === 0) n += 16, v >>>= 16;
  if ((v & 0x000000ff) === 0) n += 8, v >>>= 8;
  if ((v & 0x0000000f) === 0) n += 4, v >>>= 4;
  if ((v & 0x00000003) === 0) n += 2, v >>>= 2;
  if ((v & 0x00000001) === 0) n += 1;
  return n;
}

/** Index of the highest set bit (31 for MSB), or -1 if input is 0. */
export function highestBit(a: number): number {
  const x = toU32(a, "highestBit");
  if (x === 0) return -1;
  return 31 - leadingZeros(x);
}

/** Index of the lowest set bit (0 for LSB), or -1 if input is 0. */
export function lowestBit(a: number): number {
  const x = toU32(a, "lowestBit");
  if (x === 0) return -1;
  return trailingZeros(x);
}

// ---------------------------------------------------------------------------
// Bit-level access
// ---------------------------------------------------------------------------

/** True when bit at position `n` of `a` is set. */
export function bitTest(a: number, n: number): boolean {
  const x = toU32(a, "bitTest");
  const p = toPos(n, "bitTest");
  return ((x >>> p) & 1) === 1;
}

/** Set/clear bit `n` of `a` based on `v` (truthy = set, falsy = clear). */
export function bitSet(a: number, n: number, v: any): number {
  const x = toU32(a, "bitSet");
  const p = toPos(n, "bitSet");
  if (v) return (x | (1 << p)) >>> 0;
  return (x & ~(1 << p)) >>> 0;
}

/** Flip (toggle) bit `n` of `a`. */
export function bitFlip(a: number, n: number): number {
  const x = toU32(a, "bitFlip");
  const p = toPos(n, "bitFlip");
  return (x ^ (1 << p)) >>> 0;
}

/** Bit-merge: where mask bit is set, take from b; otherwise take from a. */
export function bitMerge(a: number, b: number, mask: number): number {
  const A = toU32(a, "bitMerge");
  const B = toU32(b, "bitMerge");
  const M = toU32(mask, "bitMerge");
  return (A ^ ((A ^ B) & M)) >>> 0;
}

/** Extract `len` bits from `a` starting at bit `start`.  Returns the field,
 *  right-justified (LSB at position 0). */
export function bitExtract(a: number, start: number, len: number): number {
  const x = toU32(a, "bitExtract");
  const s = toPos(start, "bitExtract");
  const l = toLen(len, "bitExtract");
  if (l === 0) return 0;
  if (l >= 32) {
    // Avoid shifting by 32 (undefined behavior in JS).  When start=0 we want
    // the full 32 bits, so return x unchanged (normalized to unsigned).
    if (s === 0) return x >>> 0;
    return ((x >>> s) & (0xffffffff >>> (32 - l))) >>> 0;
  }
  const mask = (1 << l) - 1;  // works for l in [1,31]
  return (x >>> s) & mask;
}

// ---------------------------------------------------------------------------
// Code conversion
// ---------------------------------------------------------------------------

/** Convert `n` to its Gray code (n ^ (n >> 1)). */
export function grayCode(n: number): number {
  const x = toU32(n, "grayCode");
  return (x ^ (x >>> 1)) >>> 0;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "bits",
  fns: [
    { name: "bitAnd", sig: "(a: int, b: int) -> int", desc: "Bitwise AND (32-bit unsigned)." },
    { name: "bitOr", sig: "(a: int, b: int) -> int", desc: "Bitwise OR (32-bit unsigned)." },
    { name: "bitXor", sig: "(a: int, b: int) -> int", desc: "Bitwise XOR (32-bit unsigned)." },
    { name: "bitNot", sig: "(a: int) -> int", desc: "Bitwise NOT (~a) in 32-bit unsigned range." },
    { name: "bitShl", sig: "(a: int, n: int) -> int", desc: "Left shift a << n." },
    { name: "bitShr", sig: "(a: int, n: int) -> int", desc: "Logical right shift a >>> n (zero-fill)." },
    { name: "bitSar", sig: "(a: int, n: int) -> int", desc: "Arithmetic right shift a >> n (sign-fill)." },
    { name: "bitRotate", sig: "(a: int, n: int) -> int", desc: "Rotate 32-bit a left by n (n mod 32)." },
    { name: "bitCount", sig: "(a: int) -> int", desc: "Population count (number of set bits)." },
    { name: "leadingZeros", sig: "(a: int) -> int", desc: "Number of leading zero bits in 32-bit a." },
    { name: "trailingZeros", sig: "(a: int) -> int", desc: "Number of trailing zero bits in 32-bit a." },
    { name: "highestBit", sig: "(a: int) -> int", desc: "Index of highest set bit (-1 if a is 0)." },
    { name: "lowestBit", sig: "(a: int) -> int", desc: "Index of lowest set bit (-1 if a is 0)." },
    { name: "bitTest", sig: "(a: int, n: int) -> bool", desc: "True when bit n of a is set." },
    { name: "bitSet", sig: "(a: int, n: int, v: any) -> int", desc: "Set/clear bit n of a based on v." },
    { name: "bitFlip", sig: "(a: int, n: int) -> int", desc: "Toggle bit n of a." },
    { name: "bitMerge", sig: "(a, b, mask) -> int", desc: "Bit-merge: take from b where mask is set, else a." },
    { name: "bitExtract", sig: "(a, start, len) -> int", desc: "Extract len bits from a starting at bit start." },
    { name: "grayCode", sig: "(n: int) -> int", desc: "Convert n to its Gray code (n ^ (n >> 1))." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("bitAnd", bitAnd);
  registerBuiltin("bitOr", bitOr);
  registerBuiltin("bitXor", bitXor);
  registerBuiltin("bitNot", bitNot);
  registerBuiltin("bitShl", bitShl);
  registerBuiltin("bitShr", bitShr);
  registerBuiltin("bitSar", bitSar);
  registerBuiltin("bitRotate", bitRotate);
  registerBuiltin("bitCount", bitCount);
  registerBuiltin("leadingZeros", leadingZeros);
  registerBuiltin("trailingZeros", trailingZeros);
  registerBuiltin("highestBit", highestBit);
  registerBuiltin("lowestBit", lowestBit);
  registerBuiltin("bitTest", bitTest);
  registerBuiltin("bitSet", bitSet);
  registerBuiltin("bitFlip", bitFlip);
  registerBuiltin("bitMerge", bitMerge);
  registerBuiltin("bitExtract", bitExtract);
  registerBuiltin("grayCode", grayCode);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toU32(x: any, fn: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected integer, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
  return x >>> 0;
}

function toS32(x: any, fn: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected integer, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
  return x | 0;
}

function toShift(n: any, fn: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(fn + ": expected integer shift, got " + (n === null ? "null" : n === undefined ? "undefined" : typeof n));
  }
  return Math.trunc(n) & 0x1f;
}

function toPos(n: any, fn: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(fn + ": expected bit position, got " + (n === null ? "null" : n === undefined ? "undefined" : typeof n));
  }
  const p = Math.trunc(n);
  if (p < 0 || p >= 32) throw new Error(fn + ": bit position out of range [0, 31]");
  return p;
}

function toLen(n: any, fn: string): number {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(fn + ": expected length, got " + (n === null ? "null" : n === undefined ? "undefined" : typeof n));
  }
  const l = Math.trunc(n);
  if (l < 0 || l > 32) throw new Error(fn + ": length out of range [0, 32]");
  return l;
}
