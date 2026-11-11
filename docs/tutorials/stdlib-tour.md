# Stdlib tour

> Audience: you want to know what's in Aether's standard library without reading the implementation.
> Time: ~60 minutes. The stdlib is 212 functions across 10 modules — this tutorial tours each with one or two runnable examples.

Aether v1 ships its standard library as TypeScript functions registered into the evaluator's root environment (see [ADR-08 stdlib as TypeScript functions](../decisions/adr-08-stdlib-as-typescript-functions.md)). The 10 modules are: `string`, `math`, `collections`, `io`, `datetime`, `regex`, `encoding`, `crypto`, `text`, and `async`. The first 9 are callable from Aether scripts; `async` is host-only in v1 (see [concurrency.md](concurrency.md)).

Every example below is runnable in the playground. The function signatures are taken directly from the per-module `MANIFEST` arrays in `aether/stdlib/*/index.ts`.

---

## 1. The inline builtins — always in scope

Before the stdlib modules, Aether has ~17 *inline* builtins baked into the evaluator. These are always in scope, no import needed:

| Function | Signature | Description |
|----------|-----------|-------------|
| `print` | `(x: any) -> ()` | Print a value (no trailing newline). |
| `println` | `(x: any) -> ()` | Print a value followed by newline. |
| `range` | `(start: int, end: int, step?: int) -> range` | Integer range. |
| `len` | `(x: any) -> int` | Length of array, map, set, or string. |
| `type_of` | `(x: any) -> string` | Type name as a string. |
| `assert` | `(cond: bool, msg?: string) -> ()` | Panic if false. |
| `assert_eq` | `(a: any, b: any, msg?: string) -> ()` | Panic if not equal. |
| `panic` | `(msg: any) -> never` | Abort the program. |
| `str` | `(x: any) -> string` | Display form of any value. |
| `int` | `(x: any) -> int` | Coerce to int (parse string, truncate float). |
| `float` | `(x: any) -> float` | Coerce to float. |
| `min` | `(...a: number) -> number` | Smallest of args. |
| `max` | `(...a: number) -> number` | Largest of args. |
| `abs` | `(n: number) -> number` | Absolute value. |
| `sqrt` | `(n: number) -> number` | Square root. |
| `push` | `(arr: [T], v: T) -> [T]` | Append to array (mutates). |
| `pop` | `(arr: [T]) -> [T]` | Drop last (mutates). |
| `map` | `(arr: [T], fn: fn(T) -> U) -> [U]` | Apply fn to each. |
| `filter` | `(arr: [T], fn: fn(T) -> bool) -> [T]` | Keep matching. |
| `reduce` | `(arr: [T], fn: fn(U, T) -> U, init: U) -> U` | Fold left. |

(Yes, that's 19 — the README's "212 fns across 10 modules" counts only the stdlib modules, not these inline builtins.)

These inline versions take precedence over the stdlib versions with the same name (e.g., `string.len`, `collections.push`, `math.min`), because they're installed last. The inline versions know how to call Aether closures via the evaluator's `callValue`; the stdlib versions accept only native JS functions.

```aether
print("hello");           // hello
println("world");         // world\n
print(len([1, 2, 3]));    // 3
print(len("hello"));      // 5
print(type_of(42));       // int
print(str(42));           // 42
print(int("42"));         // 42
print(int(3.99));         // 3 — truncates
print(float(42));         // 42
print(min(3, 1, 4, 1, 5, 9, 2, 6));   // 1
print(max(3, 1, 4, 1, 5, 9, 2, 6));   // 9
print(abs(-7));           // 7
print(sqrt(16));          // 4

for i in range(0, 5) { print(i); }    // 0 1 2 3 4
for i in range(10, 0, -2) { print(i); }  // 10 8 6 4 2

let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
print(doubled);           // [2, 4, 6]

let evens = filter([1, 2, 3, 4, 5], fn(x: int) -> bool { x % 2 == 0 });
print(evens);             // [2, 4]

let sum = reduce([1, 2, 3, 4], fn(a: int, b: int) -> int { a + b }, 0);
print(sum);               // 10

assert(2 + 2 == 4);
assert_eq(2 + 2, 4);
```

