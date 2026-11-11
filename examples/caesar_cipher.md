# caesar_cipher.ae

Caesar cipher: shift each letter in a string by a fixed number of
positions in the alphabet (here, 3). Demonstrates uppercase
encryption plus decryption (shift by `26 - 3 = 23` to invert).

## What it does

Since Aether v1 has no `char(int)` builtin (no direct char-code
conversion), we use a 26-character lookup string `ALPHABET` and
index into it.

1. **`find_pos(c)`** — linear search of `c` in `ALPHABET`,
   returns the index (or -1 if not found, e.g., for non-letters).
2. **`to_upper_char(c)` / `to_lower_char(c)`** — case conversion
   by walking the lowercase alphabet and uppercasing (or vice
   versa). Non-letters pass through unchanged.
3. **`shift_char(c, shift)`** — the core: uppercase the input,
   find its position, add the shift, wrap-around with a `while`
   loop (`while new_pos < 0 { new_pos + 26 }` and `while new_pos
   >= 26 { new_pos - 26 }` — handles negative shifts cleanly),
   index back into `ALPHABET`, then re-lowercase if the input was
   lowercase.
4. **`caesar(s, shift)`** — fold the char array with `shift_char`
   via `reduce`.
5. **Driver** — encrypts "HELLO" with shift 3 → "KHOOR",
   decrypts back, and runs a table of additional samples
   including "ATTACK AT DAWN" and the alphabet itself.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/caesar_cipher.ae
```

## Key language features

- **Lookup string + index walk** instead of `char(int)` — Aether
  v1 has no `char(n)` builtin, so we work around it with a
  hardcoded alphabet and `str(ALPHABET[i])`.
- **`reduce` over a `[string]` of chars** to apply `shift_char` to
  each character — the canonical pattern for avoiding the
  for-loop-scope quirk.
- **`while` loops for wrap-around** instead of `% 26` modulo
  (avoids any language-specific modulo quirks for negative
  operands).
- **String concatenation** `acc + c` to build the output.

## Expected output

```
== Caesar cipher (shift 3) ==

plain:    "HELLO"
shift:    3
encrypted: "KHOOR"

decrypt (23): "HELLO"

  "HELLO WORLD"
    enc(3): "KHOOR ZRUOG"
    dec(23): "HELLO WORLD"
  "AETHER"
    enc(3): "DHWKHU"
    dec(23): "AETHER"
  ...
All assertions passed.
```

## Design notes

- The "decrypt with `26 - 3 = 23`" trick works because shifting
  by `26 - k` is the inverse of shifting by `k` (mod 26). We
  could also use a negative shift (`-3`), but the `26 - k` form
  is more readable and avoids any concern about Aether's modulo
  behavior with negative operands.
- The example works on uppercase input; lowercase input is
  uppercased first via `to_upper_char`. The `was_lower` flag
  preserves the original case in the output, so "hello" encrypts
  to "khoor" (lowercase) rather than "KHOOR" (uppercase).
- The wrap-around uses two `while` loops rather than a single
  `% 26` modulo. Both work; the while-loop version is more
  pedagogical and avoids any language-specific modulo quirks.
