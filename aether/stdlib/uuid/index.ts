/**
 * Aether stdlib — `uuid` module.
 *
 * UUID generation, parsing, and inspection.  Implements:
 *  - uuid4()  — random UUID, RFC 4122 v4
 *  - uuid5(name, namespace) — SHA-1 namespace+name UUID (v5)
 *  - uuid3(name, namespace) — MD5 namespace+name UUID (v3), using a
 *    self-contained MD5 implementation
 *  - uuid1()  — time + random UUID (v1) using Gregorian timestamp + random
 *    clock sequence + random node id (not strictly RFC-correct; well-formed)
 *  - parse / stringify — bytes <-> canonical 8-4-4-4-12 hex form
 *  - inspect: uuidVersion, uuidVariant, uuidIsValid, uuidNil, uuidMax
 *  - compare — lexicographic comparison by bytes (returns -1/0/1)
 *  - namespaces: DNS / URL / OID (well-known per RFC 4122 Appendix C)
 *
 * SHA-1 and MD5 are self-contained pure-JS implementations (the crypto
 * module exposes only hex-string digests, and we need byte digests here).
 */

// ---------------------------------------------------------------------------
// SHA-1 (pure JS, bytes in -> bytes out)
// ---------------------------------------------------------------------------

function sha1Bytes(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + ((56 - (bytes.length + 1) % 64 + 64) % 64) + 8;
  const msg = new Uint8Array(withPad);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  // SHA-1 uses BIG-ENDIAN length.
  dv.setUint32(withPad - 4, (bitLen >>> 0) >>> 0, false);
  dv.setUint32(withPad - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);

  const W = new Uint32Array(80);
  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 80; t++) {
      W[t] = rotl32(W[t - 3] ^ W[t - 8] ^ W[t - 14] ^ W[t - 16], 1);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rotl32(a, 5) + f + e + k + W[t]) >>> 0;
      e = d; d = c; c = rotl32(b, 30); b = a; a = tmp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0, false);
  odv.setUint32(4, h1, false);
  odv.setUint32(8, h2, false);
  odv.setUint32(12, h3, false);
  odv.setUint32(16, h4, false);
  return out;
}

function rotl32(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

// ---------------------------------------------------------------------------
// MD5 (pure JS, bytes in -> bytes out)
// ---------------------------------------------------------------------------

const MD5_S = new Uint8Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]);
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