---

## 2. `string` module (24 functions)

String manipulation. The manifest:

```
split, join, trim, trimStart, trimEnd, toUpper, toLower,
replace, replaceAll, startsWith, endsWith, contains, indexOf,
slice, charAt, charCode, fromCharCode, repeat, padStart, padEnd,
reverse, len, isEmpty, toInt, format
```

### Examples

```aether
let s = "  Hello, World!  ";
print(trim(s));              // "Hello, World!"
print(toUpper(s));           // "  HELLO, WORLD!  "
print(toLower(trim(s)));     // "hello, world!"
print(replace(s, "World", "Aether"));    // "  Hello, Aether!  "
print(replaceAll("aaa", "a", "b"));      // "bbb"
print(startsWith("hello", "he"));        // true
print(endsWith("hello", "lo"));          // true
print(contains("hello", "ell"));         // true
print(indexOf("hello", "l"));            // 2
print(slice("hello", 1, 4));             // "ell"
print(charAt("hello", 1));               // "e"
print(repeat("ab", 3));                  // "ababab"
print(padStart("5", 3, "0"));            // "005"
print(padEnd("5", 3, "0"));               // "500"
print(reverse("hello"));                  // "olleh"

let parts = split("a,b,c", ",");
print(parts);               // ["a", "b", "c"]
print(join(parts, "-"));    // "a-b-c"

print(isEmpty(""));          // true
print(isEmpty("a"));         // false

print(format("name=%s age=%d", "ada", 36));    // name=ada age=36
print(format("hex=%x", 255));                 // hex=ff
print(format("pi=%.2f", 3.14159));             // pi=3.14
```

`format` is a printf-style formatter: `%s` (string), `%d` (int), `%f` (float), `%x` (hex), `%%` (literal percent). It's the only printf in the stdlib.

`split` with no separator splits on whitespace runs: `split("a  b\tc")` gives `["a", "b", "c"]`.

---

## 3. `math` module (31 functions)

Numeric and statistical. The manifest:

```
abs, sign, min, max, floor, ceil, round, trunc, sqrt, pow,
exp, log, log2, log10, sin, cos, tan, asin, acos, atan, atan2,
PI, E, gcd, lcm, clamp, lerp, mod, factorial, isPrime, sum, mean
```

### Examples

```aether
print(abs(-7));               // 7
print(sign(-3));               // -1
print(sign(0));                // 0
print(sign(3));                // 1
print(floor(3.7));             // 3
print(ceil(3.2));              // 4
print(round(3.5));             // 4
print(trunc(3.9));             // 3
print(sqrt(2.0));              // 1.4142135623730951
print(pow(2.0, 10.0));         // 1024
print(exp(1.0));               // 2.718281828459045
print(log(2.718281828459045)); // 1
print(log2(8));                 // 3
print(log10(1000));             // 3
print(sin(0.0));                // 0
print(cos(0.0));                // 1
print(PI());                    // 3.141592653589793
print(E());                     // 2.718281828459045
print(gcd(12, 18));             // 6
print(lcm(4, 6));               // 12
print(clamp(15, 0, 10));        // 10
print(lerp(0.0, 100.0, 0.25));  // 25
print(mod(-7, 3));              // 2  — always non-negative modulo
print(factorial(5));            // 120
print(isPrime(17));              // true
print(isPrime(15));              // false
print(sum([1, 2, 3, 4, 5]));    // 15
print(mean([1, 2, 3, 4, 5]));   // 3
```

`PI` and `E` are functions (not constants) — `PI()` returns 3.14159..., `E()` returns 2.71828.... This is because v1 has no module-qualified constants (constants would need module syntax, which is v2; see [RFC-003](../rfcs/rfc-003-modules-and-packages.md)). The `const PI: float = 3.14159;` form is how users define their own π constants.

