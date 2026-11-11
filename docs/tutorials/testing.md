# Testing in Aether

> Audience: anyone wanting to write tests for Aether code.
> Prerequisites: [language-basics.md](language-basics.md),
> [error-handling.md](error-handling.md). 25 minutes.

Aether v1 has three layers of testing:

1. **Inline assertions** — `assert` and `assert_eq` builtins,
   usable inside any Aether program.
2. **Test functions** — a convention for writing named tests
   that the playground can run as a single program.
3. **Implementation tests** — Vitest tests in TypeScript that
   exercise the Aether compiler itself (`aether/core/eval/eval.test.ts`
   etc., 700+ tests).

This tutorial covers the first two. The third is documented in
[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md).

## 1. Inline assertions

The two assertion builtins are `assert` and `assert_eq`.

```aether
assert(cond);             // panics if cond is false
assert(cond, "message");  // panics with a custom message
assert_eq(a, b);          // panics if a != b
```

`assert` takes a `bool` (and optionally a message). If the bool
is false, it panics with `assertion failed` or
`assertion failed: <message>`. The panic propagates up the call
stack and aborts the program.

`assert_eq` takes two values of any type. It compares them with
deep equality (`valueEq` in the evaluator). If they differ, it
panics with `assertion failed: A != B` where `A` and `B` are the
display forms of the two values.

### 1.1 Example: a passing test

```aether
fn add(a: int, b: int) -> int { a + b }

assert_eq(add(2, 3), 5);
assert_eq(add(0, 0), 0);
assert_eq(add(-1, 1), 0);
print("all add tests passed");
// → all add tests passed
```

### 1.2 Example: a failing test

```aether
fn buggy_add(a: int, b: int) -> int { a + b + 1 }

assert_eq(buggy_add(2, 3), 5);
// → assertion failed: 6 != 5
```

The panic message includes both the actual and expected values,
which makes it easy to see what went wrong.

### 1.3 Custom messages

```aether
fn sqrt(n: float) -> float {
  assert(n >= 0, "sqrt of negative number");
  // ... pretend to compute sqrt
  n
}

sqrt(-1.0);
// → assertion failed: sqrt of negative number
```

The custom message is shown in the panic output, after the
`assertion failed:` prefix.

### 1.4 What `assert_eq` compares

`assert_eq` uses the evaluator's `valueEq` function, which
performs deep equality:

- Primitives (`int`, `float`, `bool`, `string`, `char`) compare
  by value.
- Tuples compare element-wise.
- Arrays compare element-wise (same length, same elements).
- Maps compare entry-wise (same keys, same values).
- Structs compare field-wise (same `__struct` tag, same
  fields).
- Enum variants compare by tag and by inner values.

So you can use `assert_eq` on compound values:

```aether
assert_eq([1, 2, 3], [1, 2, 3]);           // → ok
assert_eq({ "a": 1, "b": 2 }, { "a": 1, "b": 2 });  // → ok
struct Point { x: int, y: int }
assert_eq(Point { x: 1, y: 2 }, Point { x: 1, y: 2 });  // → ok
```

## 2. Writing test functions

The Aether v1 convention is to write tests as ordinary
functions with the prefix `test_`. There is no test runner
in v1 — the playground just runs the program from top to
bottom — so the convention is to *call* each test function
from the bottom of the file.

```aether
// stats.ae — a small statistics module + tests.

fn mean(xs: [int]) -> float {
  let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
  (total as float) / (len(xs) as float)
}

fn max_of(xs: [int]) -> int {
  let mut best = xs[0];
  for x in xs {
    if x > best { best = x; }
  }
  best
}

fn test_mean() {
  assert_eq(mean([1, 2, 3, 4, 5]), 3.0);
  assert_eq(mean([7]), 7.0);
  assert_eq(mean([1, 1, 1, 1]), 1.0);
}

fn test_max_of() {
  assert_eq(max_of([1, 2, 3, 4, 5]), 5);
  assert_eq(max_of([5, 4, 3, 2, 1]), 5);
  assert_eq(max_of([3, 1, 4, 1, 5, 9, 2, 6]), 9);
}

test_mean();
test_max_of();
print("all tests passed");
// → all tests passed
```

When you run this in the playground, the output is `all tests
passed`. If any test fails, the panic message is shown instead.

