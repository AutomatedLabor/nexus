# Chapter 8 — Standard library tour

> Aether's standard library has 18 modules and ~396 functions. This chapter tours each module with one or two runnable examples. The full reference (every function, every signature, every error behavior) is in `docs/reference/api-reference.md`.

The 18 modules are: `string`, `math`, `collections`, `list`, `set`, `functional`, `statistics`, `bits`, `datetime`, `regex`, `encoding`, `crypto`, `text`, `validate`, `tree`, `uuid`, `io`, `async`. Each is implemented in TypeScript (`aether/stdlib/<module>/index.ts`) and registered with the evaluator's builtin table at startup. The functions are accessible without a module prefix — `split("a,b,c", ",")` not `string.split("a,b,c", ",")` — but in this book we sometimes use the prefix for clarity.

---

## 8.1 `string` — string operations

24 functions: `split`, `join`, `trim`, `trimStart`, `trimEnd`, `toUpper`, `toLower`, `replace`, `replaceAll`, `startsWith`, `endsWith`, `contains`, `indexOf`, `slice`, `charAt`, `charCode`, `fromCharCode`, `repeat`, `padStart`, `padEnd`, `reverse`, `len`, `isEmpty`, `toInt`, `format`.

**Example 1 — split and join.**

```aether
let s = "a,b,c,d";
let parts = split(s, ",");
print(parts);                   // ["a", "b", "c", "d"]
print(join(parts, "-"));         // a-b-c-d
```

**Example 2 — printf-style `format`.**

```aether
print(format("%s = %d (hex %x)", "answer", 42, 42));
// answer = 42 (hex 2a)
```

The `format` function supports `%s`, `%d`, `%f`, `%x`, `%X`, `%o`, `%b`, `%%`, with optional width and precision like `%5.2f`.

---

## 8.2 `math` — math functions

30 functions: `abs`, `sign`, `min`, `max`, `floor`, `ceil`, `round`, `trunc`, `sqrt`, `pow`, `exp`, `log`, `log2`, `log10`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `PI`, `E`, `gcd`, `lcm`, `clamp`, `lerp`, `mod`, `factorial`, `isPrime`, `sum`, `mean`.

**Example 1 — geometry.**

```aether
let r = 5.0;
let area = PI() * pow(r, 2.0);
let circ = 2.0 * PI() * r;
print(area);    // ~78.54
print(circ);    // ~31.42
```

**Example 2 — `gcd` and `lcm`.**

```aether
print(gcd(12, 18));   // 6
print(lcm(4, 6));     // 12
print(isPrime(17));   // true
print(factorial(5));  // 120
```

---

## 8.3 `collections` — array, map, and set

38 functions across arrays, maps, and sets. The array functions are non-mutating (they return a new array): `push`, `pop`, `shift`, `unshift`, `insert`, `remove`, `slice`, `concat`, `reverse`, `sort`, `map`, `filter`, `reduce`, `find`, `findIndex`, `every`, `some`, `includes`, `indexOf`, `flat`, `flatMap`, `zip`, `chunk`, `unique`, `len`. The map functions: `mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapDelete`, `mapKeys`, `mapValues`, `mapEntries`, `mapSize`. The set functions: `setNew`, `setAdd`, `setHas`, `setDelete`, `setSize`, `setToArray`.

**Example 1 — array operations.**

```aether
let xs = [3, 1, 4, 1, 5, 9, 2, 6];
print(sort(xs));                  // [1, 1, 2, 3, 4, 5, 6, 9]
print(unique(xs));                // [3, 1, 4, 5, 9, 2, 6]
print(chunk(xs, 3));              // [[3, 1, 4], [1, 5, 9], [2, 6]]
print(reduce(xs, fn(a: int, x: int) -> int { a + x }, 0));  // 31
```

**Example 2 — map operations.**

```aether
let mut m = mapNew();
mapSet(m, "a", 1);
mapSet(m, "b", 2);
print(mapGet(m, "a"));   // 1
print(mapKeys(m));        // ["a", "b"]
print(mapSize(m));        // 2
```

---

## 8.4 `list` — extended list operations

