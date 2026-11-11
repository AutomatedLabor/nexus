# base64_codec.ae

A from-scratch Base64 encoder and decoder that implements
RFC 4648 by hand. Aether's v1 evaluator doesn't expose
`charCodeAt` or `String.fromCharCode` to scripts, so we build
a 95-character ASCII lookup table at runtime and use it to
convert between strings and byte values.

## What it does

1. **`char_to_byte(c)`** — looks up a printable ASCII char
   (codes 32–126) in a built table and returns its byte value,
   or `-1` for chars outside that range.
2. **`byte_to_char(b)`** — the inverse: returns the ASCII
   char for a byte 0–127 (returns `"?"` outside the supported
   range).
3. **`b64_encode(s)`** — converts the input string to bytes,
   then encodes 3 bytes → 4 base64 chars (each representing 6
   bits). Trailing 1 or 2 leftover bytes get padded with `=`
   to make the output length a multiple of 4.
4. **`b64_decode(s)`** — strips `=` and whitespace, looks up
   each char in the 64-char alphabet, then decodes 4 × 6-bit
   values → 3 bytes. Handles the trailing 2 or 3 leftover
   values (1 or 2 bytes out).
5. **Driver** — round-trips 8 test strings (`"A"`, `"AB"`,
   `"ABC"`, `"Hello"`, `"Hello, World!"`, `"Aether language"`,
   `"abc 123 xyz"`, `"The quick brown fox"`). Prints each
   input, the encoded form, and the decoded form with an
   `ok` / `MISMATCH` flag.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/base64_codec.ae
```

## Key language features

- **`reduce` over `[string]`** for table construction.
- **Bit extraction via division and modulo** — `int(triple / 262144) % 64`
  emulates `(triple >> 18) & 63` because Aether's `>>` coerces
  to int32 (overflows at 2^31). The 24-bit triple stays within
  2^24 so this works fine.
- **String concatenation** — `out = out + val_to_b64(c0) + val_to_b64(c1) + ...`.
- **`while`-loop iteration** over the input string via
  `let mut i = 0; while i < len(s) { ... i = i + 1; }`.

## Expected output

```
== Base64 encode/decode (from scratch) ==

  input:    'Hello, World!'
  encoded:  SGVsbG8sIFdvcmxkIQ==
  decoded:  'Hello, World!'  (ok)
...
All assertions passed.
```

## Design notes

The known vectors (`"A" → "QQ=="`, `"ABC" → "QUJD"`,
`"Hello" → "SGVsbG8="`, `"Hello, World!" → "SGVsbG8sIFdvcmxkIQ=="`)
match RFC 4648 §10. The round-trip property
`decode(encode(s)) == s` is asserted for all test strings.
The decoder is whitespace-tolerant (it skips `\n`, `\r`,
spaces) so wrapped base64 strings decode correctly too.
