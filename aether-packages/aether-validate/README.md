# aether-validate

> Validation predicates for the Aether language — 15 pub functions covering the common string/number validators, written in Aether itself.

`aether-validate` is a small, dependency-free library of predicates: `isEmail`, `isUrl`, `isIpv4`, `isUuid`, `isDate`, `isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper`, `isInRange`, `isOneOf`, `isNonEmpty`, `isLength`, `matches`. Each is a few lines of Aether built on `while`, `len`, `charCode`, `fromCharCode`, `strSlice`, and recursion — no `for in` loops (defensive against the v1 evaluator's for-loop-scope quirk).

## Why a validation package?

Form validation, config parsing, and input sanitization all need a stable set of "is this string an email?" / "is this int in range?" predicates. Without a package, every Aether project re-implements them. `aether-validate` is the canonical user-installable package for these predicates.

## API

All 15 functions are `pub fn` declarations in `src/lib.ae`. They are pure: they take inputs and return `bool`, never mutating anything.

### Email / URL / IPv4 / UUID / Date

| Function | Signature | Description |
| --- | --- | --- |
| `isEmail(s)` | `(string) -> bool` | Simple RFC-5322 form: `<local>@<domain>.<tld>`. Rejects multiple @, no local part, no TLD, TLD too short. |
| `isUrl(s)` | `(string) -> bool` | Starts with `http://` or `https://` and has a non-empty host with a dot. |
| `isIpv4(s)` | `(string) -> bool` | Four dot-separated octets, each 0–255. Rejects non-digit parts, wrong count, out-of-range. |
| `isUuid(s)` | `(string) -> bool` | 8-4-4-4-12 hex chars with dashes (e.g. `12345678-1234-1234-1234-123456789012`). |
| `isDate(s)` | `(string) -> bool` | ISO 8601 short form `YYYY-MM-DD`. Month 1–12, day 1–31. |

### Alpha / numeric / alnum / lower / upper

| Function | Signature | Description |
| --- | --- | --- |
| `isAlpha(s)` | `(string) -> bool` | Non-empty string of only ASCII letters. |
| `isNumeric(s)` | `(string) -> bool` | Non-empty string of only ASCII digits. |
| `isAlnum(s)` | `(string) -> bool` | Non-empty string of only ASCII letters and digits. |
| `isLower(s)` | `(string) -> bool` | Non-empty string of only lowercase ASCII letters. |
| `isUpper(s)` | `(string) -> bool` | Non-empty string of only uppercase ASCII letters. |

### Number / string validators

| Function | Signature | Description |
| --- | --- | --- |
| `isInRange(x, lo, hi)` | `(int, int, int) -> bool` | `lo <= x && x <= hi`. |
| `isOneOf(x, choices)` | `(int, [int]) -> bool` | True if `x` is in `choices`. |
| `isNonEmpty(s)` | `(string) -> bool` | `len(s) > 0`. |
| `isLength(s, n)` | `(string, int) -> bool` | `len(s) == n`. |
| `isMaxLength(s, n)` | `(string, int) -> bool` | `len(s) <= n`. |
| `matches(s, alphabet)` | `(string, string) -> bool` | Every char of `s` is in `alphabet` (a poor man's regex `[alphabet]*`). |

## How to use

### As a dependency

Add `aether-validate` to your project's `aether.toml`:

```toml
[dependencies]
aether-validate = "0.1.0"
```

Then in your Aether source:

```aether
import { isEmail, isInRange, isOneOf } from "aether-validate";

fn validate_signup(email: string, age: int) -> bool {
  isEmail(email) && isInRange(age, 18, 120)
}

print(validate_signup("alice@example.com", 30));  // true
print(validate_signup("not-an-email", 200));       // false
```

### Running the test suite

```sh
aether test aether-packages/aether-validate/tests
# PASS aether-packages/aether-validate/tests/tests.ae
# 1 passed, 0 failed
```

The test file contains 30+ `assert_eq` cases covering valid and invalid inputs for every `pub fn`.

## Design notes

### Why "simple" email/URL validation?

RFC-5322 (email) and RFC-3986 (URL) are notoriously complex; a fully compliant parser would be a package of its own. `aether-validate` ships pragmatic predicates that accept the obvious good cases and reject the obvious bad ones. For a v1 application, this catches 99% of input errors without the maintenance burden of a full RFC parser. The v3.1 plan is to ship a separate `aether-validate-strict` package for full RFC compliance.

### Why character-code-based checks?

Aether's standard library exposes `charCode(s, i)` and `fromCharCode(n)` (Unicode-aware char-code primitives). The validators use these instead of regex because Aether doesn't yet have a regex builtin. The trade-off: each predicate is a few more lines of code, but they're trivial to read and debug.

### `matches` is a poor man's regex

Aether doesn't have a regex literal. `matches(s, alphabet)` is the closest portable equivalent: it checks that every char of `s` is in the `alphabet` string. For real regex (with quantifiers, alternation, etc.), the v3.1 plan is a regex builtin exposed to Aether.

### Empty string handling

`isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper` all return `false` for the empty string. The semantic is "is this string made up entirely of X chars AND has at least one char". This matches the lodash convention (`_.isEmpty([]) === true`).

## Future work

- **Strict RFC-5322 email** — a separate `aether-validate-strict` package for full compliance.
- **Regex builtin** — a `regex(pattern, s)` builtin that exposes JS's `RegExp` to Aether.
- **Struct validators** — `validateStruct(s: Struct, rules: Map<string, fn>)` that applies a per-field validator to a struct.
- **Combinators** — `and(p1, p2)`, `or(p1, p2)`, `not(p)` for composing predicates. (The `aether-functional` package's `when`/`unless`/`cond` are the current workaround.)

## License

MIT — same as the Aether language.
