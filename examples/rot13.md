# rot13.ae

ROT13 — shift each letter by 13 positions in the alphabet.
Since 13 is half of 26, ROT13 is its own inverse: applying it
twice returns the original text. That makes it a no-key
cipher: useful only for hiding spoilers / puzzle answers
from casual reading.

## What it does

1. **`find_pos(c, alphabet)`** — linear scan of `c` in
   `alphabet`, returns the index (or -1).
2. **`rot13_char(c)`** — ROT13 a single character. Uppercase
   letters map within `UPPER`, lowercase within `LOWER`;
   other characters pass through unchanged. The shift
   `(pos + 13) % 26` works cleanly because `13 < 26`.
3. **`rot13(s)`** — ROT13 a whole string: build a `[string]`
   of single chars via a `while` loop, then `reduce` over
   the char array applying `rot13_char` to each.
4. **Driver** — encodes `"Hello, World!"` → `"Uryyb, Jbeyq!"`,
   decodes it back, and runs a table of additional samples
   (including the alphabet itself, both cases).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/rot13.ae
```

## Key language features

- **Lookup string + `str(ALPHABET[i])`** — Aether v1 has no
  `char(int)` builtin, so we work around it with a 26-char
  alphabet and index into it.
- **`reduce` over a `[string]` of chars** — the canonical
  pattern for applying a per-char transform to a string.
- **Modulo `% 26` for wrap-around** — works here because
  the shift is positive (13), avoiding any negative-operand
  modulo quirk.

## Expected output

```
== ROT13 ==

input:    "Hello, World!"
encoded:  "Uryyb, Jbeyq!"
decoded:  "Hello, World!"  (should equal input)

  "AETHER"
    -> "NRGURE"
    -> "AETHER"  [ok]
  "attack at dawn"
    -> "nggnpx ng qnja"
    -> "attack at dawn"  [ok]
  ...
All assertions passed.
```

## Design notes

- ROT13 is a special case of the Caesar cipher (see
  `caesar_cipher.ae`) with `shift = 13`. The self-inverse
  property makes it a no-key cipher: encode and decode use
  the same function.
- The `(pos + 13) % 26` shift is clean because 13 is a
  non-negative integer less than 26 — no negative-mod
  workaround needed (unlike the general Caesar cipher,
  which handles negative shifts via a `while` loop).
- Both `UPPER` and `LOWER` alphabets are kept so we can
  preserve the case of the input. Non-letter characters
  pass through unchanged (this is the standard ROT13
  behavior).
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