function md5Bytes(bytes: Uint8Array): Uint8Array {
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const bitLen = bytes.length * 8;
  const withPad = bytes.length + 1 + ((56 - (bytes.length + 1) % 64 + 64) % 64) + 8;
  const msg = new Uint8Array(withPad);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(withPad - 4, Math.floor(bitLen / 0x100000000), true);
  dv.setUint32(withPad - 8, bitLen >>> 0, true);
  const M = new Uint32Array(16);
  for (let i = 0; i < msg.length; i += 64) {
    for (let t = 0; t < 16; t++) M[t] = dv.getUint32(i + t * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let t = 0; t < 64; t++) {
      let F: number, g: number;
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
// Helpers
// ---------------------------------------------------------------------------

function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") {
    throw new Error(fn + ": expected string, got " + (x === null ? "null" : x === undefined ? "undefined" : typeof x));
  }
}

function utf8Bytes(s: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  const buf = (globalThis as any).Buffer.from(s, "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const g = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(out);
    return out;
  }
  if (g.crypto && typeof g.crypto.randomBytes === "function") {
    const b = g.crypto.randomBytes(n);
    for (let i = 0; i < n; i++) out[i] = b[i];
    return out;
  }
  // Fallback (non-secure) — Math.random is not cryptographic, but better
  // than throwing if the host lacks crypto entirely.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

function hexToBytes(hex: string, expectedLen: number): Uint8Array {
  if (hex.length !== expectedLen * 2 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("hexToBytes: expected " + expectedLen * 2 + " hex chars, got '" + hex + "'");
  }
  const out = new Uint8Array(expectedLen);
  for (let i = 0; i < expectedLen; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Insert version (4 bits) and variant (2 bits) into a 16-byte buffer.
 *  `version` is 1-5.  `variant` defaults to RFC 4122 (0b10). */
function setVersionAndVariant(b: Uint8Array, version: number): void {
  // version nibble: top 4 bits of byte 6
  b[6] = (b[6] & 0x0f) | (version << 4);
  // variant: top 2 bits of byte 8 -> 0b10
  b[8] = (b[8] & 0x3f) | 0x80;
}

// ---------------------------------------------------------------------------
// UUID generators
// ---------------------------------------------------------------------------

/** Generate a v4 (random) UUID in canonical 8-4-4-4-12 hex form. */
export function uuid4(): string {
  const b = randomBytes(16);
  setVersionAndVariant(b, 4);
  return uuidStringify(b);
}

/** Generate a v1 (time + random) UUID.  Uses Gregorian time + random
 *  clock sequence + random node.  Not strictly RFC-correct (clock_seq is
 *  random, not the per-process state machine) but well-formed. */
export function uuid1(): string {
  // Gregorian epoch: 1582-10-15 00:00:00 UTC.
  // 100-ns intervals since epoch.
  const now = Date.now();
  const gregorianOffset = 12219292800000; // ms from 1582-10-15 to 1970-01-01
  const msSinceEpoch = now + gregorianOffset;
  // 100-ns intervals (10 per microsecond, 10000 per ms).
  const intervals = msSinceEpoch * 10000;
  const timeLow = intervals >>> 0;
  const timeMid = (intervals / 0x100000000) >>> 0 & 0xffff;
  const timeHi = ((intervals / 0x1000000000000) >>> 0) & 0x0fff;

  const b = new Uint8Array(16);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, timeLow, false);  // big-endian
  dv.setUint16(4, timeMid, false);
  dv.setUint16(6, (0x1000 | timeHi) >>> 0, false);  // version 1 nibble in top 4 bits
  // clock_seq + variant
  const cs = randomBytes(2);
  b[8] = (cs[0] & 0x3f) | 0x80;  // variant 0b10
  b[9] = cs[1];
  // node (random, with multicast bit set as recommended for non-MAC sources)
  const node = randomBytes(6);
  node[0] |= 0x01;
  b[10] = node[0]; b[11] = node[1]; b[12] = node[2];
  b[13] = node[3]; b[14] = node[4]; b[15] = node[5];
  return uuidStringify(b);
}

/** Generate a v3 (MD5 namespace + name) UUID. */
export function uuid3(name: string, namespace: string): string {
  assertString(name, "uuid3");
  assertString(namespace, "uuid3");
  const ns = uuidParse(namespace);
  const buf = utf8Bytes(name);
  const input = new Uint8Array(ns.length + buf.length);
  input.set(ns, 0);
  input.set(buf, ns.length);
  const digest = md5Bytes(input);  // 16 bytes
  setVersionAndVariant(digest, 3);
  return uuidStringify(digest);
}

/** Generate a v5 (SHA-1 namespace + name) UUID. */
export function uuid5(name: string, namespace: string): string {
  assertString(name, "uuid5");
  assertString(namespace, "uuid5");
  const ns = uuidParse(namespace);
  const buf = utf8Bytes(name);
  const input = new Uint8Array(ns.length + buf.length);
  input.set(ns, 0);
  input.set(buf, ns.length);
  const digest = sha1Bytes(input).slice(0, 16);  // first 16 bytes
  setVersionAndVariant(digest, 5);
  return uuidStringify(digest);
}

// ---------------------------------------------------------------------------
// Parse / stringify
// ---------------------------------------------------------------------------

/** Parse a canonical UUID string (8-4-4-4-12 hex) to a 16-byte array.
 *  Accepts uppercase or lowercase, with or without braces. */
export function uuidParse(s: string): Uint8Array {
  assertString(s, "uuidParse");
  let t = s.trim();
  if (t.startsWith("{") && t.endsWith("}")) t = t.slice(1, -1);
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(t)) {
    throw new Error("uuidParse: invalid UUID '" + s + "'");
  }
  const hex = t.replace(/-/g, "");
  return hexToBytes(hex, 16);
}

/** Stringify a 16-byte array to canonical 8-4-4-4-12 hex form (lowercase). */
export function uuidStringify(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) && !Array.isArray(bytes)) {
    throw new Error("uuidStringify: expected 16-byte array, got " + (bytes === null ? "null" : typeof bytes));
  }
  if (bytes.length !== 16) throw new Error("uuidStringify: expected 16 bytes, got " + bytes.length);
  const h = bytesToHex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20, 32);
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/** Return the version nibble (1, 2, 3, 4, 5). */
export function uuidVersion(s: string): number {
  const b = uuidParse(s);
  return (b[6] & 0xf0) >>> 4;
}

/** Return the variant code: 0 (NCS), 1 (RFC 4122), 2 (Microsoft), 3 (reserved).
 *  We classify by the top bits of byte 8. */
export function uuidVariant(s: string): number {
  const b = uuidParse(s);
  const v = (b[8] & 0xc0) >>> 6;
  if (v === 0b10) return 1;  // RFC 4122
  if (v === 0b00) return 0; // NCS (reserved)
  if (v === 0b11) return 3; // reserved for future
  if (v === 0b01) return 2; // Microsoft
  return -1;
}