24 functions: `zip`, `zip3`, `unzip`, `interleave`, `cycle`, `replicate`, `take`, `drop`, `takeWhile`, `dropWhile`, `span`, `break_`, `partition`, `group`, `groupBy`, `window`, `intersperse`, `scan`, `scanr`, `unfold`, `rangeBy`, `iterate`, `permutations`, `combinations`, `rotate`.

**Example 1 — `take` and `drop`.**

```aether
let xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
print(take(xs, 3));    // [1, 2, 3]
print(drop(xs, 7));    // [8, 9, 10]
print(takeWhile(xs, fn(x: int) -> bool { x < 5 }));   // [1, 2, 3, 4]
print(dropWhile(xs, fn(x: int) -> bool { x < 5 }));   // [5, 6, 7, 8, 9, 10]
```

**Example 2 — `permutations` and `combinations`.**

```aether
print(permutations([1, 2, 3]));
// [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]

print(combinations([1, 2, 3, 4], 2));
// [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]
```

---

## 8.5 `set` — set operations

20 functions: `setNew`, `setAdd`, `setRemove`, `setHas`, `setSize`, `setToArray`, `setUnion`, `setIntersect`, `setDifference`, `setSymDiff`, `setSubset`, `setSuperset`, `setDisjoint`, `setEqual`, `setMap`, `setFilter`, `setFold`, `setAny`, `setAll`, `setToString`.

**Example 1 — set algebra.**

```aether
let a = setNew([1, 2, 3, 4]);
let b = setNew([3, 4, 5, 6]);
print(setToArray(setUnion(a, b)));        // [1, 2, 3, 4, 5, 6]
print(setToArray(setIntersect(a, b)));   // [3, 4]
print(setToArray(setDifference(a, b)));   // [1, 2]
print(setToArray(setSymDiff(a, b)));       // [1, 2, 5, 6]
```

**Example 2 — set predicates.**

```aether
let a = setNew([1, 2, 3]);
let b = setNew([1, 2, 3, 4]);
print(setSubset(a, b));     // true
print(setSuperset(b, a));   // true
print(setDisjoint(setNew([1, 2]), setNew([3, 4])));   // true
print(setEqual(a, setNew([3, 2, 1])));                // true
```

---

## 8.6 `functional` — combinators

22 functions: `identity`, `constant`, `compose`, `pipe`, `pipeFns`, `curry`, `uncurry`, `partial`, `flip`, `memoize`, `once`, `debounce`, `throttle`, `after`, `before`, `wrap`, `tap`, `try_`, `when`, `unless`, `condTuples`.

**Example 1 — `pipe` and `compose`.**

```aether
let inc = fn(x: int) -> int { x + 1 };
let dbl = fn(x: int) -> int { x * 2 };
let pipeline = pipeFns(inc, dbl, inc);   // x -> ((x+1)*2)+1
print(pipeline(3));                       // 9
let composed = compose(inc, dbl);        // x -> inc(dbl(x))
print(composed(3));                       // 7
```

**Example 2 — `memoize`.**

```aether
let mut calls = 0;
let slow = fn(x: int) -> int {
  calls = calls + 1;
  x * x
};
let fast = memoize(slow);
print(fast(5));   // 25, calls = 1
print(fast(5));   // 25, calls = 1 (memoized)
print(fast(6));   // 36, calls = 2
print(calls);     // 2
```

---

## 8.7 `statistics` — descriptive statistics

26 functions: `mean`, `median`, `mode`, `variance`, `stdDev`, `sampleVariance`, `min_`, `max_`, `range`, `sum_`, `product`, `quartiles`, `percentile`, `iqr`, `skewness`, `kurtosis`, `covariance`, `correlation`, `linearRegression`, `rSquare`, `zScore`, `histogram`, `cumulativeSum`, `movingAverage`, `exponentialSmooth`, `chiSquare`.

**Example 1 — central tendency.**

```aether
let xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
print(mean(xs));      // 5.5
print(median(xs));    // 5.5
print(mode([1, 1, 2, 2, 3]));   // 1 (smallest most-frequent)
print(stdDev(xs));    // ~2.87
```

**Example 2 — linear regression.**

```aether
let xs = [1, 2, 3, 4, 5];
let ys = [2, 4, 6, 8, 10];
let r = linearRegression(xs, ys);
// r is { slope: 2.0, intercept: 0.0, r2: 1.0 }
print(r.slope);
print(r.r2);
```

