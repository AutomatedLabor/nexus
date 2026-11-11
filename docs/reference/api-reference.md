# Aether Standard Library — API Reference

> Complete reference for the 18 stdlib modules and ~396 functions. For each module: a one-line purpose, then every function with name, signature, parameters, return type, one-line description, a runnable example, and error behavior. Functions are accessible without a module prefix (e.g., `split(...)` not `string.split(...)`).

The implementations are in `aether/stdlib/<module>/index.ts`. Each module exports a `register(registerBuiltin)` function that wires the functions into the evaluator's builtin table at startup. The MANIFEST in each file is the source of truth for the function list.

---

## Module: `string`

> String operations: splitting, joining, case, replace, padding, formatting.

### `split`

**Signature:** `split(s: string, sep?: string) -> string[]`

**Parameters:**
- `s` — the string to split.
- `sep` — the separator (optional; default splits on whitespace runs).

**Returns:** An array of substrings. Empty string yields `[]` (whitespace mode) or `[""]` (with explicit `sep`).

**Description:** Split a string by a separator. If `sep` is omitted (or `null`), split on whitespace runs (like `words`). If `sep` is `""`, split into individual characters (Unicode-aware via `Array.from`).

**Example:**

```aether
print(split("a,b,c", ","));         // ["a", "b", "c"]
print(split("hello world foo"));    // ["hello", "world", "foo"]
print(split("abc", ""));             // ["a", "b", "c"]
```

**Errors:** `split: expected string, got <type>` if `s` (or `sep` when provided) is not a string.

### `join`

**Signature:** `join(arr: any[], sep?: string) -> string`

**Parameters:**
- `arr` — the array of values to join.
- `sep` — the separator (default `","`).

**Returns:** A string with `sep` between each element.

**Description:** Join an array of values into a string with a separator. Elements are stringified via `display` (which is JSON for objects, `str()` for primitives).

**Example:**

```aether
print(join([1, 2, 3], "-"));    // "1-2-3"
print(join(["a", "b"], ", "));   // "a, b"
print(join([1, 2, 3]));         // "1,2,3"
```

**Errors:** `join: expected array` if `arr` is not an array.

### `trim`, `trimStart`, `trimEnd`

**Signature:** `trim(s: string) -> string` (and same for `trimStart`, `trimEnd`).

**Description:** Strip leading/trailing whitespace. `trim` strips both ends; `trimStart` strips the start; `trimEnd` strips the end.

**Example:**

```aether
print(trim("  hi  "));       // "hi"
print(trimStart("  hi  "));  // "hi  "
print(trimEnd("  hi  "));    // "  hi"
```

**Errors:** `<fn>: expected string, got <type>` if `s` is not a string.

### `toUpper`, `toLower`

**Signature:** `toUpper(s: string) -> string` (and `toLower`).

**Description:** Uppercase/lowercase the string (locale-independent).

**Example:**

```aether
print(toUpper("hello"));   // "HELLO"
print(toLower("HELLO"));   // "hello"
```

### `replace`, `replaceAll`

**Signature:** `replace(s: string, from: string, to: string) -> string` (and `replaceAll`).

**Description:** Replace occurrences of `from` with `to` in `s`. `replace` does the first occurrence only; `replaceAll` does all.

**Example:**

```aether
print(replace("a-b-c", "-", "+"));      // "a+b-c"
print(replaceAll("a-b-c", "-", "+"));    // "a+b+c"
```

**Errors:** Strings only.

### `startsWith`, `endsWith`, `contains`

**Signature:** `startsWith(s: string, prefix: string) -> bool` (and `endsWith`, `contains`).

**Description:** Boolean tests for prefix, suffix, and substring.

**Example:**

```aether
print(startsWith("hello", "he"));   // true
print(endsWith("hello", "lo"));     // true
print(contains("hello", "ell"));    // true
```

### `indexOf`

**Signature:** `indexOf(s: string, sub: string) -> int`

**Description:** Return the first index of `sub` in `s`, or `-1` if not found.

**Example:**

```aether
print(indexOf("hello", "ll"));   // 2
print(indexOf("hello", "x"));    // -1
```

### `slice`

**Signature:** `slice(s: string, start: int, end?: int) -> string`

**Description:** Return the substring `[start, end)`. Negative indices are interpreted relative to the end (JS `slice` semantics).

**Example:**

```aether
print(slice("hello", 1, 3));    // "el"
print(slice("hello", 1));       // "ello"
print(slice("hello", -2));      // "lo"
```

### `charAt`, `charCode`, `fromCharCode`

**Signature:** `charAt(s: string, i: int) -> string`, `charCode(s: string, i: int) -> int`, `fromCharCode(n: int) -> string`.

**Description:** `charAt` returns the character at index `i`. `charCode` returns the UTF-16 code unit. `fromCharCode` builds a single-character string from a code point (handles surrogate pairs for code points > 0xFFFF).

**Example:**

```aether
print(charAt("hello", 1));    // "e"
print(charCode("A", 0));      // 65
print(fromCharCode(65));       // "A"
print(fromCharCode(0x1F600));  // 😀
```

**Errors:** `charAt: index out of bounds` if `i` is out of range. `charCode: index out of bounds` likewise. `fromCharCode: code point out of range` if `n` is negative or > 0x10FFFF.

### `repeat`

**Signature:** `repeat(s: string, n: int) -> string`

**Description:** Repeat `s` `n` times.

**Example:**

```aether
print(repeat("ab", 3));   // "ababab"
print(repeat("-", 5));     // "-----"
```

**Errors:** `repeat: count must be non-negative` if `n < 0`.

### `padStart`, `padEnd`

**Signature:** `padStart(s: string, n: int, ch?: string) -> string` (and `padEnd`).

**Description:** Pad `s` to length `n`. `padStart` left-pads; `padEnd` right-pads. The padding character defaults to space and must be a single character.

**Example:**

```aether
print(padStart("5", 3, "0"));   // "005"
print(padEnd("5", 3, "_"));     // "5__"
print(padStart("hi", 5));       // "   hi"
```

**Errors:** `padStart: padding must be a single char` if `ch` is not exactly one character.

### `reverse`

**Signature:** `reverse(s: string) -> string`

**Description:** Reverse by Unicode code point (not UTF-16 unit).

**Example:**

```aether
print(reverse("hello"));   // "olleh"
print(reverse("😀ab"));     // "ba😀"
```

### `len`

**Signature:** `len(s: string) -> int`

**Description:** Return the code-point length (not the UTF-16 length).

**Example:**

```aether
print(len("hello"));   // 5
print(len("😀"));      // 1 (one code point)
```

### `isEmpty`

**Signature:** `isEmpty(s: string) -> bool`

**Description:** True when length is 0.

**Example:**

```aether
print(isEmpty(""));    // true
print(isEmpty("a"));   // false
```

### `toInt`

**Signature:** `toInt(s: string) -> int`

**Description:** Parse the string as an integer. Trims whitespace, accepts optional sign, decimal, and exponent. Returns the integer via `Math.trunc`.

**Example:**

```aether
print(toInt("42"));     // 42
print(toInt("  42 "));   // 42
print(toInt("-3.9"));   // -3 (truncates)
print(toInt("1e3"));    // 1000
```

**Errors:** `toInt: empty string` if the string is empty after trimming. `toInt: cannot parse '<s>'` if the string doesn't parse to a finite number.

### `format`

**Signature:** `format(fmt: string, ...args: any) -> string`

**Description:** printf-style formatting. Supports `%s` (string), `%d` (int), `%f` (float, 6 decimal places), `%x` / `%X` (hex), `%o` (octal), `%b` (binary), `%%` (literal percent), with optional width and precision like `%5.2f`. Arguments are consumed positionally.

**Example:**

```aether
print(format("%s = %d (hex %x)", "answer", 42, 42));   // "answer = 42 (hex 2a)"
print(format("%5.2f", 3.14159));                        // " 3.14"
print(format("%-10s|", "hi"));                          // "hi        |"
```

**Errors:** `format: trailing % in format string` if the format ends with `%`. `format: unknown conversion '%X'` if `X` is not a known conversion.

---

## Module: `math`

> Mathematical functions: arithmetic, trigonometry, logarithms, number-theoretic helpers, statistics-of-one.

### `abs`, `sign`

`abs(n) -> number` — absolute value. `sign(n) -> int` — `-1`, `0`, or `1`.

```aether
print(abs(-5));    // 5
print(sign(-3.5)); // -1
print(sign(0));    // 0
print(sign(42));   // 1
```

### `min`, `max`

Variadic. Smallest/largest of arguments.

