/**
 * Aether stdlib — `sort` module.
 *
 * A small but complete sorting suite: 14 algorithms covering the
 * textbook comparison sorts (bubble, insertion, selection, merge,
 * quick, heap), the stable+unstable contrast (gnome vs comb, etc.),
 * the non-comparison sorts (counting, radix, bucket), and a few
 * "exotic" sorts often used for teaching (shell, cocktail, comb,
 * gnome).  Each `sortXxx(arr, cmp?)` returns a NEW sorted array; the
 * input is never mutated.  Default comparator: ascending numeric.
 *
 * `isSorted(arr, cmp?)` is a small helper that checks whether an array
 * is sorted according to `cmp` — useful as a property-test oracle and
 * for verifying sort results in user code.
 *
 * All functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 */

type Cmp<T> = (a: T, b: T) => number;

const defaultCmp: Cmp<any> = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// Comparison sorts
// ---------------------------------------------------------------------------

/** Bubble sort: repeatedly swap adjacent out-of-order pairs.  O(n²). */
export function sortBubble<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortBubble: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  const n = out.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      if (c(out[j], out[j + 1]) > 0) {
        const tmp = out[j]; out[j] = out[j + 1]; out[j + 1] = tmp;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return out;
}

/** Insertion sort: pull each element back to its place.  O(n²). */
export function sortInsertion<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortInsertion: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  for (let i = 1; i < out.length; i++) {
    const cur = out[i];
    let j = i - 1;
    while (j >= 0 && c(out[j], cur) > 0) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = cur;
  }
  return out;
}

/** Selection sort: find the minimum and swap to the front.  O(n²). */
export function sortSelection<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortSelection: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  for (let i = 0; i < out.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < out.length; j++) {
      if (c(out[j], out[min]) < 0) min = j;
    }
    if (min !== i) {
      const tmp = out[i]; out[i] = out[min]; out[min] = tmp;
    }
  }
  return out;
}

/** Merge sort: split, sort halves, merge.  O(n log n) stable. */
export function sortMerge<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortMerge: expected array");
  const c = cmp ?? defaultCmp;
  // Iterative bottom-up merge — avoids recursion-stack issues on long arrays.
  const n = arr.length;
  let out = arr.slice();
  let buf = new Array<T>(n);
  for (let width = 1; width < n; width *= 2) {
    for (let i = 0; i < n; i += 2 * width) {
      const lo = i;
      const mid = Math.min(i + width, n);
      const hi = Math.min(i + 2 * width, n);
      let a = lo, b = mid, k = lo;
      while (a < mid && b < hi) {
        if (c(out[a], out[b]) <= 0) buf[k++] = out[a++];
        else buf[k++] = out[b++];
      }
      while (a < mid) buf[k++] = out[a++];
      while (b < hi) buf[k++] = out[b++];
    }
    [out, buf] = [buf, out];
  }
  return out;
}

/** Quick sort: Lomuto partition with median-of-three pivot.  O(n log n) avg. */
export function sortQuick<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortQuick: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  // Iterative quick sort with an explicit stack to avoid recursion.
  const stack: Array<[number, number]> = [[0, out.length - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop() as [number, number];
    if (lo >= hi) continue;
    // Median-of-three pivot: median of out[lo], out[mid], out[hi].
    const mid = (lo + hi) >> 1;
    if (c(out[lo], out[mid]) > 0) { const t = out[lo]; out[lo] = out[mid]; out[mid] = t; }
    if (c(out[lo], out[hi]) > 0) { const t = out[lo]; out[lo] = out[hi]; out[hi] = t; }
    if (c(out[mid], out[hi]) > 0) { const t = out[mid]; out[mid] = out[hi]; out[hi] = t; }
    const pivot = out[mid];
    // Lomuto partition with pivot placed at hi-1.
    const t = out[mid]; out[mid] = out[hi - 1]; out[hi - 1] = t;
    let i = lo;
    for (let j = lo; j < hi - 1; j++) {
      if (c(out[j], pivot) <= 0) {
        const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        i++;
      }
    }
    const tmp = out[i]; out[i] = out[hi - 1]; out[hi - 1] = tmp;
    stack.push([lo, i - 1]);
    stack.push([i + 1, hi]);
  }
  return out;
}

