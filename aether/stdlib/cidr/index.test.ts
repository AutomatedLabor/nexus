import { describe, it, expect } from "vitest";
import * as C from "./index";

describe("cidr module", () => {
  it("cidrParse: parses '192.168.0.0/24'", () => {
    const c = C.cidrParse("192.168.0.0/24");
    expect(c.prefix).toBe(24);
    expect(c.ip).toBe((192 << 24 | 168 << 16 | 0 << 8 | 0) >>> 0);
  });

  it("cidrParse: masks off host bits", () => {
    const c = C.cidrParse("192.168.1.42/24");
    expect(C.cidrToString(c)).toBe("192.168.1.0/24");
  });

  it("cidrParse: /32 keeps the full address", () => {
    expect(C.cidrToString(C.cidrParse("10.0.0.5/32"))).toBe("10.0.0.5/32");
  });

  it("cidrParse: /0 covers everything", () => {
    const c = C.cidrParse("0.0.0.0/0");
    expect(c.prefix).toBe(0);
    expect(c.ip).toBe(0);
  });

  it("cidrParse: rejects missing '/'", () => {
    expect(() => C.cidrParse("192.168.0.0")).toThrow();
  });

  it("cidrParse: rejects bad octets", () => {
    expect(() => C.cidrParse("999.0.0.0/24")).toThrow();
    expect(() => C.cidrParse("a.b.c.d/24")).toThrow();
    expect(() => C.cidrParse("1.2.3/24")).toThrow();
  });

  it("cidrParse: rejects out-of-range prefix", () => {
    expect(() => C.cidrParse("1.2.3.4/33")).toThrow();
    expect(() => C.cidrParse("1.2.3.4/-1")).toThrow();
  });

  it("cidrToString: round-trips a parsed CIDR", () => {
    const c = C.cidrParse("10.20.30.40/16");
    expect(C.cidrToString(c)).toBe("10.20.0.0/16");
  });

  it("cidrNetwork: returns the network address", () => {
    expect(C.cidrNetwork(C.cidrParse("192.168.5.10/24"))).toEqual([192, 168, 5, 0]);
  });

  it("cidrBroadcast: returns the broadcast address", () => {
    expect(C.cidrBroadcast(C.cidrParse("192.168.5.0/24"))).toEqual([192, 168, 5, 255]);
  });

  it("cidrBroadcast: /32 broadcast is the address itself", () => {
    expect(C.cidrBroadcast(C.cidrParse("10.0.0.7/32"))).toEqual([10, 0, 0, 7]);
  });

  it("cidrMask: returns dotted-decimal netmask", () => {
    expect(C.cidrMask(C.cidrParse("192.168.0.0/24"))).toBe("255.255.255.0");
    expect(C.cidrMask(C.cidrParse("192.168.0.0/16"))).toBe("255.255.0.0");
    expect(C.cidrMask(C.cidrParse("0.0.0.0/0"))).toBe("0.0.0.0");
    expect(C.cidrMask(C.cidrParse("1.2.3.4/32"))).toBe("255.255.255.255");
    expect(C.cidrMask(C.cidrParse("1.2.3.4/8"))).toBe("255.0.0.0");
  });

  it("cidrHosts: counts usable hosts for /24", () => {
    expect(C.cidrHosts(C.cidrParse("192.168.0.0/24"))).toBe(254);
  });

  it("cidrHosts: /16 → 65534", () => {
    expect(C.cidrHosts(C.cidrParse("10.0.0.0/16"))).toBe(65534);
  });

  it("cidrHosts: /30 → 2 (subtract network+broadcast)", () => {
    expect(C.cidrHosts(C.cidrParse("10.0.0.0/30"))).toBe(2);
  });

  it("cidrHosts: /31 → 2 (RFC 3021 point-to-point)", () => {
    expect(C.cidrHosts(C.cidrParse("10.0.0.0/31"))).toBe(2);
  });

  it("cidrHosts: /32 → 1", () => {
    expect(C.cidrHosts(C.cidrParse("10.0.0.5/32"))).toBe(1);
  });

  it("cidrContains: /16 contains /24", () => {
    expect(C.cidrContains(C.cidrParse("10.0.0.0/16"), C.cidrParse("10.0.5.0/24"))).toBe(true);
  });

  it("cidrContains: /24 NOT contains /16", () => {
    expect(C.cidrContains(C.cidrParse("10.0.5.0/24"), C.cidrParse("10.0.0.0/16"))).toBe(false);
  });

  it("cidrContains: disjoint networks", () => {
    expect(C.cidrContains(C.cidrParse("10.0.0.0/24"), C.cidrParse("10.0.1.0/24"))).toBe(false);
  });

  it("cidrContains: /0 contains everything", () => {
    expect(C.cidrContains(C.cidrParse("0.0.0.0/0"), C.cidrParse("8.8.8.8/32"))).toBe(true);
  });

  it("cidrOverlap: sibling /24s don't overlap", () => {
    expect(C.cidrOverlap(C.cidrParse("10.0.0.0/24"), C.cidrParse("10.0.1.0/24"))).toBe(false);
  });

  it("cidrOverlap: contained CIDRs overlap", () => {
    expect(C.cidrOverlap(C.cidrParse("10.0.0.0/16"), C.cidrParse("10.0.5.0/24"))).toBe(true);
  });

  it("cidrOverlap: identical CIDRs overlap", () => {
    expect(C.cidrOverlap(C.cidrParse("10.0.0.0/24"), C.cidrParse("10.0.0.0/24"))).toBe(true);
  });

  it("cidrSubnets: bisects /24 into two /25s", () => {
    const subs = C.cidrSubnets(C.cidrParse("192.168.0.0/24"), 1);
    expect(subs).toHaveLength(2);
    expect(C.cidrToString(subs[0])).toBe("192.168.0.0/25");
    expect(C.cidrToString(subs[1])).toBe("192.168.0.128/25");
  });

  it("cidrSubnets: 4 /26s from /24", () => {
    const subs = C.cidrSubnets(C.cidrParse("192.168.0.0/24"), 2);
    expect(subs.map(C.cidrToString)).toEqual([
      "192.168.0.0/26",
      "192.168.0.64/26",
      "192.168.0.128/26",
      "192.168.0.192/26",
    ]);
  });

  it("cidrSubnets: n=0 returns the original", () => {
    const subs = C.cidrSubnets(C.cidrParse("192.168.0.0/24"), 0);
    expect(subs).toHaveLength(1);
    expect(C.cidrToString(subs[0])).toBe("192.168.0.0/24");
  });

  it("cidrSubnets: rejects prefix+1 > 32", () => {
    expect(() => C.cidrSubnets(C.cidrParse("1.2.3.4/32"), 1)).toThrow();
  });

  it("cidrSubnets: rejects negative n", () => {
    expect(() => C.cidrSubnets(C.cidrParse("1.2.3.4/24"), -1)).toThrow();
  });

  it("cidrMerge: merges two adjacent /25s into /24", () => {
    const a = C.cidrParse("192.168.0.0/25");
    const b = C.cidrParse("192.168.0.128/25");
    expect(C.cidrToString(C.cidrMerge(a, b))).toBe("192.168.0.0/24");
  });

  it("cidrMerge: rejects mismatched prefixes", () => {
    expect(() => C.cidrMerge(C.cidrParse("1.0.0.0/24"), C.cidrParse("1.0.1.0/25"))).toThrow();
  });

  it("cidrMerge: rejects non-adjacent halves", () => {
    expect(() => C.cidrMerge(C.cidrParse("192.168.0.0/25"), C.cidrParse("192.168.1.0/25"))).toThrow();
  });

  it("cidrMerge: rejects unaligned halves", () => {
    // 192.168.0.64/26 — the parent would be 192.168.0.0/25, but
    // 192.168.0.128/26 is not the matching sibling (it'd pair with
    // 192.168.0.192/26 to form 192.168.0.128/25, not 192.168.0.64).
    expect(() =>
      C.cidrMerge(C.cidrParse("192.168.0.64/26"), C.cidrParse("192.168.0.128/26")),
    ).toThrow();
  });

  it("cidr: validators reject bad input", () => {
    expect(() => C.cidrMask(null as any)).toThrow();
    expect(() => C.cidrMask({ ip: "x", prefix: 24 } as any)).toThrow();
    expect(() => C.cidrMask({ ip: 0, prefix: 99 } as any)).toThrow();
  });
});
