# Aether stdlib — `random`

The `random` module is a deterministic, seedable pseudo-random number generator (PRNG). We use **xorshift128+** as the core — a small, fast, well-tested PRNG with a 128-bit state, good statistical properties, and full reproducibility from a single integer seed. The module ships 16 functions: seeding (`randomSeed`), the core (`randomNext`, `randomNextInt`, `randomNextFloat`, `randomBool`), sampling (`randomPick`, `randomShuffle`, `randomSample`, `randomChoice`, `randomInts`, `randomRange`), bytes & strings (`randomBytes`, `randomHex`, `randomUuid`), and distributions (`randomGaussian`, `randomWeighted`). All functions are pure TypeScript; throwing an `Error` from a builtin surfaces as an Aether panic.

**This is NOT cryptographically secure.** For security-sensitive randomness (tokens, session keys, etc.), use the `crypto` module.

## Why deterministic?

We chose a **seedable** PRNG over `Math.random()` because reproducibility matters more than "true" randomness in most stdlib use cases:

- **Reproducible bug reports**: when a user reports a random-driven bug, you can ask for the seed and replay the exact stream.
- **Snapshot tests**: tests with randomness can be deterministic (set a fixed seed in `beforeEach`); the snapshot doesn't flip on every run.
- **Replay simulations**: a Monte Carlo simulation can be replayed with the same seed to verify it produces the same result.
- **Property-based testing**: the same seed that produced a failing property test will reproduce it.
- **Cross-runtime parity**: the v1 tree-walker and the v2 bytecode VM produce the SAME random stream from the same seed (the PRNG is implemented in TypeScript, not native to either runtime), so test assertions hold across both.

See ADR-017 for the full design discussion. The trade-off is that we don't have access to the OS's entropy source — for crypto, use the `crypto` module.

## Seeding

`randomSeed(seed)` initializes the PRNG state from a single integer seed. Two calls with the same seed produce the same stream. We use **splitmix64** to expand a single 64-bit integer into the two 64-bit states required by xorshift128+ (this is the standard "splitmix → xorshift" pattern). On module load, we seed with a fixed constant (`0x12345678`) so the stream is deterministic out of the box — you can use `random` without seeding and get the same stream every time.

```aether
random.randomSeed(42)
random.randomNext()  // 0.7219...
random.randomNext()  // 0.3184...
random.randomSeed(42)  // reset
random.randomNext()  // 0.7219... (same as before)
random.randomNext()  // 0.3184...
```

## Core

`randomNext()` returns the next float in `[0, 1)`. We take the top 53 bits of a `u64` and divide by 2^53, giving a full-precision double. `randomNextInt(lo, hi)` returns an integer in `[lo, hi]` (inclusive — both bounds inclusive). `randomNextFloat(lo, hi)` returns a float in `[lo, hi)` (left-closed, right-open — the standard convention). `randomBool()` returns true or false with equal probability.

```aether
random.randomNext()           // 0..0.999..
random.randomNextInt(1, 6)    // 1, 2, 3, 4, 5, or 6
random.randomNextFloat(2, 5)  // 2..4.999..
random.randomBool()           // true or false
```

## Sampling

`randomPick(arr)` returns a random element from `arr` (panics if `arr` is empty). `randomShuffle(arr)` returns a Fisher-Yates shuffle into a NEW array — the input is NOT mutated. `randomSample(arr, n)` returns `n` distinct elements from `arr` (without replacement — panics if `n > arr.length`). `randomChoice(arr, n)` returns `n` elements WITH replacement (so values can repeat). `randomInts(n, lo, hi)` returns `n` distinct integers in `[lo, hi]` (panics if `hi - lo + 1 < n`). `randomRange(lo, hi)` is an alias for `randomNextInt(lo, hi)`.

```aether
random.randomPick(["a", "b", "c"])         // one of a, b, c
random.randomShuffle([1, 2, 3, 4, 5])      // e.g. [3, 1, 5, 2, 4]
random.randomSample([1, 2, 3, 4, 5], 3)    // e.g. [4, 1, 2] (distinct)
random.randomChoice(["heads", "tails"], 5) // e.g. ["heads", "tails", "heads", "heads", "tails"]
random.randomInts(3, 1, 10)                // e.g. [7, 3, 9] (distinct)
```

## Bytes & strings

