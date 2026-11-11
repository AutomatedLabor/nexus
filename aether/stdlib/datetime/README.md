# Aether stdlib — `datetime`

The `datetime` module gives Aether programs a small but practical toolkit for working with calendar time.  Every function operates on **millisecond Unix timestamps** (the same shape JS `Date` uses), which means:

- Timestamps are plain numbers, so you can add and subtract them with arithmetic operators.  The helpers `addDays`, `addHours`, `addMinutes`, `diffSeconds`, and `diffDays` exist purely to avoid having to remember the magic constants (86_400_000 ms in a day, etc.).
- Calendar fields (`year`, `month`, `day`, `hour`, `minute`, `second`, `dayOfWeek`) are computed in the **local timezone of the host** — this matches the JS `Date` convention and is what most "human" applications expect.  For UTC use, `toISO` and `fromISO` are the round-trip pair.
- All input validation panics with a clear message (`date: month out of range`, `parseDate: cannot parse '...'`, etc.).  The evaluator surfaces these as Aether runtime panics.

## Formatting

`formatTime(ts, fmt?)` accepts a tiny `strftime`-like subset.  Default format is `"%Y-%m-%d %H:%M:%S"` (an ISO-like string without the timezone).  Supported conversions:

| Spec | Meaning |
|------|---------|
| `%Y` | Four-digit year |
| `%m` | Two-digit month (01–12) |
| `%d` | Two-digit day-of-month (01–31) |
| `%H` | Two-digit hour, 24-hour (00–23) |
| `%M` | Two-digit minute (00–59) |
| `%S` | Two-digit second (00–59) |
| `%j` | Three-digit day-of-year (001–366) |
| `%w` | Day of week, 0 = Sunday … 6 = Saturday |
| `%Z` | Timezone offset as `±HH:MM` |
| `%%` | Literal percent |

Any unknown conversion panics.  This small set covers the common cases (timestamps in logs, date-only or time-only strings, UTC offsets) without dragging in a full ICU date formatter.

## Functions

### `now() -> int`
Returns the current Unix timestamp in milliseconds.

```aether
datetime.now()   // 1697000000000-ish
```

### `today() -> int`
Returns the timestamp at midnight (00:00:00.000) of the current day in the local timezone.

```aether
datetime.today()
```

### `date(year, month, day) -> int`
Builds a timestamp from a calendar date at midnight (local timezone).  `month` is 1–12.  Panics when month or day is out of range (day up to 31 is accepted; the underlying `Date` will normalise overflow but the call validates the most common mistakes).

```aether
datetime.date(2024, 1, 15)   // midnight of 2024-01-15 local
datetime.date(2024, 13, 1)   // panic
```

### `time(h, m, s) -> int`
Builds a timestamp for `h:m:s` on the current day (local timezone).  Validates `h ∈ 0..23`, `m, s ∈ 0..59`.

```aether
datetime.time(14, 30, 0)
datetime.time(25, 0, 0)   // panic
```

### `formatTime(ts, fmt?) -> string`
Formats a timestamp using the subset described above.  Defaults to `"%Y-%m-%d %H:%M:%S"`.

```aether
datetime.formatTime(datetime.date(2024, 3, 5))                  // "2024-03-05 00:00:00"
datetime.formatTime(datetime.date(2024, 3, 5), "%Y/%m/%d")      // "2024/03/05"
datetime.formatTime(datetime.date(2024, 1, 1), "100%%")         // "100%"
```

### `parseDate(s) -> int`
Parses a date or datetime string into a timestamp.  Accepts anything `new Date(s)` accepts, including ISO 8601 (with optional `Z` or offset), RFC 2822, and `YYYY-MM-DD`-only.  Panics when the string is not a valid date.

```aether
datetime.parseDate("2024-03-15T12:00:00Z")
datetime.parseDate("not a date")   // panic
```

### `year(ts) -> int`
Calendar year (local tz).

### `month(ts) -> int`
Calendar month, 1–12 (local tz).

### `day(ts) -> int`
Day of month, 1–31 (local tz).

### `hour(ts) -> int`
Hour, 0–23 (local tz).

