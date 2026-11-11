/**
 * Aether stdlib — `crypto` module.
 *
 * Hashing: `md5`, `sha1`, `sha256` are pure-JS synchronous implementations
 * (no Web-Crypto dependency, work in any browser).  `sha512` uses the Web
 * Crypto API (or Node's `crypto` module) and returns a `Promise<string>`;
 * the evaluator can `await` it (planned for the async runtime, see the
 * `async` module).
 *
 * Demo hashes: `djb2`, `fnv1a` are tiny non-cryptographic 32-bit hashes
 * suitable for hash-table keying and checksums of untrusted data.
 *
 * Random: `randomInt(min, max)`, `randomFloat()`, `randomBytes(n)`,
 * `uuid4()`, `randomChoice(arr)`, `shuffle(arr)`, `seedRandom(seed)`,
 * `randomSeed()`.  These use `crypto.getRandomValues` in the browser and
 * `crypto.randomBytes` in Node — both are *cryptographically secure* sources.
 * For a reproducible, seedable PRNG (handy in tests and simulations) use
 * `seedRandom(seed)` which switches the random source to a deterministic
 * Mulberry32 stream; `randomSeed()` restores the secure source.
 */

// ---------------------------------------------------------------------------
// SHA-256 (pure JS, sync)
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  // Pre-processing: padding the message.
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + ((56 - (bytes.length + 1) % 64 + 64) % 64) + 8;
  const msg = new Uint8Array(withPad);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  // Append 64-bit big-endian length.  We only support lengths < 2^32 bits
  // (i.e. < 512 MiB of input), which is plenty.
  const dv = new DataView(msg.buffer);
  dv.setUint32(withPad - 4, bitLen >>> 0, false);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i], false);
  return out;
}

// ---------------------------------------------------------------------------
// SHA-1 (pure JS, sync)
// ---------------------------------------------------------------------------

function sha1Bytes(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]);
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + ((56 - (bytes.length + 1) % 64 + 64) % 64) + 8;
  const msg = new Uint8Array(withPad);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(withPad - 4, bitLen >>> 0, false);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Uint32Array(80);
  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 80; t++) {
      w[t] = rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (let t = 0; t < 80; t++) {
      const f =
        t < 20 ? ((b & c) ^ (~b & d)) + 0x5a827999 :
        t < 40 ? (b ^ c ^ d) + 0x6ed9eba1 :
        t < 60 ? ((b & c) ^ (b & d) ^ (c & d)) + 0x8f1bbcdc :
        (b ^ c ^ d) + 0xca62c1d6;
      const tmp = (rotl32(a, 5) + f + e + w[t]) >>> 0;
      e = d; d = c; c = rotl32(b, 30); b = a; a = tmp;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 5; i++) odv.setUint32(i * 4, h[i], false);
  return out;
}

// ---------------------------------------------------------------------------
// MD5 (pure JS, sync)
// ---------------------------------------------------------------------------

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