`mod(a, b)` is always non-negative (the Euclidean definition), unlike the `%` operator which follows the C convention (sign of dividend).

`factorial(170)` is the largest factorial that fits in a float (7.257415615307994e+306). `factorial(171)` panics with `factorial: n must be <= 170`.

---

## 4. `collections` module (35 functions)

Arrays, maps, sets. The manifest:

```
push, pop, shift, unshift, insert, remove, slice, concat, reverse,
sort, map, filter, reduce, find, findIndex, every, some, includes,
indexOf, flat, flatMap, zip, chunk, unique, len,
mapNew, mapSet, mapGet, mapHas, mapDelete, mapKeys, mapValues, mapEntries, mapSize,
setNew, setAdd, setHas, setDelete, setSize, setToArray
```

(Note: `push`, `pop`, `map`, `filter`, `reduce`, `len` overlap with inline builtins. The inline versions win when both are registered; the stdlib versions are still useful from host code.)

### Arrays

```aether
let xs = [3, 1, 4, 1, 5, 9, 2, 6];
print(sort(xs));                         // [1, 1, 2, 3, 4, 5, 6, 9]
print(sort(xs, fn(a: int, b: int) -> int { b - a }));   // descending
print(reverse(xs));                      // [6, 2, 9, 5, 1, 4, 1, 3]
print(slice(xs, 2, 5));                  // [4, 1, 5]
print(concat([1, 2], [3, 4]));           // [1, 2, 3, 4]
print(shift([1, 2, 3]));                  // [2, 3] — drop first
print(unshift([2, 3], 1));                // [1, 2, 3] — prepend
print(insert([1, 3], 1, 2));              // [1, 2, 3] — insert at index
print(remove([1, 2, 3], 1));              // [1, 3] — remove at index

print(find([1, 2, 3, 4], fn(x: int) -> bool { x > 2 }));   // 3
print(findIndex([1, 2, 3, 4], fn(x: int) -> bool { x > 2 }));   // 2
print(every([2, 4, 6], fn(x: int) -> bool { x % 2 == 0 }));    // true
print(some([1, 3, 4], fn(x: int) -> bool { x % 2 == 0 }));     // true
print(includes([1, 2, 3], 2));            // true
print(indexOf([1, 2, 3, 2], 2));          // 1

print(flat([[1, 2], [3, 4]]));           // [1, 2, 3, 4]
print(flatMap([1, 2, 3], fn(x: int) -> [int] { [x, x * 10] }));  // [1, 10, 2, 20, 3, 30]
print(zip([1, 2, 3], ["a", "b", "c"]));  // [[1, "a"], [2, "b"], [3, "c"]]
print(chunk([1, 2, 3, 4, 5], 2));         // [[1, 2], [3, 4], [5]]
print(unique([1, 2, 2, 3, 3, 3]));        // [1, 2, 3]
```

### Maps

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
mapSet(m, "three", 3);

print(mapGet(m, "one"));    // 1
print(mapHas(m, "two"));    // true
print(mapSize(m));          // 3
print(mapKeys(m));          // ["one", "two", "three"]
print(mapValues(m));        // [1, 2, 3]
print(mapEntries(m));       // [["one", 1], ["two", 2], ["three", 3]]

mapDelete(m, "two");
print(mapSize(m));          // 2

// Iterating a map's keys
let total = 0;
for k in mapKeys(m) {
  print(f"{k} -> {mapGet(m, k)}");
}
```

### Sets

```aether
let mut s = setNew();
setAdd(s, 1);
setAdd(s, 2);
setAdd(s, 1);     // already in — no-op
print(setHas(s, 1));   // true
print(setHas(s, 99));  // false
print(setSize(s));       // 2
print(setToArray(s));   // [1, 2]
setDelete(s, 1);
print(setSize(s));       // 1
```

The stdlib's `sort` takes an optional comparator closure. The default is ascending. `find` returns `null` (not `Option::None`) when no element matches — a small inconsistency, but the inline `find` returns `null` too. (v2 may add an `Option`-returning variant.)

---

## 5. `io` module (13 functions)

Input/output and process. The manifest:

```
print, println, printList, readLine, writeFileSync, readFileSync,
fileExists, args, env, time, sleep, now, exit
```

(`print` and `println` overlap with inline builtins; the inline versions win. The stdlib versions are useful from host code.)

In the browser playground, the file/process functions (`readLine`, `writeFileSync`, `readFileSync`, `fileExists`, `args`, `env`, `sleep`, `exit`) are no-ops or panic — they need Node. They're callable from a Node-runs-Aether setup.

### Examples

```aether
print("hello");              // hello
println("world");            // world\n
printList([1, 2, 3]);        // 1\n2\n3\n

