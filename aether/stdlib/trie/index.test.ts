import { describe, it, expect } from "vitest";
import * as T from "./index";

describe("trie module", () => {
  it("trieNew: creates empty trie", () => {
    const t = T.trieNew();
    expect(T.trieSize(t)).toBe(0);
    expect(T.trieWords(t)).toEqual([]);
  });

  it("trieInsert: adds a word", () => {
    const t = T.trieNew();
    T.trieInsert(t, "hello");
    expect(T.trieSize(t)).toBe(1);
    expect(T.trieSearch(t, "hello")).toBe(true);
  });

  it("trieInsert: multiple words", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    T.trieInsert(t, "app");
    T.trieInsert(t, "banana");
    expect(T.trieSize(t)).toBe(3);
  });

  it("trieInsert: duplicate is no-op", () => {
    const t = T.trieNew();
    T.trieInsert(t, "hello");
    T.trieInsert(t, "hello");
    expect(T.trieSize(t)).toBe(1);
  });

  it("trieInsert: empty string", () => {
    const t = T.trieNew();
    T.trieInsert(t, "");
    expect(T.trieSize(t)).toBe(1);
    expect(T.trieSearch(t, "")).toBe(true);
  });

  it("trieSearch: returns false for absent", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    expect(T.trieSearch(t, "apple")).toBe(true);
    expect(T.trieSearch(t, "app")).toBe(false);
    expect(T.trieSearch(t, "apples")).toBe(false);
    expect(T.trieSearch(t, "")).toBe(false);
  });

  it("trieSearch: false for empty trie", () => {
    const t = T.trieNew();
    expect(T.trieSearch(t, "anything")).toBe(false);
  });

  it("trieStartsWith: prefix matches", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    T.trieInsert(t, "application");
    expect(T.trieStartsWith(t, "app")).toBe(true);
    expect(T.trieStartsWith(t, "appl")).toBe(true);
    expect(T.trieStartsWith(t, "apple")).toBe(true);
    expect(T.trieStartsWith(t, "application")).toBe(true);
    expect(T.trieStartsWith(t, "banan")).toBe(false);
  });

  it("trieStartsWith: empty prefix is always true (if trie non-empty)", () => {
    const t = T.trieNew();
    expect(T.trieStartsWith(t, "")).toBe(true);
    T.trieInsert(t, "x");
    expect(T.trieStartsWith(t, "")).toBe(true);
  });

  it("trieDelete: removes a word", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    expect(T.trieDelete(t, "apple")).toBe(true);
    expect(T.trieSearch(t, "apple")).toBe(false);
    expect(T.trieSize(t)).toBe(0);
  });

  it("trieDelete: returns false for absent", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    expect(T.trieDelete(t, "banana")).toBe(false);
    expect(T.trieSize(t)).toBe(1);
  });

  it("trieDelete: doesn't break shared prefixes", () => {
    const t = T.trieNew();
    T.trieInsert(t, "app");
    T.trieInsert(t, "apple");
    expect(T.trieDelete(t, "apple")).toBe(true);
    expect(T.trieSearch(t, "app")).toBe(true);
    expect(T.trieSearch(t, "apple")).toBe(false);
    expect(T.trieSize(t)).toBe(1);
  });

  it("trieDelete: prunes unused nodes", () => {
    const t = T.trieNew();
    T.trieInsert(t, "abc");
    T.trieDelete(t, "abc");
    // After deleting "abc", the prefix "ab" should not be a startsWith
    // (no word starts with "ab" anymore).
    expect(T.trieStartsWith(t, "ab")).toBe(false);
  });

  it("trieWords: returns all words in lexicographic order", () => {
    const t = T.trieNew();
    T.trieInsert(t, "banana");
    T.trieInsert(t, "apple");
    T.trieInsert(t, "cherry");
    T.trieInsert(t, "apricot");
    expect(T.trieWords(t)).toEqual(["apple", "apricot", "banana", "cherry"]);
  });

  it("trieWords: empty trie returns empty array", () => {
    expect(T.trieWords(T.trieNew())).toEqual([]);
  });

  it("trieSize: counts complete words, not nodes", () => {
    const t = T.trieNew();
    T.trieInsert(t, "a");
    T.trieInsert(t, "ab");
    T.trieInsert(t, "abc");
    T.trieInsert(t, "abcd");
    expect(T.trieSize(t)).toBe(4);
  });

  it("trieLongestPrefix: returns longest matching word", () => {
    const t = T.trieNew();
    T.trieInsert(t, "a");
    T.trieInsert(t, "ab");
    T.trieInsert(t, "abc");
    expect(T.trieLongestPrefix(t, "abcde")).toBe("abc");
    expect(T.trieLongestPrefix(t, "abxyz")).toBe("ab");
    expect(T.trieLongestPrefix(t, "axyz")).toBe("a");
  });

  it("trieLongestPrefix: empty string when no match", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    expect(T.trieLongestPrefix(t, "banana")).toBe("");
  });

  it("trieLongestPrefix: exact match", () => {
    const t = T.trieNew();
    T.trieInsert(t, "hello");
    expect(T.trieLongestPrefix(t, "hello")).toBe("hello");
    expect(T.trieLongestPrefix(t, "hellow")).toBe("hello");
  });

  it("trieAutocomplete: returns matching words", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    T.trieInsert(t, "application");
    T.trieInsert(t, "apricot");
    T.trieInsert(t, "banana");
    const results = T.trieAutocomplete(t, "app");
    expect(results).toEqual(["apple", "application"]);
  });

  it("trieAutocomplete: empty prefix returns all words", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    T.trieInsert(t, "banana");
    expect(T.trieAutocomplete(t, "").sort()).toEqual(["apple", "banana"]);
  });

  it("trieAutocomplete: no match returns empty array", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    expect(T.trieAutocomplete(t, "xyz")).toEqual([]);
  });

  it("trieAutocomplete: prefix that is itself a word", () => {
    const t = T.trieNew();
    T.trieInsert(t, "app");
    T.trieInsert(t, "apple");
    T.trieInsert(t, "application");
    const results = T.trieAutocomplete(t, "app");
    expect(results).toEqual(["app", "apple", "application"]);
  });

  it("trieCount: counts words under prefix", () => {
    const t = T.trieNew();
    T.trieInsert(t, "apple");
    T.trieInsert(t, "application");
    T.trieInsert(t, "apricot");
    T.trieInsert(t, "banana");
    expect(T.trieCount(t, "ap")).toBe(3);
    expect(T.trieCount(t, "app")).toBe(2);
    expect(T.trieCount(t, "b")).toBe(1);
    expect(T.trieCount(t, "xyz")).toBe(0);
  });

  it("trieCount: empty prefix counts all", () => {
    const t = T.trieNew();
    T.trieInsert(t, "a");
    T.trieInsert(t, "b");
    T.trieInsert(t, "c");
    expect(T.trieCount(t, "")).toBe(3);
  });

  it("non-Trie argument panics", () => {
    expect(() => T.trieSize({} as any)).toThrow();
    expect(() => T.trieSearch(null as any, "x")).toThrow();
    expect(() => T.trieInsert(undefined as any, "x")).toThrow();
  });

  it("non-string word panics", () => {
    const t = T.trieNew();
    expect(() => T.trieInsert(t, 42 as any)).toThrow();
    expect(() => T.trieSearch(t, null as any)).toThrow();
  });

  it("many inserts and queries don't break", () => {
    const t = T.trieNew();
    const words: string[] = [];
    for (let i = 0; i < 200; i++) {
      const w = "word" + i;
      T.trieInsert(t, w);
      words.push(w);
    }
    expect(T.trieSize(t)).toBe(200);
    for (const w of words) {
      expect(T.trieSearch(t, w)).toBe(true);
    }
    expect(T.trieAutocomplete(t, "word1").length).toBe(111);  // word1, word10..word199
  });
});
