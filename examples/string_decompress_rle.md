# string_decompress_rle.ae

Run-length decoding: the inverse of `string_compress_rle.ae`.
Expand a string of the form `"count char count char ..."` back
into the original run of characters.

## What it does

1. **`digit_value(c)`** — convert a single digit char to its
   integer value via chained if/else (Aether v1 has no
   `switch`).
2. **`is_digit(c)`** — return true if `c` is one of `"0".."9"`.
3. **`repeat_char(c, n)`** — build a string by concatenating
   `c` `n` times via a `while` loop.
4. **`rle_decode(s)`** — walk the input with an index `i`:
   - Parse all consecutive digits forming the count.
   - The next character is the run character.
   - Emit `repeat_char(run_char, count)`, advance `i`.
5. **Driver** — runs the decoder on a set of samples,
   including multi-digit counts (`"12a"` → `"aaaaaaaaaaaa"`).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/string_decompress_rle.ae
```

## Key language features

- **`while` loop with explicit `i` index** — the canonical
  parser pattern when you need to advance the index by
  variable amounts (vs. a fixed step).
- **`count = count * 10 + digit_value(str(s[i]))`** — the
  standard multi-digit integer parser.
- **`is_digit` returns `int` (`0` or `1`)** rather than
  `bool` — Aether v1 doesn't have a `[bool]` literal form
  in the type checker's mind, so we use `int` consistently.

## Expected output

```
== String decompression (RLE) ==

  "3a2b1c"  (6 chars) -> "aaabbc"  (6 chars)
  "2a3b2a"  (6 chars) -> "aabbbaa"  (7 chars)
  "1a1b1c"  (6 chars) -> "abc"  (3 chars)
  "7z"  (2 chars) -> "zzzzzzz"  (7 chars)
  "12a"  (3 chars) -> "aaaaaaaaaaaa"  (12 chars)
  "3a10b2c"  (7 chars) -> "aaabbbbbbbbbbcc"  (15 chars)
  ""  (0 chars) -> ""  (0 chars)

round-trip: rle_decode("3a2b1c") = "aaabbc" (expected "aaabbc") [ok]

All assertions passed.
```

## Design notes

- The decoder handles multi-digit counts (e.g., `"12a"` →
  12 `a`s), which the simple single-digit decoder wouldn't.
  This is the canonical RLE decoder format.
- The round-trip demo confirms `rle_decode("3a2b1c")` gives
  back `"aaabbc"`, the original input to the encoder in
  `string_compress_rle.ae`. The two files form a complete
  encode / decode pair.
- The `else` branch of the inner loop (advance `i` even on
  malformed input) is defensive — without it, a malformed
  input like `"abc"` (no leading digit) would loop forever.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
