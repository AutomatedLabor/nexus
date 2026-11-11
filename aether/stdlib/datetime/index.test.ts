import { describe, it, expect } from "vitest";
import * as D from "./index";

describe("datetime module", () => {
  it("now: finite ms", () => {
    const t = D.now();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
  });

  it("today: midnight of current day", () => {
    const t = D.today();
    const d = new Date(t);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });

  it("date: builds timestamp", () => {
    const t = D.date(2024, 1, 15);
    const d = new Date(t);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // January = 0
    expect(d.getDate()).toBe(15);
  });
  it("date: out-of-range month panics", () => {
    expect(() => D.date(2024, 13, 1)).toThrow();
  });

  it("time: builds timestamp for today", () => {
    const t = D.time(14, 30, 0);
    const d = new Date(t);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
  it("time: invalid hour panics", () => {
    expect(() => D.time(25, 0, 0)).toThrow();
  });

  it("formatTime: default", () => {
    const t = D.date(2024, 3, 5);
    expect(D.formatTime(t)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
  it("formatTime: custom", () => {
    const t = D.date(2024, 3, 5);
    expect(D.formatTime(t, "%Y/%m/%d")).toBe("2024/03/05");
  });
  it("formatTime: literal %", () => {
    const t = D.date(2024, 1, 1);
    expect(D.formatTime(t, "100%%")).toBe("100%");
  });
  it("formatTime: day-of-week and day-of-year", () => {
    const t = D.date(2024, 1, 1);
    expect(D.formatTime(t, "%w")).toBe(String(new Date(t).getDay()));
    expect(D.formatTime(t, "%j")).toMatch(/^\d{3}$/);
  });

  it("parseDate: ISO", () => {
    const t = D.parseDate("2024-03-15T12:00:00Z");
    expect(new Date(t).getUTCFullYear()).toBe(2024);
  });
  it("parseDate: bad input panics", () => {
    expect(() => D.parseDate("not a date")).toThrow();
  });

  it("year/month/day", () => {
    const t = D.date(2024, 7, 4);
    expect(D.year(t)).toBe(2024);
    expect(D.month(t)).toBe(7);
    expect(D.day(t)).toBe(4);
  });

  it("hour/minute/second", () => {
    const t = D.time(9, 8, 7);
    expect(D.hour(t)).toBe(9);
    expect(D.minute(t)).toBe(8);
    expect(D.second(t)).toBe(7);
  });

  it("dayOfWeek", () => {
    // 2024-01-07 was a Sunday.
    const t = D.date(2024, 1, 7);
    expect(D.dayOfWeek(t)).toBe(0);
  });

  it("addDays: forward", () => {
    const t = D.date(2024, 1, 1);
    const next = D.addDays(t, 10);
    expect(D.day(next)).toBe(11);
  });
  it("addDays: backward", () => {
    const t = D.date(2024, 1, 10);
    const prev = D.addDays(t, -10);
    expect(D.day(prev)).toBe(31);
  });

  it("addHours", () => {
    const t = D.date(2024, 1, 1);
    const later = D.addHours(t, 25);
    expect(D.day(later)).toBe(2);
    expect(D.hour(later)).toBe(1);
  });

  it("addMinutes", () => {
    const t = D.date(2024, 1, 1);
    const later = D.addMinutes(t, 90);
    expect(D.hour(later)).toBe(1);
    expect(D.minute(later)).toBe(30);
  });

  it("diffSeconds", () => {
    const a = D.date(2024, 1, 1);
    const b = D.addMinutes(a, 90);
    expect(D.diffSeconds(a, b)).toBe(5400);
  });

  it("diffDays", () => {
    const a = D.date(2024, 1, 1);
    const b = D.date(2024, 1, 11);
    expect(D.diffDays(a, b)).toBe(10);
    expect(D.diffDays(b, a)).toBe(-10);
  });

  it("isLeapYear", () => {
    expect(D.isLeapYear(2024)).toBe(true);
    expect(D.isLeapYear(2023)).toBe(false);
    expect(D.isLeapYear(2000)).toBe(true);
    expect(D.isLeapYear(1900)).toBe(false);
  });

  it("daysInMonth: 28/29/30/31", () => {
    expect(D.daysInMonth(2024, 2)).toBe(29);
    expect(D.daysInMonth(2023, 2)).toBe(28);
    expect(D.daysInMonth(2024, 4)).toBe(30);
    expect(D.daysInMonth(2024, 1)).toBe(31);
  });
  it("daysInMonth: bad month panics", () => {
    expect(() => D.daysInMonth(2024, 13)).toThrow();
  });

  it("toISO/fromISO round-trip", () => {
    const t = D.date(2024, 6, 15);
    const iso = D.toISO(t);
    const back = D.fromISO(iso);
    expect(D.toISO(back)).toBe(iso);
  });
  it("fromISO: bad input panics", () => {
    expect(() => D.fromISO("nope")).toThrow();
  });

  it("formatTime: timezone offset placeholder works", () => {
    const t = D.now();
    expect(D.formatTime(t, "%Z")).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});
