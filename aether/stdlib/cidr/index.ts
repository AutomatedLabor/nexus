/**
 * Aether stdlib — `cidr` module.
 *
 * CIDR / IPv4 utility functions. A "CIDR" is represented as a plain
 * object `{ ip: [a, b, c, d], prefix: number }` where `ip` is the
 * network address (host bits zeroed) and `prefix` is 0..32. All
 * functions throw a plain `Error` on invalid input.
 *
 * Functions:
 *   - cidrParse, cidrToString          — text <-> object
 *   - cidrContains, cidrOverlap        — membership / overlap tests
 *   - cidrNetwork, cidrBroadcast       — endpoints
 *   - cidrMask                         — dotted-decimal netmask
 *   - cidrHosts                        — count of usable hosts
 *   - cidrSubnets                      — split into N sub-prefixes
 *   - cidrMerge                        — merge two adjacent equal-size nets
 *
 * All arithmetic is done on 32-bit unsigned integers via `>>>0`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Cidr {
  ip: number;       // 32-bit unsigned integer
  prefix: number;   // 0..32
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIPv4(s: string): number {
  if (typeof s !== "string") throw new Error("cidr: expected IPv4 string");
  const parts = s.split(".");
  if (parts.length !== 4) throw new Error(`cidr: bad IPv4 address '${s}'`);
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parts[i];
    if (!/^\d+$/.test(octet)) throw new Error(`cidr: bad octet '${octet}' in '${s}'`);
    const n = parseInt(octet, 10);
    if (n < 0 || n > 255) throw new Error(`cidr: octet out of range '${octet}' in '${s}'`);
    v = (v << 8) | n;
  }
  return v >>> 0;
}

function formatIPv4(ip: number): string {
  return `${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`;
}

function maskOf(prefix: number): number {
  if (prefix === 0) return 0;
  // JavaScript's `~` returns signed, but >>>0 normalises.
  return (prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0) >>> 0;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/** Parse a CIDR string like "192.168.0.0/24" (or "192.168.1.42/24"
 *  with non-zero host bits — those bits are masked off, so the
 *  resulting `cidr.ip` is the network address). */
export function cidrParse(s: string): Cidr {
  if (typeof s !== "string") throw new Error("cidrParse: expected string");
  const slash = s.indexOf("/");
  if (slash === -1) throw new Error(`cidrParse: missing '/' in '${s}'`);
  const ipStr = s.slice(0, slash);
  const prefixStr = s.slice(slash + 1);
  const ip = parseIPv4(ipStr);
  if (!/^\d+$/.test(prefixStr)) throw new Error(`cidrParse: bad prefix '${prefixStr}'`);
  const prefix = parseInt(prefixStr, 10);
  if (prefix < 0 || prefix > 32) throw new Error(`cidrParse: prefix out of range '${prefix}'`);
  return { ip: (ip & maskOf(prefix)) >>> 0, prefix };
}

/** Format a Cidr back to "a.b.c.d/p" string. */
export function cidrToString(c: Cidr): string {
  assertCidr(c, "cidrToString");
  return `${formatIPv4(c.ip)}/${c.prefix}`;
}

/** Return the network address (host bits zeroed) as a 4-tuple. */
export function cidrNetwork(c: Cidr): [number, number, number, number] {
  assertCidr(c, "cidrNetwork");
  const ip = (c.ip & maskOf(c.prefix)) >>> 0;
  return [(ip >>> 24) & 0xff, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff];
}

/** Return the broadcast address as a 4-tuple. */
export function cidrBroadcast(c: Cidr): [number, number, number, number] {
  assertCidr(c, "cidrBroadcast");
  const m = maskOf(c.prefix);
  const ip = (c.ip | (~m >>> 0)) >>> 0;
  return [(ip >>> 24) & 0xff, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff];
}

/** Return the dotted-decimal netmask, e.g. "255.255.255.0" for /24. */
export function cidrMask(c: Cidr): string {
  assertCidr(c, "cidrMask");
  return formatIPv4(maskOf(c.prefix));
}

/** Number of usable host addresses in the CIDR.  For /31 and /32 the
 *  convention here is point-to-point (RFC 3021): /31 → 2, /32 → 1.
 *  For all other prefixes it's `2^(32-prefix) - 2`. */
export function cidrHosts(c: Cidr): number {
  assertCidr(c, "cidrHosts");
  if (c.prefix >= 32) return 1;
  if (c.prefix === 31) return 2;
  return (1 << (32 - c.prefix)) - 2;
}

/** True if `inner` is fully contained in `outer` (the network
 *  addresses overlap and `inner` is at least as specific). */
export function cidrContains(outer: Cidr, inner: Cidr): boolean {
  assertCidr(outer, "cidrContains");
  assertCidr(inner, "cidrContains");
  if (inner.prefix < outer.prefix) return false;
  const m = maskOf(outer.prefix);
  return (inner.ip & m) >>> 0 === (outer.ip & m) >>> 0;
}

