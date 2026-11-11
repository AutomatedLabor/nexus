# A Tour of the Standard Library

> Audience: anyone wanting to know what's in the box.
> Prerequisites: [language-basics.md](language-basics.md),
> [types-and-generics.md](types-and-generics.md). 45 minutes.

Aether's standard library is **curated**, not exhaustive. It has
ten modules with about 200 functions in total (the count varies
slightly as functions are added). Every function is implemented
in TypeScript and exposed to Aether through the `registerBuiltin`
hook in `aether/stdlib/index.ts`.

This tour walks each module in turn with one or two runnable
examples per module. For the complete function index, see
[../spec/12-stdlib.md](../spec/12-stdlib.md).

## 1. The ten modules

| Module | Path | Purpose | Callable in v1? |
|--------|------|---------|-----------------|
| `string` | `stdlib/string/` | string operations | yes |
| `math` | `stdlib/math/` | numerics, constants | yes |
| `collections` | `stdlib/collections/` | arrays, maps, sets | yes |
| `io` | `stdlib/io/` | print, println, time, files | partially (browser can't read files) |
| `datetime` | `stdlib/datetime/` | timestamps, date math | yes |
| `regex` | `stdlib/regex/` | regular expressions | yes |
| `encoding` | `stdlib/encoding/` | JSON, base64, hex, CSV | yes |
| `crypto` | `stdlib/crypto/` | hashes, random, UUID | yes |
| `text` | `stdlib/text/` | unicode, casing, wrapping | yes |
| `async` | `stdlib/async/` | channels, spawn, select | **no** (v2 spec only) |

The `async` module is honest: its function signatures are real,
but the v1 evaluator does not understand `Promise` values, so the
functions are not callable from Aether code. See §10 below.

## 2. Naming collisions

A small number of stdlib functions share a name with the
evaluator's inline builtins (`print`, `println`, `len`, `map`,
`filter`, `reduce`, `min`, `max`, `abs`, `sqrt`, `push`, `pop`).
When both are registered, the inline builtins win because they
are written into the root environment last. The inline versions
know how to call Aether closures via the evaluator's
`callValue`; the stdlib versions accept only native JS functions.

In practice, this means: when you call `map(arr, fn(x) { ... })`
from Aether code, you are calling the inline builtin, which
accepts an Aether closure. When you call `slice(arr, 0, 3)`,
there is no inline `slice`, so you get the stdlib `collections`
version.

See `aether/stdlib/index.ts` for the precedence comment.

## 3. `string` — string operations

The string module has about 35 functions. The most common:

```aether
let s = "  hello, world  ";
print(trim(s));                          // → hello, world
print(trim_start(s));                    // → hello, world  
print(trim_end(s));                      // →   hello, world
print(to_upper(s));                      // →   HELLO, WORLD  
print(to_lower(s));                      // →   hello, world  
print(replace(s, "world", "aether"));    // →   hello, aether  
print(replace_all(s, "l", "L"));         // →   heLLo, worLd  
print(starts_with(s, "  he"));           // → true
print(ends_with(s, "  "));               // → true
print(contains(s, "o, w"));              // → true
print(index_of(s, "world"));             // → 9
print(slice(s, 2, 7));                   // → hello
print(len(s));                           // → 16
print(repeat("ab", 3));                  // → ababab
print(pad_start("5", 3, "0"));           // → 005
print(pad_end("5", 3, "-"));             // → 5--
print(reverse("hello"));                 // → olleh
```

A second example: building a CSV line from an array.

```aether
let fields = ["alice", "30", "NYC"];
print(join(fields, ","));
// → alice,30,NYC
```

The `format` function provides printf-style formatting:

```aether
print(format("%s is %d years old", "Alice", 30));
// → Alice is 30 years old

print(format("0x%x", 255));
// → 0xff

print(format("%.2f", 3.14159));
// → 3.14
```

For the full function list, see
[../spec/12-stdlib.md](../spec/12-stdlib.md) §3 (string).

## 4. `math` — numerics

The math module has about 30 functions. The most common:

```aether
print(abs(-5));          // → 5
print(sign(-3));         // → -1
print(min(3, 7));        // → 3
print(max(3, 7));        // → 7
print(floor(3.7));       // → 3
print(ceil(3.2));        // → 4
print(round(3.5));       // → 4
print(trunc(3.9));       // → 3
print(sqrt(16));         // → 4
print(pow(2, 10));       // → 1024
print(exp(1));           // → 2.718281828459045
print(log(2.718281828459045));  // → 1
print(log2(8));          // → 3
print(log10(1000));      // → 3
print(sin(0));           // → 0
print(cos(0));           // → 1
print(PI());             // → 3.141592653589793
print(E());              // → 2.718281828459045
print(gcd(12, 18));      // → 6
print(lcm(4, 6));        // → 12
print(clamp(15, 0, 10));  // → 10
print(lerp(0, 100, 0.5));  // → 50
print(mod(-7, 3));       // → 2  (always non-negative)
print(factorial(5));     // → 120
print(is_prime(17));     // → true
print(sum([1, 2, 3, 4, 5]));  // → 15
print(mean([1, 2, 3, 4, 5]));  // → 3
```

