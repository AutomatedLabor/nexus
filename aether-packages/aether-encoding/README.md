# aether-encoding

Pure-Aether encoding utilities covering **base32 (RFC 4648)**,
**lowercase hex**, and **percent encoding** for whole URLs and
URL components. The package ships **8 pub functions** plus a handful
of internal helpers (UTF-8 byte codec, power-of-two helper, char-class
predicates).

Where the stdlib `encoding` module (TypeScript) leans on JS builtins
(`Buffer`, `encodeURIComponent`, `btoa`), `aether-encoding` is **100%
pure Aether**: it walks the input string with `charCode` /
`fromCharCode` / `strSlice` / `len`, converts it to a list of UTF-8
bytes, and produces the encoded output character by character. No
host calls, no regex, no imports beyond the Aether core.

## Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `base32Encode`  | `(s: string) -> string` | RFC 4648 base32, uppercase `A-Z2-7`, `=` padded. |
| `base32Decode`  | `(s: string) -> string` | Inverse; case-insensitive; ignores `=` and whitespace. |
| `hexEncode`     | `(s: string) -> string` | Lowercase hex of the UTF-8 bytes. |
| `hexDecode`     | `(s: string) -> string` | Decodes any-case hex (one byte per two nibbles). |
| `urlEncode`     | `(s: string) -> string` | Percent-encode for a *whole URL*: preserves reserved chars `;/?:@&=+$,#%` and the unreserved set. |
| `urlDecode`     | `(s: string) -> string` | Percent-decode `%XX` sequences; leaves everything else verbatim. |
| `urlEncodeComponent` | `(s: string) -> string` | Percent-encode a *URL component*: encodes everything except the unreserved set. |
| `urlDecodeComponent` | `(s: string) -> string` | Same as `urlDecode` (provided for symmetry). |

## UTF-8 substrate

All four formats operate on bytes, not characters. The package
converts the input string to a list of UTF-8 bytes first, then
packs/unpacks those bytes into the target alphabet. The codec
covers BMP code points (0..0xFFFF): code points below 0x80 use one
byte, below 0x800 use two, otherwise three. Astral characters
(outside the BMP) are encoded as two 3-byte sequences (one per
surrogate half) rather than a single 4-byte sequence — round-tripping
strings with astral characters is therefore *not* guaranteed, but
ASCII and Latin-1 text round-trips perfectly.

## Quirk avoidance

The v1 evaluator has two known quirks that this package takes
explicit care to avoid:

1. **For-loop-scope bug** (`let X;` before a `for` loop, referenced
   after, fails). Every loop in the package is a `while` with the
   index declared inside the loop body — no `for` keyword anywhere
   in the file.
2. **`return X;` after a block can fail**. Every function returns
   implicitly via its trailing expression; the `return` keyword
   does not appear in the file.

A third, more subtle quirk is also avoided: the v1 evaluator's
bitwise `|` and `&` operators coerce their operands to 32-bit
signed integers (`Math.trunc(l) | Math.trunc(r)) | 0`). Naïvely
accumulating 5 bytes (40 bits) into a single buffer would silently
wrap and produce wrong base32 output. The implementation instead
**processes one byte at a time**, so the bit buffer never exceeds
12 bits — well within the 32-bit range.

## Usage

```aether
import {
  base32Encode, base32Decode,
  hexEncode, hexDecode,
  urlEncode, urlDecode,
  urlEncodeComponent, urlDecodeComponent,
} from "aether-encoding/src/lib.ae";

// Hex
print(hexEncode("Hello"));      // -> "48656c6c6f"
print(hexDecode("48656c6c6f")); // -> "Hello"

// Base32 (RFC 4648)
print(base32Encode("foobar"));  // -> "MZXW6YTBOI======"
print(base32Decode("mzxw6ytboi======"));  // -> "foobar"

// Whole URL — reserved chars preserved
print(urlEncode("a/b?c=d"));    // -> "a/b?c=d"
print(urlEncode("hello world")); // -> "hello%20world"

// URL component — reserved chars encoded
print(urlEncodeComponent("a/b?c=d")); // -> "a%2fb%3fc%3dd"

// Round-trip
let msg = "The quick brown fox";
assert_eq(urlDecode(urlEncode(msg)), msg);
assert_eq(base32Decode(base32Encode(msg)), msg);
```

## RFC 4648 known-answer vectors

The test suite covers all six RFC 4648 §10 test vectors for
base32Encode / base32Decode:

| Input | Encoded |
|-------|---------|
| `""`    | `""` |
| `"f"`   | `"MY======"` |
| `"fo"`  | `"MZXQ===="` |
| `"foo"` | `"MZXW6==="` |
| `"foob"`| `"MZXW6YQ="` |
| `"fooba"` | `"MZXW6YTB"` |
| `"foobar"` | `"MZXW6YTBOI======"` |

The decode side is the inverse and is case-insensitive (`"mzxw6ytb"`
decodes the same as `"MZXW6YTB"`). Whitespace inside the encoded
string is ignored; invalid characters stop decoding gracefully.

## URL encoding vs. URL component encoding

The two URL encoders differ in *what* they preserve:

- **`urlEncode`** matches `encodeURI` in spirit: it preserves
  reserved structural characters (`; / ? : @ & = + $ , # %`) so
  that the URL remains structurally valid after encoding. Use this
  when you have a full URL with a known structure and only need to
  escape the "user" parts (query values, fragments, etc.).
- **`urlEncodeComponent`** matches `encodeURIComponent` in spirit:
  it encodes *everything* except the unreserved set
  (`A-Z a-z 0-9 - _ . ~`). Use this when encoding a single
  component that will later be inserted into a URL by a separate
  step (e.g. building a query string from key/value pairs).

Both decoders (`urlDecode`, `urlDecodeComponent`) are identical —
they percent-decode `%XX` sequences and leave everything else
verbatim. They do *not* convert `+` to space (that's form-encoding,
not URL encoding).

## Round-trip guarantees

For any string made of BMP code points:
- `hexDecode(hexEncode(s)) == s`
- `base32Decode(base32Encode(s)) == s`
- `urlDecode(urlEncode(s)) == s`
- `urlDecode(urlEncodeComponent(s)) == s`

The URL encoders are *not* symmetric with the decoders when the
input already contains `%` (a pre-encoded URL); `urlEncode` leaves
`%` alone to avoid double-encoding, so `urlDecode(urlEncode("%20"))`
returns `" "` rather than `"%20"`.

## Why a separate package when stdlib already has `encoding`?

The stdlib `encoding` module is implemented in TypeScript and
runs natively in the host. It's fast and complete (CSV, YAML,
TOML, msgpack, JSON, base64, …) but it's not part of the Aether
*language* — Aether code can call into it via the builtin
registration mechanism but cannot inspect or modify its
internals. `aether-encoding` is the opposite: pure Aether source,
visible to the evaluator, debuggable in the playground, and
extensible by anyone who knows Aether (no JS/TS required). The
two are complementary — use the stdlib for performance-critical
paths in host code, use `aether-encoding` when you want the
encoder to live *inside* the Aether codebase (for example, when
generating data URIs in a server-side template, or building a
hash-based URL scheme entirely in Aether).

## Installation

Drop the `aether-encoding/` directory into `aether-packages/` and
import from `"aether-encoding/src/lib.ae"`. The package has no
dependencies beyond Aether's core builtins.
