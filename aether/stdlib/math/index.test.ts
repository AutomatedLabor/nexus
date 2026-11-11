import { describe, it, expect } from "vitest";
import * as M from "./index";

describe("math module", () => {
  it("abs", () => {
    expect(M.abs(-5)).toBe(5);
    expect(M.abs(5)).toBe(5);
    expect(M.abs(0)).toBe(0);
  });
  it("sign", () => {
    expect(M.sign(-3)).toBe(-1);
    expect(M.sign(0)).toBe(0);
    expect(M.sign(3)).toBe(1);
  });
  it("min / max", () => {
    expect(M.min(3, 1, 2)).toBe(1);
    expect(M.max(3, 1, 2)).toBe(3);
  });
  it("min: empty panics", () => {
    expect(() => M.min()).toThrow();
  });
  it("floor / ceil / round / trunc", () => {
    expect(M.floor(2.7)).toBe(2);
    expect(M.ceil(2.1)).toBe(3);
    expect(M.round(2.5)).toBe(3);
    expect(M.round(-2.5)).toBe(-2);
    expect(M.trunc(-2.7)).toBe(-2);
  });
  it("sqrt", () => {
    expect(M.sqrt(16)).toBe(4);
    expect(() => M.sqrt(-1)).toThrow();
  });
  it("pow", () => {
    expect(M.pow(2, 10)).toBe(1024);
    expect(M.pow(2, -1)).toBe(0.5);
  });
  it("exp / log", () => {
    expect(M.exp(0)).toBe(1);
    expect(M.log(M.E)).toBeCloseTo(1);
    expect(() => M.log(0)).toThrow();
  });
  it("log2 / log10", () => {
    expect(M.log2(8)).toBe(3);
    expect(M.log10(1000)).toBeCloseTo(3);
  });
  it("sin / cos / tan", () => {
    expect(M.sin(0)).toBe(0);
    expect(M.cos(0)).toBe(1);
    expect(M.tan(0)).toBe(0);
  });
  it("asin / acos / atan", () => {
    expect(M.asin(0)).toBe(0);
    expect(M.acos(1)).toBe(0);
    expect(M.atan(0)).toBe(0);
    expect(() => M.asin(2)).toThrow();
  });
  it("atan2", () => {
    expect(M.atan2(1, 0)).toBeCloseTo(M.PI / 2);
    expect(M.atan2(0, 1)).toBe(0);
  });
  it("PI / E constants", () => {
    expect(M.PI).toBeCloseTo(3.14159265, 5);
    expect(M.E).toBeCloseTo(2.7182818, 5);
  });
  it("gcd", () => {
    expect(M.gcd(12, 18)).toBe(6);
    expect(M.gcd(7, 5)).toBe(1);
    expect(M.gcd(-12, 18)).toBe(6);
  });
  it("lcm", () => {
    expect(M.lcm(4, 6)).toBe(12);
    expect(M.lcm(0, 5)).toBe(0);
  });
  it("clamp", () => {
    expect(M.clamp(5, 0, 10)).toBe(5);
    expect(M.clamp(-1, 0, 10)).toBe(0);
    expect(M.clamp(11, 0, 10)).toBe(10);
    expect(() => M.clamp(1, 10, 0)).toThrow();
  });
  it("lerp", () => {
    expect(M.lerp(0, 10, 0.5)).toBe(5);
    expect(M.lerp(0, 10, 0)).toBe(0);
    expect(M.lerp(0, 10, 1)).toBe(10);
  });
  it("mod: always non-negative", () => {
    expect(M.mod(7, 3)).toBe(1);
    expect(M.mod(-7, 3)).toBe(2);
    expect(() => M.mod(1, 0)).toThrow();
  });
  it("factorial", () => {
    expect(M.factorial(0)).toBe(1);
    expect(M.factorial(5)).toBe(120);
    expect(() => M.factorial(-1)).toThrow();
  });
  it("isPrime", () => {
    expect(M.isPrime(2)).toBe(true);
    expect(M.isPrime(17)).toBe(true);
    expect(M.isPrime(1)).toBe(false);
    expect(M.isPrime(15)).toBe(false);
  });
  it("sum", () => {
    expect(M.sum([1, 2, 3, 4])).toBe(10);
    expect(M.sum([])).toBe(0);
  });
  it("mean", () => {
    expect(M.mean([2, 4, 6])).toBe(4);
    expect(() => M.mean([])).toThrow();
  });
  it("trig identities", () => {
    // sin^2 + cos^2 = 1
    const x = 0.7;
    expect(M.sin(x) ** 2 + M.cos(x) ** 2).toBeCloseTo(1, 10);
  });
  it("round half-to-even-ish edge", () => {
    expect(M.round(0.5)).toBe(1);
    expect(M.round(1.5)).toBe(2);
    expect(M.round(2.5)).toBe(3);
  });
  it("pow handles zero exponent", () => {
    expect(M.pow(5, 0)).toBe(1);
  });
  it("large factorial panics", () => {
    expect(() => M.factorial(200)).toThrow();
  });
  it("max with negative numbers", () => {
    expect(M.max(-3, -1, -2)).toBe(-1);
  });
  it("atan2 quadrant", () => {
    expect(M.atan2(-1, -1)).toBeCloseTo(-3 * M.PI / 4, 5);
  });
});