/** True when `s` is a canonical UUID with version+variant consistent with
 *  one of the known variants.  (Does NOT validate the byte content beyond
 *  the format and version/variant bits.) */
export function uuidIsValid(s: string): boolean {
  if (typeof s !== "string") return false;
  try {
    const b = uuidParse(s);
    if (b.length !== 16) return false;
    // variant must be 0b10 (RFC 4122) for our generated UUIDs
    const variant = (b[8] & 0xc0) >>> 6;
    if (variant !== 0b10) return false;
    const version = (b[6] & 0xf0) >>> 4;
    return [1, 2, 3, 4, 5].includes(version);
  } catch {
    return false;
  }
}

/** Compare two UUIDs lexicographically by their 16-byte representation.
 *  Returns -1 (a < b), 0 (equal), or 1 (a > b). */
export function uuidCompare(a: string, b: string): number {
  const ba = uuidParse(a);
  const bb = uuidParse(b);
  for (let i = 0; i < 16; i++) {
    if (ba[i] < bb[i]) return -1;
    if (ba[i] > bb[i]) return 1;
  }
  return 0;
}

/** The nil UUID: 00000000-0000-0000-0000-000000000000. */
export function uuidNil(): string {
  return "00000000-0000-0000-0000-000000000000";
}

/** The max UUID: ffffffff-ffff-ffff-ffff-ffffffffffff. */
export function uuidMax(): string {
  return "ffffffff-ffff-ffff-ffff-ffffffffffff";
}

// ---------------------------------------------------------------------------
// Well-known namespaces (RFC 4122 Appendix C)
// ---------------------------------------------------------------------------

export function uuidNamespaceDNS(): string { return "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; }
export function uuidNamespaceURL(): string { return "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; }
export function uuidNamespaceOID(): string { return "6ba7b812-9dad-11d1-80b4-00c04fd430c8"; }

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "uuid",
  fns: [
    { name: "uuid1", sig: "() -> string", desc: "Generate a v1 (time + random) UUID." },
    { name: "uuid3", sig: "(name: string, namespace: string) -> string", desc: "Generate a v3 (MD5 namespace + name) UUID." },
    { name: "uuid4", sig: "() -> string", desc: "Generate a v4 (random) UUID." },
    { name: "uuid5", sig: "(name: string, namespace: string) -> string", desc: "Generate a v5 (SHA-1 namespace + name) UUID." },
    { name: "uuidParse", sig: "(s: string) -> Uint8Array(16)", desc: "Parse a canonical UUID string to 16 bytes." },
    { name: "uuidStringify", sig: "(bytes: Uint8Array(16)) -> string", desc: "Stringify 16 bytes to canonical 8-4-4-4-12 hex." },
    { name: "uuidCompare", sig: "(a, b) -> int", desc: "Lexicographic compare; returns -1, 0, or 1." },
    { name: "uuidNil", sig: "() -> string", desc: "The nil UUID: 00000000-0000-0000-0000-000000000000." },
    { name: "uuidMax", sig: "() -> string", desc: "The max UUID: ffffffff-ffff-ffff-ffff-ffffffffffff." },
    { name: "uuidVersion", sig: "(s: string) -> int", desc: "Return the version nibble (1-5)." },
    { name: "uuidVariant", sig: "(s: string) -> int", desc: "Return the variant code (0=NCS, 1=RFC4122, 2=MS, 3=reserved)." },
    { name: "uuidIsValid", sig: "(s: string) -> bool", desc: "True when s is a canonical UUID with RFC 4122 variant." },
    { name: "uuidNamespaceDNS", sig: "() -> string", desc: "Well-known DNS namespace UUID." },
    { name: "uuidNamespaceURL", sig: "() -> string", desc: "Well-known URL namespace UUID." },
    { name: "uuidNamespaceOID", sig: "() -> string", desc: "Well-known OID namespace UUID." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("uuid1", uuid1);
  registerBuiltin("uuid3", uuid3);
  registerBuiltin("uuid4", uuid4);
  registerBuiltin("uuid5", uuid5);
  registerBuiltin("uuidParse", uuidParse);
  registerBuiltin("uuidStringify", uuidStringify);
  registerBuiltin("uuidCompare", uuidCompare);
  registerBuiltin("uuidNil", uuidNil);
  registerBuiltin("uuidMax", uuidMax);
  registerBuiltin("uuidVersion", uuidVersion);
  registerBuiltin("uuidVariant", uuidVariant);
  registerBuiltin("uuidIsValid", uuidIsValid);
  registerBuiltin("uuidNamespaceDNS", uuidNamespaceDNS);
  registerBuiltin("uuidNamespaceURL", uuidNamespaceURL);
  registerBuiltin("uuidNamespaceOID", uuidNamespaceOID);
}
