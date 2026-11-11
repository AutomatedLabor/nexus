# neural_net_xor.ae

A tiny 2-2-1 feed-forward neural network that learns the XOR
function via stochastic gradient descent (backpropagation).
Two inputs, two sigmoid hidden units, one sigmoid output.
After 1000 epochs of training with learning rate 1.5, the
network converges to a mean squared loss below 0.005.

## What it does

1. **`lcg_seed(seed)`, `lcg_next()`, `rand01()`** — a
   Park-Miller linear congruential generator (modulus
   2^31 - 1 = 2147483647) provides deterministic random
   floats in `[0, 1)`.
2. **`exp_small(r)`, `exp_full(x)`** — `exp(x)` implemented
   via a 10-term Taylor series with range reduction
   (split `x = k + r` where `k ∈ ℤ` and `r ∈ [-0.5, 0.5]`,
   then `exp(x) = e^k · exp(r)` where `e^k` is repeated
   multiplication). The v1 evaluator doesn't expose `Math.exp`
   to scripts.
3. **`sigmoid(x)`** — `1 / (1 + exp(-x))` using `exp_full`.
4. **`init_weights()`** — random weights in `[-0.5, 0.5]`
   for 4 hidden weights, 2 hidden biases, 2 output weights,
   1 output bias. Stored in module-level `let mut` arrays.
5. **`forward(x1, x2)`** — pure forward pass returning
   `(h0, h1, output)`.
6. **`train_step(x1, x2, target, lr)`** — forward pass,
   compute output error and deltas (with sigmoid derivative
   `o * (1 - o)`), backprop to hidden layer, gradient descent
   weight updates. Returns the per-sample loss.
7. **`epoch_loss()`** — mean squared error across the 4 XOR
   patterns `(0,0)→0`, `(0,1)→1`, `(1,0)→1`, `(1,1)→0`.
8. **Driver** — seeds the PRNG (seed 42), initializes, prints
   initial loss, runs 1000 epochs of full-pass SGD, prints
   loss at every 100th epoch, then prints final predictions
   vs targets and asserts the loss is below 0.1 and each
   prediction rounds to the correct target.

## How to run

```bash
bun /tmp/verify_one.ts /home/z/my-project/examples/neural_net_xor.ae
```

## Key language features

- **Module-level `let mut` arrays** for weights and biases,
  mutated in-place by `train_step`. (The v1 evaluator
  supports `let mut` at module scope.)
- **`int(x + 0.5)` rounding trick** avoided — we use
  `int(x)` (truncation toward 0) and adjust `r` afterward
  to stay in `[-0.5, 0.5]` so the Taylor series converges
  fast.
- **Float literals** `0.5`, `1.0`, `2.718281828459045` —
  Aether v1 supports full float64 arithmetic.
- **`assert(cond, msg)`** — runtime assertions with a
  custom message on failure.
- **`while`-loop training** with `e % 100 == 0` milestone
  prints.

## Expected output

```
== Tiny neural network learns XOR ==

Initial loss: 0.2533...

Loss at milestones (every 100 epochs):
  epoch 100: loss = 0.2502
  epoch 200: loss = 0.2498
  ...
  epoch 1000: loss = 0.0020

Final predictions:
  XOR(0, 0) = 0.040  (target 0)
  XOR(0, 1) = 0.969  (target 1)
  XOR(1, 0) = 0.964  (target 1)
  XOR(1, 1) = 0.064  (target 0)
All assertions passed.
```

## Design notes

The Park-Miller LCG (`state = state * 16807 % 2147483647`)
was chosen specifically because the modulus 2^31 - 1 fits in
Aether's int32-modulo operator (Aether's `%` coerces both
operands to int32, so a modulus of 2^32 would be silently
treated as 0 and throw "modulo by zero"). The Taylor-series
`exp` is accurate to about 6 decimal digits for `|x| < 10`,
which is more than enough for our sigmoid. The learning rate
1.5 is high; it converges in ~700 epochs but oscillates
slightly, as you can see in the milestone log.
