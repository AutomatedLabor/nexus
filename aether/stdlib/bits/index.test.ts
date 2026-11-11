import { describe, it, expect } from "vitest";
import * as B from "./index";

describe("bits module", () => {
  it("bitAnd / bitOr / bitXor", () => {
    expect(B.bitAnd(0b1100, 0b1010)).toBe(0b1000);
    expect(B.bitOr(0b1100, 0b1010)).toBe(0b1110);
    expect(B.bitXor(0b1100, 0b1010)).toBe(0b0110);
  });
  it("bitNot", () => {
    expect(B.bitNot(0)).toBe(0xffffffff);
    expect(B.bitNot(0xff)).toBe(0xffffff00);
  });

  it("bitShl", () => {
    expect(B.bitShl(1, 3)).toBe(8);
    expect(B.bitShl(0xff, 24)).toBe(0xff000000);
  });
  it("bitShr: logical (zero-fill)", () => {
    expect(B.bitShr(0xff000000, 24)).toBe(0xff);
    expect(B.bitShr(-1, 1)).toBe(0x7fffffff);
  });
  it("bitSar: arithmetic (sign-fill)", () => {
    expect(B.bitSar(-8, 1)).toBe(-4);
    expect(B.bitSar(8, 1)).toBe(4);
  });

  it("bitRotate: left by 4", () => {
    expect(B.bitRotate(0x12345678, 4)).toBe(0x23456781);
  });
  it("bitRotate: by 0 returns same", () => {
    expect(B.bitRotate(0xdeadbeef, 0)).toBe(0xdeadbeef);
  });
  it("bitRotate: full wrap (32) returns same", () => {
    expect(B.bitRotate(0xdeadbeef, 32)).toBe(0xdeadbeef);
  });
  it("bitRotate: negative n rotates right", () => {
    // Rotate-right by 4 == rotate-left by 28
    expect(B.bitRotate(0x12345678, -4)).toBe(B.bitRotate(0x12345678, 28));
  });

  it("bitCount", () => {
    expect(B.bitCount(0)).toBe(0);
    expect(B.bitCount(0xff)).toBe(8);
    expect(B.bitCount(0xffffffff)).toBe(32);
    expect(B.bitCount(0b10110110)).toBe(5);
  });
  it("leadingZeros", () => {
    expect(B.leadingZeros(0)).toBe(32);
    expect(B.leadingZeros(1)).toBe(31);
    expect(B.leadingZeros(0x80000000)).toBe(0);
    expect(B.leadingZeros(0xff)).toBe(24);
  });
  it("trailingZeros", () => {
    expect(B.trailingZeros(0)).toBe(32);
    expect(B.trailingZeros(1)).toBe(0);
    expect(B.trailingZeros(0x80000000)).toBe(31);
    expect(B.trailingZeros(0b10000)).toBe(4);
  });
  it("highestBit", () => {
    expect(B.highestBit(0)).toBe(-1);
    expect(B.highestBit(1)).toBe(0);
    expect(B.highestBit(0x80000000)).toBe(31);
    expect(B.highestBit(0b10000)).toBe(4);
  });
  it("lowestBit", () => {
    expect(B.lowestBit(0)).toBe(-1);
    expect(B.lowestBit(1)).toBe(0);
    expect(B.lowestBit(0x80000000)).toBe(31);
    expect(B.lowestBit(0b10100)).toBe(2);
  });

  it("bitTest", () => {
    expect(B.bitTest(0b1010, 1)).toBe(true);
    expect(B.bitTest(0b1010, 0)).toBe(false);
    expect(B.bitTest(0x80000000, 31)).toBe(true);
  });
  it("bitSet: set", () => {
    expect(B.bitSet(0, 3, true)).toBe(0b1000);
  });
  it("bitSet: clear", () => {
    expect(B.bitSet(0b1111, 1, false)).toBe(0b1101);
  });
  it("bitFlip", () => {
    expect(B.bitFlip(0b0000, 2)).toBe(0b0100);
    expect(B.bitFlip(0b0100, 2)).toBe(0b0000);
  });

  it("bitMerge", () => {
    // a = 0b1010, b = 0b0101, mask = 0b1100
    // bit 3: mask=1 -> take b (b3=0) -> 0
    // bit 2: mask=1 -> take b (b2=1) -> 1
    // bit 1: mask=0 -> take a (a1=1) -> 1
    // bit 0: mask=0 -> take a (a0=0) -> 0
    // result = 0b0110 = 6
    expect(B.bitMerge(0b1010, 0b0101, 0b1100)).toBe(0b0110);
  });

  it("bitExtract: simple", () => {
    expect(B.bitExtract(0b11010, 1, 3)).toBe(0b101);
  });
  it("bitExtract: full field", () => {
    expect(B.bitExtract(0xffffffff, 0, 32)).toBe(0xffffffff);
  });
  it("bitExtract: len 0 returns 0", () => {
    expect(B.bitExtract(0xffffffff, 4, 0)).toBe(0);
  });

  it("grayCode", () => {
    expect(B.grayCode(0)).toBe(0);
    expect(B.grayCode(1)).toBe(1);
    expect(B.grayCode(2)).toBe(3);
    expect(B.grayCode(3)).toBe(2);
    expect(B.grayCode(4)).toBe(6);
    // Consecutive Gray codes differ by exactly one bit.
    let prev = B.grayCode(0);
    for (let n = 1; n < 16; n++) {
      const g = B.grayCode(n);
      expect(B.bitCount(g ^ prev)).toBe(1);
      prev = g;
    }
  });

  it("non-number panics", () => {
    expect(() => B.bitAnd("x" as any, 1)).toThrow();
    expect(() => B.bitCount(NaN)).toThrow();
    expect(() => B.bitTest(0, "x" as any)).toThrow();
  });
  it("bit position out of range panics", () => {
    expect(() => B.bitTest(0, 32)).toThrow();
    expect(() => B.bitSet(0, -1, true)).toThrow();
  });
});