/** Heap sort: build a heap, repeatedly pop.  O(n log n) in-place. */
export function sortHeap<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortHeap: expected array");
  const c = cmp ?? defaultCmp;
  // Treat as min-heap (so popping gives ascending order).  Build by sifting down.
  const out = arr.slice();
  const n = out.length;
  const less = (a: number, b: number) => c(out[a], out[b]) > 0; // for min-heap, want larger-index to bubble up
  // Actually we want max-heap with reversed cmp so popping puts largest at end.
  // Simpler: build max-heap using `c(a, b) < 0` as "a is bigger".
  function siftDownMax(start: number, end: number) {
    let root = start;
    while (true) {
      const l = 2 * root + 1;
      const r = 2 * root + 2;
      let largest = root;
      if (l < end && c(out[l], out[largest]) > 0) largest = l;
      if (r < end && c(out[r], out[largest]) > 0) largest = r;
      if (largest === root) break;
      const tmp = out[root]; out[root] = out[largest]; out[largest] = tmp;
      root = largest;
    }
  }
  for (let i = (n >> 1) - 1; i >= 0; i--) siftDownMax(i, n);
  for (let i = n - 1; i > 0; i--) {
    const tmp = out[0]; out[0] = out[i]; out[i] = tmp;
    siftDownMax(0, i);
  }
  void less;
  return out;
}

/** Shell sort: insertion sort with diminishing gaps.  O(n^1.3) typically. */
export function sortShell<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortShell: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  let gap = out.length >> 1;
  while (gap > 0) {
    for (let i = gap; i < out.length; i++) {
      const cur = out[i];
      let j = i;
      while (j >= gap && c(out[j - gap], cur) > 0) {
        out[j] = out[j - gap];
        j -= gap;
      }
      out[j] = cur;
    }
    gap >>= 1;
  }
  return out;
}

/** Cocktail (shaker) sort: bidirectional bubble sort.  O(n²). */
export function sortCocktail<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortCocktail: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  let lo = 0, hi = out.length - 1;
  while (lo < hi) {
    let swapped = false;
    for (let i = lo; i < hi; i++) {
      if (c(out[i], out[i + 1]) > 0) {
        const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t;
        swapped = true;
      }
    }
    hi--;
    if (!swapped) break;
    swapped = false;
    for (let i = hi; i > lo; i--) {
      if (c(out[i - 1], out[i]) > 0) {
        const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t;
        swapped = true;
      }
    }
    lo++;
    if (!swapped) break;
  }
  return out;
}

/** Comb sort: bubble sort with shrinking gap.  O(n log n) typical. */
export function sortComb<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortComb: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  let gap = out.length;
  const shrink = 1.3;
  let sorted = false;
  while (!sorted) {
    gap = Math.floor(gap / shrink);
    if (gap <= 1) { gap = 1; sorted = true; }
    for (let i = 0; i + gap < out.length; i++) {
      if (c(out[i], out[i + gap]) > 0) {
        const t = out[i]; out[i] = out[i + gap]; out[i + gap] = t;
        sorted = false;
      }
    }
  }
  return out;
}

/** Gnome sort: walking a gnome forward (compare with prev) or backward (swap).  O(n²). */
export function sortGnome<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortGnome: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  let i = 1;
  while (i < out.length) {
    if (i === 0 || c(out[i - 1], out[i]) <= 0) {
      i++;
    } else {
      const t = out[i]; out[i] = out[i - 1]; out[i - 1] = t;
      i--;
    }
  }
  return out;
}

/** Stable sort: a wrapper around `sortMerge` (which is stable) under a
 *  chosen comparator.  Alias for clarity in user code. */
export function sortStable<T>(arr: T[], cmp?: Cmp<T>): T[] {
  return sortMerge(arr, cmp);
}

// ---------------------------------------------------------------------------
// Non-comparison sorts (integers only)
// ---------------------------------------------------------------------------

/** Counting sort: O(n + max) — only for non-negative integers. */
export function sortCounting(arr: number[], max: number): number[] {
  if (!Array.isArray(arr)) throw new Error("sortCounting: expected array");
  if (!Number.isInteger(max) || max < 0) throw new Error("sortCounting: max must be a non-negative int");
  for (const x of arr) {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x > max) {
      throw new Error("sortCounting: each element must be an integer in [0, max]");
    }
  }
  const counts = new Array<number>(max + 1).fill(0);
  for (const x of arr) counts[x]++;
  const out: number[] = [];
  for (let v = 0; v <= max; v++) {
    for (let k = 0; k < counts[v]; k++) out.push(v);
  }
  return out;
}