---

## 8.8 `bits` — bit operations

20 functions: `bitAnd`, `bitOr`, `bitXor`, `bitNot`, `bitShl`, `bitShr`, `bitSar`, `bitRotate`, `bitCount`, `leadingZeros`, `trailingZeros`, `highestBit`, `lowestBit`, `bitTest`, `bitSet`, `bitFlip`, `bitMerge`, `bitExtract`, `grayCode`.

**Example 1 — popcount and Gray code.**

```aether
print(bitCount(0xFF));        // 8
print(bitCount(0b10101100));  // 5
print(grayCode(5));            // 7  (5 = 101 -> 111 = 7)
print(grayCode(6));            // 5  (6 = 110 -> 101 = 5)
```

**Example 2 — bit manipulation.**

```aether
let x = 0b11001010;
print(bitTest(x, 1));    // true (bit 1 is 1)
print(bitTest(x, 0));    // false (bit 0 is 0)
let y = bitSet(x, 0, true);   // set bit 0
print(y);                // 0b11001011 = 203
print(bitExtract(x, 1, 3));    // extract 3 bits starting at bit 1 = 0b101 = 5
```

---

## 8.9 `datetime` — date and time

22 functions: `now`, `today`, `date`, `time`, `formatTime`, `parseDate`, `year`, `month`, `day`, `hour`, `minute`, `second`, `dayOfWeek`, `addDays`, `addHours`, `addMinutes`, `diffSeconds`, `diffDays`, `isLeapYear`, `daysInMonth`, `toISO`, `fromISO`.

**Example 1 — current time and date parts.**

```aether
let t = now();
print(year(t));
print(month(t));
print(day(t));
print(toISO(t));   // ISO 8601 UTC
```

**Example 2 — date arithmetic.**

```aether
let d1 = date(2024, 1, 1);
let d2 = date(2024, 12, 31);
print(diffDays(d1, d2));   // 365 (2024 is a leap year)
print(isLeapYear(2024));    // true
print(daysInMonth(2024, 2)); // 29
```

---

## 8.10 `regex` — regular expressions

16 functions: `regex`, `match`, `matchAll`, `replace`, `replaceAll`, `split`, `test`, `extract`, `groups`, `firstMatch`, `count`, `startsWithMatch`, `endsWithMatch`, `escape`, `flags`.

**Example 1 — extracting captures.**

```aether
let s = "name: Aether, version: 2";
let r = regex("name: (\\w+), version: (\\d+)");
let g = groups(s, r);
print(g);   // ["Aether", "2"]
```

**Example 2 — `replaceAll`.**

```aether
let s = "hello world";
let r = regex("\\w+");
print(replaceAll(s, r, "X"));   // X X
print(count(s, regex("\\w+")));   // 2
```

---

## 8.11 `encoding` — JSON, Base64, hex, UTF-8, CSV, YAML, TOML, msgpack, URL

20 functions: `jsonStringify`, `jsonParse`, `jsonPretty`, `base64Encode`, `base64Decode`, `hexEncode`, `hexDecode`, `utf8Encode`, `utf8Decode`, `bytesToString`, `urlEncode`, `urlDecode`, `csvParse`, `csvStringify`, `yamlStringify`, `tomlStringify`, `msgpackPack`, `urlencode`, `queryParse`, `queryStringify`.

**Example 1 — JSON round-trip.**

```aether
let v = { name: "Aether", version: 2 };
let s = jsonStringify(v);
print(s);                    // {"name":"Aether","version":2}
let back = jsonParse(s);
print(back.name);             // Aether
```

**Example 2 — Base64.**

```aether
let s = "Hello, World!";
let b64 = base64Encode(s);
print(b64);                    // SGVsbG8sIFdvcmxkIQ==
print(base64Decode(b64));      // Hello, World!
```

---

## 8.12 `crypto` — hashes and random

14 functions: `md5`, `sha1`, `sha256`, `sha512`, `djb2`, `fnv1a`, `randomInt`, `randomFloat`, `randomBytes`, `uuid4`, `randomChoice`, `shuffle`, `seedRandom`, `randomSeed`.

**Example 1 — SHA-256.**