## 3. Grouping tests with `describe` (convention)

There is no built-in `describe` or `it`. The convention is to
use a function that takes a name and a thunk:

```aether
fn describe(name: string, body: fn() -> ()) {
  print(f"  running {name}");
  body();
}

describe("mean", fn() -> () {
  assert_eq(mean([1, 2, 3]), 2.0);
  assert_eq(mean([7]), 7.0);
});

describe("max_of", fn() -> () {
  assert_eq(max_of([1, 2, 3]), 3);
  assert_eq(max_of([3, 2, 1]), 3);
});

print("done");
```

This is just a convention. There is no test framework in v1;
the playground runs whatever you give it.

## 4. Negative tests

For "this should panic" tests, there is no `assert_panic` in v1.
The convention is to comment the expected behavior:

```aether
fn factorial(n: int) -> int {
  if n < 0 { panic("factorial of negative number"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

// Expected: panic with "factorial of negative number"
// factorial(-1);
```

To actually run a negative test, you would need to copy the
code into the playground, comment it back in, run it, and
verify the panic message. The v2 plan includes an `assert_panic`
helper; see
[../spec/15-conformance-and-tests.md](../spec/15-conformance-and-tests.md).

## 5. Property-based tests

Aether v1 has no QuickCheck-style property testing. The
convention is to write a small loop that exercises a property
over a range of inputs:

```aether
fn reverse_twice(xs: [int]) -> [int] {
  reverse(reverse(xs))
}

fn test_reverse_twice() {
  for n in range(0, 20) {
    let xs = range(0, n);
    assert_eq(reverse_twice(xs), xs);
  }
}

test_reverse_twice();
print("ok");
```

For random inputs, use the `random_int` and `shuffle` functions
from the `crypto` stdlib:

```aether
fn test_sort_preserves_length() {
  for _ in range(0, 100) {
    let xs = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    let sorted = sort(xs);
    assert_eq(len(sorted), len(xs));
  }
}

test_sort_preserves_length();
print("ok");
```

## 6. Test-driven development in Aether

The recommended workflow in the playground is:

1. Write a small test that fails.
2. Write the implementation that makes it pass.
3. Refactor with the test as a safety net.

Here is an example:

```aether
// Step 1: write the test.
fn test_add() {
  assert_eq(add(2, 3), 5);
  assert_eq(add(0, 0), 0);
  assert_eq(add(-1, 1), 0);
}

// Step 2: write a stub.
fn add(a: int, b: int) -> int { 0 }

// Step 3: run the test — it should fail.
test_add();
// → assertion failed: 0 != 5

// Step 4: fix the implementation.
fn add_fixed(a: int, b: int) -> int { a + b }

// Step 5: update the test to call add_fixed.
fn test_add_fixed() {
  assert_eq(add_fixed(2, 3), 5);
  assert_eq(add_fixed(0, 0), 0);
  assert_eq(add_fixed(-1, 1), 0);
}

test_add_fixed();
print("ok");
// → ok
```

The playground's step counter (visible in the Inspector's Steps
tab) gives you a rough idea of how much work each test does.
Use it as a sanity check; if a test takes 100,000 steps to run,
it is probably doing too much.

## 7. Running tests via the playground

The playground runs the entire source as a single program.
There is no "test mode." The convention is:

1. Put the implementation at the top of the file.
2. Put the test functions in the middle, prefixed with `test_`.
3. Put the test invocations at the bottom.
4. End with `print("all tests passed")` or similar.

If any test panics, the program aborts at that point and the
panic message is shown. The tests above the failing one are
marked as "passed" implicitly (they ran without panicking).

A larger example structure:

```aether
// stats.ae

// --- implementation ---

fn mean(xs: [int]) -> float {
  let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
  (total as float) / (len(xs) as float)
}

fn median(xs: [int]) -> float {
  let sorted = sort(xs);
  let n = len(sorted);
  if n % 2 == 0 {
    let mid = n / 2;
    (sorted[mid - 1] as float + sorted[mid] as float) / 2.0
  } else {
    sorted[n / 2] as float
  }
}

fn variance(xs: [int]) -> float {
  let m = mean(xs);
  let sq = map(xs, fn(x: int) -> float {
    let d = (x as float) - m;
    d * d
  });
  reduce(sq, fn(a: float, b: float) -> float { a + b }, 0.0) / (len(xs) as float)
}

// --- tests ---

fn test_mean() {
  assert_eq(mean([1, 2, 3, 4, 5]), 3.0);
  assert_eq(mean([7]), 7.0);
}

fn test_median() {
  assert_eq(median([1, 2, 3, 4, 5]), 3.0);
  assert_eq(median([1, 2, 3, 4]), 2.5);
  assert_eq(median([7]), 7.0);
}

fn test_variance() {
  assert_eq(variance([2, 4, 4, 4, 5, 5, 7, 9]), 4.0);
}

// --- run ---

test_mean();
test_median();
test_variance();
print("all tests passed");
```

## 8. The planned test runner (v2)

The v2 plan, sketched in
[../spec/15-conformance-and-tests.md](../spec/15-conformance-and-tests.md),
includes:

- A `test` keyword for declaring tests:
  ```aether
  test "mean of empty" { ... }
  test "median odd length" { ... }
  ```
- A `aether test` CLI command that runs all tests in a package.
- An `assert_panic` builtin for negative tests.
- A property-testing library based on the `crypto` random
  functions.
- Coverage reporting based on the evaluator's step counter.

None of this is in v1. The v1 convention (write tests as
functions, call them at the bottom) is the workaround.

## 9. What to test

A good test suite covers:

1. **Happy path.** The function works on typical inputs.
2. **Edge cases.** Empty arrays, single-element arrays, zero,
   negative numbers, very large numbers.
3. **Property tests.** Invariants that should hold for all
   inputs (e.g., `reverse(reverse(xs)) == xs`).
4. **Negative tests.** Inputs that should panic.

For most functions, aim for 3-10 tests covering the happy path,
the edge cases, and one or two property tests. More tests are
not always better; a few well-chosen tests are usually enough.

## 10. The implementation test suite

The Aether compiler itself has 700+ tests, written in Vitest
(TypeScript). They live next to the source:

- `aether/core/lexer/lexer.test.ts` — lexer tests.
- `aether/core/parser/parser.test.ts` — parser tests.
- `aether/core/sema/sema.test.ts` — type checker tests.
- `aether/core/eval/eval.test.ts` — evaluator tests.
- `aether/stdlib/*/index.test.ts` — stdlib tests, one per
  module.

To run them:

```bash
bun test
```

See
[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md)
for the choice of Vitest and
[../tutorials/tooling.md](../tutorials/tooling.md) for the
current tooling state.

## 11. A worked example: testing a JSON parser

Here is a small program that defines and tests a (sketch) JSON
parser. The parser is incomplete; the tests focus on shape,
not on parsing every JSON form.

```aether
enum Json {
  Null,
  Bool(bool),
  Num(float),
  Str(string),
  Arr([Json]),
  Obj(map[string]Json),
}

fn parse_null(s: string) -> Json {
  if s == "null" { Json::Null }
  else { panic(f"expected null, got {s}") }
}

fn parse_bool(s: string) -> Json {
  if s == "true" { Json::Bool(true) }
  else if s == "false" { Json::Bool(false) }
  else { panic(f"expected true/false, got {s}") }
}

fn test_parse_null() {
  assert_eq(parse_null("null"), Json::Null);
}

fn test_parse_bool() {
  assert_eq(parse_bool("true"), Json::Bool(true));
  assert_eq(parse_bool("false"), Json::Bool(false));
}

test_parse_null();
test_parse_bool();
print("all json tests passed");
// → all json tests passed
```

## 12. Where to go next

- **[../decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md)**
  — why Vitest for the compiler tests.
- **[../spec/15-conformance-and-tests.md](../spec/15-conformance-and-tests.md)**
  — the v2 test runner plan.
- **[../tutorials/tooling.md](../tutorials/tooling.md)** — the
  current state of Aether tooling.
- **[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)**
  — patterns for writing testable code.

Aether v1's testing story is bare-bones: `assert` and `assert_eq`
plus a convention. It is enough for small programs and for
learning the language. The v2 plan adds a real test runner; see
[../spec/15-conformance-and-tests.md](../spec/15-conformance-and-tests.md)
for the design.
