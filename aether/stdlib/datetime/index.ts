/**
 * Aether stdlib — `datetime` module.
 *
 * All functions operate on millisecond Unix timestamps (the same shape used
 * by JS `Date`).  Calendar fields (year/month/day/…) are computed in the
 * *local* timezone of the host, mirroring JS `Date`.  `toISO`/`fromISO` use
 * UTC, again matching JS.
 *
 * The format spec for `formatTime` is a tiny, predictable subset:
 *   %Y  4-digit year     %m  2-digit month     %d  2-digit day
 *   %H  2-digit hour 24  %M  2-digit minute     %S  2-digit second
 *   %j  day-of-year      %w  day-of-week (0=Sun)  %Z  timezone offset
 *   %%  literal percent
 */

export function now(): number {
  return Date.now();
}

export function today(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function date(year: number, month: number, day: number): number {
  assertInt(year, "date");
  assertInt(month, "date");
  assertInt(day, "date");
  if (month < 1 || month > 12) throw new Error("date: month out of range");
  if (day < 1 || day > 31) throw new Error("date: day out of range");
  // JS months are 0-indexed.
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

export function time(h: number, m: number, s: number): number {
  assertInt(h, "time");
  assertInt(m, "time");
  assertInt(s, "time");
  if (h < 0 || h > 23) throw new Error("time: hour out of range");
  if (m < 0 || m > 59) throw new Error("time: minute out of range");
  if (s < 0 || s > 59) throw new Error("time: second out of range");
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d.getTime();
}

export function formatTime(ts: number, fmt: string = "%Y-%m-%d %H:%M:%S"): string {
  assertNum(ts, "formatTime");
  assertString(fmt, "formatTime");
  const d = new Date(ts);
  if (isNaN(d.getTime())) throw new Error("formatTime: invalid timestamp");
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const tz = -d.getTimezoneOffset();
  const tzSign = tz >= 0 ? "+" : "-";
  const tzH = pad(Math.floor(Math.abs(tz) / 60));
  const tzM = pad(Math.abs(tz) % 60);
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== "%") {
      out += c;
      continue;
    }
    i++;
    if (i >= fmt.length) throw new Error("formatTime: trailing %");
    const k = fmt[i];
    switch (k) {
      case "Y": out += d.getFullYear(); break;
      case "m": out += pad(d.getMonth() + 1); break;
      case "d": out += pad(d.getDate()); break;
      case "H": out += pad(d.getHours()); break;
      case "M": out += pad(d.getMinutes()); break;
      case "S": out += pad(d.getSeconds()); break;
      case "j": out += pad(dayOfYear(d), 3); break;
      case "w": out += d.getDay(); break;
      case "Z": out += `${tzSign}${tzH}:${tzM}`; break;
      case "%": out += "%"; break;
      default: throw new Error("formatTime: unknown %" + k);
    }
  }
  return out;
}

export function parseDate(s: string): number {
  assertString(s, "parseDate");
  // Accept ISO 8601 (with optional T/Z/offset) or `YYYY-MM-DD`-only.
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("parseDate: cannot parse '" + s + "'");
  return d.getTime();
}

export function year(ts: number): number {
  assertNum(ts, "year");
  return new Date(ts).getFullYear();
}

export function month(ts: number): number {
  assertNum(ts, "month");
  return new Date(ts).getMonth() + 1;
}

export function day(ts: number): number {
  assertNum(ts, "day");
  return new Date(ts).getDate();
}

export function hour(ts: number): number {
  assertNum(ts, "hour");
  return new Date(ts).getHours();
}

export function minute(ts: number): number {
  assertNum(ts, "minute");
  return new Date(ts).getMinutes();
}

export function second(ts: number): number {
  assertNum(ts, "second");
  return new Date(ts).getSeconds();
}

export function dayOfWeek(ts: number): number {
  assertNum(ts, "dayOfWeek");
  return new Date(ts).getDay(); // 0 = Sunday, 6 = Saturday
}

export function addDays(ts: number, n: number): number {
  assertNum(ts, "addDays");
  assertInt(n, "addDays");
  return ts + n * 86_400_000;
}

export function addHours(ts: number, n: number): number {
  assertNum(ts, "addHours");
  assertInt(n, "addHours");
  return ts + n * 3_600_000;
}

export function addMinutes(ts: number, n: number): number {
  assertNum(ts, "addMinutes");
  assertInt(n, "addMinutes");
  return ts + n * 60_000;
}

export function diffSeconds(a: number, b: number): number {
  assertNum(a, "diffSeconds");
  assertNum(b, "diffSeconds");
  return Math.round((b - a) / 1000);
}

export function diffDays(a: number, b: number): number {
  assertNum(a, "diffDays");
  assertNum(b, "diffDays");
  return Math.round((b - a) / 86_400_000);
}

