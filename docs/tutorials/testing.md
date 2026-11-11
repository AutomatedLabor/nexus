# Testing in Aether

> Audience: you want to verify your Aether programs work.
> Time: ~25 minutes. Every example is runnable.

Aether v1 ships with two testing primitives — `assert(cond)` and `assert_eq(a, b)` — and the implementation itself is tested with Vitest. There is no first-class test runner in v1 (no `test` blocks, no `describe`/`it`, no `@test` decorator, no `aether test` command). The v2 plan adds one (see §5).

This tutorial covers: writing assertions, organizing a "test file" with assertions, what to assert on, and the v2 plan.

---

## 1. The two primitives

### `assert(cond, msg?)`

Panics if `cond` is false.

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}

assert(fib(0) == 0);
assert(fib(1) == 1);
assert(fib(2) == 1);
assert(fib(10) == 55);
assert(fib(20) == 6765);

print("all fib assertions passed");
```

If any assertion fails, the program panics with `assertion failed` (or `assertion failed: <msg>` if you passed a third argument) and the rest of the program doesn't run. If all assertions pass, the print runs.

`assert` is an inline builtin. The implementation in `aether/core/eval/eval.ts` is:

```ts
set("assert", (cond, msg) => {
  if (!truthy(cond)) throw new PanicSignal(`assertion failed${msg ? ": " + display(msg) : ""}`);
});
```

So `assert(false, "expected positive")` panics with `assertion failed: expected positive`.

### `assert_eq(a, b, msg?)`

Panics if `a` and `b` aren't deeply equal.

```aether
assert_eq(2 + 2, 4);
assert_eq("hello" + " " + "world", "hello world");
assert_eq([1, 2, 3], [1, 2, 3]);
assert_eq((1, "two"), (1, "two"));
assert_eq(Option::Some(42), Option::Some(42));
assert_eq(Result::Ok(42), Result::Ok(42));

let p1 = Point { x: 3, y: 4 };   // assume struct Point
let p2 = Point { x: 3, y: 4 };
assert_eq(p1, p2);              // structurally equal

print("all equality assertions passed");
```

`assert_eq` uses the evaluator's `valueEq` (deep structural equality). For numbers, strings, bools, chars, this is `===`. For arrays, it's elementwise `valueEq`. For tuples, it's elementwise. For maps, it's key-value equality. For structs and enum variants, it's structural — same name, same fields, same field values. The deep equality is in `aether/core/eval/eval.ts`.

If `a` and `b` aren't equal, the panic message is `assertion failed: <display(a)> != <display(b)>`. The third argument overrides the message: `assert_eq(a, b, "expected a == b")`.

### What `assert_eq` does *not* check

- Floating-point equality is exact — `assert_eq(0.1 + 0.2, 0.3)` will *fail* because of float rounding (0.1 + 0.2 = 0.30000000000000004). Use `assert(abs((0.1 + 0.2) - 0.3) < 1e-9)` for approximate equality.
- Map key order is *not* compared — `assert_eq` on maps checks the same keys with the same values, regardless of insertion order.
- Set equality is value-based.
- Function values compare by identity — two different closures with the same signature are not equal.

---

## 2. A test file in v1

There's no `test` block. The convention is: write a regular Aether program whose last statements are assertions. If the program runs to completion, the assertions passed. If it panics, the assertion(s) failed.

```aether
// tests.ae — a self-contained test program.