```aether
print(min(3, 1, 4, 1, 5));   // 1
print(max(3, 1, 4, 1, 5));   // 5
```

### `floor`, `ceil`, `round`, `trunc`

`floor(f) -> int`, `ceil(f) -> int`, `round(f) -> int` (half up), `trunc(f) -> int`.

```aether
print(floor(3.7));   // 3
print(ceil(3.2));     // 4
print(round(3.5));    // 4
print(round(3.4));    // 3
print(trunc(3.9));    // 3
print(trunc(-3.9));   // -3
```

### `sqrt`

`sqrt(f) -> number`. Square root. Panics on negative input (returns NaN; Aether treats NaN as a panic for sqrt).

```aether
print(sqrt(16.0));   // 4
print(sqrt(2.0));    // 1.4142135623730951
```

### `pow`, `exp`, `log`, `log2`, `log10`

```aether
print(pow(2.0, 10.0));   // 1024
print(exp(1.0));          // 2.718281828459045
print(log(2.71828));      // ~1
print(log2(8));           // 3
print(log10(1000));       // 3
```

**Errors:** `log`: panics on `<= 0`. `log2`, `log10`: same.

### `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`

```aether
print(sin(0.0));           // 0
print(cos(0.0));           // 1
print(PI() / 2);           // 1.5707963267948966
print(atan2(1.0, 1.0));    // 0.7853981633974483
```

### `PI`, `E`

`PI() -> number`, `E() -> number`. Constants π and e (as zero-argument functions for parity with the rest of the stdlib).

```aether
print(PI());   // 3.141592653589793
print(E());    // 2.718281828459045
```

### `gcd`, `lcm`

`gcd(a, b) -> int`, `lcm(a, b) -> int`. Greatest common divisor / least common multiple.

```aether
print(gcd(12, 18));   // 6
print(lcm(4, 6));     // 12
```

### `clamp`, `lerp`

`clamp(n, lo, hi) -> number`. `lerp(a, b, t) -> number`. Linear interpolation.

```aether
print(clamp(15, 0, 10));   // 10
print(clamp(-5, 0, 10));   // 0
print(lerp(0.0, 100.0, 0.25));   // 25
```

### `mod`

`mod(a, b) -> int`. Always-non-negative modulo (Python-style).

```aether
print(mod(-1, 7));   // 6 (not -1)
print(mod(8, 7));    // 1
```

### `factorial`

`factorial(n) -> int`. n!. Panics for `n > 170` (overflow into Infinity).

```aether
print(factorial(5));    // 120
print(factorial(10));   // 3628800
```

### `isPrime`

`isPrime(n) -> bool`. Trial-division primality test.

```aether
print(isPrime(17));    // true
print(isPrime(18));    // false
print(isPrime(2));     // true
```

### `sum`, `mean`

`sum(arr) -> number`. `mean(arr) -> number`. Sum and arithmetic mean of a numeric array.

```aether
print(sum([1, 2, 3, 4, 5]));   // 15
print(mean([1, 2, 3, 4, 5])); // 3
```

---

## Module: `collections`

> Array, map, and set operations. Array functions are non-mutating (they return new arrays). Map and set operations mutate the receiver (and return it for chaining).

### Array operations

### `push`, `pop`, `shift`, `unshift`

`push(arr, v) -> arr` (non-mutating; appends v). `pop(arr) -> arr` (non-mutating; drops last). `shift(arr) -> arr` (drops first). `unshift(arr, v) -> arr` (prepends v).

```aether
print(push([1, 2], 3));     // [1, 2, 3]
print(pop([1, 2, 3]));      // [1, 2]
print(shift([1, 2, 3]));    // [2, 3]
print(unshift([2, 3], 1)); // [1, 2, 3]
```