export function isLeapYear(y: number): boolean {
  assertInt(y, "isLeapYear");
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  assertInt(y, "daysInMonth");
  assertInt(m, "daysInMonth");
  if (m < 1 || m > 12) throw new Error("daysInMonth: month out of range");
  // Day 0 of next month = last day of this month.
  return new Date(y, m, 0).getDate();
}

export function toISO(ts: number): string {
  assertNum(ts, "toISO");
  const d = new Date(ts);
  if (isNaN(d.getTime())) throw new Error("toISO: invalid timestamp");
  return d.toISOString();
}

export function fromISO(s: string): number {
  assertString(s, "fromISO");
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("fromISO: cannot parse '" + s + "'");
  return d.getTime();
}

// ---------------------------------------------------------------------------
function assertNum(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new Error(fn + ": expected number, got " + (typeof x));
  }
}
function assertInt(x: any, fn: string): asserts x is number {
  if (typeof x !== "number" || !Number.isFinite(x) || !Number.isInteger(x)) {
    throw new Error(fn + ": expected integer, got " + String(x));
  }
}
function assertString(x: any, fn: string): asserts x is string {
  if (typeof x !== "string") throw new Error(fn + ": expected string, got " + typeof x);
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  const now = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((now - start) / 86_400_000);
}

// ---------------------------------------------------------------------------
export const MANIFEST = {
  module: "datetime",
  fns: [
    { name: "now", sig: "() -> int", desc: "Current Unix timestamp in ms." },
    { name: "today", sig: "() -> int", desc: "Midnight of the current day (local tz)." },
    { name: "date", sig: "(y: int, m: int, d: int) -> int", desc: "Build a timestamp from Y/M/D (local tz)." },
    { name: "time", sig: "(h: int, m: int, s: int) -> int", desc: "Build a timestamp from h:m:s of today." },
    { name: "formatTime", sig: "(ts: int, fmt?: string) -> string", desc: "Format timestamp (subset of strftime)." },
    { name: "parseDate", sig: "(s: string) -> int", desc: "Parse a date/time string." },
    { name: "year", sig: "(ts: int) -> int", desc: "Calendar year (local tz)." },
    { name: "month", sig: "(ts: int) -> int", desc: "Calendar month 1-12 (local tz)." },
    { name: "day", sig: "(ts: int) -> int", desc: "Day of month 1-31 (local tz)." },
    { name: "hour", sig: "(ts: int) -> int", desc: "Hour 0-23 (local tz)." },
    { name: "minute", sig: "(ts: int) -> int", desc: "Minute 0-59." },
    { name: "second", sig: "(ts: int) -> int", desc: "Second 0-59." },
    { name: "dayOfWeek", sig: "(ts: int) -> int", desc: "Day of week 0=Sun..6=Sat." },
    { name: "addDays", sig: "(ts: int, n: int) -> int", desc: "Add n days to a timestamp." },
    { name: "addHours", sig: "(ts: int, n: int) -> int", desc: "Add n hours." },
    { name: "addMinutes", sig: "(ts: int, n: int) -> int", desc: "Add n minutes." },
    { name: "diffSeconds", sig: "(a: int, b: int) -> int", desc: "Seconds from a to b (rounded)." },
    { name: "diffDays", sig: "(a: int, b: int) -> int", desc: "Days from a to b (rounded)." },
    { name: "isLeapYear", sig: "(y: int) -> bool", desc: "Gregorian leap-year test." },
    { name: "daysInMonth", sig: "(y: int, m: int) -> int", desc: "Number of days in month m of year y." },
    { name: "toISO", sig: "(ts: int) -> string", desc: "ISO 8601 UTC timestamp." },
    { name: "fromISO", sig: "(s: string) -> int", desc: "Parse ISO 8601 to a timestamp." },
  ],
};

export function register(registerBuiltin: (name: string, fn: any) => void): void {
  registerBuiltin("now", now);
  registerBuiltin("today", today);
  registerBuiltin("date", date);
  registerBuiltin("time", time);
  registerBuiltin("formatTime", formatTime);
  registerBuiltin("parseDate", parseDate);
  registerBuiltin("year", year);
  registerBuiltin("month", month);
  registerBuiltin("day", day);
  registerBuiltin("hour", hour);
  registerBuiltin("minute", minute);
  registerBuiltin("second", second);
  registerBuiltin("dayOfWeek", dayOfWeek);
  registerBuiltin("addDays", addDays);
  registerBuiltin("addHours", addHours);
  registerBuiltin("addMinutes", addMinutes);
  registerBuiltin("diffSeconds", diffSeconds);
  registerBuiltin("diffDays", diffDays);
  registerBuiltin("isLeapYear", isLeapYear);
  registerBuiltin("daysInMonth", daysInMonth);
  registerBuiltin("toISO", toISO);
  registerBuiltin("fromISO", fromISO);
}
