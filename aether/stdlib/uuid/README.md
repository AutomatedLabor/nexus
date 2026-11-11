# Aether stdlib — `uuid`

The `uuid` module generates, parses, and inspects RFC 4122 UUIDs. It implements UUID v1 (time + random), v3 (MD5 namespace + name), v4 (random), and v5 (SHA-1 namespace + name), plus parsing, stringification, comparison, version/variant inspection, the nil and max UUIDs, and the well-known DNS / URL / OID namespace UUIDs. Every function is a pure TypeScript implementation; the SHA-1 and MD5 implementations are self-contained (the crypto module exposes only hex-string digests, but we need raw bytes for UUID construction).

## Why this module

The crypto module already ships `uuid4()`, but it stops there. Real systems also need:

- **v5 (name-based) UUIDs** for deterministic ID assignment ("give me the same UUID for `('dns', 'python.org')` every time" — essential for content-addressable storage, build system artifact IDs, and test fixtures).
- **v1 (time-based) UUIDs** for sortable, low-collision IDs in event logs.
- **Parsing and stringification** for converting between wire format and in-memory representation.
- **Version/variant inspection** to validate that a UUID came from the expected generator.

This module covers all of that. The SHA-1 implementation here is verified against the canonical Python test vector `uuid5(NAMESPACE_DNS, "python.org") == "886313e1-3b8a-5372-9b90-0c9aee199e5d"`, and MD5 against `uuid3(NAMESPACE_DNS, "python.org") == "6fa459ea-ee8a-3ca4-894e-db77e160355e"`.

## Conventions

- **Canonical form** is lowercase 8-4-4-4-12 hex: `550e8400-e29b-41d4-a716-446655440000`. `uuidStringify` always returns lowercase; `uuidParse` accepts uppercase, lowercase, and brace-wrapped forms.
- **All bytes are `Uint8Array(16)`** when in-memory. The wire form is always the canonical string.
- **Random source** is `crypto.getRandomValues` in the browser, `crypto.randomBytes` in Node, falling back to `Math.random` only if neither is available (with a comment that this is not cryptographically secure). In practice you'll always get the secure source.
- **v1 is "well-formed but not strictly RFC-correct"**: the clock sequence and node ID are random per call rather than tracking per-process state. This is fine for the vast majority of uses (you get a sortable, low-collision UUID with the version nibble set correctly), but it does mean two calls within the same millisecond could theoretically produce the same UUID. For RFC-strict v1 you'd need to track a per-process clock_seq counter.
- **Deterministic UUIDs (v3, v5)** take `(name, namespace)` — note the order is name first, then the namespace UUID. This matches the Aether convention of "thing first, context second".

## Generators

`uuid4()` returns a random UUID (v4). `uuid1()` returns a time-based UUID (v1, well-formed). `uuid3(name, namespace)` and `uuid5(name, namespace)` return name-based UUIDs using MD5 and SHA-1 respectively — deterministic for the same input.

```aether
uuid.uuid4()                                  // e.g. "550e8400-e29b-41d4-a716-446655440000"
uuid.uuid1()                                  // e.g. "a3bb1942-1c8e-11f1-9b8a-0800200c9a66"
uuid.uuid5("python.org", uuid.uuidNamespaceDNS())  // "886313e1-3b8a-5372-9b90-0c9aee199e5d"
uuid.uuid3("python.org", uuid.uuidNamespaceDNS())  // "6fa459ea-ee8a-3ca4-894e-db77e160355e"
```

The v3 and v5 functions are deterministic — same input always produces the same UUID. This makes them ideal for:

- **Content-addressable storage**: `uuid5(fileContent, fileNamespace)` gives the same UUID for the same content, so two clients uploading the same file deduplicate to the same ID.
- **Test fixtures**: hardcode a UUID in your test, compute the same UUID in your code, compare.
- **Stable IDs across systems**: two services that agree on a naming scheme and namespace UUID will independently produce the same IDs without coordinating.

## Parse / stringify

`uuidParse(s)` parses a canonical UUID string (lowercase, uppercase, or brace-wrapped) to a `Uint8Array(16)`. Invalid input panics. `uuidStringify(bytes)` is the inverse — it always returns lowercase. Round-tripping preserves the value exactly: `uuidStringify(uuidParse(s)) === s.toLowerCase()`.

