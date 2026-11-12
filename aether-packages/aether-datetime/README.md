# aether-datetime

> Datetime utilities for Aether — 18 pure functions for UTC-based calendar math, ISO 8601 formatting, and timestamp arithmetic, with calendar fields computed via Howard Hinnant's `days_from_civil` algorithm.

Aether's stdlib `datetime` module uses local time for `year`/`month`/`day` and provides 22 functions as direct host calls. `aether-datetime` is a user-space alternative: it operates entirely in **UTC** (so the same program produces the same output on machines in different timezones) and re-implements every calendar function — including `year`, `month`, `day`, `dayOfWeek`, `toISO`, and `fromISO` — as pure Aether arithmetic. Only `now()` and `today()` reach the host clock, and they do so through a small helper module (`_host_clock.ae`) that captures the builtins before the package's own `now`/`today` wrappers shadow them.

The calendar math is Howard Hinnant's `days_from_civil` / `civil_from_days` algorithm, the same algorithm used by C++20's `<chrono>`. It's O(1), branch-light, and correct for every date in the proleptic Gregorian calendar (year 1 forward; year 0 = 1 BC; negative years work too).

## Why a UTC-only datetime package?

The stdlib `datetime` module uses local time for `year(ts)` etc. because `Date(ts).getFullYear()` (which is what the stdlib uses) returns the year in the host's local timezone. For programs that run on a single machine in a known timezone, that's fine; for programs that **share timestamps across machines** — a database row, a log line, a serialized event — local time is a correctness hazard. `aether-datetime` deliberately uses UTC everywhere so:

- A timestamp written on a server in Tokyo reads back identically on a laptop in São Paulo.
- `toISO(ts)` and `fromISO(toISO(ts))` round-trip exactly, with no timezone offset.
- Test assertions on `year(ts)`/`month(ts)`/etc. are deterministic.

The cost is that the "current year" returned by `year(now())` is the UTC year, which may differ from the user's wall-clock year by a few hours around midnight. For most programmatic uses — scheduling, logging, duration math — UTC is what you want anyway.

## API

All 18 functions are `pub fn` declarations in `src/lib.ae`. They are pure (except `now`/`today`, which read the host clock) and operate on millisecond Unix timestamps.

### Clock

| Function | Signature | Description |
| --- | --- | --- |
| `now()` | `() -> int` | Current Unix timestamp in ms (UTC). |
| `today()` | `() -> int` | Midnight UTC of the current day (a timestamp divisible by `MS_PER_DAY`). |

### Calendar field extraction (UTC)

| Function | Signature | Description |
| --- | --- | --- |
| `year(ts)` | `(int) -> int` | Calendar year (e.g. `2024`). |
| `month(ts)` | `(int) -> int` | Calendar month `1..12`. |
| `day(ts)` | `(int) -> int` | Day of month `1..31`. |
| `hour(ts)` | `(int) -> int` | Hour `0..23`. |
| `minute(ts)` | `(int) -> int` | Minute `0..59`. |
| `second(ts)` | `(int) -> int` | Second `0..59`. |
| `dayOfWeek(ts)` | `(int) -> int` | `0=Sunday .. 6=Saturday` (matches JS `Date.getDay`). |

### Arithmetic

| Function | Signature | Description |
| --- | --- | --- |
| `addDays(ts, n)` | `(int, int) -> int` | Add `n` days to a timestamp. |
| `addHours(ts, n)` | `(int, int) -> int` | Add `n` hours. |
| `addMinutes(ts, n)` | `(int, int) -> int` | Add `n` minutes. |
| `diffSeconds(a, b)` | `(int, int) -> int` | Seconds from `a` to `b` (positive if `b` is later). |
| `diffDays(a, b)` | `(int, int) -> int` | Days from `a` to `b` (positive if `b` is later). |

### Predicates

| Function | Signature | Description |
| --- | --- | --- |
| `isLeapYear(y)` | `(int) -> bool` | Gregorian leap-year test. |
| `daysInMonth(y, m)` | `(int, int) -> int` | Number of days in month `m` of year `y`. Panics if `m` is out of `1..12`. |

### ISO 8601 formatting / parsing

| Function | Signature | Description |
| --- | --- | --- |
| `toISO(ts)` | `(int) -> string` | Format as `"YYYY-MM-DDTHH:MM:SS.mmmZ"`. |
| `fromISO(s)` | `(string) -> int` | Parse the same shape back to a timestamp. Panics on out-of-range fields. |

## How to use

### As a dependency

Add `aether-datetime` to your project's `aether.toml`:

```toml
[dependencies]
aether-datetime = "0.1.0"
```

Then in your Aether source:

```aether
import { now, toISO, year, addDays, diffDays, isLeapYear, daysInMonth } from "aether-datetime";

let t = now();
print(toISO(t));
print("year: " + str(year(t)));
print("tomorrow: " + toISO(addDays(t, 1)));
print("is 2024 leap? " + str(isLeapYear(2024)));
print("days in Feb 2024: " + str(daysInMonth(2024, 2)));
```

### Locally (without the registry)

```aether
import { toISO, fromISO, diffDays } from "./aether-packages/aether-datetime/src/lib.ae";

let a = fromISO("2024-01-01T00:00:00.000Z");
let b = fromISO("2024-12-31T00:00:00.000Z");
print("days in 2024: " + str(diffDays(a, b)));   // 365
```

### Running the test suite

```sh
aether test aether-packages/aether-datetime/tests
# PASS aether-packages/aether-datetime/tests/tests.ae
# 1 passed, 0 failed
```

