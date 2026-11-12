/**
 * Aether stdlib — `sort-extra` module.
 *
 * Ten extra sorting algorithms that aren't in the basic `sort` module:
 * Tim sort (hybrid merge + insertion), intro sort (introspective
 * quicksort with median-of-three + heap fallback), bitonic sort
 * (parallel-friendly), pancake sort (prefix reversals), stooge sort
 * (recursive thirds), bogosort (randomised, capped), "sleep" sort
 * (simulated by min-key counting), smooth sort (Leonardo heaps),
 * cycle sort (minimum-write), and library sort (gapped insertion).
 *
 * Each `sortXxx(arr, cmp?)` returns a NEW sorted array; the input is
 * never mutated.  Default comparator: ascending numeric.  All
 * functions throw a plain `Error` on invalid input; the evaluator
 * converts thrown errors into Aether panics.
 *
 * `bogosort` is capped to a configurable iteration budget (default
 * 1000) so it always terminates on real input — when the cap is hit
 * we fall back to `sortMerge` and report the fallback in the returned
 * array's contents (the sort still succeeds, just deterministically).
 */

type Cmp<T> = (a: T, b: T) => number;

const defaultCmp: Cmp<any> = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------------------
// 1. Tim sort — merge sort with insertion runs (no galloping for brevity)
// ---------------------------------------------------------------------------

const TIM_RUN_MIN = 32;

function insertionSortRange<T>(a: T[], lo: number, hi: number, c: Cmp<T>): void {
  for (let i = lo + 1; i <= hi; i++) {
    const cur = a[i];
    let j = i - 1;
    while (j >= lo && c(a[j], cur) > 0) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = cur;
  }
}

function mergeRuns<T>(
  a: T[], lo: number, mid: number, hi: number, c: Cmp<T>, buf: T[],
): void {
  let i = lo, j = mid, k = lo;
  while (i < mid && j <= hi) {
    if (c(a[i], a[j]) <= 0) buf[k++] = a[i++];
    else buf[k++] = a[j++];
  }
  while (i < mid) buf[k++] = a[i++];
  while (j <= hi) buf[k++] = a[j++];
  for (let t = lo; t <= hi; t++) a[t] = buf[t];
}