A second example: solving a quadratic equation.

```aether
fn quadratic(a: float, b: float, c: float) -> (float, float) {
  let disc = sqrt(b * b - 4.0 * a * c);
  let r1 = (-b + disc) / (2.0 * a);
  let r2 = (-b - disc) / (2.0 * a);
  (r1, r2)
}

let (x1, x2) = quadratic(1.0, -5.0, 6.0);
print(x1);   // → 3
print(x2);   // → 2
```

Note: in v1, `min`, `max`, `abs`, `sqrt` are also inline
builtins (so you do not need to import them); the stdlib
versions accept variadic and array arguments. See §2 above.

## 5. `collections` — arrays, maps, sets

The collections module has about 35 functions. The most common
array operations:

```aether
let xs = [3, 1, 4, 1, 5, 9, 2, 6];

print(sort(xs));              // → [1, 1, 2, 3, 4, 5, 6, 9]
print(reverse(xs));           // → [6, 2, 9, 5, 1, 4, 1, 3]
print(slice(xs, 2, 5));       // → [4, 1, 5]
print(concat([1, 2], [3, 4])); // → [1, 2, 3, 4]
print(unique(xs));            // → [3, 1, 4, 5, 9, 2, 6]
print(flat([[1, 2], [3, 4]]));  // → [1, 2, 3, 4]
print(zip([1, 2, 3], ["a", "b", "c"]));  // → [[1, "a"], [2, "b"], [3, "c"]]
print(chunk([1, 2, 3, 4, 5, 6], 2));  // → [[1, 2], [3, 4], [5, 6]]
print(find(xs, fn(x: int) -> bool { x > 5 }));  // → 9
print(find_index(xs, fn(x: int) -> bool { x > 5 }));  // → 5
print(every(xs, fn(x: int) -> bool { x > 0 }));  // → true
print(some(xs, fn(x: int) -> bool { x > 5 }));  // → true
print(includes(xs, 4));      // → true
print(index_of(xs, 4));      // → 2
```

Map operations:

```aether
let m = map_new();
let m1 = map_set(m, "alice", 30);
let m2 = map_set(m1, "bob", 25);
print(map_get(m2, "alice"));  // → 30
print(map_has(m2, "bob"));    // → true
print(map_size(m2));          // → 2
print(map_keys(m2));          // → ["alice", "bob"]
print(map_values(m2));        // → [30, 25]
```

A second example: counting word frequencies.

```aether
let text = "the cat the dog the bird the cat";
let words = split(text, " ");
let counts = map_new();
for w in words {
  if map_has(counts, w) {
    let n = map_get(counts, w);
    map_set(counts, w, n + 1);
  } else {
    map_set(counts, w, 1);
  }
}
print(map_get(counts, "the"));   // → 4
print(map_get(counts, "cat"));   // → 2
```

## 6. `io` — input/output

The io module has about 12 functions. In the browser (playground),
only `print`, `println`, `print_list`, `time`, and `now` work.
The file functions (`read_file_sync`, `write_file_sync`,
`file_exists`, `read_line`) and process functions (`args`, `env`,
`exit`, `sleep`) require Node, which the playground does not have.

```aether
print("no newline");
println("with newline");
print_list([1, 2, 3]);
// → 1
// → 2
// → 3
print(time());   // → 1700000000000 (milliseconds since epoch)
print(now());    // → 2023-11-15T12:00:00.000Z (ISO timestamp)
```

For the playground, this is the entire surface. The full surface
is in [../spec/12-stdlib.md](../spec/12-stdlib.md) §7.

## 7. `datetime` — timestamps

The datetime module has about 20 functions for working with
timestamps. Timestamps are `int` (milliseconds since epoch).

```aether
let t = now();              // current timestamp
print(year(t));             // → 2023
print(month(t));            // → 11
print(day(t));             // → 15
print(hour(t));             // → 12
print(minute(t));           // → 0
print(second(t));           // → 0
print(day_of_week(t));      // → 3 (Wednesday)
print(to_iso(t));           // → 2023-11-15T12:00:00.000Z
print(from_iso("2023-11-15T12:00:00.000Z"));  // → timestamp
print(is_leap_year(2024));   // → true
print(days_in_month(2024, 2));  // → 29
print(add_days(t, 7));      // → t + 7 days
print(diff_days(t, add_days(t, 30)));  // → 30
```