print(time());               // 1700000000000 (ms since epoch)
print(now());                // "2023-11-15T12:00:00.000Z" — ISO timestamp
print(env("HOME"));          // "" in browser, your home in Node

// writeFileSync("/tmp/x.ae", "let x = 42;");   // panics in browser, works in Node
// print(readFileSync("/tmp/x.ae"));            // ditto
// print(args());                               // process args, Node only
// sleep(1000);                                 // sleep 1s, Node only
// exit(0);                                     // terminate, Node only
```

The browser-friendly functions are `print`, `println`, `printList`, `time`, `now`. The rest need a Node environment.

---

## 6. `datetime` module (22 functions)

Date and time. The manifest:

```
now, today, date, time, formatTime, parseDate,
year, month, day, hour, minute, second, dayOfWeek,
addDays, addHours, addMinutes, diffSeconds, diffDays,
isLeapYear, daysInMonth, toISO, fromISO
```

Times are Unix timestamps in milliseconds (consistent with `io.time`).

### Examples

```aether
let t = now();
print(t);                       // 1700000000000 (ms since epoch)
print(toISO(t));                // "2023-11-15T12:00:00.000Z"

let y = year(t);
let m = month(t);
let d = day(t);
print(f"{y}-{m}-{d}");          // 2023-11-15

print(dayOfWeek(t));            // 0 = Sunday, 6 = Saturday

let tomorrow = addDays(t, 1);
print(diffDays(t, tomorrow));   // 1

print(isLeapYear(2024));         // true
print(isLeapYear(1900));         // false
print(isLeapYear(2000));         // true

print(daysInMonth(2024, 2));     // 29  — leap year
print(daysInMonth(2023, 2));     // 28

let parsed = fromISO("2023-01-15T00:00:00.000Z");
print(year(parsed));            // 2023

print(formatTime(t, "%Y-%m-%d %H:%M:%S"));  // strftime subset, e.g. "2023-11-15 12:00:00"
```

`formatTime` accepts a strftime-style format string with a subset of directives: `%Y` (year), `%m` (month), `%d` (day), `%H` (hour), `%M` (minute), `%S` (second). See `aether/stdlib/datetime/index.ts` for the full list.

---

## 7. `regex` module (15 functions)

Regular expressions. The manifest:

```
regex, match, matchAll, replace, replaceAll, split, test,
extract, groups, firstMatch, count, startsWithMatch, endsWithMatch,
escape, flags
```

Aether's regex is a thin wrapper around JS `RegExp`, so the syntax is the standard JS regex syntax.

### Examples

```aether
let pat = regex("\\d+");                // compile a pattern
print(test("abc123", pat));              // true
print(firstMatch("abc123", pat));        // "123"

let m = match("user=ada, age=36", "(\\w+)=(\\w+)");
print(m);   // ["user=ada", "user", "ada"]

let all = matchAll("a1 b2 c3", "(\\w)(\\d)");
print(all);   // [["a1", "a", "1"], ["b2", "b", "2"], ["c3", "c", "3"]]

let replaced = replaceAll("hello world", "o", "0");
print(replaced);   // "hell0 w0rld"

let parts = split("a,b,c", regex(","));
print(parts);   // ["a", "b", "c"]