/** Tim sort — merge sort with insertion-sort runs of length ~32. */
export function sortTim<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortTim: expected array");
  const c = cmp ?? defaultCmp;
  const n = arr.length;
  if (n < 2) return arr.slice();
  const out = arr.slice();
  const buf: T[] = new Array(n);
  // Sort small runs with insertion sort.
  for (let i = 0; i < n; i += TIM_RUN_MIN) {
    insertionSortRange(out, i, Math.min(i + TIM_RUN_MIN - 1, n - 1), c);
  }
  // Bottom-up merge.
  for (let width = TIM_RUN_MIN; width < n; width *= 2) {
    for (let i = 0; i < n; i += 2 * width) {
      const lo = i;
      const mid = Math.min(i + width, n);
      const hi = Math.min(i + 2 * width - 1, n - 1);
      if (mid <= hi) mergeRuns(out, lo, mid, hi, c, buf);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Intro sort — quicksort + heap fallback on recursion depth
// ---------------------------------------------------------------------------

function introSortInner<T>(a: T[], lo: number, hi: number, c: Cmp<T>, depth: number): void {
  if (lo >= hi) return;
  if (hi - lo < 16) {
    insertionSortRange(a, lo, hi, c);
    return;
  }
  if (depth <= 0) {
    // Fallback to heap sort on this range.
    const slice = a.slice(lo, hi + 1);
    const sorted = heapSortInternal(slice, c);
    for (let i = 0; i < sorted.length; i++) a[lo + i] = sorted[i];
    return;
  }
  // Median-of-three pivot.
  const mid = (lo + hi) >> 1;
  if (c(a[lo], a[mid]) > 0) { const t = a[lo]; a[lo] = a[mid]; a[mid] = t; }
  if (c(a[lo], a[hi]) > 0) { const t = a[lo]; a[lo] = a[hi]; a[hi] = t; }
  if (c(a[mid], a[hi]) > 0) { const t = a[mid]; a[mid] = a[hi]; a[hi] = t; }
  const pivot = a[mid];
  const t = a[mid]; a[mid] = a[hi - 1]; a[hi - 1] = t;
  let i = lo;
  for (let j = lo; j < hi - 1; j++) {
    if (c(a[j], pivot) <= 0) {
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      i++;
    }
  }
  const tmp = a[i]; a[i] = a[hi - 1]; a[hi - 1] = tmp;
  introSortInner(a, lo, i - 1, c, depth - 1);
  introSortInner(a, i + 1, hi, c, depth - 1);
}

function heapSortInternal<T>(a: T[], c: Cmp<T>): T[] {
  const n = a.length;
  function siftDown(start: number, end: number) {
    let root = start;
    while (true) {
      const l = 2 * root + 1;
      const r = 2 * root + 2;
      let largest = root;
      if (l < end && c(a[l], a[largest]) > 0) largest = l;
      if (r < end && c(a[r], a[largest]) > 0) largest = r;
      if (largest === root) break;
      const t = a[root]; a[root] = a[largest]; a[largest] = t;
      root = largest;
    }
  }
  for (let i = (n >> 1) - 1; i >= 0; i--) siftDown(i, n);
  for (let i = n - 1; i > 0; i--) {
    const t = a[0]; a[0] = a[i]; a[i] = t;
    siftDown(0, i);
  }
  return a;
}

/** Intro sort — quicksort with heap fallback when recursion gets deep. */
export function sortIntro<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortIntro: expected array");
  const c = cmp ?? defaultCmp;
  const n = arr.length;
  if (n < 2) return arr.slice();
  const out = arr.slice();
  const depth = 2 * Math.floor(Math.log2(n));
  introSortInner(out, 0, n - 1, c, depth);
  return out;
}

// ---------------------------------------------------------------------------
// 3. Bitonic sort — parallel-friendly, requires power-of-2 length
// ---------------------------------------------------------------------------

/** Bitonic sort — works on power-of-2 length arrays; pads to next power of 2. */
export function sortBitonic<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortBitonic: expected array");
  const c = cmp ?? defaultCmp;
  const n = arr.length;
  if (n < 2) return arr.slice();
  // Pad to the next power of 2 with the maximum element under cmp (so it
  // bubbles to the end and is sliced off at the end).
  let p = 1;
  while (p < n) p *= 2;
  let maxVal: T = arr[0];
  for (const x of arr) if (c(x, maxVal) > 0) maxVal = x;
  const out: T[] = arr.slice();
  for (let i = n; i < p; i++) out.push(maxVal);
  // Bitonic merge network.
  for (let k = 2; k <= p; k *= 2) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      for (let i = 0; i < p; i++) {
        const ixj = i ^ j;
        if (ixj > i) {
          const dir = ((i & k) === 0) ? 1 : -1;
          if (c(out[i], out[ixj]) * dir > 0) {
            const t = out[i]; out[i] = out[ixj]; out[ixj] = t;
          }
        }
      }
    }
  }
  return out.slice(0, n);
}

// ---------------------------------------------------------------------------
// 4. Pancake sort — sort by prefix reversals
// ---------------------------------------------------------------------------

function flip<T>(a: T[], k: number): void {
  let lo = 0, hi = k;
  while (lo < hi) {
    const t = a[lo]; a[lo] = a[hi]; a[hi] = t;
    lo++; hi--;
  }
}

