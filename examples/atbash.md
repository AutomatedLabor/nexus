# atbash.ae

Atbash cipher: replace each letter with its mirror in the
alphabet. So `'a' <-> 'z'`, `'b' <-> 'y'`, ..., `'z' <-> 'a'`
(and the same for uppercase). Non-letters pass through
unchanged.

## What it does

1. **`find_pos(c, alphabet)`** — linear scan of `c` in
   `alphabet`, returns the index (or -1).
2. **`atbash_char(c)`** — Atbash a single character. The
   mirror position is `25 - pos` (since the alphabet has
   length 26). Uppercase letters map within `UPPER`,
   lowercase within `LOWER`; other characters pass through.
3. **`atbash(s)`** — Atbash a whole string: build a
   `[string]` of single chars via a `while` loop, then
   `reduce` over the char array applying `atbash_char` to
   each.
4. **Driver** — applies Atbash to `"ABCXYZ"` → `"ZYXCBA"`
   and runs a table of additional samples (including the
   full alphabet in both cases, demonstrating the self-
   inverse property).

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/atbash.ae
```

## Key language features

- **Lookup string + `str(ALPHABET[i])`** — Aether v1 has
  no `char(int)` builtin, so we work around it with a
  26-char alphabet.
- **`25 - pos` mirror formula** — no shift, no modulo, no
  wrap-around edge cases (unlike Caesar / ROT13).
- **`reduce` over a `[string]` of chars** — the canonical
  pattern for applying a per-char transform to a string.

## Expected output

```
== Atbash cipher ==

input:    "ABCXYZ"
atbash:   "ZYXCBA"

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    -> "ZYXWVUTSRQPONMLKJIHGFEDCBA"
    -> "ABCDEFGHIJKLMNOPQRSTUVWXYZ"  [ok]
  "abcdefghijklmnopqrstuvwxyz"
    -> "zyxwvutsrqponmlkjihgfedcba"
    -> "abcdefghijklmnopqrstuvwxyz"  [ok]
  "Hello, World!"
    -> "Svool, Dliow!"
    -> "Hello, World!"  [ok]
  ...
All assertions passed.
```

## Design notes

- Atbash is its own inverse, just like ROT13. The test
  driver confirms this for every sample by re-applying
  `atbash` and checking equality with the original.
- The Atbash map is just `pos -> 25 - pos`. No shift, no
  modulo, no wrap-around edge cases — much simpler than
  Caesar or ROT13.
- Originally used as a Hebrew cipher (the name comes from
  the Hebrew letters Aleph-Tav-Beth-Shin, the four
  end-points of the alphabet). One of the simplest
  substitution ciphers.
- This is a fully clean compile (`ok = true`): no parse
  errors, no type errors, no runtime errors.