(These are non-mutating versions. The inline `push`/`pop` from the evaluator's builtins *do* mutate; the linter flags the ambiguity — see Chapter 13.)

### `insert`, `remove`, `slice`, `concat`, `reverse`, `sort`

```aether
print(insert([1, 3], 1, 2));       // [1, 2, 3] — insert 2 at index 1
print(remove([1, 2, 3], 1));        // [1, 3]   — remove at index 1
print(slice([1, 2, 3, 4], 1, 3));   // [2, 3]
print(concat([1, 2], [3, 4]));      // [1, 2, 3, 4]
print(reverse([1, 2, 3]));          // [3, 2, 1]
print(sort([3, 1, 2]));             // [1, 2, 3]
print(sort([3, 1, 2], fn(a: int, b: int) -> int { b - a }));   // [3, 2, 1] (descending)
```

### `map`, `filter`, `reduce`

```aether
print(map([1, 2, 3], fn(x: int) -> int { x * 2 }));                   // [2, 4, 6]
print(filter([1, 2, 3, 4], fn(x: int) -> bool { x % 2 == 0 }));       // [2, 4]
print(reduce([1, 2, 3, 4], fn(a: int, x: int) -> int { a + x }, 0));  // 10
```

### `find`, `findIndex`, `every`, `some`, `includes`, `indexOf`

```aether
print(find([1, 2, 3], fn(x: int) -> bool { x > 2 }));     // 3
print(findIndex([1, 2, 3], fn(x: int) -> bool { x > 2 })); // 2
print(every([2, 4, 6], fn(x: int) -> bool { x % 2 == 0 })); // true
print(some([1, 2, 3], fn(x: int) -> bool { x > 2 }));       // true
print(includes([1, 2, 3], 2));                              // true
print(indexOf([1, 2, 3], 2));                                // 1
```

### `flat`, `flatMap`, `zip`, `chunk`, `unique`

```aether
print(flat([[1, 2], [3, 4]]));          // [1, 2, 3, 4]
print(flatMap([1, 2], fn(x: int) -> [int] { [x, x * 10] }));   // [1, 10, 2, 20]
print(zip([1, 2, 3], ["a", "b", "c"]));  // [[1, "a"], [2, "b"], [3, "c"]]
print(chunk([1, 2, 3, 4, 5], 2));        // [[1, 2], [3, 4], [5]]
print(unique([1, 1, 2, 3, 3, 4]));       // [1, 2, 3, 4]
```

### `len`

`len(arr) -> int`. Element count (works on arrays, strings, maps, sets).

### Map operations

### `mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapDelete`, `mapKeys`, `mapValues`, `mapEntries`, `mapSize`

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
print(mapGet(m, "one"));    // 1
print(mapHas(m, "three")); // false
print(mapKeys(m));          // ["one", "two"]
print(mapValues(m));        // [1, 2]
print(mapEntries(m));       // [{ key: "one", value: 1 }, { key: "two", value: 2 }]
print(mapSize(m));          // 2
print(mapDelete(m, "one")); // true
print(mapSize(m));          // 1
```

**Errors:** `mapGet` panics if the key is absent (`map key not found: <key>`). Use `mapHas` first, or wrap in a `match` with `Option`.

### Set operations (basic)

### `setNew`, `setAdd`, `setHas`, `setDelete`, `setSize`, `setToArray`

(See the dedicated `set` module for the full set of operations.)

---

## Module: `list`

> Extended list operations: take/drop, span/break, partition, group, window, scan, unfold, permutations, combinations.

### `zip`, `zip3`, `unzip`, `interleave`, `cycle`, `replicate`

```aether
print(zip([1, 2, 3], ["a", "b", "c"]));   // [[1, "a"], [2, "b"], [3, "c"]]
print(zip3([1, 2], ["a", "b"], [true, false]));  // [[1, "a", true], [2, "b", false]]
print(unzip([[1, "a"], [2, "b"]]));       // [[1, 2], ["a", "b"]]
print(interleave([1, 3, 5], [2, 4, 6]));  // [1, 2, 3, 4, 5, 6]
print(cycle([1, 2, 3], 8));                // [1, 2, 3, 1, 2, 3, 1, 2]
print(replicate(0, 5));                    // [0, 0, 0, 0, 0]
```

### `take`, `drop`, `takeWhile`, `dropWhile`, `span`, `break_`, `partition`

```aether
print(take([1, 2, 3, 4, 5], 3));                          // [1, 2, 3]
print(drop([1, 2, 3, 4, 5], 2));                          // [3, 4, 5]
print(takeWhile([1, 2, 3, 4, 5], fn(x: int) -> bool { x < 4 }));   // [1, 2, 3]
print(dropWhile([1, 2, 3, 4, 5], fn(x: int) -> bool { x < 4 }));   // [4, 5]
print(span([1, 2, 3, 4, 5], fn(x: int) -> bool { x < 4 }));        // [[1, 2, 3], [4, 5]]
print(break_([1, 2, 3, 4, 5], fn(x: int) -> bool { x >= 4 }));     // [[1, 2, 3], [4, 5]]
print(partition([1, 2, 3, 4, 5], fn(x: int) -> bool { x % 2 == 0 }));  // [[2, 4], [1, 3, 5]]
```

### `group`, `groupBy`, `window`, `intersperse`

```aether
print(group([1, 2, 3, 4, 5, 6], 2));    // [[1, 2], [3, 4], [5, 6]]
print(window([1, 2, 3, 4], 2));          // [[1, 2], [2, 3], [3, 4]]
print(intersperse([1, 2, 3], 0));        // [1, 0, 2, 0, 3]
```

### `scan`, `scanr`, `unfold`, `rangeBy`, `iterate`

```aether
print(scan([1, 2, 3, 4], fn(a: int, x: int) -> int { a + x }, 0));   // [0, 1, 3, 6, 10]
print(rangeBy(0, 2, 5));                                              // [0, 2, 4, 6, 8]
print(iterate(fn(x: int) -> int { x * 2 }, 5, 1));                  // [1, 2, 4, 8, 16]
```

### `permutations`, `combinations`, `rotate`

```aether
print(permutations([1, 2, 3]));     // [[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]]
print(combinations([1, 2, 3, 4], 2)); // [[1,2], [1,3], [1,4], [2,3], [2,4], [3,4]]
print(rotate([1, 2, 3, 4, 5], 2));   // [3, 4, 5, 1, 2]
```

---

## Module: `set`

> Set operations: algebra (union, intersect, difference, symmetric difference), predicates (subset, superset, disjoint, equal), and functional combinators (map, filter, fold).

### `setNew`, `setAdd`, `setRemove`, `setHas`, `setSize`, `setToArray`

```aether
let s = setNew([1, 2, 3]);
print(setHas(s, 2));      // true
setAdd(s, 4);
print(setSize(s));        // 4
print(setRemove(s, 2));   // true (was present)
print(setToArray(s));     // [1, 3, 4]
```

### `setUnion`, `setIntersect`, `setDifference`, `setSymDiff`

```aether
let a = setNew([1, 2, 3, 4]);
let b = setNew([3, 4, 5, 6]);
print(setToArray(setUnion(a, b)));        // [1, 2, 3, 4, 5, 6]
print(setToArray(setIntersect(a, b)));   // [3, 4]
print(setToArray(setDifference(a, b)));   // [1, 2]
print(setToArray(setSymDiff(a, b)));       // [1, 2, 5, 6]
```

### `setSubset`, `setSuperset`, `setDisjoint`, `setEqual`

```aether
print(setSubset(setNew([1, 2]), setNew([1, 2, 3])));   // true
print(setSuperset(setNew([1, 2, 3]), setNew([1, 2]))); // true
print(setDisjoint(setNew([1, 2]), setNew([3, 4])));    // true
print(setEqual(setNew([1, 2, 3]), setNew([3, 2, 1]))); // true
```

### `setMap`, `setFilter`, `setFold`, `setAny`, `setAll`

```aether
let s = setNew([1, 2, 3, 4, 5]);
print(setToArray(setMap(s, fn(x: int) -> int { x * x })));     // [1, 4, 9, 16, 25]
print(setToArray(setFilter(s, fn(x: int) -> bool { x > 2 }))); // [3, 4, 5]
print(setFold(s, fn(a: int, x: int) -> int { a + x }, 0));     // 15
print(setAny(s, fn(x: int) -> bool { x > 4 }));                 // true
print(setAll(s, fn(x: int) -> bool { x > 0 }));                // true
```

### `setToString`

```aether
print(setToString(setNew([1, 2, 3])));   // "{1, 2, 3}"
```

---

## Module: `functional`

> Combinators: identity, constant, compose, pipe, curry, partial, flip, memoize, once, debounce, throttle, after, before, wrap, tap, try_, when, unless, condTuples.

### `identity`, `constant`

```aether
print(identity(42));          // 42
let always = constant(42);
print(always());             // 42
print(always());             // 42
```

### `compose`, `pipe`, `pipeFns`

`compose(f, g)(x) = f(g(x))`. `pipe(x, f1, f2, ...) = f2(...f1(x))`. `pipeFns(f1, f2, ...) = x -> f2(f1(x))`.

```aether
let inc = fn(x: int) -> int { x + 1 };
let dbl = fn(x: int) -> int { x * 2 };
print(compose(inc, dbl)(3));   // 7 (inc(dbl(3)) = inc(6) = 7)
print(pipe(3, inc, dbl, inc)); // 8 (dbl(inc(3)) = 8, then inc = 9 — wait let me retrace)
//  pipe(3, inc, dbl, inc) = inc(dbl(inc(3))) = inc(dbl(4)) = inc(8) = 9
let p = pipeFns(inc, dbl, inc);
print(p(3));                   // 9
```

### `curry`, `uncurry`, `partial`, `flip`

```aether
let add = fn(a: int, b: int) -> int { a + b };
let add5 = curry(add)(5);
print(add5(10));              // 15
let add5p = partial(add, 5);
print(add5p(10));             // 15
let sub = fn(a: int, b: int) -> int { a - b };
let flipped = flip(sub);
print(flipped(3, 10));        // 7 (sub(10, 3))
```

### `memoize`, `once`

```aether
let mut calls = 0;
let slow = fn(x: int) -> int { calls = calls + 1; x * x };
let fast = memoize(slow);
print(fast(5));   // 25, calls = 1
print(fast(5));   // 25, calls = 1 (cached)
let onceOnly = once(slow);
print(onceOnly(5));  // 25
print(onceOnly(6));  // 25 (returns cached)
```

### `debounce`, `throttle`

```aether
let log = debounce(fn(x: int) -> () { print(x); }, 100);
log(1); log(2); log(3);
// 100ms later: prints 3 only

let log2 = throttle(fn(x: int) -> () { print(x); }, 100);
log2(1); log2(2); log2(3);  // prints 1 immediately; 2 and 3 may be dropped
```

### `after`, `before`

```aether
let mut calls = 0;
let f = after(2, fn() -> int { calls = calls + 1; calls });
print(f());  // 0 (not yet — first call)
print(f());  // 0 (not yet — second call)
print(f());  // 1 (now fires)
```

### `wrap`, `tap`

```aether
let wrapped = wrap(fn(x: int) -> int { x + 1 }, fn(f, x) -> int { f(x) * 10 });
print(wrapped(3));   // 40

let tapped = tap(42, fn(x: int) -> () { print(f"got {x}"); });
// prints "got 42", returns 42
print(tapped);  // 42
```

### `try_`, `when`, `unless`, `condTuples`

```aether
let result = try_(
  fn() -> int { panic("oops"); },
  fn(e) -> int { -1 }
);
print(result);  // -1

print(when(true, fn() -> int { 42 }));    // 42
print(when(false, fn() -> int { 42 }));   // null/undefined

print(unless(false, fn() -> int { 42 })); // 42

let describe = condTuples([
  [fn(n: int) -> bool { n < 0 }, fn() -> string { "negative" }],
  [fn(n: int) -> bool { n == 0 }, fn() -> string { "zero" }],
  [fn(n: int) -> bool { n > 0 }, fn() -> string { "positive" }],
]);
print(describe(5));   // "positive"
```

---

## Module: `statistics`

> Descriptive statistics: central tendency, dispersion, shape, regression, smoothing.

### Central tendency

`mean`, `median`, `mode`.

```aether
print(mean([1, 2, 3, 4, 5]));    // 3
print(median([1, 2, 3, 4]));     // 2.5
print(mode([1, 1, 2, 2, 3]));   // 1 (smallest most-frequent)
```

### Dispersion

`variance`, `stdDev`, `sampleVariance`, `range`, `iqr`.

```aether
print(variance([1, 2, 3, 4, 5]));   // 2
print(stdDev([1, 2, 3, 4, 5]));     // ~1.414
print(sampleVariance([1, 2, 3, 4, 5]));   // 2.5 (Bessel's correction)
print(range([1, 2, 3, 4, 5]));     // 4 (max - min)
print(iqr([1, 2, 3, 4, 5, 6, 7])); // 4 (Q3 - Q1)
```

### Order statistics

`min_`, `max_`, `sum_`, `product`, `quartiles`, `percentile`.

```aether
print(min_([3, 1, 4, 1, 5]));   // 1
print(max_([3, 1, 4, 1, 5]));   // 5
print(sum_([1, 2, 3, 4, 5]));    // 15
print(product([1, 2, 3, 4, 5])); // 120
print(quartiles([1, 2, 3, 4, 5, 6, 7]));   // [2, 4, 6]
print(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 25));   // 3.25
```

### Shape

`skewness`, `kurtosis`.

```aether
print(skewness([1, 2, 3, 4, 5]));   // 0 (symmetric)
print(kurtosis([1, 2, 3, 4, 5]));    // ~-1.3 (platykurtic)
```

### Relationships

`covariance`, `correlation`, `linearRegression`, `rSquare`, `zScore`.

```aether
print(covariance([1, 2, 3], [2, 4, 6]));    // 0.6667
print(correlation([1, 2, 3], [2, 4, 6]));    // 1.0
let r = linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
print(r.slope);   // 2
print(r.intercept); // 0
print(r.r2);        // 1
print(rSquare([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]));   // 1
print(zScore([1, 2, 3, 4, 5], 3));   // 0 (3 is the mean)
```

### Distributions and smoothing

`histogram`, `cumulativeSum`, `movingAverage`, `exponentialSmooth`, `chiSquare`.

```aether
print(histogram([1, 2, 2, 3, 3, 3, 4, 4, 4, 4], 4));  // [1, 2, 3, 4]
print(cumulativeSum([1, 2, 3, 4]));   // [1, 3, 6, 10]
print(movingAverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3));   // [2, 3, 4, 5, 6, 7, 8, 9]
print(exponentialSmooth([1, 2, 3, 4, 5], 0.5));   // [1, 1.5, 2.25, 3.125, 4.0625]
print(chiSquare([10, 10, 10, 10], [10, 10, 10, 10]));   // 0 (perfect fit)
```

---

## Module: `bits`

> Bit operations on 32-bit unsigned integers.

### Bitwise operations

`bitAnd`, `bitOr`, `bitXor`, `bitNot`, `bitShl`, `bitShr`, `bitSar`, `bitRotate`.

```aether
print(bitAnd(0xFF, 0x0F));     // 15
print(bitOr(0xF0, 0x0F);      // 255
print(bitXor(0xFF, 0x0F));    // 240
print(bitNot(0));              // 4294967295
print(bitShl(1, 4));           // 16
print(bitShr(0xFF, 4));         // 15
print(bitSar(-16, 2));          // -4 (sign-fill)
print(bitRotate(0x80000001, 4)); // 0x00000018
```

### Bit inspection

`bitCount`, `leadingZeros`, `trailingZeros`, `highestBit`, `lowestBit`, `bitTest`.

```aether
print(bitCount(0xFF));        // 8
print(bitCount(0b10101100));   // 5
print(leadingZeros(1));        // 31
print(trailingZeros(8));       // 3
print(highestBit(0b10000));     // 4
print(lowestBit(0b10000));     // 4
print(bitTest(0b1010, 1));     // true (bit 1 is 1)
print(bitTest(0b1010, 0));     // false
```

### Bit manipulation

`bitSet`, `bitFlip`, `bitMerge`, `bitExtract`, `grayCode`.

```aether
print(bitSet(0b1010, 0, true));    // 0b1011 = 11
print(bitSet(0b1010, 1, false));   // 0b1000 = 8
print(bitFlip(0b1010, 1));          // 0b1000 = 8
print(bitMerge(0xFF, 0x00FF, 0x0F));  // 0xF0 (b where mask is set, a elsewhere)
print(bitExtract(0b11001010, 1, 3));  // 0b101 = 5 (3 bits starting at bit 1)
print(grayCode(5));                  // 7 (5 = 101, gray = 111)
```

---

## Module: `datetime`

> Date and time: timestamps, date parts, formatting, parsing.

### Current time

`now`, `today`, `time`.

```aether
let t = now();
print(t > 0);   // true
print(toISO(t));  // ISO 8601 UTC
print(today());   // midnight of today
```

### Date construction

`date`, `time`.

```aether
let d = date(2024, 1, 1);
let t = time(12, 30, 0);
print(year(d));    // 2024
print(month(d));   // 1
print(day(d));     // 1
```

### Date parts

`year`, `month`, `day`, `hour`, `minute`, `second`, `dayOfWeek`.

```aether
let t = now();
print(year(t));        // 2024 (or current year)
print(month(t));       // 1-12
print(day(t));         // 1-31
print(hour(t));        // 0-23
print(minute(t));     // 0-59
print(second(t));     // 0-59
print(dayOfWeek(t));  // 0=Sun..6=Sat
```

### Date arithmetic

`addDays`, `addHours`, `addMinutes`, `diffSeconds`, `diffDays`.

```aether
let d1 = date(2024, 1, 1);
let d2 = addDays(d1, 30);
print(diffDays(d1, d2));    // 30
print(diffSeconds(d1, d2));  // 30 * 86400
```

### Calendar

`isLeapYear`, `daysInMonth`.

```aether
print(isLeapYear(2024));     // true
print(isLeapYear(2023));     // false
print(daysInMonth(2024, 2));  // 29
print(daysInMonth(2023, 2));  // 28
```

### Format and parse

`formatTime`, `parseDate`, `toISO`, `fromISO`.

```aether
let t = now();
print(formatTime(t));    // default format
print(formatTime(t, "%Y-%m-%d %H:%M:%S"));
print(toISO(t));
let parsed = fromISO("2024-01-01T00:00:00Z");
print(year(parsed));   // 2024
```

---

## Module: `regex`

> Regular expressions, wrapping JS `RegExp`.

### Compilation and match

`regex`, `match`, `matchAll`, `test`, `firstMatch`, `count`.

```aether
let r = regex("\\d+");
print(test("abc 123", r));        // true
print(firstMatch("abc 123", r)); // "123"
print(count("a1b2c3", r));        // 3
let g = match("name: Aether", regex("name: (\\w+)"));
print(g);   // ["name: Aether", "Aether"]
let all = matchAll("a1b2c3", r);
print(all);  // [["1"], ["2"], ["3"]]
```

### Replace and split

`replace`, `replaceAll`, `split`.

```aether
print(replace("hello world", regex("\\w+"), "X"));     // "X world"
print(replaceAll("hello world", regex("\\w+"), "X"));  // "X X"
print(split("a, b, c", regex(",\\s*")));                  // ["a", "b", "c"]
```

### Capture groups

`extract`, `groups`.

```aether
let r = regex("(\\w+)@(\\w+)");
print(extract("user@example.com", r, 1));   // "user"
print(extract("user@example.com", r, 2));   // "example"
print(groups("user@example.com", r));       // ["user", "example"]
```

### Predicates and helpers

`startsWithMatch`, `endsWithMatch`, `escape`, `flags`.

```aether
print(startsWithMatch("hello", regex("he")));   // true
print(endsWithMatch("hello", regex("lo")));     // true
print(escape("a.b*c"));                          // "a\\.b\\*c"
print(flags(regex("hello", "i")));                // "i"
```

---

## Module: `encoding`

> Encoding and decoding: JSON, Base64, hex, UTF-8, CSV, YAML, TOML, msgpack, URL.

### JSON

`jsonStringify`, `jsonParse`, `jsonPretty`.

```aether
let v = { name: "Aether", version: 2 };
let s = jsonStringify(v);
print(s);                       // {"name":"Aether","version":2}
print(jsonPretty(v));          // pretty-printed with 2-space indent
let back = jsonParse(s);
print(back.name);               // Aether
```

### Base64 and hex

`base64Encode`, `base64Decode`, `hexEncode`, `hexDecode`.

```aether
print(base64Encode("Hello"));     // SGVsbG8=
print(base64Decode("SGVsbG8="));  // Hello
print(hexEncode("Hi"));            // 4869
print(hexDecode("4869"));          // Hi
```

### UTF-8

`utf8Encode`, `utf8Decode`, `bytesToString`.

```aether
print(utf8Encode("Hi"));   // [72, 105]
print(utf8Decode([72, 105]));   // Hi
print(bytesToString([72, 105]));   // Hi (alias of utf8Decode)
```

### URL

`urlEncode`, `urlDecode`, `urlencode`, `queryParse`, `queryStringify`.

```aether
print(urlEncode("hello world"));   // hello%20world
print(urlDecode("hello%20world")); // hello world
let q = queryParse("a=1&b=2");
print(q.a);   // "1"
print(queryStringify({ a: "1", b: "2" }));   // a=1&b=2
```

### CSV, YAML, TOML, msgpack

`csvParse`, `csvStringify`, `yamlStringify`, `tomlStringify`, `msgpackPack`.

```aether
print(csvParse("a,b,c\n1,2,3"));   // [["a","b","c"], ["1","2","3"]]
print(csvStringify([["a","b"], [1, 2]]));   // "a,b\r\n1,2\r\n"
print(yamlStringify({ a: 1, b: 2 }));   // "a: 1\nb: 2\n"
print(tomlStringify({ a: 1, b: 2 }));   // "a = 1\nb = 2\n"
print(msgpackPack({ a: 1 }));   // msgpack-encoded byte array
```

---

## Module: `crypto`

> Hashes and cryptographically secure random.

### Hashes

`md5`, `sha1`, `sha256`, `sha512`, `djb2`, `fnv1a`.

```aether
print(md5("hello"));     // 5d41402abc4b2a76b9719d911017c592
print(sha1("hello"));    // aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
print(sha256("hello"));  // 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
// sha512 is async (uses Web Crypto / Node):
let h = await(sha512("hello"));
print(h);
print(djb2("hello"));     // 2105870
print(fnv1a("hello"));    // 1957 contato
```

### Random

`randomInt`, `randomFloat`, `randomBytes`, `uuid4`, `randomChoice`, `shuffle`, `seedRandom`, `randomSeed`.

```aether
print(randomInt(1, 100));   // cryptographically secure random in [1, 100]
print(randomFloat());       // [0, 1)
print(randomBytes(4));       // [.., .., .., ..]
print(uuid4());              // random UUID
print(randomChoice([1, 2, 3]));   // one of them
print(shuffle([1, 2, 3, 4]));      // shuffled (non-mutating)

seedRandom(42);                    // switch to deterministic Mulberry32
print(randomInt(1, 100));
seedRandom(42);                    // re-seed — same sequence
print(randomInt(1, 100));
randomSeed();                      // restore secure source
```

---

## Module: `text`

> Text formatting: lines, words, indentation, wrapping, alignment, case conversion, truncation.

### Lines and words

`lines`, `words`, `unlines`, `unwords`.

```aether
print(lines("a\nb\nc"));    // ["a", "b", "c"]
print(words("hello world foo"));   // ["hello", "world", "foo"]
print(unlines(["a", "b", "c"]));   // "a\nb\nc"
print(unwords(["hello", "world"])); // "hello world"
```

### Indentation and wrapping

`indent`, `dedent`, `wrap`, `center`, `left`, `right`.

```aether
print(indent("a\nb\nc", 2));    // "  a\n  b\n  c"
print(dedent("  a\n  b\n  c"));  // "a\nb\nc"
print(wrap("The quick brown fox", 10));   // "The quick\nbrown fox"
print(center("hi", 6));     // "  hi  "
print(left("hi", 6));       // "hi    "
print(right("hi", 6));      // "    hi"
```

### Case

`titleCase`, `camelCase`, `snakeCase`, `kebabCase`.

```aether
print(titleCase("hello world"));   // "Hello World"
print(camelCase("hello world foo"));   // "helloWorldFoo"
print(snakeCase("helloWorldFoo"));     // "hello_world_foo"
print(kebabCase("helloWorldFoo"));     // "hello-world-foo"
```

### Truncation

`truncate`.

```aether
print(truncate("Hello, World!", 5));         // "Hell…"
print(truncate("Hello, World!", 8, "..."));  // "Hello..."
```

---

## Module: `validate`

> String validators: email, URL, IP, UUID, date, time, character classes, ranges.

### Email and URL

`isEmail`, `isUrl`.

```aether
print(isEmail("user@example.com"));   // true
print(isEmail("not-an-email"));       // false
print(isUrl("https://aether.dev"));   // true
print(isUrl("ftp://aether.dev"));     // false (http/https only)
```

### IP addresses

`isIpv4`, `isIpv6`.

```aether
print(isIpv4("192.168.1.1"));     // true
print(isIpv4("999.999.999.999")); // false
print(isIpv6("::1"));             // true
print(isIpv6("not an ip"));        // false
```

### UUID and dates

`isUuid`, `isDate`, `isTime`.

```aether
print(isUuid("550e8400-e29b-41d4-a716-446655440000"));   // true
print(isUuid("not-a-uuid"));                              // false
print(isDate("2024-02-29"));   // true (2024 is a leap year)
print(isDate("2023-02-29"));   // false
print(isTime("23:59:59"));     // true
print(isTime("24:00:00"));     // false
```

### Character classes

`isAlpha`, `isNumeric`, `isAlnum`, `isLower`, `isUpper`, `isWhitespace`, `isAscii`.

```aether
print(isAlpha("hello"));     // true
print(isNumeric("123"));     // true
print(isAlnum("hello123"));  // true
print(isLower("hello"));     // true
print(isUpper("HELLO"));     // true
print(isWhitespace("  \t")); // true
print(isAscii("hello"));     // true
print(isAscii("héllo"));     // false
```

### Ranges and membership

`isInRange`, `isOneOf`, `isNonEmpty`, `isLength`, `isMaxLength`, `matches`.

```aether
print(isInRange(5, 1, 10));    // true
print(isOneOf(2, [1, 2, 3]));  // true
print(isNonEmpty("hello"));     // true
print(isLength("hello", 5));    // true
print(isMaxLength("hi", 10));   // true
print(matches("hello", "^h.*o$"));  // true
```

---

## Module: `tree`

> N-ary trees: construction, traversal, mapping, filtering, finding paths.

### Construction

`treeNew`, `treeAddChild`.

```aether
let root = treeNew("root");
let a = treeAddChild(root, "a");
let b = treeAddChild(root, "b");
treeAddChild(a, "a1");
treeAddChild(a, "a2");
```

### Accessors

`treeValue`, `treeChildren`, `treeIsLeaf`.

```aether
print(treeValue(root));         // "root"
print(treeChildren(root));       // [Node a, Node b]
print(treeIsLeaf(a));            // false
print(treeIsLeaf(treeAddChild(b, "b1")));  // false (it has children after this)
```

### Size and shape

`treeSize`, `treeDepth`, `treeHeight`.

```aether
print(treeSize(root));   // 6
print(treeDepth(root));  // 3
print(treeHeight(root)); // 2
```

### Traversal and transformation

`treeMap`, `treeFilter`, `treeFind`, `treePath`, `treeFlatten`, `treeWalk`, `treeBfs`, `treeDfs`.

```aether
let upper = treeMap(root, fn(v: string) -> string { toUpper(v) });
print(treeFlatten(upper));   // ["ROOT", "A", "A1", "A2", "B"]

let found = treeFind(root, fn(v: string) -> bool { v == "a2" });
print(treeValue(found));   // "a2"

let path = treePath(root, fn(v: string) -> bool { v == "a2" });
print(path);   // ["root", "a", "a2"]

treeWalk(root, fn(v: string) -> () { print(v); });   // pre-order
treeBfs(root, fn(v: string) -> () { print(v); });     // breadth-first
```

### Printing and equality

`treePrint`, `treeToString`, `treeFromEdges`, `treeEquals`.

```aether
print(treePrint(root));
// root
// ├─ a
// │  ├─ a1
// │  └─ a2
// └─ b

print(treeToString(root));   // root(a(a1, a2), b)

let t2 = treeFromEdges([["root", "a"], ["root", "b"]]);
print(treeEquals(root, root));   // true (same tree)
```

---

## Module: `uuid`

> UUID generation, parsing, comparison, well-known namespaces.

### Generation

`uuid1`, `uuid3`, `uuid4`, `uuid5`.

```aether
print(uuid4());    // random v4
print(uuid5("aether.dev", uuidNamespaceDNS()));   // deterministic v5
print(uuid3("test", uuidNamespaceDNS()));           // deterministic v3 (MD5)
print(uuid1());    // time + random
```

### Parsing and stringifying

`uuidParse`, `uuidStringify`.

```aether
let bytes = uuidParse("550e8400-e29b-41d4-a716-446655440000");
print(len(bytes));   // 16
print(uuidStringify(bytes));   // 550e8400-e29b-41d4-a716-446655440000
```

### Comparison and inspection

`uuidCompare`, `uuidVersion`, `uuidVariant`, `uuidIsValid`.

```aether
print(uuidCompare("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440000"));   // 0
print(uuidVersion("550e8400-e29b-41d4-a716-446655440000"));   // 5
print(uuidVariant("550e8400-e29b-41d4-a716-446655440000"));   // 1 (RFC4122)
print(uuidIsValid("550e8400-e29b-41d4-a716-446655440000"));  // true
```

### Special values and namespaces

`uuidNil`, `uuidMax`, `uuidNamespaceDNS`, `uuidNamespaceURL`, `uuidNamespaceOID`.

```aether
print(uuidNil());    // 00000000-0000-0000-0000-000000000000
print(uuidMax());    // ffffffff-ffff-ffff-ffff-ffffffffffff
print(uuidNamespaceDNS());   // 6ba7b810-9dad-11d1-80b4-00c04fd430c8
print(uuidNamespaceURL());   // 6ba7b811-9dad-11d1-80b4-00c04fd430c8
print(uuidNamespaceOID());   // 6ba7b812-9dad-11d1-80b4-00c04fd430c8
```

---

## Module: `io`

> Input/output: print, file I/O (Node), environment, time, sleep, exit.

### Output

`print`, `println`, `printList`.

```aether
print("hello");          // no trailing newline
println("hello");        // with trailing newline
printList([1, 2, 3]);    // 1\n2\n3\n
```

### Input and files (Node only)

`readLine`, `writeFileSync`, `readFileSync`, `fileExists`.

```aether
// Node only:
let line = readLine();
writeFileSync("/tmp/x.txt", "hello");
let content = readFileSync("/tmp/x.txt");
print(content);   // hello
print(fileExists("/tmp/x.txt"));   // true
```

### Environment

`args`, `env`, `time`, `sleep`, `now`, `exit`.

```aether
print(env("HOME"));   // your home directory (Node)
print(args());         // process args
print(time());         // ms since epoch
print(now());          // ISO 8601 timestamp
sleep(100);            // 100ms synchronous sleep
// exit(0);            // terminate process (Node)
```

---

## Module: `async`

> Concurrency: channels, spawn, select, timeout, async helpers.

### Channels

`channel`, `send`, `recv`, `close`.

```aether
let ch = channel();
send(ch, "hello");
let v = await(recv(ch));
print(v);   // hello
close(ch);
```

### Spawning and racing

`spawn`, `awaitAll`, `race`.

```aether
let p1 = spawn(fn() -> int { 1 + 1 });
let p2 = spawn(fn() -> int { 2 * 3 });
print(await(awaitAll([p1, p2])));   // [2, 6]
print(await(race([p1, p2])));        // whichever resolves first
```

### `select` and `timeout`

`select`, `timeout`.

```aether
let ch1 = channel();
let ch2 = channel();
send(ch2, "from ch2");
let r = await(select([
  { op: "recv", ch: ch1 },
  { op: "recv", ch: ch2 },
]));
print(r);   // { ch: ch2, value: "from ch2" }

await(timeout(50));   // wait 50ms
```

### Async combinators

`mapAsync`, `filterAsync`, `reduceAsync`.

```aether
let xs = [1, 2, 3];
let doubled = await(mapAsync(xs, fn(x: int) -> int { x * 2 }));
print(doubled);   // [2, 4, 6]

let evens = await(filterAsync(xs, fn(x: int) -> bool { x % 2 == 1 }));
// wait — filter keeps where fn is true. x % 2 == 1 keeps odds.
print(evens);   // [1, 3]

let sum = await(reduceAsync(xs, fn(a: int, x: int) -> int { a + x }, 0));
print(sum);   // 6
```

### Utilities

`defer`, `retry`, `debounce`, `runAsync`.

```aether
print("a");
defer(fn() -> () { print("c"); });
print("b");   // a, b, c

let r = await(retry(3, fn() -> int { 42 }));
print(r);   // 42

let log = debounce(fn(x: int) -> () { print(x); }, 100);
log(1); log(2); log(3);   // 100ms later: 3
```

---

## Cross-cutting notes

### Error behavior

All stdlib functions throw plain JavaScript `Error`s on invalid input. The evaluator catches these and converts them into Aether panics with the message intact. So `split(42, ",")` panics with `split: expected string, got number`.

### Naming collisions

Some functions in `collections` (`map`, `filter`, `reduce`) collide with the inline builtins of the same name. They have the same semantics, so the collision is benign. The linter (Chapter 13) flags shadowing if you `let map = ...`.

### Mutation vs immutability

Most `collections` array functions are *non-mutating* (they return a new array). The exceptions are noted in the function descriptions. Map and set operations mutate the receiver (and return it for chaining).

### Async functions

Functions that return `Promise<T>` are marked in the manifest. Use `await(p)` to wait for the result. The async runtime is based on JS Promises (ADR-13).

### Performance

The stdlib is implemented in TypeScript. For tight numeric code, the VM (with the optimizer passes) is 5-10× faster than the v1 tree-walker. For stdlib calls, the difference is smaller (the stdlib is the same TS code in both backends) — typically 1-2× for I/O-bound operations.

---

## Quick reference: all 18 modules and their function counts

| Module        | Functions | Notes                                |
|---------------|-----------|--------------------------------------|
| `string`      | 24        | String operations, printf format.    |
| `math`        | 30        | Math, number-theory, statistics-of-one. |
| `collections` | 38        | Array, map, set operations.          |
| `list`        | 24        | Extended list operations.            |
| `set`         | 20        | Set algebra and predicates.          |
| `functional`  | 22        | Combinators.                         |
| `statistics`  | 26        | Descriptive statistics.              |
| `bits`        | 20        | Bit operations on 32-bit ints.      |
| `datetime`    | 22        | Date and time.                       |
| `regex`       | 16        | Regular expressions.                 |
| `encoding`    | 20        | JSON, Base64, hex, CSV, etc.         |
| `crypto`      | 14        | Hashes and random.                   |
| `text`        | 16        | Text formatting.                    |
| `validate`    | 22        | String validators.                  |
| `tree`        | 20        | N-ary trees.                          |
| `uuid`        | 14        | UUID generation and parsing.         |
| `io`          | 14        | Input/output (some Node-only).       |
| `async`       | 18        | Concurrency (v2).                    |

**Total:** ~396 functions across 18 modules.

---

# Part II — In-depth parameter documentation, error matrices, and edge cases

> Part I gave you the function list with one example each. Part II gives you the edge cases, the parameter semantics in detail, the error matrix per module, and the "see also" cross-references. Use Part I for "what does this function do"; use Part II for "what happens at the boundary".

## `string` — edge cases and error matrix

### `split` — detailed semantics

| Call                                          | Result                              | Notes                                      |
|-----------------------------------------------|-------------------------------------|--------------------------------------------|
| `split("a,b,c", ",")`                         | `["a", "b", "c"]`                   | Standard split.                            |
| `split("a,,b", ",")`                          | `["a", "", "b"]`                    | Empty strings between consecutive seps.    |
| `split(",a,b,", ",")`                         | `["", "a", "b", ""]`                | Leading/trailing seps produce empty strings.|
| `split("abc", "")`                            | `["a", "b", "c"]`                   | Empty sep splits into characters.           |
| `split("hello   world  foo")`                 | `["hello", "world", "foo"]`         | Whitespace runs (default).                  |
| `split("   ")`                                | `[]`                                | All-whitespace trims to empty.              |
| `split("")`                                   | `[]`                                | Empty string yields empty array.            |
| `split("abc", ",")`                           | `["abc"]`                           | Sep not found yields whole string.          |
| `split(42, ",")`                              | panic: `split: expected string, got number` | Type error.                          |
| `split("abc", 1)`                             | panic: `split: expected string, got number` | Sep must be a string.              |

### `format` — full conversion specifier reference

| Specifier | Meaning                                | Argument type | Example                              |
|-----------|----------------------------------------|---------------|--------------------------------------|
| `%s`      | String                                 | any           | `format("%s", 42)` → `"42"`          |
| `%d`      | Integer (truncates floats)             | int or float  | `format("%d", 3.99)` → `"3"`         |
| `%f`      | Float, 6 decimals by default           | int or float  | `format("%f", 3.14159)` → `"3.141590"` |
| `%x`      | Hex (lowercase)                        | int           | `format("%x", 255)` → `"ff"`         |
| `%X`      | Hex (uppercase)                        | int           | `format("%X", 255)` → `"FF"`         |
| `%o`      | Octal                                  | int           | `format("%o", 8)` → `"10"`          |
| `%b`      | Binary                                 | int           | `format("%b", 5)` → `"101"`         |
| `%%`      | Literal `%`                            | (no arg)      | `format("100%%")` → `"100%"`       |

Flags and width/precision:

- `%5d` — minimum width 5, right-aligned (default).
- `%-5d` — minimum width 5, left-aligned (the `-` flag).
- `%05d` — minimum width 5, zero-padded (the `0` flag).
- `%.2f` — precision 2 (2 decimals).
- `%5.2f` — width 5, precision 2.
- `%+d` — always show sign (the `+` flag).
- `% d` — space before positive numbers (the ` ` flag).

Errors:
- `format: trailing % in format string` if the format ends with `%`.
- `format: unknown conversion '%X'` if `X` is not a known conversion.

### `replace` vs `replaceAll`

`replace` replaces the first occurrence only. `replaceAll` replaces all occurrences.

```aether
print(replace("a-b-c-d", "-", "+"));      // "a+b-c-d"
print(replaceAll("a-b-c-d", "-", "+"));    // "a+b+c+d"
```

Edge cases:
- `replace("abc", "", "X")` returns `"abc"` (no `from` to find; v1 is conservative and returns the input unchanged).
- `replaceAll("abc", "", "X")` returns `"abc"` (avoid infinite loop on empty match).

### Unicode awareness

`len`, `reverse`, `split` with `""`, `charAt`, `charCode` are all Unicode-aware (they work on code points, not UTF-16 units, where it matters).

```aether
print(len("😀"));      // 1 (one code point)
print(len("Aether"));  // 6
print(reverse("abc"));  // "cba"
print(reverse("ab😀c")); // "c😀ba"
print(split("a😀b", ""));  // ["a", "😀", "b"]
```

`charAt` and `charCode` work on UTF-16 units, not code points — be careful with astral characters. For code-point-based access, use `split(s, "")` and array indexing.

### See also

- `text` module for higher-level text formatting (lines, words, wrap, case conversion).
- `regex` module for pattern-based splitting.
- `validate` module for character-class tests (`isAlpha`, `isNumeric`, etc.).

## `math` — error matrix

| Function        | Panics on                            | Notes                                  |
|-----------------|--------------------------------------|----------------------------------------|
| `sqrt(f)`       | `f < 0` (returns NaN; Aether treats NaN as panic) | Use `abs` first if you need.  |
| `log(f)`        | `f <= 0`                             | Use `log(abs(f))` if sign-agnostic.    |
| `log2(f)`       | `f <= 0`                             | Same.                                  |
| `log10(f)`      | `f <= 0`                             | Same.                                  |
| `factorial(n)`  | `n < 0` or `n > 170`                 | 170! ≈ 7.26e306, near the double max.  |
| `isPrime(n)`    | (none — returns false for `n < 2`)   | Trial division; fast for `n < 10^12`.  |
| `gcd(a, b)`     | (none — handles negative)             | `gcd(0, 0) = 0`.                       |
| `lcm(a, b)`     | (none — handles `0`)                  | `lcm(0, x) = 0`.                       |

### Numeric stability

`sum`, `mean` use naive accumulation. For better stability with very large or very small numbers, sort by absolute value first and sum from smallest to largest.

`pow(base, exp)` uses JS `Math.pow`. For integer `exp`, prefer `pow(int, int)` — it's the same JS function but Aether's type system tracks the int.

## `collections` — mutation semantics (the full matrix)

| Function      | Mutates?   | Returns              |
|---------------|------------|----------------------|
| `push(arr,v)` | No (clone) | New array with `v` appended |
| `pop(arr)`    | No (clone) | New array without last |
| `shift(arr)`  | No (clone) | New array without first |
| `unshift(arr,v)` | No (clone) | New array with `v` prepended |
| `insert(arr,i,v)` | No (clone) | New array with `v` at index `i` |
| `remove(arr,i)` | No (clone) | New array without index `i` |
| `slice(arr,i,j)` | No (clone) | Subarray |
| `concat(a,b)` | No (clone) | New concatenated array |
| `reverse(arr)` | No (clone) | New reversed array |
| `sort(arr,cmp?)` | No (clone) | New sorted array |
| `map(arr,fn)` | No (clone) | New mapped array |
| `filter(arr,fn)` | No (clone) | New filtered array |
| `reduce(arr,fn,init)` | No | Reduced value |
| `flat(arr)` | No (clone) | New flattened array |
| `flatMap(arr,fn)` | No (clone) | New flat-mapped array |
| `unique(arr)` | No (clone) | New deduplicated array |
| `mapSet(m,k,v)` | YES | `m` (mutated, returned for chaining) |
| `mapDelete(m,k)` | YES | bool (was the key present) |
| `setAdd(s,v)` | YES | `s` (mutated, returned for chaining) |
| `setDelete(s,v)` | YES | bool (was the element present) |

### Map key types

Map keys can be any value that the underlying JS Map accepts. Primitive keys (string, int, float, bool, char) work as expected. Struct and enum keys work via reference equality (not deep equality — this is a known limitation in v1). For deep-equality map keys, use a string serialization (e.g., `jsonStringify`).

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
mapSet(m, 3, "three");   // int key
print(mapGet(m, 3));     // "three"
```

(Mixed-type keys work but are confusing — prefer homogeneous keys.)

## `regex` — error matrix and escape rules

`regex(pattern, flags?)` compiles a JS `RegExp`. The pattern is a JS regex string, with all the standard JS regex syntax (character classes, anchors, lookahead, named groups, etc.).

Errors:
- `regex: invalid pattern '<p>'` if the pattern doesn't compile.
- `regex: invalid flags '<f>'` if the flags string has unknown characters.

Escape rules:
- In a string literal, `\` is the escape character. To pass `\d` to the regex engine, write `"\\d"` in the Aether source.
- Use `escape(s)` to escape regex metacharacters in a user-supplied string.

```aether
let user_input = "a.b*c";
let pattern = escape(user_input);    // "a\\.b\\*c"
print(test(user_input, regex(pattern)));  // true (matches literally)
```

### Match result shape

`match(s, pattern)` returns:
- `null` if no match.
- An array where index 0 is the whole match and indices 1..n are the capture groups.

```aether
let r = regex("(\\w+)@(\\w+)");
let m = match("user@example.com", r);
print(m);   // ["user@example.com", "user", "example"]
print(m[0]); // "user@example.com"
print(m[1]); // "user"
print(m[2]); // "example"
print(match("no email here", r));   // null
```

`matchAll(s, pattern)` returns an array of match arrays (each shaped like `match`'s return).

### Flags

Standard JS flags: `g` (global), `i` (case-insensitive), `m` (multiline), `s` (dotall), `u` (unicode), `y` (sticky).

```aether
let r = regex("hello", "i");
print(test("HELLO", r));   // true (case-insensitive)
print(flags(r));            // "i"
```

## `encoding` — format coverage and limitations

| Format   | Encode                              | Decode                              | Limitations                                |
|----------|-------------------------------------|-------------------------------------|--------------------------------------------|
| JSON     | `jsonStringify`, `jsonPretty`        | `jsonParse`                         | No `BigInt`. No comments.                  |
| Base64   | `base64Encode`                       | `base64Decode`                       | UTF-8 only.                                |
| Hex      | `hexEncode`                          | `hexDecode`                          | UTF-8 only. Lowercase output.              |
| UTF-8    | `utf8Encode`                         | `utf8Decode`, `bytesToString`       | Works on any string.                       |
| URL      | `urlEncode`                          | `urlDecode`                          | Uses JS `encodeURIComponent`.              |
| Query    | `queryStringify`                    | `queryParse`                         | No nested keys. No array values.           |
| CSV      | `csvStringify`                       | `csvParse`                           | RFC 4180. No custom delimiters.            |
| YAML     | `yamlStringify`                      | (none — no `yamlParse`)              | Subset. No anchors, no tags.               |
| TOML     | `tomlStringify`                      | (none — no `tomlParse`)              | Subset.                                    |
| msgpack  | `msgpackPack`                        | (none — no `msgpackUnpack`)          | Demo only.                                 |

The "subset" and "demo" notes are honest: the YAML/TOML/msgpack support is minimal and intended for simple cases. For full YAML/TOML, embed a JS library.

### JSON edge cases

- `jsonStringify(undefined)` returns `undefined` (not the string `"undefined"`) — Aether follows JS here.
- `jsonStringify(NaN)` returns `"null"` (NaN is not valid JSON).
- `jsonStringify(Infinity)` returns `"null"` (likewise).
- `jsonParse("null")` returns the JS `null` value.
- `jsonParse("[1, 2, 3]")` returns an Aether array `[1, 2, 3]`.
- `jsonParse("\"hello\"")` returns the string `"hello"`.
- `jsonParse("invalid")` panics with a parse error.

### CSV edge cases

`csvParse` handles quoted fields, embedded commas, embedded newlines (in quotes), and embedded quotes (escaped as `""`).

```aether
let csv = "name,age\n\"John, Jr.\",42\n\"Hello\nWorld\",30";
let rows = csvParse(csv);
print(rows);   // [["name","age"], ["John, Jr.","42"], ["Hello\nWorld","30"]]
```

## `crypto` — sync vs async and determinism

| Function        | Sync/Async | Deterministic?   | Notes                                  |
|-----------------|------------|------------------|----------------------------------------|
| `md5(s)`        | sync       | yes              | Pure JS implementation.                |
| `sha1(s)`       | sync       | yes              | Pure JS.                              |
| `sha256(s)`     | sync       | yes              | Pure JS.                              |
| `sha512(s)`     | async      | yes              | Uses Web Crypto (browser) or Node crypto. Returns `Promise<string>`. |
| `djb2(s)`       | sync       | yes              | Non-cryptographic. 32-bit.             |
| `fnv1a(s)`      | sync       | yes              | Non-cryptographic. 32-bit.             |
| `randomInt(min, max)` | sync | NO               | Cryptographically secure (Web Crypto `getRandomValues`). |
| `randomFloat()` | sync       | NO               | Cryptographically secure.              |
| `randomBytes(n)` | sync      | NO               | Cryptographically secure.              |
| `uuid4()`        | sync      | NO               | Random UUID.                            |
| `randomChoice(arr)` | sync  | NO               | Uses `randomInt`.                       |
| `shuffle(arr)`  | sync       | NO               | Fisher-Yates with `randomInt`.         |
| `seedRandom(seed)` | sync   | (switches to deterministic) | Switches the global random source to Mulberry32. |
| `randomSeed()`  | sync       | (restores secure) | Restores the secure source.            |

### Hash output format

All hash functions return lowercase hex strings.

```aether
print(md5(""));          // d41d8cd98f00b204e9800998ecf8427e
print(sha256(""));       // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

### Seeded determinism for tests

For deterministic random in tests:

```aether
seedRandom(42);
let r1 = randomInt(1, 1000);
let r2 = randomInt(1, 1000);
let r3 = randomInt(1, 1000);

seedRandom(42);   // re-seed — same sequence
assert_eq(randomInt(1, 1000), r1);
assert_eq(randomInt(1, 1000), r2);
assert_eq(randomInt(1, 1000), r3);

randomSeed();    // restore secure source
```

The Mulberry32 PRNG is *not* cryptographically secure. Use it only for tests and benchmarks where you need determinism.

## `async` — the full API surface and gotchas

Aether's async is JS-Promise-based (ADR-13). The runtime is cooperative — there's no parallelism, only concurrency. The following gotchas apply:

1. **`await` outside a function returning a Promise.** A top-level `await` (at the module level) is *not* supported in v2 — you have to wrap your code in a function and call it. The v2.x plan is to support top-level `await` via the suspend/resume mechanism.

2. **Channels are unbounded.** `send` on an unbounded channel returns immediately. There's no backpressure. v2.1 will add bounded channels.

3. **`select` returns `None` on timeout.** Without a timeout, `select` blocks until one of the ops is ready. With a timeout, it returns `None` if no op becomes ready in time.

4. **`spawn` schedules on the microtask queue.** The spawned function doesn't run immediately; it runs after the current synchronous code completes.

5. **`recv` on a closed channel rejects.** Use `try_` or check a "closed" flag.

### Full API matrix

| Function                | Returns          | Blocks?  | Notes                                    |
|-------------------------|------------------|----------|------------------------------------------|
| `channel()`             | Channel          | No       | Creates an unbounded channel.            |
| `send(ch, v)`           | `Promise<void>`  | No       | Resolves immediately (unbounded).        |
| `recv(ch)`              | `Promise<any>`   | Yes      | Resolves when a value is available.      |
| `close(ch)`             | void             | No       | Closes the channel.                      |
| `select(ops, timeout?)` | `Promise<SelectResult>` | Yes | Resolves with first ready op.            |
| `timeout(ms)`           | `Promise<void>`  | Yes      | Resolves after `ms`.                     |
| `spawn(fn)`             | `Promise<T>`     | No       | Schedules `fn` on microtask queue.       |
| `awaitAll(ps)`          | `Promise<T[]>`   | Yes      | Waits for all to resolve.                |
| `race(ps)`              | `Promise<T>`     | Yes      | Resolves with first to settle.           |
| `mapAsync(arr, fn)`     | `Promise<U[]>`   | Yes      | Sequential (not parallel).               |
| `filterAsync(arr, fn)`  | `Promise<T[]>`   | Yes      | Sequential.                              |
| `reduceAsync(arr, fn, init)` | `Promise<U>` | Yes   | Sequential.                              |
| `defer(fn)`             | void             | No       | Queues a microtask.                      |
| `retry(n, fn)`          | `Promise<T>`     | Yes      | Retries up to `n` times on rejection.    |
| `debounce(fn, ms)`      | fn               | No       | Returns a debounced wrapper.             |
| `runAsync(fn)`          | `Promise<T>`     | No       | Host-only demo entry point.              |

## Migration notes

### From JavaScript/TypeScript

Aether's stdlib functions are mostly one-to-one with JS equivalents, but with some renames:

- `Array.prototype.map` → `map(arr, fn)`
- `Array.prototype.filter` → `filter(arr, fn)`
- `Array.prototype.reduce` → `reduce(arr, fn, init)`
- `Array.prototype.includes` → `includes(arr, v)`
- `Array.prototype.indexOf` → `indexOf(arr, v)`
- `Array.prototype.slice` → `slice(arr, i, j)`
- `Array.prototype.concat` → `concat(a, b)`
- `String.prototype.split` → `split(s, sep)`
- `String.prototype.trim` → `trim(s)`
- `String.prototype.toUpperCase` → `toUpper(s)`
- `Math.sqrt` → `sqrt(f)`
- `Math.floor` → `floor(f)`
- `JSON.stringify` → `jsonStringify(v)`
- `JSON.parse` → `jsonParse(s)`
- `btoa` → `base64Encode`
- `atob` → `base64Decode`

### From Python

- `str.split` → `split` (default whitespace)
- `",".join(arr)` → `join(arr, ",")`
- `str.upper` → `toUpper`
- `str.replace` → `replace` (first only) or `replaceAll`
- `math.sqrt` → `sqrt`
- `math.floor` → `floor`
- `math.gcd` → `gcd`
- `math.factorial` → `factorial`
- `random.randint` → `randomInt` (cryptographically secure by default)
- `random.random` → `randomFloat`
- `random.choice` → `randomChoice`
- `random.shuffle` → `shuffle`
- `re.findall` → `matchAll`
- `re.sub` → `replaceAll`
- `re.split` → `split` (with regex pattern)
- `urllib.parse.urlencode` → `urlencode`
- `urllib.parse.parse_qs` → `queryParse`
- `base64.b64encode` → `base64Encode`

### From Rust

- `String::from_utf8` → `utf8Decode`
- `String::into_bytes` → `utf8Encode`
- `Vec::push` → `push` (note: Aether's `push` is non-mutating by default; use the inline `push` for mutation)
- `Vec::pop` → `pop` (likewise)
- `Vec::contains` → `includes`
- `HashMap::insert` → `mapSet`
- `HashMap::get` → `mapGet` (panics if absent; use `mapHas` first)
- `HashSet::insert` → `setAdd`
- `HashSet::contains` → `setHas`

## Common error patterns

| Pattern                                | Cause                                    | Fix                                  |
|----------------------------------------|------------------------------------------|--------------------------------------|
| `split: expected string, got number`   | Passed a number to `split`                | Use `str(x)` or `format("%s", x)`.   |
| `mapGet` panic: `map key not found`    | Called `mapGet` without `mapHas`         | Use `mapHas` first or wrap in match. |
| `pow` returns NaN                      | `pow(-1.0, 0.5)` (negative base, fractional exp) | Use `abs` first or check the base. |
| `factorial: n out of range`            | `n > 170`                                 | Use `float` arithmetic for large n.  |
| `regex: invalid pattern`               | Bad regex syntax                         | Test the pattern in a regex tool.    |
| `base64Decode: invalid length`         | String isn't valid base64                 | Validate before decoding.            |
| `int: cannot parse '<s>'`              | `int("hello")` on non-numeric string      | Use `toInt` with a try/catch or check first. |

## See also

- The book's Chapter 8 (stdlib tour) for one-or-two-example-per-module overviews.
- The book's Chapter 9 (bytecode VM) for the perf characteristics of stdlib calls.
- The book's Chapter 14 (idiomatic Aether) for patterns that use the stdlib.
- The error catalog (`docs/reference/error-catalog.md`) for runtime errors that the stdlib can produce.
- The ADRs (`docs/decisions/`) for architectural decisions (especially ADR-08 for "stdlib as TypeScript functions").
- The RFCs (`docs/rfcs/`) for future work (especially RFC-007 for LSP integration that surfaces stdlib signatures).