A second example: computing age from a birthday.

```aether
fn age(birth: int) -> int {
  let now_ms = now();
  let days = diff_days(birth, now_ms);
  days / 365
}

let born = date(1990, 6, 15);
print(age(born));
// → 33  (or whatever)
```

## 8. `regex` — regular expressions

The regex module has about 15 functions. Patterns are JS RegExp
objects, compiled via the `regex` builtin.

```aether
let p = regex("\\d+");        // matches runs of digits
print(test("hello 42 world", p));   // → true
print(match("hello 42 world", p));  // → ["42"]
print(match_all("a1 b2 c3", regex("[a-z][0-9]")));  // → [["a1"], ["b2"], ["c3"]]
print(extract("phone: 555-1234", regex("(\\d+)-(\\d+)"), 1));  // → "555"
print(replace_all("hello world", regex("o"), "0"));  // → hell0 w0rld
print(split("a,b,c", regex(",")));  // → ["a", "b", "c"]
print(count("the the the", regex("the")));  // → 3
print(escape("a.b*c"));  // → a\.b\*c
```

A second example: extract all email addresses from a text.

```aether
let text = "contact alice@example.com or bob@corp.org for info";
let p = regex("[a-z]+@[a-z]+\\.[a-z]+");
let matches = match_all(text, p);
for m in matches {
  print(m[0]);
}
// → alice@example.com
// → bob@corp.org
```

## 9. `encoding` — JSON, base64, hex, CSV

The encoding module has about 20 functions for serializing and
deserializing data.

```aether
let data = { "name": "Alice", "age": 30 };
let json = json_stringify(data);
print(json);   // → {"name":"Alice","age":30}

let parsed = json_parse(json);
print(parsed["name"]);   // → Alice

let pretty = json_pretty(data);
print(pretty);
// → {
// →   "name": "Alice",
// →   "age": 30
// → }

let b64 = base64_encode("hello");
print(b64);   // → aGVsbG8=
print(base64_decode(b64));  // → hello

let hex = hex_encode("hi");
print(hex);   // → 6869
print(hex_decode(hex));  // → hi

let csv = csv_stringify([["name", "age"], ["Alice", 30], ["Bob", 25]]);
print(csv);
// → name,age
// → Alice,30
// → Bob,25

let rows = csv_parse(csv);
print(rows[1][0]);  // → Alice
```

A second example: encode a query string.

```aether
let q = query_stringify({ "q": "aether lang", "page": "1" });
print(q);   // → q=aether%20lang&page=1

let p = query_parse("name=John%20Doe&age=30");
print(p["name"]);   // → John Doe
print(p["age"]);    // → 30
```

## 10. `crypto` — hashes, random, UUID

The crypto module has about 14 functions.

```aether
print(sha256("hello"));   
// → 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824

print(md5("hello"));     // → 5d41402abc4b2a76b9719d911017c592
print(sha1("hello"));    // → aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
print(djb2("hello"));    // → 2107
print(fnv1a("hello"));    // → 1335831723

print(uuid4());   // → f47ac10b-58cc-4372-a567-0e02b2c3d479 (random)

print(random_int(1, 100));    // → 42 (cryptographically secure)
print(random_float());        // → 0.5234 (in [0, 1))

let bytes = random_bytes(4);
print(bytes);    // → [12, 221, 7, 198]

print(random_choice([1, 2, 3, 4, 5]));    // → 3 (random)
print(shuffle([1, 2, 3, 4, 5]));    // → [3, 5, 1, 4, 2] (random order)
```

For deterministic random (useful in tests), seed with `seed_random`:

```aether
seed_random(42);
print(random_int(1, 100));   // → 73 (deterministic)
print(random_int(1, 100));   // → 27 (deterministic)
seed_random(42);
print(random_int(1, 100));   // → 73 (same again)
random_seed();  // restore secure source
```