print(count("the three thieves", "th"));   // 3
print(extract("phone: 555-1234", "(\\d+-\\d+)", 1));  // "555-1234"
print(startsWithMatch("hello world", "hel"));   // true

let escaped = escape("a.b*c");   // "a\\.b\\*c"
print(escaped);
print(flags(regex("x", "i")));   // "i" — case-insensitive
```

`regex(pattern, flags?)` compiles a JS `RegExp`. The pattern is a string, so backslashes have to be doubled (`"\\d"` in Aether source is the regex `\d` in JS).

`match` returns `null` if no match (the type is `string[]?` — option-like). `matchAll` returns all matches with their capture groups. `extract` returns the Nth capture group (default 0 = whole match).

---

## 8. `encoding` module (19 functions)

Encoding and serialization. The manifest:

```
jsonStringify, jsonParse, jsonPretty, base64Encode, base64Decode,
hexEncode, hexDecode, utf8Encode, utf8Decode, bytesToString,
urlEncode, urlDecode, csvParse, csvStringify, yamlStringify,
tomlStringify, msgpackPack, urlencode, queryParse, queryStringify
```

### Examples

```aether
let v = mapNew();
mapSet(v, "name", "Ada");
mapSet(v, "age", 36);
print(jsonStringify(v));   // compact JSON
print(jsonPretty(v));      // pretty-printed 2-space JSON

let parsed = jsonParse("{\"x\":1,\"y\":2}");
print(parsed);

let s = "hello, world!";
let b64 = base64Encode(s);
print(b64);              // "aGVsbG8sIHdvcmxkIQ=="
print(base64Decode(b64));   // "hello, world!"

let h = hexEncode("hi");
print(h);                // "6869"
print(hexDecode(h));     // "hi"

let bytes = utf8Encode("héllo");
print(bytes);            // [104, 195, 169, 108, 108, 111]
print(utf8Decode(bytes));   // "héllo"

let url = urlEncode("hello world & co");
print(url);              // "hello%20world%20%26%20co"
print(urlDecode(url));   // "hello world & co"

let csv = "a,b,c\n1,2,3\n4,5,6";
print(csvParse(csv));    // [["a","b","c"],["1","2","3"],["4","5","6"]]

let rows = [["x","y"], [1, 2], [3, 4]];
print(csvStringify(rows));   // "x,y\n1,2\n3,4"

let q = "name=Ada&age=36";
print(queryParse(q));    // map { name: "Ada", age: "36" }
print(queryStringify(queryParse(q)));   // "name=Ada&age=36"
```

`yamlStringify` and `tomlStringify` produce minimal YAML/TOML (subsets — not full implementations). `msgpackPack` is a tiny msgpack-style binary packer for demo purposes.

---

## 9. `crypto` module (14 functions)

Hashing, randomness, UUIDs. The manifest:

```
md5, sha1, sha256, sha512, djb2, fnv1a,
randomInt, randomFloat, randomBytes, uuid4, randomChoice, shuffle,
seedRandom, randomSeed
```

### Examples

```aether
print(md5("hello"));             // "5d41402abc4b2a76b9719d911017c592"
print(sha1("hello"));            // "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
print(sha256("hello"));          // "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

// sha512 is async in the stdlib (Web Crypto) — host-only in v1.
// print(sha512("hello"));        // returns a Promise; v1 evaluator can't await it

print(djb2("hello"));           // 2106665590   — a 32-bit hash
print(fnv1a("hello"));          // 1335831723

print(randomInt(1, 100));        // a cryptographically secure random int in [1, 100]
print(randomFloat());             // a secure random float in [0, 1)
let bs = randomBytes(8);
print(bs);                       // 8 random bytes, e.g. [234, 12, 87, ...]

print(uuid4());                  // e.g. "550e8400-e29b-41d4-a716-446655440000"

print(randomChoice([1, 2, 3, 4, 5]));   // a random element
print(shuffle([1, 2, 3, 4, 5]));         // Fisher-Yates shuffle (non-mutating)