// --- code under test ---
fn factorial(n: int) -> int {
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

fn is_prime(n: int) -> bool {
  if n < 2 { return false; }
  let mut i = 2;
  while i * i <= n {
    if n % i == 0 { return false; }
    i = i + 1;
  }
  true
}

fn reverse_string(s: string) -> string {
  let mut out = "";
  let mut i = len(s) - 1;
  while i >= 0 {
    out = out + slice(s, i, i + 1);
    i = i - 1;
  }
  out
}

// --- tests ---
assert_eq(factorial(0), 1);
assert_eq(factorial(1), 1);
assert_eq(factorial(5), 120);
assert_eq(factorial(10), 3628800);

assert_eq(is_prime(2), true);
assert_eq(is_prime(3), true);
assert_eq(is_prime(4), false);
assert_eq(is_prime(17), true);
assert_eq(is_prime(25), false);
assert_eq(is_prime(1), false);
assert_eq(is_prime(0), false);

assert_eq(reverse_string("hello"), "olleh");
assert_eq(reverse_string(""), "");
assert_eq(reverse_string("a"), "a");
assert_eq(reverse_string("ab"), "ba");

print("all tests passed");
```

Paste this in the playground, hit Run, and you should see `all tests passed` in the Output tab. If you change `factorial(5)` to return `121`, the program will panic with `assertion failed: 120 != 121` and the print won't run.

### Multiple assertion failures

`assert` and `assert_eq` panic on the first failure, so you see only one error at a time. There's no "run all tests, collect failures" mechanism in v1. The v2 plan (§5) adds proper test runners with failure aggregation.

---

## 3. What to test

### Pure functions

The default. Easy to test — give inputs, assert outputs:

```aether
fn add(a: int, b: int) -> int { a + b }

assert_eq(add(2, 3), 5);
assert_eq(add(-1, 1), 0);
assert_eq(add(0, 0), 0);
assert_eq(add(1_000_000, 1_000_000), 2_000_000);
```

### Edge cases

Test the boundaries: empty arrays, zero, negative numbers, single-element arrays, the maximum int, the empty string.

```aether
fn sum(xs: [int]) -> int {
  reduce(xs, fn(a: int, b: int) -> int { a + b }, 0)
}

assert_eq(sum([]), 0);
assert_eq(sum([1]), 1);
assert_eq(sum([1, 2, 3]), 6);
assert_eq(sum([-1, -2, -3]), -6);
assert_eq(sum([1_000_000, -1_000_000]), 0);
```

### Property tests (light)

You can't generate random inputs in v1 easily (well, you can use `crypto.randomInt` from the stdlib), but you can write "for all x in [list], check property":

```aether
fn reverse_twice_is_identity(xs: [int]) -> bool {
  // a property test: reverse(reverse(xs)) == xs
  let rev1 = reverse(xs);   // stdlib reverse
  let rev2 = reverse(rev1);
  rev2 == xs
}

let test_cases = [
  [],
  [1],
  [1, 2],
  [1, 2, 3],
  [5, 4, 3, 2, 1],
];

for xs in test_cases {
  assert(reverse_twice_is_identity(xs));
}
print("reverse property tests passed");
```

### Functions that return `Result` / `Option`

Test both arms:

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) }
  else { Result::Err(f"bad: {s}") }
}

assert_eq(parse_int("42"), Result::Ok(42));
assert_eq(parse_int("hello"), Result::Err("bad: hello"));

match parse_int("42") {
  Result::Ok(n) => assert_eq(n, 42),
  Result::Err(e) => panic(f"unexpected: {e}"),
}

match parse_int("hello") {
  Result::Ok(n) => panic(f"unexpected ok: {n}"),
  Result::Err(e) => assert_eq(e, "bad: hello"),
}
```

The `assert_eq` form is more concise; the `match` form lets you test the error message text exactly.

### Functions that panic

There's no `assert_panic` in v1. To test that a function panics, you'd have to call it and observe that the program aborts — which you can't do from within the same program. The v2 plan adds `assert_panic(fn)` (see §5).

In v1, you test the *precondition* instead: if `divide(10, 0)` is supposed to panic, you assert that the *call site* checks first:

```aether
fn safe_divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") }
  else { Result::Ok(a / b) }
}

assert_eq(safe_divide(10, 2), Result::Ok(5));
assert_eq(safe_divide(10, 0), Result::Err("div by zero"));
```

This is the recommended style anyway — return `Result` instead of panicking, then test both arms.

### Functions that print

To test that a function prints specific output, capture stdout... well, you can't directly in v1. The workaround is to make the function return a string instead of printing, and test the string:

```aether
fn format_row(name: string, age: int) -> string {
  f"{name} ({age})"
}

assert_eq(format_row("Ada", 36), "Ada (36)");
assert_eq(format_row("", 0), " (0)");
```

If the function genuinely needs to print, you can refactor it into "compute the string, then print the string":

```aether
fn report(name: string, age: int) -> () {
  print(format_row(name, age));
}
```

Then test `format_row` directly. The `report` function is a thin wrapper that you don't unit-test.

---

## 4. Running tests — the v1 workflow

There's no `aether test` command. The workflow is:

1. Write a `.ae` file with your code and your assertions.
2. Load it in the playground, hit Run.
3. Read the Output tab — if you see "all tests passed" (or whatever your final print says), the tests passed. If you see `panic: assertion failed: ...`, they didn't.

For a real test suite, you'd have multiple `.ae` files (one per module under test) and run them all. v1 doesn't have a runner that does this — you do it manually or with a small shell script. The v2 plan (§5) automates this.

### The implementation's own tests

The Aether implementation (the TypeScript code that implements the compiler and runtime) is tested with **Vitest**, not with Aether itself. See [ADR-09 vitest for implementation tests](../decisions/adr-09-vitest-for-implementation-tests.md) for the rationale. The Vitest tests are at:

- `aether/core/lexer/lexer.test.ts` — lexer tests.
- `aether/core/parser/parser.test.ts` — parser tests.
- `aether/core/sema/sema.test.ts` — type checker tests.
- `aether/core/eval/eval.test.ts` — runtime tests.
- `aether/stdlib/*/index.test.ts` — stdlib tests (one per module).

There are 703 of these tests. They use the standard Vitest API (`describe`, `it`, `expect`) and call `compileAndRun(source)` from `aether/core/index.ts`, then assert on the resulting `CompileResult`. For example:

```ts
// aether/core/eval/eval.test.ts (illustrative)
import { describe, it, expect } from "vitest";
import { compileAndRun } from "../../core";

describe("fib", () => {
  it("fib(10) = 55", () => {
    const r = compileAndRun("fn fib(n: int) -> int { if n < 2 { n } else { fib(n-1) + fib(n-2) } } fib(10)");
    expect(r.runtime?.value).toBe(55);
    expect(r.ok).toBe(true);
  });
});
```

This is how the implementation knows "703 tests pass" — that's the count of Vitest test cases across the four core modules and the ten stdlib modules.

---

## 5. The v2 plan — a real test runner

The v2 design (sketched in [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md) § 9 and [RFC-005 LSP](../rfcs/rfc-005-lsp.md) § 4) is:

### `test` blocks in `.ae` files

```aether
// v2 sketch — does NOT run in v1

fn factorial(n: int) -> int {
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

test "factorial of small numbers" {
  assert_eq(factorial(0), 1);
  assert_eq(factorial(1), 1);
  assert_eq(factorial(5), 120);
  assert_eq(factorial(10), 3628800);
}

test "factorial of zero" {
  assert_eq(factorial(0), 1);
}

test "factorial panics on negative" {
  assert_panic(fn() { factorial(-1); });
}
```

`test "name" { body }` is a top-level item. The runner collects all `test` blocks across the module (and its imports), runs each one in a fresh environment, and reports pass/fail counts.

### `aether test` command

```sh
aether test                 # run all tests in the current module + deps
aether test path/to/file    # run tests in a specific file
aether test --watch         # re-run on change
aether test --filter "factorial*"  # name pattern
```

### Failure aggregation

The runner collects all failures, not just the first. You see:

```
FAIL  factorial_test.ae
  - factorial of negative numbers
    panic: assertion failed: 1 != 2
    at factorial_test.ae:7:3
  - factorial panics on negative
    expected panic, got Ok

PASS  fibonacci_test.ae
  + fib(10) = 55
  + fib(20) = 6765

2 failed, 2 passed, 4 total
```

### `assert_panic`

```aether
test "divide by zero panics" {
  assert_panic(fn() { divide(10, 0); });
}
```

`assert_panic(fn)` runs the closure and asserts that it panics. Useful for testing that preconditions are enforced.

### Property-based testing (planned)

```aether
test "reverse is involutive" {
  prop_check(fn(xs: [int]) -> bool {
    reverse(reverse(xs)) == xs
  }, gen_array_of(gen_int, 0, 100), 100);   // 100 random arrays
}
```

`prop_check` runs the property with generated inputs and reports the first failing case. Inspired by QuickCheck. This is further out than the basic test runner — it's tracked in [RFC-003](../rfcs/rfc-003-modules-and-packages.md) § 9.

### Coverage

```sh
aether test --coverage
```

Reports line/branch coverage. Useful for finding untested code paths. The v2 plan tracks this; v1 has no coverage tooling.

### Relationship to Vitest

The Aether implementation itself stays on Vitest — those tests verify the *TypeScript* implementation of Aether. The v2 `test` blocks run *Aether* programs that verify *user code*. The two layers don't conflict; they test different things.

---

## 6. A v1 idiom — the "table test"

While you wait for v2, you can structure tests as data:

```aether
fn factorial(n: int) -> int {
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}

// A table of (input, expected) pairs.
let cases = [
  (0, 1),
  (1, 1),
  (5, 120),
  (10, 3628800),
];

let mut failures = 0;
for c in cases {
  let input = c.0;
  let expected = c.1;
  let actual = factorial(input);
  if actual != expected {
    failures = failures + 1;
    print(f"FAIL: factorial({input}) = {actual}, expected {expected}");
  }
}

if failures == 0 {
  print(f"all {len(cases)} cases passed");
} else {
  print(f"{failures}/{len(cases)} cases failed");
  panic("table test failures");
}
```

This pattern — collect (input, expected) pairs, loop, compare, report — is the v1 substitute for `test` blocks. The output is more legible than a single panic, and you see all failures at once.

A subtle point: you can't easily catch a panic from inside `factorial` in v1, so the table-test pattern works only for functions that don't panic. For functions that might panic, refactor them to return `Result` instead.

---

## 7. Worked example — testing a JSON parser

```aether
// (sketch — based on examples/json_parser.ae)

enum JV {
  Nul,
  Bool(bool),
  Int(int),
  Str(string),
  Arr([JV]),
  Obj([(string, JV)]),
}

fn parse_json(s: string) -> JV {
  // ... the actual implementation from examples/json_parser.ae ...
  JV::Nul   // placeholder
}

// --- Tests ---

// 1. Empty object.
let p1 = parse_json("{}");
match p1 {
  JV::Obj(entries) => assert_eq(len(entries), 0),
  _ => panic("expected Obj"),
}

// 2. Simple string.
let p2 = parse_json("\"hello\"");
assert_eq(p2, JV::Str("hello"));

// 3. Integer.
let p3 = parse_json("42");
assert_eq(p3, JV::Int(42));

// 4. Boolean.
let p4 = parse_json("true");
assert_eq(p4, JV::Bool(true));

// 5. Null.
let p5 = parse_json("null");
assert_eq(p5, JV::Nul);

// 6. Nested.
let p6 = parse_json("{\"a\":[1,2,{\"b\":3}]}");
match p6 {
  JV::Obj(entries) => {
    let kv = entries[0];
    assert_eq(kv.0, "a");
    match kv.1 {
      JV::Arr(items) => {
        assert_eq(items[0], JV::Int(1));
        assert_eq(items[1], JV::Int(2));
        match items[2] {
          JV::Obj(inner) => {
            let inner_kv = inner[0];
            assert_eq(inner_kv.0, "b");
            assert_eq(inner_kv.1, JV::Int(3));
          },
          _ => panic("expected Obj inside array"),
        }
      },
      _ => panic("expected Arr"),
    }
  },
  _ => panic("expected top-level Obj"),
}

print("all JSON parser tests passed");
```

This is the kind of test the example file's own `assert_eq` calls already do — see `examples/json_parser.ae` for the real version. The pattern is "parse the input, match on the structure, assert_eq on the leaves". For deeply nested data, the `match` form is more verbose than ideal; v2's `assert_eq` would pretty-print the diff when it fails.

---

## 8. What's next

- [error-handling.md](error-handling.md) — `Result` and `?`, which compose with `assert_eq`.
- [decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md) — why the implementation uses Vitest, not Aether.
- [rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md) § 9 — the v2 test runner.
- [rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md) § 4 — the LSP testing integration.

Aether v1's testing story is, in three sentences: `assert` and `assert_eq` for in-program assertions, table tests for collecting (input, expected) pairs, and the playground's Run button as the test runner. v2 adds `test` blocks, an `aether test` command, failure aggregation, `assert_panic`, and property-based testing — and the Vitest tests of the TypeScript implementation continue in parallel.