/** Radix sort (LSD, base 10): O(n * k) — non-negative integers only. */
export function sortRadix(arr: number[]): number[] {
  if (!Array.isArray(arr)) throw new Error("sortRadix: expected array");
  for (const x of arr) {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0) {
      throw new Error("sortRadix: each element must be a non-negative integer");
    }
  }
  if (arr.length === 0) return [];
  const out = arr.slice();
  let max = 0;
  for (const x of out) if (x > max) max = x;
  const buckets: number[][] = [];
  for (let i = 0; i < 10; i++) buckets.push([]);
  let exp = 1;
  while (Math.floor(max / exp) > 0) {
    for (const x of out) buckets[Math.floor(x / exp) % 10].push(x);
    let k = 0;
    for (let b = 0; b < 10; b++) {
      for (const x of buckets[b]) out[k++] = x;
      buckets[b].length = 0;
    }
    exp *= 10;
  }
  return out;
}

/** Bucket sort: distribute into `n` buckets, sort each, concatenate.
 *  For numeric arrays only — uses the min/max to bucket. */
export function sortBucket(arr: number[], n: number): number[] {
  if (!Array.isArray(arr)) throw new Error("sortBucket: expected array");
  if (!Number.isInteger(n) || n <= 0) throw new Error("sortBucket: n must be a positive int");
  if (arr.length === 0) return [];
  let lo = arr[0], hi = arr[0];
  for (const x of arr) { if (x < lo) lo = x; if (x > hi) hi = x; }
  if (lo === hi) return arr.slice();
  const buckets: number[][] = [];
  for (let i = 0; i < n; i++) buckets.push([]);
  const span = hi - lo;
  for (const x of arr) {
    const b = Math.min(n - 1, Math.floor(((x - lo) / span) * n));
    buckets[b].push(x);
  }
  const out: number[] = [];
  for (const b of buckets) {
    b.sort((a, c) => a - c);
    for (const x of b) out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/** True when `arr` is sorted ascending (or according to `cmp`). */
export function isSorted<T>(arr: T[], cmp?: Cmp<T>): boolean {
  if (!Array.isArray(arr)) throw new Error("isSorted: expected array");
  const c = cmp ?? defaultCmp;
  for (let i = 1; i < arr.length; i++) {
    if (c(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const MANIFEST = {
  module: "sort",
  fns: [
    { name: "sortBubble", sig: "(arr, cmp?) -> any[]", desc: "Bubble sort (O(n^2), stable)." },
    { name: "sortInsertion", sig: "(arr, cmp?) -> any[]", desc: "Insertion sort (O(n^2), stable)." },
    { name: "sortSelection", sig: "(arr, cmp?) -> any[]", desc: "Selection sort (O(n^2), not stable)." },
    { name: "sortMerge", sig: "(arr, cmp?) -> any[]", desc: "Merge sort (O(n log n), stable)." },
    { name: "sortQuick", sig: "(arr, cmp?) -> any[]", desc: "Quick sort, Lomuto + median-of-three (avg O(n log n))." },
    { name: "sortHeap", sig: "(arr, cmp?) -> any[]", desc: "Heap sort (O(n log n), not stable)." },
    { name: "sortCounting", sig: "(arr, max) -> int[]", desc: "Counting sort for integers in [0, max]." },
    { name: "sortRadix", sig: "(arr) -> int[]", desc: "Radix sort (LSD, base 10) for non-negative ints." },
    { name: "sortBucket", sig: "(arr, n) -> number[]", desc: "Bucket sort into n buckets (numeric only)." },
    { name: "sortShell", sig: "(arr, cmp?) -> any[]", desc: "Shell sort with halving gap." },
    { name: "sortCocktail", sig: "(arr, cmp?) -> any[]", desc: "Cocktail (shaker) sort — bidirectional bubble." },
    { name: "sortComb", sig: "(arr, cmp?) -> any[]", desc: "Comb sort — bubble with shrinking gap." },
    { name: "sortGnome", sig: "(arr, cmp?) -> any[]", desc: "Gnome sort — a 'walking' insertion variant." },
    { name: "sortStable", sig: "(arr, cmp?) -> any[]", desc: "Stable sort — alias for sortMerge." },
    { name: "isSorted", sig: "(arr, cmp?) -> bool", desc: "True when arr is sorted according to cmp." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("sortBubble", sortBubble);
  registerBuiltin("sortInsertion", sortInsertion);
  registerBuiltin("sortSelection", sortSelection);
  registerBuiltin("sortMerge", sortMerge);
  registerBuiltin("sortQuick", sortQuick);
  registerBuiltin("sortHeap", sortHeap);
  registerBuiltin("sortCounting", sortCounting);
  registerBuiltin("sortRadix", sortRadix);
  registerBuiltin("sortBucket", sortBucket);
  registerBuiltin("sortShell", sortShell);
  registerBuiltin("sortCocktail", sortCocktail);
  registerBuiltin("sortComb", sortComb);
  registerBuiltin("sortGnome", sortGnome);
  registerBuiltin("sortStable", sortStable);
  registerBuiltin("isSorted", isSorted);
}
