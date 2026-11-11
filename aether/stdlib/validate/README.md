# Aether stdlib — `validate`

The `validate` module is a set of pure predicates for common input-validation cases: format checks (email, URL, IPv4/IPv6, UUID, date, time), character-class checks (alpha, numeric, alnum, lower, upper, whitespace, ASCII), and value checks (in-range, one-of, non-empty, length, regex match). Every function returns `true` or `false` — they never throw on invalid *input* (that's the point of a predicate). They DO throw on wrong-type *arguments* — that's a programming error, not a validation failure.

## Conventions

- **Predicates never throw on bad input.** Pass `"not-an-email"` to `isEmail` and you get `false`, not a panic. Pass `123` (a non-string) to `isEmail` and you *do* get a panic — that's a type error in the calling code, not a validation failure.
- **Empty strings return `false` for the character-class checks** (`isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper`, `isWhitespace`, `isAscii`). This matches the convention "vacuous truth is not validation": an empty string is not "all letters" in any useful sense, and rejecting it makes these predicates safer as field validators. Use `isNonEmpty(s) && isAlpha(s)` if you want to allow empty.
- **Calendar validation** for `isDate` uses the `Date` constructor's UTC mode and checks the round-trip — so `2023-02-29` (not a leap year) is correctly rejected, and `2024-02-29` is correctly accepted.
- **Strict equality** for `isOneOf` — `isOneOf("1", [1])` is `false` because `"1" !== 1`. If you need loose equality, coerce first.
- **The email/URL/IP regexes are pragmatic**, not exhaustive. They accept the common, real-world forms and reject the obvious garbage. They're not RFC-strict; if you need to validate an edge case like `"very.(),:;<>[]\".VERY.\"very@\\ \"very\".unusual"@strange.example.com`, reach for a dedicated library.

## Format checks

`isEmail(s)` accepts the common form `local-part@domain.tld`, with reasonable characters in the local-part (letters, digits, `.`, `_`, `%`, `+`, `-`) and a domain of at least one dot with a 2+ letter TLD. `isUrl(s)` accepts `http://` and `https://` URLs with optional port and path. `isIpv4(s)` is a dotted-quad with each octet in `[0, 255]`, no leading zeros. `isIpv6(s)` accepts the textual colon-separated form including `::` shortcuts (one run of zero groups allowed).

`isUuid(s)` accepts any UUID version in canonical `8-4-4-4-12` lowercase or uppercase hex form. `isDate(s)` accepts ISO `YYYY-MM-DD` form with calendar validation (rejects Feb 29 on non-leap years). `isTime(s)` accepts `HH:MM` or `HH:MM:SS` in 24-hour form.

```aether
validate.isEmail("foo@bar.com")          // true
validate.isEmail("foo.bar+baz@example.org") // true
validate.isEmail("foo@bar")              // false
validate.isUrl("https://example.com/p")  // true
validate.isUrl("ftp://example.com")       // false
validate.isIpv4("192.168.0.1")           // true
validate.isIpv4("256.1.1.1")             // false
validate.isIpv6("::1")                    // true
validate.isIpv6("2001:db8::1")           // true
validate.isUuid("550e8400-e29b-41d4-a716-446655440000")  // true
validate.isDate("2024-02-29")            // true (leap year)
validate.isDate("2023-02-29")            // false
validate.isTime("13:45:30")              // true
validate.isTime("24:00")                  // false
```

## Character-class checks

`isAlpha(s)` is true when `s` is non-empty and contains only ASCII letters `[A-Za-z]+`. `isNumeric(s)` is `[0-9]+` only — note this is *digit characters*, not "parseable as a number"; `"12.3"` is `false` because `.` is not a digit. `isAlnum` is the union; `isLower` / `isUpper` are the case-restricted variants. `isWhitespace(s)` is `\s+` (spaces, tabs, newlines). `isAscii(s)` walks the string once and returns false on any code unit > 127 — useful as a guard before passing a string to a legacy ASCII-only API.

```aether
validate.isAlpha("hello")    // true
validate.isAlpha("hello!")   // false
validate.isNumeric("12345")  // true
validate.isNumeric("12.3")   // false
validate.isAlnum("hello123") // true
validate.isLower("lowercase") // true
validate.isUpper("UPPER")     // true
validate.isWhitespace(" \t\n") // true
validate.isAscii("plain text")  // true
validate.isAscii("café")        // false (é is non-ASCII)
```

## Value checks

`isInRange(n, lo, hi)` is the obvious `[lo, hi]` inclusive check (works for numbers; pass a custom comparator for other types). `isOneOf(v, opts)` is "v in opts" with strict equality — useful for enum validation. `isNonEmpty(s)` is `s.length > 0`; `isLength(s, n)` is `s.length === n`; `isMaxLength(s, n)` is `s.length <= n`. `matches(s, pattern)` constructs a `RegExp` from `pattern` and tests `s` against it; invalid regexes panic with a clear message.

```aether
validate.isInRange(5, 1, 10)      // true
validate.isInRange(0, 1, 10)      // false
validate.isOneOf("b", ["a","b","c"])  // true
validate.isOneOf("d", ["a","b","c"])  // false
validate.isNonEmpty("x")          // true
validate.isNonEmpty("")           // false
validate.isLength("abc", 3)       // true
validate.isMaxLength("abc", 5)    // true
validate.matches("hello world", "world")   // true
validate.matches("12345", "^\\d{5}$")      // true
validate.matches("1234", "^\\d{5}$")       // false
```

## Common patterns

- **Validate a form field**: combine with `&&`. `isNonEmpty(s) && isEmail(s)` for an email field, `isLength(s, 8) && matches(s, "^[A-Za-z0-9]+$")` for a password.
- **Validate a config enum**: `isOneOf(level, ["debug", "info", "warn", "error"])`.
- **Guard a number input**: `isInRange(n, 0, 100)` for a percentage, `isInRange(n, 1, 65535)` for a port.
- **Reject non-ASCII before encoding**: `isAscii(s)` before `Buffer.from(s, 'ascii')`.

## Limitations

- The regex-based format checks are pragmatic, not RFC-compliant. They will reject valid-but-weird emails (`"foo"@bar.com` with quoted local-part) and accept some invalid-but-common URLs (no path validation). For production-grade validation, use a dedicated library.
- `isIpv6` does not currently accept the IPv4-embedded form `::ffff:192.0.2.1`; if you need that, extend the regex or call `isIpv4` on the trailing segment.
- `isOneOf` uses strict equality, so type-coercing comparisons (`"1" vs 1`) return false. Coerce before calling if you need loose semantics.
- The predicates return plain `boolean` — there's no structured error message. If you want "is it valid, and if not, why not?", you'll want a separate schema-validation library; this module is the lightweight building-block layer underneath.

The whole module is 20 functions, ~220 lines of TypeScript, no dependencies, and is wired in by `registerAll` in `aether/stdlib/index.ts`.