`randomBytes(n)` returns `n` random bytes (each an integer in 0-255). `randomHex(n)` returns `n` random lowercase hex characters. `randomUuid()` returns a UUID v4 (lowercase, with dashes, version 4, variant 10xx — RFC 4122 compliant format).

```aether
random.randomBytes(4)    // e.g. [173, 22, 199, 87]
random.randomHex(8)      // e.g. "a7f3c9d2"
random.randomUuid()      // e.g. "1f3e9c2d-8b7a-4d2e-9c8f-1234567890ab"
```

## Distributions

`randomGaussian(mean, std)` returns a sample from a normal distribution with the given `mean` and standard deviation `std`. We use the **Box-Muller transform** — two uniforms → one normal — which gives a high-quality normal sample. `std = 0` is allowed and returns `mean` exactly.

`randomWeighted(items, weights)` returns an item from `items` selected with probability proportional to its weight in `weights` (both arrays must be the same length, all weights must be non-negative, and the total must be positive). Useful for "pick a label from a Markov chain's transition row".

```aether
// Standard normal sample
random.randomGaussian(0, 1)         // e.g. -0.42, +1.7, 0.05, ...
// Sample from a weighted list
random.randomWeighted(["low", "med", "hi"], [1, 3, 1])  // "med" 3x more likely
```

## Determinism across the VM and the tree-walker

The PRNG is implemented in TypeScript (not native to either runtime). Both the v1 tree-walker and the v2 bytecode VM call into the same TypeScript code, so the stream is identical across them. This is a critical property: tests that use randomness pass identically on both runtimes.

```aether
// In a test file:
random.randomSeed(1)
const xs = []
let i = 0
while i < 10 { push(xs, random.randomNextInt(0, 100)); i = i + 1 }
assert_eq(xs, [/* deterministic values */])
```

This test passes on both the tree-walker and the VM, regardless of which the test runner is configured to use.

## Common patterns

- **Roll a die**: `random.randomNextInt(1, 6)`.
- **Flip a coin**: `random.randomBool()`.
- **Pick a random card**: `random.randomSample([...deck], 5)` for a 5-card hand.
- **Simulate a Markov chain**: `random.randomWeighted(states, transitionMatrix[currentState])` to pick the next state.
- **Monte Carlo pi**: count points in the unit square that fall in the unit circle. With the same seed, the estimate is reproducible.
- **Generate test data**: `random.randomInts(100, 0, 1000)` for an array of distinct test keys.
- **Fuzz testing**: seed the PRNG with a known value at the start of each test, then use `random` to drive the fuzz. The seed is logged, so a failing fuzz test can be reproduced by re-running with that seed.

## What's NOT in here

- **Cryptographic randomness**: use the `crypto` module.
- **Multiple independent streams**: there's one global PRNG state. If you need multiple independent streams (e.g. in parallel processes), maintain separate "PRNG wrapper objects" manually — out of scope for stdlib.
- **Other PRNG algorithms** (PCG, Mersenne Twister, Philox): xorshift128+ covers the stdlib use cases well. Other algorithms would be a separate module.
- **Perlin noise / Simplex noise / procedural generation**: out of scope — those are domain-specific modules, not stdlib primitives.
- **Saving and restoring state**: there's no `getState` / `setState`. To "checkpoint" a stream, save the seed and the number of calls made; to resume, re-seed and burn that many values. (We don't ship a helper for this because the burn count is hard to track across all functions — each function may consume a variable number of u64s internally.)

## Performance notes

- `randomNext` is O(1) — one xorshift128+ step.
- `randomShuffle` is O(n) — Fisher-Yates is one PRNG call per element.
- `randomSample` is O(n) — Fisher-Yates on a copy, then slice.
- `randomGaussian` is O(1) — one Box-Muller step (two uniforms → one normal; the second is wasted).
- `randomBytes(n)` is O(n).
- `randomUuid` is O(1) — 16 random bytes, then format.

## When to reach for this module

- **Any time you need randomness in a stdlib-style call**: dice rolls, shuffles, sampling, weighted choices.
- **Testing**: a fixed seed gives deterministic tests. Log the seed in the test output for reproducibility.
- **Monte Carlo simulations**: reproducibility from a logged seed means a published simulation can be verified.
- **Fuzz testing**: the seed is the test case identifier.

The whole module is 16 functions, ~280 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
