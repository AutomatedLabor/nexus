import { describe, it, expect } from "vitest";
import * as St from "./index";

describe("statistics module", () => {
  it("mean", () => {
    expect(St.mean([1, 2, 3, 4])).toBe(2.5);
    expect(St.mean([5])).toBe(5);
  });
  it("mean: empty panics", () => {
    expect(() => St.mean([])).toThrow();
  });
  it("mean: non-number panics", () => {
    expect(() => St.mean([1, "x"] as any)).toThrow();
  });

  it("median: odd", () => {
    expect(St.median([3, 1, 2])).toBe(2);
  });
  it("median: even interpolation", () => {
    expect(St.median([1, 2, 3, 4])).toBe(2.5);
  });
  it("median: empty panics", () => {
    expect(() => St.median([])).toThrow();
  });

  it("mode: unimodal", () => {
    expect(St.mode([1, 2, 2, 3])).toBe(2);
  });
  it("mode: multimodal picks smallest", () => {
    expect(St.mode([1, 1, 2, 2, 3])).toBe(1);
  });

  it("variance: population", () => {
    expect(St.variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4, 5);
  });
  it("stdDev: population", () => {
    expect(St.stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5);
  });
  it("sampleVariance", () => {
    expect(St.sampleVariance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 5);
  });
  it("sampleVariance: 1 element panics", () => {
    expect(() => St.sampleVariance([5])).toThrow();
  });

  it("min_ / max_ / range / sum_ / product", () => {
    expect(St.min_([3, 1, 2])).toBe(1);
    expect(St.max_([3, 1, 2])).toBe(3);
    expect(St.range([3, 1, 2])).toBe(2);
    expect(St.sum_([1, 2, 3, 4])).toBe(10);
    expect(St.product([1, 2, 3, 4])).toBe(24);
  });
  it("min_: empty panics", () => {
    expect(() => St.min_([])).toThrow();
  });

  it("percentile: median matches", () => {
    expect(St.percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });
  it("percentile: 0 / 100 match min / max", () => {
    expect(St.percentile([10, 20, 30, 40, 50], 0)).toBe(10);
    expect(St.percentile([10, 20, 30, 40, 50], 100)).toBe(50);
  });
  it("percentile: linear interpolation", () => {
    // For [10,20,30,40], p=25 -> rank 0.75 -> 0.25*10+0.75*20 = 17.5
    expect(St.percentile([10, 20, 30, 40], 25)).toBe(17.5);
  });
  it("percentile: out of range panics", () => {
    expect(() => St.percentile([1, 2, 3], 150)).toThrow();
  });

  it("quartiles", () => {
    const q = St.quartiles([1, 2, 3, 4, 5, 6, 7, 8]);
    // n=8; rank(25)=1.75 -> 0.25*2+0.75*3 = 2.75; median=4.5; rank(75)=5.25 -> 0.75*6+0.25*7 = 6.25
    expect(q[0]).toBeCloseTo(2.75, 5);
    expect(q[1]).toBe(4.5);
    expect(q[2]).toBeCloseTo(6.25, 5);
  });
  it("iqr", () => {
    const i = St.iqr([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(i).toBeCloseTo(3.5, 5); // 6.25 - 2.75
  });

  it("skewness: symmetric ~ 0", () => {
    expect(St.skewness([1, 2, 3, 4, 5])).toBeCloseTo(0, 5);
  });
  it("skewness: right-skewed > 0", () => {
    expect(St.skewness([1, 2, 3, 4, 100])).toBeGreaterThan(0);
  });
  it("skewness: need 3+ elements", () => {
    expect(() => St.skewness([1, 2])).toThrow();
  });

  it("kurtosis: normal-ish small", () => {
    // A flat uniform has kurtosis ~ -1.2 (excess)
    const k = St.kurtosis([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(k).toBeLessThan(0);
  });
  it("kurtosis: need 4+ elements", () => {
    expect(() => St.kurtosis([1, 2, 3])).toThrow();
  });

  it("covariance: positive correlation", () => {
    // population covariance: sum((a-ma)*(b-mb)) / N = 4/3
    expect(St.covariance([1, 2, 3], [2, 4, 6])).toBeCloseTo(4 / 3, 5);
  });
  it("covariance: mismatched lengths panics", () => {
    expect(() => St.covariance([1, 2], [1])).toThrow();
  });

  it("correlation: perfect positive", () => {
    expect(St.correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });
  it("correlation: perfect negative", () => {
    expect(St.correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
  });
  it("correlation: zero variance panics", () => {
    expect(() => St.correlation([1, 1, 1], [1, 2, 3])).toThrow();
  });

  it("linearRegression: line y = 2x + 1", () => {
    const xs = [1, 2, 3, 4];
    const ys = [3, 5, 7, 9];
    const r = St.linearRegression(xs, ys);
    expect(r.slope).toBeCloseTo(2, 10);
    expect(r.intercept).toBeCloseTo(1, 10);
    expect(r.r2).toBeCloseTo(1, 10);
  });
  it("linearRegression: zero-x variance panics", () => {
    expect(() => St.linearRegression([5, 5, 5], [1, 2, 3])).toThrow();
  });

  it("rSquare", () => {
    expect(St.rSquare([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it("zScore", () => {
    const z = St.zScore([10, 10, 10, 20], 15);
    // mean=12.5, var=popvar of [10,10,10,20] = (6.25*3 + 56.25)/4 = (18.75+56.25)/4 = 75/4=18.75, sd=sqrt(18.75)
    const sd = Math.sqrt(18.75);
    expect(z).toBeCloseTo((15 - 12.5) / sd, 5);
  });
  it("zScore: zero sd panics", () => {
    expect(() => St.zScore([5, 5, 5], 5)).toThrow();
  });

  it("histogram: basic", () => {
    expect(St.histogram([1, 2, 3, 4, 5], 5)).toEqual([1, 1, 1, 1, 1]);
  });
  it("histogram: clamps to last bin", () => {
    expect(St.histogram([1, 1, 5, 5, 5], 2)).toEqual([2, 3]);
  });
  it("histogram: bad bins panics", () => {
    expect(() => St.histogram([1, 2, 3], 0)).toThrow();
  });

  it("cumulativeSum", () => {
    expect(St.cumulativeSum([1, 2, 3, 4])).toEqual([1, 3, 6, 10]);
  });
  it("cumulativeSum: empty", () => {
    expect(St.cumulativeSum([])).toEqual([]);
  });

  it("movingAverage", () => {
    expect(St.movingAverage([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
  });
  it("movingAverage: window larger than arr panics", () => {
    expect(() => St.movingAverage([1, 2], 5)).toThrow();
  });

  it("exponentialSmooth", () => {
    const out = St.exponentialSmooth([1, 2, 3], 0.5);
    // out[0]=1; out[1]=0.5*2+0.5*1=1.5; out[2]=0.5*3+0.5*1.5=2.25
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(1);
    expect(out[1]).toBeCloseTo(1.5, 10);
    expect(out[2]).toBeCloseTo(2.25, 10);
  });
  it("exponentialSmooth: empty", () => {
    expect(St.exponentialSmooth([], 0.5)).toEqual([]);
  });
  it("exponentialSmooth: bad alpha panics", () => {
    expect(() => St.exponentialSmooth([1, 2], 2)).toThrow();
  });

  it("chiSquare", () => {
    expect(St.chiSquare([10, 10], [10, 10])).toBe(0);
    expect(St.chiSquare([10, 10], [5, 15])).toBeCloseTo(25 / 5 + 25 / 15, 5);
  });
  it("chiSquare: zero expected panics", () => {
    expect(() => St.chiSquare([1, 2], [0, 1])).toThrow();
  });
  it("chiSquare: mismatched lengths panics", () => {
    expect(() => St.chiSquare([1, 2], [1])).toThrow();
  });
});