```aether
print(sha256("hello"));
// 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
```

**Example 2 — random with seed.**

```aether
seedRandom(42);
print(randomInt(1, 100));
print(randomInt(1, 100));
seedRandom(42);   // re-seed — same sequence
print(randomInt(1, 100));
print(randomInt(1, 100));
print(shuffle([1, 2, 3, 4, 5]));
```

---

## 8.13 `text` — text formatting

16 functions: `lines`, `words`, `unlines`, `unwords`, `indent`, `dedent`, `wrap`, `center`, `left`, `right`, `titleCase`, `camelCase`, `snakeCase`, `kebabCase`, `truncate`.

**Example 1 — wrap and indent.**

```aether
let s = "The quick brown fox jumps over the lazy dog.";
print(wrap(s, 20));
// The quick brown fox
// jumps over the lazy
// dog.
print(indent("a\nb\nc", 2));
//   a
//   b
//   c
```

**Example 2 — case conversions.**

```aether
print(camelCase("hello world foo"));   // helloWorldFoo
print(snakeCase("helloWorldFoo"));      // hello_world_foo
print(kebabCase("helloWorldFoo"));       // hello-world-foo
print(titleCase("hello world foo"));     // Hello World Foo
```

---

## 8.14 `validate` — string validators

22 functions: `isEmail`, `isUrl`, `isIpv4`, `isIpv6`, `isUuid`, `isDate`, `isTime`, `isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper`, `isWhitespace`, `isAscii`, `isInRange`, `isOneOf`, `isNonEmpty`, `isLength`, `isMaxLength`, `matches`.

**Example 1 — email and URL validation.**

```aether
print(isEmail("user@example.com"));     // true
print(isEmail("not-an-email"));          // false
print(isUrl("https://aether.dev"));      // true
print(isUrl("ftp://aether.dev"));        // false
print(isIpv4("192.168.1.1"));            // true
print(isIpv4("999.999.999.999"));         // false
```

**Example 2 — UUID and date validation.**

```aether
print(isUuid("550e8400-e29b-41d4-a716-446655440000"));   // true
print(isDate("2024-02-29"));   // true (2024 is a leap year)
print(isDate("2023-02-29"));   // false (2023 is not)
print(isTime("23:59:59"));      // true
print(isTime("24:00:00"));      // false
```

---

## 8.15 `tree` — n-ary trees

20 functions: `treeNew`, `treeValue`, `treeChildren`, `treeAddChild`, `treeIsLeaf`, `treeSize`, `treeDepth`, `treeHeight`, `treeMap`, `treeFilter`, `treeFind`, `treePath`, `treeFlatten`, `treeWalk`, `treeBfs`, `treeDfs`, `treePrint`, `treeToString`, `treeFromEdges`, `treeEquals`.

**Example 1 — build and walk a tree.**

```aether
let root = treeNew("root");
let a = treeAddChild(root, "a");
let b = treeAddChild(root, "b");
treeAddChild(a, "a1");
treeAddChild(a, "a2");
treeAddChild(b, "b1");
print(treeSize(root));   // 6
print(treeDepth(root)); // 3
treeWalk(root, fn(v: string) -> () { print(v); });
// root, a, a1, a2, b, b1 (pre-order)
```

**Example 2 — pretty-print.**

```aether
let root = treeNew("root");
treeAddChild(treeAddChild(root, "a"), "a1");
treeAddChild(root, "b");
print(treePrint(root));
// root
// ├─ a
// │  └─ a1
// └─ b
```

---

## 8.16 `uuid` — UUID generation and parsing

14 functions: `uuid1`, `uuid3`, `uuid4`, `uuid5`, `uuidParse`, `uuidStringify`, `uuidCompare`, `uuidNil`, `uuidMax`, `uuidVersion`, `uuidVariant`, `uuidIsValid`, `uuidNamespaceDNS`, `uuidNamespaceURL`.

**Example 1 — generate UUIDs.**

```aether
print(uuid4());                       // random UUID v4
print(uuid5("aether.dev", uuidNamespaceDNS()));   // deterministic v5
print(uuidIsValid("550e8400-e29b-41d4-a716-446655440000"));   // true
print(uuidVersion("550e8400-e29b-41d4-a716-446655440000"));   // 5
```