### `minute(ts) -> int`
Minute, 0–59.

### `second(ts) -> int`
Second, 0–59.

### `dayOfWeek(ts) -> int`
Day of the week, 0 = Sunday … 6 = Saturday.

```aether
datetime.dayOfWeek(datetime.date(2024, 1, 7))   // 0 (Sunday)
```

### `addDays(ts, n) -> int`
Returns `ts + n * 86_400_000`.  `n` can be negative.

```aether
datetime.addDays(datetime.date(2024, 1, 1), 10)    // 2024-01-11
datetime.addDays(datetime.date(2024, 1, 10), -10)  // 2023-12-31
```

### `addHours(ts, n) -> int`
Returns `ts + n * 3_600_000`.

### `addMinutes(ts, n) -> int`
Returns `ts + n * 60_000`.

### `diffSeconds(a, b) -> int`
Seconds from `a` to `b`, rounded to the nearest integer.  Negative when `b` is before `a`.

```aether
datetime.diffSeconds(t0, t1)
```

### `diffDays(a, b) -> int`
Whole days from `a` to `b`, rounded.  Negative when `b` is before `a`.

```aether
datetime.diffDays(datetime.date(2024, 1, 1), datetime.date(2024, 1, 11))   // 10
```

### `isLeapYear(y) -> bool`
Gregorian leap-year test: `y` is divisible by 4, except centuries not divisible by 400.

```aether
datetime.isLeapYear(2024)   // true
datetime.isLeapYear(2000)   // true
datetime.isLeapYear(1900)   // false
```

### `daysInMonth(y, m) -> int`
Number of days in month `m` of year `y`.  `m` is 1–12.

```aether
datetime.daysInMonth(2024, 2)   // 29 (leap)
datetime.daysInMonth(2023, 2)   // 28
datetime.daysInMonth(2024, 4)   // 30
```

### `toISO(ts) -> string`
Returns the UTC ISO 8601 representation of the timestamp.

```aether
datetime.toISO(datetime.date(2024, 6, 15))   // "2024-06-15T00:00:00.000Z" (modulo tz)
```

### `fromISO(s) -> int`
Parses an ISO 8601 string and returns the timestamp.  Panics on bad input.

```aether
datetime.fromISO("2024-06-15T00:00:00.000Z")
```

## Conventions and pitfalls

A few small choices worth knowing about:

- **Local vs UTC.**  Calendar fields use the local timezone; ISO strings use UTC.  This is the same split JS uses and it avoids the classic "off by N hours" bug you get when mixing the two without thinking.  If you need UTC calendar fields, parse the ISO string back and use `new Date(s).getUTCFullYear()` etc. via a small wrapper.
- **Rounding in `diffSeconds` and `diffDays`.**  These helpers round to the nearest integer; if you need a fractional day count use the raw difference divided by the relevant constant.  Rounding makes the common case ("how many whole days between these dates?") return an integer without surprises.
- **Validation is permissive at the edges.**  `date(2024, 1, 31)` is fine, but so is `date(2024, 1, 29)` even when 2024 is a leap year and you meant February — the function does not enforce month-vs-day invariants beyond the 1..31 range.  Use `daysInMonth` first if you need strict validation.
- **Leap seconds and historical calendar drift are not handled.**  `datetime` follows the JS `Date` model: a day is exactly 86_400_000 ms, a minute exactly 60_000 ms.  This is fine for almost all applications and matches what the rest of the JS ecosystem expects.

## Composing helpers

A small example: compute "the number of days until next New Year":

```aether
fn daysUntilNewYear() -> int {
  let now = datetime.now()
  let y = datetime.year(now)
  let ny = datetime.date(y + 1, 1, 1)
  return datetime.diffDays(now, ny)
}
```

Or: format a timestamp in a custom format and round-trip it back:

```aether
let s = datetime.formatTime(t, "%Y-%m-%d")
let back = datetime.parseDate(s)
// back is midnight of t's day in local tz
```

The module is intentionally small.  For timezone-aware work, calendar recurrence rules, or humanised durations ("3 days ago"), reach for a dedicated library; the stdlib module aims to cover the 80% case well and panic clearly on the rest.