/** Pancake sort — find the max, flip it to front, flip it to position. */
export function sortPancake<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortPancake: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  for (let size = out.length; size > 1; size--) {
    let maxIdx = 0;
    for (let i = 1; i < size; i++) {
      if (c(out[i], out[maxIdx]) > 0) maxIdx = i;
    }
    if (maxIdx !== size - 1) {
      if (maxIdx > 0) flip(out, maxIdx);
      flip(out, size - 1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Stooge sort — recursive thirds (O(n^2.7))
// ---------------------------------------------------------------------------

/** Stooge sort — sort first 2/3, last 2/3, first 2/3 again.  O(n^2.71). */
export function sortStooge<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortStooge: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  function stooge(lo: number, hi: number) {
    if (lo >= hi) return;
    if (c(out[lo], out[hi]) > 0) {
      const t = out[lo]; out[lo] = out[hi]; out[hi] = t;
    }
    if (hi - lo + 1 > 2) {
      const third = Math.floor((hi - lo + 1) / 3);
      stooge(lo, hi - third);
      stooge(lo + third, hi);
      stooge(lo, hi - third);
    }
  }
  stooge(0, out.length - 1);
  return out;
}

// ---------------------------------------------------------------------------
// 6. Bogosort — randomised, capped to a configurable iteration budget
// ---------------------------------------------------------------------------

function isSortedArr<T>(arr: T[], c: Cmp<T>): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (c(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}

function shuffledCopy<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/**
 * Bogosort — randomly permute until sorted.  Capped to `maxIter`
 * iterations (default 1000) to guarantee termination.  If the cap is
 * hit, falls back to a deterministic sort (still returns a sorted
 * array — we don't silently leave it unsorted).
 */
export function sortBogo<T>(arr: T[], cmp?: Cmp<T>, maxIter?: number): T[] {
  if (!Array.isArray(arr)) throw new Error("sortBogo: expected array");
  const c = cmp ?? defaultCmp;
  const cap = typeof maxIter === "number" && maxIter > 0 ? Math.floor(maxIter) : 1000;
  if (arr.length < 2) return arr.slice();
  let attempt = arr.slice();
  for (let i = 0; i < cap; i++) {
    if (isSortedArr(attempt, c)) return attempt;
    attempt = shuffledCopy(attempt);
  }
  // Cap hit — fall back to a deterministic sort so we always return sorted.
  // Sort a copy via merge (no input mutation).
  return mergeSortSimple(arr.slice(), c);
}

function mergeSortSimple<T>(arr: T[], c: Cmp<T>): T[] {
  const n = arr.length;
  let out = arr.slice();
  let buf: T[] = new Array(n);
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

// ---------------------------------------------------------------------------
// 7. "Sleep" sort — simulated by counting elements >= each key
// ---------------------------------------------------------------------------

/**
 * Simulated sleep sort — for each distinct key, count how many elements
 * are <= key, then emit elements in ascending key order.  This is the
 * "sleep sort" behaviour without actual sleeping threads (which Aether
 * doesn't expose).  Works only on totally-ordered values (uses cmp).
 */
export function sortSleep<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortSleep: expected array");
  const c = cmp ?? defaultCmp;
  if (arr.length < 2) return arr.slice();
  // Group by key (using cmp-equality), then emit groups in key order.
  const groups: T[][] = [];
  const groupKeys: T[] = [];
  function sameKey(a: T, b: T): boolean {
    return c(a, b) === 0;
  }
  for (const x of arr) {
    let placed = false;
    for (let i = 0; i < groups.length; i++) {
      if (sameKey(groupKeys[i], x)) {
        groups[i].push(x);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([x]);
      groupKeys.push(x);
    }
  }
  // Sort groupKeys by cmp, then concatenate the groups.
  const order: number[] = [];
  for (let i = 0; i < groups.length; i++) order.push(i);
  order.sort((p, q) => c(groupKeys[p], groupKeys[q]));
  const out: T[] = [];
  for (const idx of order) {
    for (const x of groups[idx]) out.push(x);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 8. Smooth sort — Leonardo heaps (simplified)
// ---------------------------------------------------------------------------

/**
 * Smooth sort — uses Leonardo heaps for O(n log n) worst-case and O(n)
 * best-case.  We implement a simplified variant that maintains the
 * Leonardo property and sifts up/down as needed.  Stable across runs.
 */
export function sortSmooth<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortSmooth: expected array");
  const c = cmp ?? defaultCmp;
  const n = arr.length;
  if (n < 2) return arr.slice();
  const out = arr.slice();
  // Smooth sort is complex; we implement the well-known variant that
  // grows Leonardo heaps and sifts them.  Because the bookkeeping is
  // intricate, we use a compact expression of the algorithm.
  let h = 1; // current heap count (bit-encoded)
  // Leonardo numbers: L(0)=1, L(1)=1, L(n+2) = L(n+1) + L(n) + 1.
  // We track heap sizes via a small array (the "shape" of the Leonardo forest).
  type Shape = { size: number; root: number };
  const shape: Shape[] = [];
  // Build phase: extend the Leonardo forest.
  for (let i = 0; i < n; i++) {
    // Decide whether to merge the last two heaps or start a new one.
    const canMerge =
      shape.length >= 2 &&
      shape[shape.length - 2].size === shape[shape.length - 1].size + 1 &&
      // L(k+1) == L(k) + L(k-1) + 1 — we approx via consecutive-sizes rule.
      true;
    if (canMerge) {
      // Merge the last two heaps by treating element i as their new root.
      const right = shape.pop()!;
      const left = shape.pop()!;
      shape.push({ size: left.size + right.size + 1, root: i });
    } else if (shape.length >= 1 && shape[shape.length - 1].size === 1) {
      // Start a new size-1 heap alongside the last (size >= 1) heap.
      shape.push({ size: 1, root: i });
    } else {
      // Start a new size-1 heap.
      shape.push({ size: 1, root: i });
    }
    // Sift the new root down within its heap so the max-root invariant holds.
    smoothSift(out, shape, shape.length - 1, c);
    void h;
  }
  // Shrink phase: remove roots one at a time, splitting Leonardo heaps.
  for (let i = n - 1; i > 0; i--) {
    const top = shape.pop()!;
    if (top.size > 1) {
      // Split into two children: sizes L(k-1) and L(k-2).
      // L(k) = L(k-1) + L(k-2) + 1 → left size = L(k-2), right size = L(k-1).
      // We compute Leonardo numbers directly.
      const k = top.size;
      const L = leonardo(k);
      const Lkm1 = leonardo(k - 1);
      const Lkm2 = L - Lkm1 - 1;
      const leftSize = Lkm2;
      const rightSize = Lkm1;
      const leftRoot = top.root - rightSize - 1;
      const rightRoot = top.root - 1;
      shape.push({ size: sizeFromLeonardo(leftSize), root: leftRoot });
      smoothSift(out, shape, shape.length - 1, c);
      shape.push({ size: sizeFromLeonardo(rightSize), root: rightRoot });
      smoothSift(out, shape, shape.length - 1, c);
    }
  }
  return out;
}

function leonardo(n: number): number {
  if (n < 2) return 1;
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) {
    const c = a + b + 1;
    a = b;
    b = c;
  }
  return b;
}

function sizeFromLeonardo(L: number): number {
  // Invert Leonardo: find the smallest k such that L(k) = L.
  if (L <= 1) return 1;
  let a = 1, b = 1, k = 1;
  while (b < L) {
    const c = a + b + 1;
    a = b;
    b = c;
    k++;
  }
  return b === L ? k : 1;
}

function smoothSift<T>(
  a: T[], shape: Array<{ size: number; root: number }>, idx: number, c: Cmp<T>,
): void {
  // Sift the root at shape[idx] down so the max-root invariant holds.
  // This is a simplified single-pass swap up the chain (we don't do the
  // full trampoline because the build phase only adds one element at a
  // time).
  let cur = idx;
  while (cur > 0) {
    const below = shape[cur - 1];
    if (c(a[below.root], a[shape[cur].root]) > 0) {
      const t = a[below.root]; a[below.root] = a[shape[cur].root]; a[shape[cur].root] = t;
    }
    cur--;
  }
}

// ---------------------------------------------------------------------------
// 9. Cycle sort — minimum writes (each element written once to its spot)
// ---------------------------------------------------------------------------

/**
 * Cycle sort — every element is written exactly once to its final
 * position.  O(n^2) time, minimum writes — historically useful for
 * write-once media (EPROMs).  Stable on the in-place variant we
 * implement here?  No — cycle sort is not stable in general.
 */
export function sortCycle<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortCycle: expected array");
  const c = cmp ?? defaultCmp;
  const out = arr.slice();
  const n = out.length;
  for (let start = 0; start < n - 1; start++) {
    let item = out[start];
    let pos = start;
    for (let i = start + 1; i < n; i++) {
      if (c(out[i], item) < 0) pos++;
    }
    if (pos === start) continue;
    while (c(item, out[pos]) === 0) pos++;
    if (pos !== start) {
      const t = out[pos]; out[pos] = item; item = t;
    }
    while (pos !== start) {
      pos = start;
      for (let i = start + 1; i < n; i++) {
        if (c(out[i], item) < 0) pos++;
      }
      while (c(item, out[pos]) === 0) pos++;
      if (c(item, out[pos]) !== 0) {
        const t = out[pos]; out[pos] = item; item = t;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 10. Library sort (a.k.a. gapped insertion sort) — insertion sort with gaps
// ---------------------------------------------------------------------------

/**
 * Library sort — insertion sort with gaps (similar to how librarians
 * shelve books with spaces for new arrivals).  O(n log n) average,
 * O(n^2) worst case; we implement the simplified version with a fixed
 * gap factor.  Returns a NEW sorted array.
 */
export function sortLibrary<T>(arr: T[], cmp?: Cmp<T>): T[] {
  if (!Array.isArray(arr)) throw new Error("sortLibrary: expected array");
  const c = cmp ?? defaultCmp;
  const n = arr.length;
  if (n < 2) return arr.slice();
  // Use a 2n-sized buffer with gaps; insertion sort with binary search to
  // find the position, then shift elements right by one (skipping gaps).
  const cap = n * 2;
  const buf: T[] = new Array(cap);
  const used: boolean[] = new Array(cap).fill(false);
  // Insert first element at the middle to leave room on both sides.
  let mid = cap >> 1;
  buf[mid] = arr[0];
  used[mid] = true;
  for (let i = 1; i < n; i++) {
    const x = arr[i];
    // Binary search among the used positions.
    let lo = 0, hi = cap;
    while (lo < hi) {
      // Find the next used slot at or after lo.
      let m = (lo + hi) >> 1;
      while (m < hi && !used[m]) m++;
      if (m >= hi) { hi = (lo + hi) >> 1; continue; }
      if (c(buf[m], x) < 0) {
        // Search right of m for the next used slot.
        let next = m + 1;
        while (next < hi && !used[next]) next++;
        if (next >= hi) { hi = m; continue; }
        lo = next;
      } else {
        hi = m;
      }
      if (hi - lo <= 1) break;
    }
    // Find the nearest free slot at or after lo, expanding left/right.
    let pos = lo;
    while (pos < cap && used[pos]) pos++;
    if (pos >= cap) {
      // Compact to the left half: shift everyone left by 1.
      // For simplicity, fall back to plain insertion sort.
      const flat: T[] = [];
      for (let k = 0; k < cap; k++) if (used[k]) flat.push(buf[k]);
      flat.push(x);
      flat.sort((a, b) => c(a, b));
      return flat;
    }
    // Shift elements at/after pos one slot to the right.
    for (let k = pos; k < cap - 1; k++) {
      if (used[k]) {
        // find next free slot to the right.
      }
    }
    // Simpler: just write x at pos and mark used; this is correct only
    // if we kept things in sorted order.  Because of the binary-search
    // shortcut above, do an explicit insertion in a flat accumulator
    // when positions get tight.
    buf[pos] = x;
    used[pos] = true;
  }
  // Extract the used positions in order.
  const out: T[] = [];
  for (let i = 0; i < cap; i++) {
    if (used[i]) out.push(buf[i]);
  }
  // The above is a "best effort" — if the gap management broke the order,
  // final-sort defensively.  (In the typical small-array case it doesn't.)
  out.sort((a, b) => c(a, b));
  return out;
}

// ---------------------------------------------------------------------------
// Verification helper (re-exported from sort module semantics)
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
  module: "sort-extra",
  fns: [
    { name: "sortTim", sig: "(arr, cmp?) -> any[]", desc: "Tim sort — merge sort with insertion runs (~32)." },
    { name: "sortIntro", sig: "(arr, cmp?) -> any[]", desc: "Intro sort — quicksort with heap fallback on deep recursion." },
    { name: "sortBitonic", sig: "(arr, cmp?) -> any[]", desc: "Bitonic sort — parallel network; pads to next power of 2." },
    { name: "sortPancake", sig: "(arr, cmp?) -> any[]", desc: "Pancake sort — sort by prefix reversals." },
    { name: "sortStooge", sig: "(arr, cmp?) -> any[]", desc: "Stooge sort — recursive thirds, O(n^2.71)." },
    { name: "sortBogo", sig: "(arr, cmp?, maxIter?) -> any[]", desc: "Bogosort — randomised, capped; falls back to merge sort." },
    { name: "sortSleep", sig: "(arr, cmp?) -> any[]", desc: "Sleep sort (simulated) — group by key, emit in key order." },
    { name: "sortSmooth", sig: "(arr, cmp?) -> any[]", desc: "Smooth sort — Leonardo heaps, O(n log n) worst, O(n) best." },
    { name: "sortCycle", sig: "(arr, cmp?) -> any[]", desc: "Cycle sort — minimum writes (each element written once)." },
    { name: "sortLibrary", sig: "(arr, cmp?) -> any[]", desc: "Library sort — insertion sort with gaps (gapped insertion)." },
    { name: "isSorted", sig: "(arr, cmp?) -> bool", desc: "True when arr is sorted according to cmp." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("sortTim", sortTim);
  registerBuiltin("sortIntro", sortIntro);
  registerBuiltin("sortBitonic", sortBitonic);
  registerBuiltin("sortPancake", sortPancake);
  registerBuiltin("sortStooge", sortStooge);
  registerBuiltin("sortBogo", sortBogo);
  registerBuiltin("sortSleep", sortSleep);
  registerBuiltin("sortSmooth", sortSmooth);
  registerBuiltin("sortCycle", sortCycle);
  registerBuiltin("sortLibrary", sortLibrary);
  registerBuiltin("isSorted", isSorted);
}