**Example 2 — parse and stringify.**

```aether
let bytes = uuidParse("550e8400-e29b-41d4-a716-446655440000");
print(len(bytes));   // 16
print(uuidStringify(bytes));   // 550e8400-e29b-41d4-a716-446655440000
print(uuidNil());    // 00000000-0000-0000-0000-000000000000
```

---

## 8.17 `io` — input/output

14 functions: `print`, `println`, `printList`, `readLine`, `writeFileSync`, `readFileSync`, `fileExists`, `args`, `env`, `time`, `sleep`, `now`, `exit`. (Some are Node-only.)

**Example 1 — output.**

```aether
println("Hello, Aether!");
printList([1, 2, 3]);   // 1\n2\n3\n
print(now());           // ISO 8601 timestamp
```

**Example 2 — environment.**

```aether
// Node-only:
print(env("HOME"));
print(args());
// writeFileSync("/tmp/x.txt", "hello");
// print(readFileSync("/tmp/x.txt"));
```

---

## 8.18 `async` — concurrency

18 functions: `channel`, `send`, `recv`, `close`, `select`, `timeout`, `spawn`, `awaitAll`, `race`, `mapAsync`, `filterAsync`, `reduceAsync`, `defer`, `retry`, `debounce`, `runAsync`. (Async is a v2 stdlib; v1 runs synchronously.)

**Example 1 — channels.**

```aether
let ch = channel();
spawn(fn() -> () { send(ch, "hello"); });
let v = await(recv(ch));
print(v);   // hello
```

**Example 2 — `awaitAll` and `race`.**

```aether
let ps = [
  spawn(fn() -> int { 1 + 1 }),
  spawn(fn() -> int { 2 * 3 }),
  spawn(fn() -> int { 10 - 4 }),
];
print(await(awaitAll(ps)));   // [2, 6, 6]
```

(The async module uses JS Promises internally — see ADR-13. The full async runtime is covered in Chapter 12.)

---

## 8.19 Eight runnable examples (one per module family)

**1. `string` — split/join.**

```aether
let s = "hello,world,foo";
print(join(split(s, ","), "-"));   // hello-world-foo
```

**2. `math` — clamp and lerp.**

```aether
print(clamp(15, 0, 10));   // 10
print(lerp(0.0, 100.0, 0.25));   // 25.0
```

**3. `collections` — `chunk` and `unique`.**

```aether
let xs = [1, 1, 2, 3, 3, 4];
print(unique(xs));          // [1, 2, 3, 4]
print(chunk([1, 2, 3, 4, 5, 6], 2));   // [[1, 2], [3, 4], [5, 6]]
```

**4. `list` — `take` and `drop`.**

```aether
let xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
print(take(xs, 3));    // [1, 2, 3]
print(drop(xs, 7));    // [8, 9, 10]
```

**5. `set` — union.**

```aether
let a = setNew([1, 2, 3]);
let b = setNew([3, 4, 5]);
print(setToArray(setUnion(a, b)));   // [1, 2, 3, 4, 5]
```

**6. `functional` — `pipe`.**

```aether
let inc = fn(x: int) -> int { x + 1 };
let dbl = fn(x: int) -> int { x * 2 };
print(pipe(3, inc, dbl, inc));   // 9
```

**7. `regex` — extract.**

```aether
let r = regex("(\\d+)");
print(extract("abc 123 def", r, 1));   // 123
```

**8. `validate` — email.**

```aether
print(isEmail("user@example.com"));   // true
print(isEmail("not-an-email"));       // false
```

---

## 8.20 Summary

- 18 stdlib modules, ~396 functions, all implemented in TypeScript and registered as builtins at startup.
- String, math, collections, list, set, functional, statistics, bits, datetime, regex, encoding, crypto, text, validate, tree, uuid, io, async.
- The full reference (every function, every signature, every error behavior) is in `docs/reference/api-reference.md`.
- Functions are accessible without a module prefix: `split(...)`, not `string.split(...)`.
- The async module is a v2 stdlib (uses JS Promises internally — see ADR-13).

The next chapter is the bytecode VM: how the v2 VM works, the 80+ opcodes, why a VM, perf vs tree-walker, and the benchmark numbers.
