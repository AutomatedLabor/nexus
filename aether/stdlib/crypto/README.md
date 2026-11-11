# Aether stdlib — `crypto`

The `crypto` module provides Aether programs with hashing primitives, secure random number generation, and a small set of utilities (UUIDs, shuffling, seeded PRNG) that are commonly needed in real applications.  Everything that can be synchronous *is* synchronous and uses no external dependency.  The single exception is `sha512`, which uses the platform's Web Crypto API (or Node's `crypto` module) and therefore returns a `Promise<string>` — Aether v1's evaluator is synchronous, so callers must use the planned async runtime or the playground's `runAsync` helper to consume it (see the `async` module README for details).

## Hashing

### `md5(s) -> string`
Synchronous MD5 hex digest, implemented in pure TypeScript.  MD5 is **not** cryptographically secure — use it only for non-security tasks (legacy checksums, cache keys).  Verified against the standard vectors `md5("") = "d41d8cd98f00b204e9800998ecf8427e"`, `md5("abc") = "900150983cd24fb0d6963f7d28e17f72"`, `md5("message digest") = "f96b697d7cb7938d525a2f31aaf161d0"`.

```aether
crypto.md5("abc")   // "900150983cd24fb0d6963f7d28e17f72"
```

### `sha1(s) -> string`
Synchronous SHA-1 hex digest, implemented in pure TypeScript.  SHA-1 is also considered broken for cryptographic purposes (collision resistance is gone), but it remains useful for non-adversarial checksums (e.g. Git's object IDs, content-addressable storage).

```aether
crypto.sha1("abc")  // "a9993e364706816aba3e25717850c26c9cd0d89d"
crypto.sha1("")       // "da39a3ee5e6b4b0d3255bfef95601890afd80709"
```

### `sha256(s) -> string`
Synchronous SHA-256 hex digest, implemented in pure TypeScript.  SHA-256 is currently considered secure for general cryptographic use.  Verified against the standard vectors including the 1-million-`a` test vector (`cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0`).

```aether
crypto.sha256("")    // "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
crypto.sha256("abc") // "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
```

### `sha512(s) -> Promise<string>`
Asynchronous SHA-512 hex digest via Web Crypto (browser) or Node's `crypto` module.  Returns a `Promise<string>`; the Aether evaluator's planned async runtime can `await` it.

```aether
let h = await crypto.sha512("abc")
// h == "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a..."
```

### `djb2(s) -> int`
DJB2 non-cryptographic 32-bit hash.  Tiny and fast; useful as a hash-table keying function.  The initial hash value is 5381, then `h = (h * 33) ^ c` for each character code.

```aether
crypto.djb2("hello")   // a 32-bit unsigned integer
```

### `fnv1a(s) -> int`
FNV-1a non-cryptographic 32-bit hash.  Initial value 0x811c9dc5, then `h ^= c; h = h * 0x01000193` for each character code.  Better distribution than DJB2 for short keys.

```aether
crypto.fnv1a("hello")  // a 32-bit unsigned integer
```

## Random

All random helpers use **cryptographically secure** sources by default.  In a browser they call `crypto.getRandomValues`; in Node they call `crypto.randomBytes`.  When you need reproducibility (testing, simulations), call `seedRandom(seed)` to switch to a deterministic Mulberry32 stream — subsequent calls to `randomFloat` draw from the stream until you call `randomSeed()` to restore the secure source.

### `randomInt(min, max) -> int`
Returns a uniformly random integer in `[min, max]` (inclusive on both ends).  Uses rejection sampling so the output is unbiased regardless of the range.  Panics when `max < min` or when the range exceeds `2^32`.

```aether
crypto.randomInt(0, 9)    // 0..9 with equal probability
crypto.randomInt(5, 5)    // always 5
```

### `randomFloat() -> float`
Returns a uniformly random float in `[0, 1)` with 53 bits of precision (the same precision as `Math.random`).  Honors the seeded PRNG: when `seedRandom(seed)` has been called, the stream is deterministic.

```aether
crypto.randomFloat()    // a float in [0, 1)
```

### `randomBytes(n) -> int[]`
Returns an array of `n` cryptographically secure random bytes (each 0–255).  Panics for negative `n`.

```aether
crypto.randomBytes(16)   // 16 random bytes
crypto.randomBytes(0)    // []
```

### `uuid4() -> string`
Returns a random UUID v4 string of the form `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where `y` is `8`, `9`, `a`, or `b` (the variant bits).  Uses `randomBytes(16)` and sets the version/variant bits per RFC 4122.

```aether
crypto.uuid4()   // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

### `randomChoice(arr) -> any`
Returns a uniformly random element from `arr`.  Panics on an empty array.

```aether
crypto.randomChoice([10, 20, 30])   // one of 10, 20, or 30
```

### `shuffle(arr) -> any[]`
Fisher-Yates shuffle using `randomInt` for unbiased index selection.  Non-mutating — the input array is preserved and a new shuffled array is returned.

```aether
let s = crypto.shuffle([1, 2, 3, 4, 5])
// s has the same elements as the input, possibly in a different order
```

### `seedRandom(seed) -> void`
Switches the random source to a deterministic Mulberry32 stream seeded with `seed` (an integer).  Subsequent calls to `randomFloat` draw from this stream until `randomSeed()` is called.  `randomInt` continues to use the secure source even in seeded mode (so its output is always unbiased) — for seeded simulations, draw a uniform float and scale it yourself if you need reproducible `randomInt`-like behaviour.

```aether
crypto.seedRandom(42)
let a = crypto.randomFloat()
crypto.seedRandom(42)
let b = crypto.randomFloat()
// a == b (deterministic)
```

### `randomSeed() -> void`
Restores the secure random source.

## Why pure JS for SHA-256, SHA-1, and MD5?

The synchronous subset of the crypto module is implemented in pure TypeScript rather than relying on Web Crypto for three reasons:

1. **Sync usability.**  Aether's v1 evaluator is synchronous (see the `async` module README).  If hashing required `await`, Aether programs couldn't compute a hash inside a normal function — that would make even trivial programs (caching keys, deduplication tokens) awkward.  Pure-JS SHA-256 etc. run synchronously and return a string directly.
2. **No browser-vs-Node divergence.**  Web Crypto's `crypto.subtle.digest` is async-only; Node's `crypto.createHash` is sync but unavailable in a browser.  Pure JS runs in both environments identically.
3. **Auditability.**  The implementation fits in a single file and is verifiably correct against published test vectors.  No native code, no surprise behaviour.

The trade-off is throughput — pure-JS SHA-256 is roughly 50–150 MiB/s on a modern machine, while a native implementation can do 500+ MiB/s.  For the playground, REPL, and most application workloads the JS speed is fine; if you need to hash gigabytes, reach for a streaming helper built on top of `sha512` (which uses the native path).

## Why async for SHA-512?

SHA-512 is harder to implement efficiently in pure JS because it uses 64-bit arithmetic.  JS can do it via `BigInt` or via two-32-bit-word emulation, but both are noticeably slower than a native implementation.  Since Web Crypto and Node's `crypto` both ship SHA-512 (and SHA-1, SHA-256), the only reason to ship a pure-JS SHA-512 would be sync usability — and the Aether runtime already plans an async path (see the `async` module).  So we delegate to the native implementation and accept the `Promise` return type.

## Limitations and security notes

- **MD5 and SHA-1 are broken for cryptographic collision resistance.**  Use them only for non-adversarial purposes.  For password storage, signatures, or any context where an attacker might construct a malicious input, use SHA-256 or SHA-512.
- **The seeded PRNG (Mulberry32) is not cryptographically secure.**  It is suitable for testing, simulations, and games; do not use it for security tokens.
- **`randomInt` is unbiased** because of rejection sampling — but it makes two `secureRandomBytes` calls per iteration when the range does not divide 2^32.  This is negligible for typical ranges (< 1000 calls/second on any platform) but if you need millions of random integers per second, prefer `randomBytes` and assemble the integer yourself.
- **No HMAC, KDF, or AEAD helpers** are provided in this module.  Those are planned for a future `crypto.advanced` module that builds on top of the primitives here.