The test file has 30+ `assert_eq` cases covering every `pub fn`, including round-trip `toISO`/`fromISO`, leap-year edge cases, day-of-week for known historical dates, and arithmetic with negative deltas.

### Running the example

```sh
aether run aether-packages/aether-datetime/examples/example.ae
```

The example prints the current UTC time, formatted ISO, calendar fields, and a few computed dates (tomorrow, yesterday, days-in-2024).

## Design notes

### Why Hinnant's algorithm?

There are three common ways to convert a Unix-day-count to (year, month, day):

1. **Iterative.** Start at 1970, walk forward subtracting 365/366 per year, then walk forward through the months. O(years + months) per call; simple to read; slow and error-prone at boundaries (the leap-year rule has three exceptions).
2. **Table-driven.** Precompute the cumulative-days-per-month for leap and non-leap years and binary-search. O(log 12); 24 bytes of static data; easy to get wrong.
3. **Hinnant's `civil_from_days`.** O(1) arithmetic with a few carefully-chosen integer divisions. Branchless (one ternary for the month). Correct for all proleptic Gregorian dates (year 0 = 1 BC; negative years work). Used by C++20 `<chrono>`.

`aether-datetime` uses (3). The implementation is ~15 lines of Aether, plus a tiny helper for the era/yoe/doy bookkeeping. The algorithm's correctness is established in Hinnant's paper; we keep the variable names (`era`, `yoe`, `doe`, `doy`, `mp`) so the Aether code reads like a direct translation of the C++ reference.

### Why does `_host_clock.ae` exist?

Aether's name resolution lets a top-level function `pub fn now() -> int { ... }` shadow the host builtin `now` *everywhere in the same module*, including inside `now`'s own body. The obvious delegation pattern

```aether
pub fn now() -> int { now() }   // infinite recursion — calls itself
```

doesn't work. To capture the host `now` before the shadow takes effect, we evaluate the builtin in a *separate* module (`_host_clock.ae`, where `now` is not redeclared), export it as a `pub const`, and import it back:

```aether
// _host_clock.ae
pub const HOST_NOW = now;
pub const HOST_TODAY = today;
```

```aether
// lib.ae
import { HOST_NOW, HOST_TODAY } from "./_host_clock.ae";
pub fn now() -> int { HOST_NOW() }
pub fn today() -> int { HOST_TODAY() }
```

The const captures the builtin's value at `_host_clock.ae`'s load time (which is before `lib.ae`'s `now` declaration shadows the builtin). The same trick would work for any other case where a package wraps a same-named builtin.

### Why UTC and not local time?

See "Why a UTC-only datetime package?" above. UTC is the right default for programmatic datetime work; local time is what humans read on a wall clock, and even that is increasingly UTC+offset under the hood. The stdlib's `datetime` already covers local time; `aether-datetime` deliberately doesn't compete, it provides the UTC variant.

### Why `int(a / b)` and not `floor(a / b)`?

Aether's `/` is float division; `int(x)` truncates toward zero; `floor(x)` rounds toward negative infinity. For the Hinnant algorithm we need integer (truncating) division, not floor division, because the algorithm's intermediate values are always non-negative. We use `int(...)` for those. The `floor_div` helper is only used for the day-count (where the timestamp can be negative, e.g. dates before 1970).

### Why does `fromISO` panic on out-of-range fields?

Same reason `daysInMonth` does: the function's contract is "parse this exact string format, return a timestamp"; an out-of-range field is a programmer error, not a recoverable failure. The panic message names the field. If you need graceful failure, wrap the call in `try_(fn() -> int { fromISO(s) }, fn(_e) -> int { -1 })`.

## Implementation patterns

### Pattern 1: floor div + floor mod

Negative timestamps (dates before 1970-01-01) need floor division, not truncation. The helper:

```aether
fn floor_div(a: int, b: int) -> int {
  let q = int(a / b);
  let r = a - q * b;
  if r != 0 && ((r < 0) != (b < 0)) { q - 1 } else { q }
}
fn floor_mod(a: int, b: int) -> int {
  a - floor_div(a, b) * b
}
```

is used everywhere we need "days since epoch" or "ms in the current day" — both can be negative for negative timestamps, and floor mod gives a non-negative remainder when the divisor is positive.

### Pattern 2: const-capture of a same-named builtin

The `_host_clock.ae` / `lib.ae` pattern (see "Why does `_host_clock.ae` exist?" above) is the canonical way to wrap a same-named host builtin. The same pattern would work for `readFile`/`writeFile`, `args`/`env`, or any other builtin a package wants to re-export under the same name.

### Pattern 3: arithmetic with named-constant magnitudes

`MS_PER_DAY`, `MS_PER_HOUR`, `MS_PER_MINUTE`, `MS_PER_SECOND` are `pub const`s. This avoids the `86400000` magic number everywhere, makes the arithmetic self-documenting, and lets callers import them:

```aether
import { MS_PER_DAY, addDays } from "aether-datetime";
let two_days = 2 * MS_PER_DAY;
```

## Future work

- **Local time.** A `localYear`/`localMonth`/`localDay` set that uses the host's local timezone (delegating to the stdlib `datetime` module). Probably a separate `aether-datetime-local` package to keep the UTC variant pure.
- **Time zones.** A `withTimeZone(ts, offset_minutes)` that returns a "zoned" timestamp struct. Significantly more work — needs the IANA timezone database.
- **Durations.** A `Duration` struct with `+`/`-`/`*`/`compare` and pretty-printing. Probably belongs in a separate `aether-duration` package.
- **Calendar math beyond Gregorian.** Julian, Hijri, Hebrew calendars. Each is a separate package; `aether-datetime` is Gregorian-only.

## License

MIT — same as the Aether language.