/** True if `a` and `b` overlap (share at least one address).  Two
 *  CIDRs overlap iff one contains the other. */
export function cidrOverlap(a: Cidr, b: Cidr): boolean {
  assertCidr(a, "cidrOverlap");
  assertCidr(b, "cidrOverlap");
  if (a.prefix <= b.prefix) return cidrContains(a, b);
  return cidrContains(b, a);
}

/** Split `c` into 2^n sub-prefixes where `n` is given.  Returns an
 *  array of Cidr objects with `prefix + n` (or throws if it would
 *  exceed 32).  Pass `n=1` to bisect into two halves. */
export function cidrSubnets(c: Cidr, n: number): Cidr[] {
  assertCidr(c, "cidrSubnets");
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new Error("cidrSubnets: n must be a non-negative integer");
  }
  const newPrefix = c.prefix + n;
  if (newPrefix > 32) throw new Error(`cidrSubnets: prefix ${c.prefix} + ${n} exceeds 32`);
  const count = 1 << n;
  const out: Cidr[] = [];
  const blockSize = 1 << (32 - newPrefix);
  for (let i = 0; i < count; i++) {
    out.push({ ip: (c.ip + i * blockSize) >>> 0, prefix: newPrefix });
  }
  return out;
}

/** Merge two adjacent /p CIDRs into a single /p-1 CIDR.  Throws if
 *  the two CIDRs are not adjacent halves of the same parent. */
export function cidrMerge(a: Cidr, b: Cidr): Cidr {
  assertCidr(a, "cidrMerge");
  assertCidr(b, "cidrMerge");
  if (a.prefix !== b.prefix) throw new Error("cidrMerge: prefixes must match");
  if (a.prefix === 0) throw new Error("cidrMerge: cannot merge /0");
  const newPrefix = a.prefix - 1;
  // The two halves must be aligned: the lower one has the bit at
  // position (32 - newPrefix) cleared, the upper one set, AND they
  // differ only in that bit.
  const blockSize = 1 << (32 - a.prefix);
  const lower = Math.min(a.ip, b.ip);
  const upper = Math.max(a.ip, b.ip);
  if (lower % (2 * blockSize) !== 0) {
    throw new Error("cidrMerge: not aligned to parent boundary");
  }
  if (upper - lower !== blockSize) {
    throw new Error("cidrMerge: not adjacent halves");
  }
  return { ip: lower, prefix: newPrefix };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "cidr",
  fns: [
    { name: "cidrParse", sig: "(s: string) -> Cidr", desc: "Parse 'a.b.c.d/p' into a Cidr; host bits are masked off." },
    { name: "cidrContains", sig: "(outer: Cidr, inner: Cidr) -> bool", desc: "True if inner is fully contained in outer." },
    { name: "cidrNetwork", sig: "(c: Cidr) -> [int,int,int,int]", desc: "Network address (host bits zeroed) as 4-tuple." },
    { name: "cidrBroadcast", sig: "(c: Cidr) -> [int,int,int,int]", desc: "Broadcast address as 4-tuple." },
    { name: "cidrMask", sig: "(c: Cidr) -> string", desc: "Dotted-decimal netmask (e.g. '255.255.255.0')." },
    { name: "cidrHosts", sig: "(c: Cidr) -> int", desc: "Number of usable host addresses (RFC 3021 for /31)." },
    { name: "cidrSubnets", sig: "(c: Cidr, n: int) -> Cidr[]", desc: "Split into 2^n sub-prefixes." },
    { name: "cidrOverlap", sig: "(a: Cidr, b: Cidr) -> bool", desc: "True if the two CIDRs share any address." },
    { name: "cidrMerge", sig: "(a: Cidr, b: Cidr) -> Cidr", desc: "Merge two adjacent equal-size CIDRs into a /p-1." },
    { name: "cidrToString", sig: "(c: Cidr) -> string", desc: "Format a Cidr as 'a.b.c.d/p'." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("cidrParse", cidrParse);
  registerBuiltin("cidrContains", cidrContains);
  registerBuiltin("cidrNetwork", cidrNetwork);
  registerBuiltin("cidrBroadcast", cidrBroadcast);
  registerBuiltin("cidrMask", cidrMask);
  registerBuiltin("cidrHosts", cidrHosts);
  registerBuiltin("cidrSubnets", cidrSubnets);
  registerBuiltin("cidrOverlap", cidrOverlap);
  registerBuiltin("cidrMerge", cidrMerge);
  registerBuiltin("cidrToString", cidrToString);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

function assertCidr(x: any, fn: string): asserts x is Cidr {
  if (typeof x !== "object" || x === null ||
      typeof x.ip !== "number" || !Number.isInteger(x.ip) ||
      typeof x.prefix !== "number" || !Number.isInteger(x.prefix) ||
      x.prefix < 0 || x.prefix > 32 ||
      x.ip < 0 || x.ip > 0xffffffff) {
    throw new Error(fn + ": expected Cidr, got " + kind(x));
  }
}

function kind(x: any): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  return typeof x;
}