// Deterministic mode: switch to a seeded PRNG (Mulberry32)
seedRandom(12345);
print(randomInt(1, 100));        // deterministic now
print(randomInt(1, 100));        // deterministic
randomSeed();                    // restore secure source
```

`md5`, `sha1`, `sha256` are pure-JS synchronous implementations. `sha512` is async (Web Crypto/Node `crypto`) — callable from host TypeScript, not from v1 Aether. `djb2` and `fnv1a` are non-cryptographic 32-bit hashes.

`randomInt`, `randomFloat`, `randomBytes`, `uuid4`, `randomChoice`, `shuffle` use `crypto.getRandomValues` (browser) / `crypto.randomBytes` (Node) — cryptographically secure. `seedRandom(seed)` switches to a deterministic Mulberry32 PRNG (useful for tests and reproducible shuffles); `randomSeed()` restores the secure source.

---

## 10. `text` module (15 functions)

Higher-level text processing — case conversion, wrapping, indentation. The manifest:

```
lines, words, unlines, unwords, indent, dedent, wrap, center, left,
right, titleCase, camelCase, snakeCase, kebabCase, truncate
```

### Examples

```aether
let paragraph = "first line\nsecond line\nthird line";
print(lines(paragraph));    // ["first line", "second line", "third line"]
print(unlines(lines(paragraph)));   // back to original

print(words("the quick brown fox"));   // ["the", "quick", "brown", "fox"]
print(unwords(["hello", "world"]));    // "hello world"

let multi = "hello\nworld\nfrom aether";
print(indent(multi, 2));    // "  hello\n  world\n  from aether"
print(dedent("  a\n   b"));  // "a\n b"  — strips common leading whitespace

print(wrap("the quick brown fox jumps over the lazy dog", 15));
// "the quick brown\nfox jumps over\nthe lazy dog"

print(center("hi", 8));   // "   hi   "
print(left("hi", 5));     // "hi   "
print(right("hi", 5));    // "   hi"

print(titleCase("hello world"));   // "Hello World"
print(camelCase("hello world"));    // "helloWorld"
print(camelCase("hello-world"));    // "helloWorld"
print(camelCase("hello_world"));    // "helloWorld"
print(snakeCase("helloWorld"));      // "hello_world"
print(snakeCase("hello world"));     // "hello_world"
print(kebabCase("helloWorld"));      // "hello-world"

print(truncate("hello, world!", 5));             // "hello..." (default ellipsis)
print(truncate("hello, world!", 5, "…"));        // "hello…"
```

`camelCase`, `snakeCase`, `kebabCase` recognize word boundaries from spaces, hyphens, underscores, and case transitions. Useful for converting between API naming conventions.

---

## 11. `async` module (16 functions, host-only)

This module is **not callable from v1 Aether**. It's a TypeScript module that's part of the stdlib for two reasons:

1. Host TypeScript code (the playground itself, server-side scripts) can call it directly via `import * as Async from "aether/stdlib/async"`.
2. It's the design artifact for the v2 async runtime (see [RFC-001 async await](../rfcs/rfc-001-async-await.md)).

The functions:

```
channel, send, recv, close, select, timeout, spawn, awaitAll, race,
mapAsync, filterAsync, reduceAsync, defer, retry, debounce, runAsync
```

From Aether v1: if you try to call any of these, you'll get `undefined name 'channel'` (etc.) because `Async.register` throws rather than registering. From host TypeScript:

```ts
import * as Async from "aether/stdlib/async";