A second example: hash a password (NOT secure — for real use
you'd want a key-derivation function, not just SHA-256).

```aether
fn hash_password(pw: string) -> string {
  sha256(pw + "salt")
}

print(hash_password("hunter2"));
// → 6b3a6e6c4d9e0a1b...
```

For real password storage, use a proper KDF (PBKDF2, Argon2).
Aether v1 does not have these in the stdlib; they are planned
for v2. See [../spec/12-stdlib.md](../spec/12-stdlib.md) §10.

## 11. `text` — unicode, casing, wrapping

The text module has about 14 functions for text manipulation
beyond simple string operations. It focuses on unicode-aware
operations.

```aether
print(lines("a\nb\nc"));    // → ["a", "b", "c"]
print(words("the quick brown fox"));  // → ["the", "quick", "brown", "fox"]
print(unlines(["a", "b", "c"]));   // → a\nb\nc
print(unwords(["the", "quick"]));  // → the quick

print(indent("hello\nworld", 2));   // →   hello\n  world
print(dedent("  hello\n  world"));   // → hello\nworld
print(wrap("the quick brown fox jumps over the lazy dog", 20));
// → the quick brown fox
// → jumps over the lazy
// → dog
print(center("hi", 6));   // →   hi  
print(left("hi", 6));     // → hi    
print(right("hi", 6));    // →     hi

print(title_case("the quick brown fox"));  // → The Quick Brown Fox
print(camel_case("the quick brown fox"));  // → theQuickBrownFox
print(snake_case("TheQuickBrownFox"));     // → the_quick_brown_fox
print(kebab_case("TheQuickBrownFox"));     // → the-quick-brown-fox

print(truncate("hello world", 8));   // → hello...
print(truncate("hello world", 8, "[...]"));  // → hello[...]
```

A second example: pretty-print a paragraph.

```aether
let text = "the quick brown fox jumps over the lazy dog. the dog was not amused.";
let wrapped = wrap(text, 30);
let indented = indent(wrapped, 4);
print(indented);
// →     the quick brown fox jumps
// →     over the lazy dog. the dog
// →     was not amused.
```

## 12. `async` — the honest status

The `async` module is **not callable from Aether v1 code**. The
function signatures are real — they are defined in
`aether/stdlib/async/index.ts` — but the v1 evaluator does not
understand `Promise` values. Calling `spawn` or `recv` from
Aether code raises a runtime error.

The reason the module exists is to:

1. **Document the v2 API.** The function signatures are the
   contract for the v2 async/await system.
2. **Let host code call the functions directly.** The
   playground, a future CLI, or any other host can call
   `Async.spawn(...)` from JavaScript without needing Aether
   to know about promises.
3. **Provide a target for the v2 evaluator.** When v2 ships,
   the evaluator will understand promises and the `async`
   module will become callable from Aether.

The v2 surface includes:

```aether
// v2 sketch — does NOT run in v1.
channel<T>()            → Channel<T>
send(ch, v)             → Future<unit>
recv(ch)                → Future<T>
close(ch)               → unit
select(ops)             → Future<SelectResult>
spawn(fn)               → JoinHandle<T>
await_all(futures)      → Future<[T]>
race(futures)           → Future<T>
map_async(arr, fn)      → Future<[U]>
filter_async(arr, fn)   → Future<[T]>
reduce_async(arr, fn, init) → Future<U>
timeout(ms)             → Future<unit>
retry(n, fn)            → Future<T>
```

See [../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md)
for the full v2 design and
[../tutorials/concurrency.md](../tutorials/concurrency.md) for the
tutorial.

## 13. A bigger example: a small log analyzer

Here is a program that uses five stdlib modules together to
analyze a small log file.

```aether
let log = `
2023-11-15 10:00:00 INFO  startup
2023-11-15 10:00:05 INFO  request id=1 path=/users
2023-11-15 10:00:06 ERROR request id=1 detail="not found"
2023-11-15 10:00:10 INFO  request id=2 path=/users
2023-11-15 10:00:11 INFO  request id=2 detail="ok"
`;

let lines_arr = lines(trim(log));
let counts = map_new();
for line in lines_arr {
  let parts = split(line, " ");
  if len(parts) >= 3 {
    let level = parts[2];
    if map_has(counts, level) {
      let n = map_get(counts, level);
      map_set(counts, level, n + 1);
    } else {
      map_set(counts, level, 1);
    }
  }
}

let keys = map_keys(counts);
for k in keys {
  print(f"{k}: {map_get(counts, k)}");
}
// → INFO: 3
// → ERROR: 1
```

This uses:

- `lines` (text) to split the log.
- `trim` (string) to clean up.
- `split` (string) to tokenize.
- `map_new`, `map_has`, `map_get`, `map_set`, `map_keys`
  (collections) to count.
- `f"..."` (string interpolation) for output.

## 14. Where to go next

- **[../spec/12-stdlib.md](../spec/12-stdlib.md)** — the full
  stdlib reference with every function's signature and
  semantics.
- **[../guides/idiomatic-aether.md](../guides/idiomatic-aether.md)**
  — when to use which stdlib function.
- **[../guides/anti-patterns.md](../guides/anti-patterns.md)**
  — stdlib anti-patterns (e.g., string concatenation in a loop
  instead of `join`).
- **[../tutorials/performance.md](../tutorials/performance.md)**
  — which stdlib functions are fast and which are slow under
  the v1 tree-walking interpreter.

The Aether stdlib is small but well-chosen. Most programs you
write will use one or two modules; the others are there when
you need them.