```aether
const b = uuid.uuidParse("550E8400-E29B-41D4-A716-446655440000")  // 16-byte array
uuid.uuidStringify(b)  // "550e8400-e29b-41d4-a716-446655440000"
uuid.uuidParse("not-a-uuid")  // panics
uuid.uuidStringify(new Uint8Array(15))  // panics: expected 16 bytes
```

## Inspection

`uuidVersion(s)` returns the version nibble (1, 2, 3, 4, or 5). `uuidVariant(s)` returns the variant code: 0 for NCS (reserved), 1 for RFC 4122 (what we generate), 2 for Microsoft, 3 for reserved-future. `uuidIsValid(s)` is the strict validator: it returns true only when `s` is a canonical UUID with the RFC 4122 variant bit set and a known version nibble. (The nil UUID has version 0, so `uuidIsValid(uuidNil())` is false — by design; the nil UUID is a special case that should be checked with `s === uuidNil()` if you need to accept it.)

```aether
uuid.uuidVersion(uuid.uuid4())   // 4
uuid.uuidVariant(uuid.uuid4())   // 1
uuid.uuidIsValid(uuid.uuid4())    // true
uuid.uuidIsValid("not-a-uuid")    // false
uuid.uuidIsValid(uuid.uuidNil())  // false (version 0 not in [1..5])
```

## Comparison

`uuidCompare(a, b)` compares two UUIDs lexicographically by their 16-byte representations. Returns -1, 0, or 1. Useful for sorting UUIDs as keys in a tree or sorted set. The nil UUID sorts first (it's all-zeros); the max UUID sorts last.

```aether
uuid.uuidCompare("00000000-0000-0000-0000-000000000000", uuid.uuidMax())  // -1
uuid.uuidCompare(uuid.uuidMax(), "00000000-0000-0000-0000-000000000000")  // 1
uuid.uuidCompare(u, u)                                                    // 0
```

## Nil and Max UUIDs

`uuidNil()` returns the nil UUID `00000000-0000-0000-0000-000000000000` — a sentinel meaning "no UUID" (useful as a default value or to indicate "not yet assigned"). `uuidMax()` returns the max UUID `ffffffff-ffff-ffff-ffff-ffffffffffff` — a sentinel meaning "greater than any UUID" (useful in range queries: "give me everything up to max").

## Well-known namespaces

`uuidNamespaceDNS()`, `uuidNamespaceURL()`, and `uuidNamespaceOID()` return the RFC 4122 Appendix C namespace UUIDs. Use them with `uuid5`/`uuid3` for domain-, URL-, or OID-namespaced UUIDs. The convention is that two systems using the same namespace and the same name will independently produce the same UUID — so a v5 UUID with the DNS namespace and name `"python.org"` is universally `"886313e1-3b8a-5372-9b90-0c9aee199e5d"`.

```aether
uuid.uuidNamespaceDNS()  // "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
uuid.uuidNamespaceURL()  // "6ba7b811-9dad-11d1-80b4-00c04fd430c8"
uuid.uuidNamespaceOID()  // "6ba7b812-9dad-11d1-80b4-00c04fd430c8"
```

## Implementation notes

- The SHA-1 implementation is the standard 80-round Merkle–Damgård construction with big-endian 32-bit word ordering. It's verified against the canonical Python `uuid5(NAMESPACE_DNS, "python.org")` test vector.
- The MD5 implementation is the standard 64-round Merkle–Damgård construction with little-endian 32-bit word ordering. Verified against the Python `uuid3(NAMESPACE_DNS, "python.org")` test vector.
- Both implementations are sync, take UTF-8 byte arrays, and return raw 16-byte (or 20-byte for SHA-1) digests. No external dependencies.
- The v1 generator computes the Gregorian timestamp (`Date.now() + 12219292800000`) and converts to 100-ns intervals (the RFC 4122 time format). It uses random clock sequence and random node bytes, which means it's well-formed (version 1, RFC 4122 variant) but not strictly RFC-conformant (RFC requires tracking per-process state to guarantee monotonicity).

The whole module is 15 public functions, ~430 lines of TypeScript (including the SHA-1 and MD5 implementations, ~150 lines), no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
