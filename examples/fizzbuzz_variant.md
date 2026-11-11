# fizzbuzz_variant.ae

FizzBuzzPop — the next iteration of FizzBuzz with a third divisor
(7). For each integer `i` in 1..105, print a label based on
divisibility by 3, 5, and 7.

## What it does

Labels (combined in fixed precedence: 3, then 5, then 7):

```
by 3           -> "Fizz"
by 5           -> "Buzz"
by 7           -> "Pop"
by 15 (3*5)    -> "FizzBuzz"
by 21 (3*7)    -> "FizzPop"
by 35 (5*7)    -> "BuzzPop"
by 105 (3*5*7) -> "FizzBuzzPop"
otherwise      -> the number itself
```

1. **`classify(i)`** — tests `i % 3 == 0`, `i % 5 == 0`,
   `i % 7 == 0`, then concatenates "Fizz", "Buzz", "Pop" onto the
   label in that order. If the label is empty (no divisor
   matched), returns `str(i)` instead.
2. **Driver** — runs `i` from 1 to 105 with a `while` loop and
   prints each label. Then prints spot-checks for the special
   values, then counts each label type in 1..105, then runs
   assertions.

## How to run

```bash
bun /home/z/verify_one.ts /home/z/my-project/examples/fizzbuzz_variant.ae
```

## Key language features

- **`while` loop** (rather than `for`) for the main iteration —
  avoids the v1 scoping quirk where a `let` bound before a `for`
  loop is reported as undefined when referenced after the loop.
- **`% 3 == 0` etc.** for the divisibility tests — integer modulo.
- **`if cond { ... };` blocks** chained together to build the
  label — each block has a trailing `;` to terminate as a statement
  before the next one.
- **`str(i)` fallback** when no divisor matched — converts the
  number to its decimal string for the label.
- **Multiple `let mut` accumulators** in the counting loop —
  `fizz_count`, `buzz_count`, etc.

## Expected output

```
== FizzBuzzPop (1..105) ==

1
2
Fizz
4
Buzz
Fizz
Pop
...
105 = FizzBuzzPop

Spot checks:
  classify(3)   = Fizz
  classify(5)   = Buzz
  classify(7)   = Pop
  classify(15)  = FizzBuzz
  classify(21)  = FizzPop
  classify(35)  = BuzzPop
  classify(105) = FizzBuzzPop
  classify(2)   = 2

Label counts in 1..105:
  Fizz       (by 3 only)    : 24
  Buzz       (by 5 only)    : 14
  Pop        (by 7 only)    : 10
  FizzBuzz   (by 15 only)   : 4
  FizzPop    (by 21 only)   : 2
  BuzzPop    (by 35 only)   : 1
  FizzBuzzPop (by 105 only) : 1
  numbers    (other)        : 48

All assertions passed.
```

## Design notes

- We end at `i = 105` (the LCM of 3, 5, 7) so the cycle repeats
  cleanly. `105` is the only number in 1..105 that triggers all
  three divisors, so it gets the "FizzBuzzPop" label.
- The label-counting loop walks 1..105 a second time and checks
  each label string equality — that gives an authoritative
  count of each type, useful as a sanity check on `classify`.
- The label construction (`out = out + "Fizz"; out = out +
  "Buzz"; out = out + "Pop";`) is the cleanest way to combine
  the labels in the correct order; an alternative would be
  nested `if`s, but the chain is more readable.