async function demo() {
  const ch = Async.channel<number>();
  await Async.send(ch, 1);
  await Async.send(ch, 2);
  console.log(await Async.recv(ch));   // 1
  console.log(await Async.recv(ch));   // 2

  const result = await Async.select([
    { ch, op: "recv" },
  ], 1000);
  console.log(result);   // { index: -1 } — timeout, channel empty
}
demo();
```

For the v2 design that exposes these from Aether, see [concurrency.md](concurrency.md) and [RFC-001](../rfcs/rfc-001-async-await.md).

---

## 12. Module boundaries — what's where

A few functions appear in multiple modules with different signatures:

| Function | Inline | `string` | `math` | `collections` | `io` | `regex` |
|----------|-------|----------|-------|--------------|------|---------|
| `len` | (T) → int (array, string, map, set) | (string) → int (code points) | — | (arr, map, set) → int | — | — |
| `map` | (arr, fn) → arr | — | — | (arr, fn) → arr | — | — |
| `filter` | (arr, fn) → arr | — | — | (arr, fn) → arr | — | — |
| `reduce` | (arr, fn, init) → T | — | — | (arr, fn, init) → T | — | — |
| `min`/`max` | (variadic) → number | — | (variadic) → number | — | — | — |
| `abs`/`sqrt` | (number) → number | — | (number) → number | — | — | — |
| `push`/`pop` | (arr, v?) → arr | — | — | (arr, v?) → arr | — | — |
| `print`/`println` | (any) → () | — | — | — | (any) → () | — |
| `time`/`now` | — | — | — | — | (time, now) | (datetime has now too) |
| `replace`/`replaceAll`/`split`/`slice` | — | (string args) | — | (array args) | — | (regex pattern args) |
| `reverse` | — | (string) → string | — | (arr) → arr | — | — |

The inline version is what you get when you call the unqualified name from Aether. The stdlib version is callable as the same unqualified name when the inline doesn't exist (e.g., `format`, `regex`, `jsonParse`), and is callable from host TypeScript via `import * as Str from "aether/stdlib/string"` etc.

This naming overlap is documented in `aether/stdlib/index.ts` and is intentional — the inline builtins handle Aether closures properly (via the evaluator's `callValue`), the stdlib versions accept native JS functions (for host callers).

---

## 13. A worked example using several modules

```aether
// url_summary.ae — fetch a list of URLs (mocked), parse the query strings,
// compute a frequency map of parameter names, and print a sorted summary.

fn mock_urls() -> [string] {
  [
    "https://example.com/a?utm_source=email&page=1",
    "https://example.com/b?utm_source=ad&page=2",
    "https://example.com/c?utm_source=email&page=3",
    "https://example.com/d?utm_source=organic",
  ]
}

fn parse_query(url: string) -> map {
  // take the part after '?'
  let q = "";
  let i = indexOf(url, "?");
  if i >= 0 {
    q = slice(url, i + 1, len(url));
  }
  queryParse(q)
}

fn param_freq(urls: [string]) -> map {
  let mut freq = mapNew();
  for u in urls {
    let q = parse_query(u);
    for k in mapKeys(q) {
      if mapHas(freq, k) {
        let cur = mapGet(freq, k);
        mapSet(freq, k, cur + 1);
      } else {
        mapSet(freq, k, 1);
      }
    }
  }
  freq
}

let urls = mock_urls();
let freq = param_freq(urls);

let keys = mapKeys(freq);
for k in keys {
  print(f"{k}: {mapGet(freq, k)}");
}

// Compose a JSON summary.
print(jsonStringify(freq));
```

This uses `string` (`indexOf`, `slice`), `encoding` (`jsonStringify`, `queryParse`), `collections` (`mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapKeys`), and inline builtins (`for in`, `len`, `print`). Output:

```
utm_source: 4
page: 3
{"utm_source":4,"page":3}
```

---

## 14. What's next

- [reference/error-catalog.md](../reference/error-catalog.md) — what happens when a stdlib function panics.
- [decisions/adr-08-stdlib-as-typescript-functions.md](../decisions/adr-08-stdlib-as-typescript-functions.md) — the design decision.
- [concurrency.md](concurrency.md) — the `async` module's role.
- [performance.md](performance.md) — which stdlib functions are fast, which are not, and why.

The stdlib is the second-largest part of v1 (after the compiler itself). If you want to see how a particular function is implemented, the source is at `aether/stdlib/<module>/index.ts`, with tests at `aether/stdlib/<module>/index.test.ts`. The MANIFEST arrays at the bottom of each module file are the authoritative signatures.
