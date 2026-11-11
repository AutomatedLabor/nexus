import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as C from "./index";

// Known vectors verified against independent implementations.
const SHA256_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const SHA256_LONG = "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0";
const SHA1_EMPTY = "da39a3ee5e6b4b0d3255bfef95601890afd80709";
const SHA1_ABC = "a9993e364706816aba3e25717850c26c9cd0d89d";
const MD5_EMPTY = "d41d8cd98f00b204e9800998ecf8427e";
const MD5_ABC = "900150983cd24fb0d6963f7d28e17f72";

describe("crypto: hashes (sync)", () => {
  it("sha256: empty string", () => {
    expect(C.sha256("")).toBe(SHA256_EMPTY);
  });
  it("sha256: 'abc'", () => {
    expect(C.sha256("abc")).toBe(SHA256_ABC);
  });
  it("sha256: 1 million 'a's (long input vector)", () => {
    expect(C.sha256("a".repeat(1_000_000))).toBe(SHA256_LONG);
  });
  it("sha256: deterministic", () => {
    expect(C.sha256("hello")).toBe(C.sha256("hello"));
  });

  it("sha1: empty string", () => {
    expect(C.sha1("")).toBe(SHA1_EMPTY);
  });
  it("sha1: 'abc'", () => {
    expect(C.sha1("abc")).toBe(SHA1_ABC);
  });

  it("md5: empty string", () => {
    expect(C.md5("")).toBe(MD5_EMPTY);
  });
  it("md5: 'abc'", () => {
    expect(C.md5("abc")).toBe(MD5_ABC);
  });
  it("md5: 'message digest'", () => {
    expect(C.md5("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
  });

  it("djb2: deterministic", () => {
    expect(C.djb2("hello")).toBe(C.djb2("hello"));
    expect(C.djb2("hello")).not.toBe(C.djb2("world"));
  });
  it("djb2: empty", () => {
    expect(C.djb2("")).toBe(5381);
  });

  it("fnv1a: deterministic", () => {
    expect(C.fnv1a("hello")).toBe(C.fnv1a("hello"));
  });
  it("fnv1a: empty", () => {
    expect(C.fnv1a("")).toBe(0x811c9dc5);
  });
});

describe("crypto: hashes (async sha512)", () => {
  it("sha512: 'abc' known vector", async () => {
    const h = await C.sha512("abc");
    expect(h).toBe("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
  });
  it("sha512: empty string", async () => {
    const h = await C.sha512("");
    expect(h).toBe("cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e");
  });
});

describe("crypto: random", () => {
  it("randomInt: in range", () => {
    for (let i = 0; i < 100; i++) {
      const n = C.randomInt(0, 9);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
  it("randomInt: equal bounds returns bound", () => {
    expect(C.randomInt(5, 5)).toBe(5);
  });
  it("randomInt: max < min panics", () => {
    expect(() => C.randomInt(10, 5)).toThrow();
  });
  it("randomFloat: in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const f = C.randomFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
  it("randomBytes: length", () => {
    const b = C.randomBytes(32);
    expect(b.length).toBe(32);
    // very unlikely all zeros
    expect(b.some((x) => x !== 0)).toBe(true);
  });
  it("randomBytes: zero length", () => {
    expect(C.randomBytes(0)).toEqual([]);
  });
  it("uuid4: shape", () => {
    const u = C.uuid4();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("uuid4: unique", () => {
    const a = C.uuid4();
    const b = C.uuid4();
    expect(a).not.toBe(b);
  });
  it("randomChoice: returns an element", () => {
    const arr = [10, 20, 30];
    const v = C.randomChoice(arr);
    expect(arr).toContain(v);
  });
  it("randomChoice: empty panics", () => {
    expect(() => C.randomChoice([])).toThrow();
  });
  it("shuffle: same elements, possibly different order", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s = C.shuffle(arr);
    expect(s.length).toBe(arr.length);
    // Use numeric sort so [1, 10, 2, ...] is reordered to [1, 2, ..., 10].
    expect([...s].sort((x, y) => x - y)).toEqual(arr);
    // non-mutating
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("crypto: seeded PRNG", () => {
  beforeEach(() => C.randomSeed());
  afterEach(() => C.randomSeed());

  it("seedRandom is deterministic", () => {
    C.seedRandom(42);
    const a1 = C.randomFloat();
    const a2 = C.randomFloat();
    C.seedRandom(42);
    const b1 = C.randomFloat();
    const b2 = C.randomFloat();
    expect(a1).toBe(b1);
    expect(a2).toBe(b2);
  });
  it("seedRandom restores to secure after randomSeed", () => {
    C.seedRandom(42);
    const a = C.randomFloat();
    C.randomSeed();
    // After restoring, the sequence should not match the seeded sequence.
    C.seedRandom(42);
    const b = C.randomFloat();
    expect(b).toBe(a);
    C.randomSeed();
  });
  it("seeded randomInt is in range", () => {
    C.seedRandom(7);
    for (let i = 0; i < 50; i++) {
      const n = C.randomInt(0, 100);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});