function rotl32(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

function md5Bytes(bytes: Uint8Array): Uint8Array {
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + ((56 - (bytes.length + 1) % 64 + 64) % 64) + 8;
  const msg = new Uint8Array(withPad);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  // MD5 uses LITTLE-ENDIAN length: low 32 bits first (at offset withPad-8,
  // which is M[14] under little-endian 32-bit reads), high 32 bits second
  // (at offset withPad-4, which is M[15]).
  dv.setUint32(withPad - 4, Math.floor(bitLen / 0x100000000), true);
  dv.setUint32(withPad - 8, bitLen >>> 0, true);

  const M = new Uint32Array(16);
  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) M[t] = dv.getUint32(i + t * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let t = 0; t < 64; t++) {
      let F: number; let g: number;
      if (t < 16) { F = (B & C) | (~B & D); g = t; }
      else if (t < 32) { F = (D & B) | (~D & C); g = (5 * t + 1) % 16; }
      else if (t < 48) { F = B ^ C ^ D; g = (3 * t + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * t) % 16; }
      F = (F + A + MD5_K[t] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl32(F, MD5_S[t])) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return out;
}

// ---------------------------------------------------------------------------
// Hex helpers + public hashing API
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  const buf = (globalThis as any).Buffer.from(s, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function sha256(s: string): string {
  assertString(s, "sha256");
  return bytesToHex(sha256Bytes(utf8Bytes(s)));
}

export function sha1(s: string): string {
  assertString(s, "sha1");
  return bytesToHex(sha1Bytes(utf8Bytes(s)));
}

export function md5(s: string): string {
  assertString(s, "md5");
  return bytesToHex(md5Bytes(utf8Bytes(s)));
}

/**
 * sha512 — uses the Web Crypto API (browser) or Node's `crypto` module.
 * Returns a Promise that resolves to the hex digest.  The Aether v1
 * evaluator is synchronous (see the `async` module README), so callers
 * must use the planned async runtime (or the playground's `runAsync`
 * helper) to consume this.
 */
export function sha512(s: string): Promise<string> {
  assertString(s, "sha512");
  const g = globalThis as any;
  // Browser path: crypto.subtle.
  if (g.crypto && g.crypto.subtle && typeof g.crypto.subtle.digest === "function") {
    return g.crypto.subtle.digest("SHA-512", utf8Bytes(s)).then((buf: ArrayBuffer) => {
      const out = new Uint8Array(buf);
      return bytesToHex(out);
    });
  }
  // Node path: crypto module.
  return new Promise<string>((resolve, reject) => {
    try {
      const m = g.require ? g.require("crypto") : null;
      if (!m) throw new Error("sha512: no crypto implementation available");
      const digest = m.createHash("sha512").update(s, "utf8").digest("hex");
      resolve(digest);
    } catch (e: any) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ---------------------------------------------------------------------------
// Demo non-cryptographic hashes
// ---------------------------------------------------------------------------

export function djb2(s: string): number {
  assertString(s, "djb2");
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function fnv1a(s: string): number {
  assertString(s, "fnv1a");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

/** When non-null, the random source is the deterministic Mulberry32 stream. */
let _seededState: number | null = null;

/** Mulberry32 — a tiny deterministic PRNG.  Returns [0, 1). */
function mulberry32Step(): number {
  // _seededState is treated as a 32-bit unsigned integer.
  _seededState = (_seededState! + 0x6d2b79f5) >>> 0;
  let t = _seededState!;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function secureRandomBytes(n: number): Uint8Array {
  assertInt(n, "randomBytes");
  if (n < 0) throw new Error("randomBytes: negative count");
  const out = new Uint8Array(n);
  const g = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(out);
    return out;
  }
  // Node path.
  if (g.require) {
    try {
      const m = g.require("crypto");
      const buf = m.randomBytes(n);
      for (let i = 0; i < n; i++) out[i] = buf[i];
      return out;
    } catch {
      // fall through
    }
  }
  throw new Error("randomBytes: no secure source available");
}

export function randomInt(min: number, max: number): number {
  assertInt(min, "randomInt");
  assertInt(max, "randomInt");
  if (max < min) throw new Error("randomInt: max < min");
  const range = max - min + 1;
  if (range > 0xffffffff) throw new Error("randomInt: range too large");
  // Largest multiple of `range` that fits in a 32-bit unsigned value.  When
  // `range == 1` this equals 2^32, so we accept every x without rejection.
  const limit = Math.floor(0x100000000 / range) * range;
  let x: number;
  do {
    const bytes = secureRandomBytes(4);
    const dv = new DataView(bytes.buffer);
    x = dv.getUint32(0, false);
  } while (x >= limit);
  return min + (x % range);
}

export function randomFloat(): number {
  if (_seededState !== null) return mulberry32Step();
  const bytes = secureRandomBytes(8);
  const dv = new DataView(bytes.buffer);
  // 53-bit random fraction (matches Math.random precision).
  const high = dv.getUint32(0, false) >>> 0;
  const low = dv.getUint32(4, false) >>> 0;
  return (high * 0x200000 + low) / 0x20000000000000;
}

export function randomBytes(n: number): number[] {
  return Array.from(secureRandomBytes(n));
}

export function uuid4(): string {
  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomChoice(arr: any[]): any {
  if (!Array.isArray(arr)) throw new Error("randomChoice: expected array");
  if (arr.length === 0) throw new Error("randomChoice: empty array");
  const idx = randomInt(0, arr.length - 1);
  return arr[idx];
}

/** Fisher-Yates shuffle with secure randomness; returns a new array. */
export function shuffle(arr: any[]): any[] {
  if (!Array.isArray(arr)) throw new Error("shuffle: expected array");
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Switch the random source to a deterministic Mulberry32 stream seeded with
 * `seed`.  All subsequent random calls (randomFloat, randomInt, etc.) draw
 * from this stream until `randomSeed()` is called. */
export function seedRandom(seed: number): void {
  assertInt(seed, "seedRandom");
  _seededState = seed >>> 0;
}

/** Restore the secure random source. */
export function randomSeed(): void {
  _seededState = null;
}

// ---------------------------------------------------------------------------
function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") throw new Error(fn + ": expected string, got " + typeof x);
}
function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "crypto",
  fns: [
    { name: "md5", sig: "(s: string) -> string", desc: "MD5 hex digest (sync, pure JS)." },
    { name: "sha1", sig: "(s: string) -> string", desc: "SHA-1 hex digest (sync, pure JS)." },
    { name: "sha256", sig: "(s: string) -> string", desc: "SHA-256 hex digest (sync, pure JS)." },
    { name: "sha512", sig: "(s: string) -> Promise<string>", desc: "SHA-512 hex digest (async, Web Crypto/Node)." },
    { name: "djb2", sig: "(s: string) -> int", desc: "DJB2 32-bit non-cryptographic hash." },
    { name: "fnv1a", sig: "(s: string) -> int", desc: "FNV-1a 32-bit non-cryptographic hash." },
    { name: "randomInt", sig: "(min: int, max: int) -> int", desc: "Cryptographically secure random integer in [min, max]." },
    { name: "randomFloat", sig: "() -> float", desc: "Cryptographically secure random float in [0, 1)." },
    { name: "randomBytes", sig: "(n: int) -> int[]", desc: "Array of n cryptographically secure random bytes." },
    { name: "uuid4", sig: "() -> string", desc: "Random UUID v4." },
    { name: "randomChoice", sig: "(arr: any[]) -> any", desc: "Pick a random element." },
    { name: "shuffle", sig: "(arr: any[]) -> any[]", desc: "Fisher-Yates shuffle (non-mutating)." },
    { name: "seedRandom", sig: "(seed: int) -> void", desc: "Switch to deterministic Mulberry32 PRNG." },
    { name: "randomSeed", sig: "() -> void", desc: "Restore the secure random source." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("md5", md5);
  registerBuiltin("sha1", sha1);
  registerBuiltin("sha256", sha256);
  registerBuiltin("sha512", sha512);
  registerBuiltin("djb2", djb2);
  registerBuiltin("fnv1a", fnv1a);
  registerBuiltin("randomInt", randomInt);
  registerBuiltin("randomFloat", randomFloat);
  registerBuiltin("randomBytes", randomBytes);
  registerBuiltin("uuid4", uuid4);
  registerBuiltin("randomChoice", randomChoice);
  registerBuiltin("shuffle", shuffle);
  registerBuiltin("seedRandom", seedRandom);
  registerBuiltin("randomSeed", randomSeed);
}
