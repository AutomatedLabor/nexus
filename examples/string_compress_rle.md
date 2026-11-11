# string_compress_rle.ae

Run-length encoding (RLE): compress a string by replacing each
run of identical characters with the count followed by the
character. So

```
"aaabbc"  ->  "3a2b1c"
"aabbbaa" ->  "a2b3a2"
```

## What it does

1. **`rle_encode(s)`** — walk the input with a `while` loop,
   tracking the current run's character (`run_char`) and
   length (`run_len`). When the character changes (or we hit
   the end), append `str(run_len) + run_char` to the output
   and reset. The output always includes a count (even for
   runs of length 1), so the decoder is unambiguous.
2. **Driver** — runs the encoder on a set of samples,
   including the empty string, all-zeros, mixed-case strings,
   and "Hello, World!" (which demonstrates that RLE is
   ineffective on text without long runs — the encoded
   output is *longer* than the input).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/string_compress_rle.ae
```

## Key language features

- **`while` loop with `mut` accumulators** — the canonical
  RLE pattern. Safe with `while` (no for-loop-scope quirk).
- **`str(run_len)` to convert the count to a string** for
  concatenation.
- **`reduce` to render the int array as a pretty string**
  (used in the round-trip demonstration).

## Expected output

```
== String compression (RLE) ==

  "aaabbc"  (6 chars) -> "3a2b1c"  (6 chars, ~100% of original)
  "aabbbaa"  (7 chars) -> "2a3b2a"  (6 chars, ~85% of original)
  "abc"  (3 chars) -> "1a1b1c"  (6 chars, ~200% of original)
  ""  (0 chars) -> ""  (0 chars, ~0% of original)
  "zzzzzzz"  (7 chars) -> "7z"  (2 chars, ~28% of original)
  "AAAAAaaaaBBBBcccc"  (17 chars) -> "5A4a4B4c"  (8 chars, ~47% of original)
  "Hello, World!"  (13 chars) -> "1H1e2l1o1,1 1W1o1r1l1d1!"  (26 chars, ~200% of original)

re-encoding the encoding: rle("3a2b1c") = "111a121b111c"

All assertions passed.
```

## Design notes

- RLE is most effective on inputs with long runs of the
  same character (think fax transmissions, simple bitmaps,
  DNA sequences with long homopolymer stretches). It is
  *pathological* on ordinary text — every "run" of length
  1 doubles in size (`"a" -> "1a"`).
- The output format `"3a2b1c"` (count-first) is one
  convention; the other (`"a3b2c1"` char-first) is also
  common. The decoder in `string_decompress_rle.ae`
  understands the count-first format.
- The "re-encoding the encoding" line demonstrates that
  RLE is *not* idempotent: `rle("3a2b1c")` gives
  `"111a121b111c"` because the encoding itself has no
  runs of length > 1 (each digit and each letter is a
  run of length 1).
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
