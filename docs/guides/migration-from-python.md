# Migration from Python

> Audience: a Python programmer wanting to learn Aether.
> Prerequisites: comfort with Python. 25 minutes.

This guide is a translation table: Python → Aether. The biggest
honest caveats upfront:

1. Aether v1 is **statically typed**. There is no duck typing.
2. Aether v1 has **no classes**, no inheritance, no methods.
3. Aether v1 is **single-threaded and synchronous**. There is
   no `asyncio`, no `threading`, no `multiprocessing`.
4. Aether v1 has **no exceptions**. Use `Result<T, E>` instead.
5. Aether v1 has **no `None`**. Use `Option<T>` instead.
6. Aether v1 has **no first-class packages**. Single-file
   programs only.

For the language tour, see
[../tutorials/getting-started.md](../tutorials/getting-started.md).

## 1. The big picture

| Aspect | Python | Aether |
|--------|--------|--------|
| Typing | dynamic, gradual (`typing` module) | static, inferred |
| Mutation | mutable by default | immutable by default |
| None | `None` | `Option<T>` |
| Exceptions | `try`/`except`/`raise` | `Result<T, E>` |
| Classes | yes | not in v1 |
| Inheritance | yes | not in v1 |
| Methods | yes | free functions (v1); methods (v2 planned) |
| Async | `async`/`await`, `asyncio` | sync only (v2 planned) |
| Generators | `yield` | not in v1 |
| Decorators | `@decorator` | not in v1 |
| Comprehensions | `[x for x in xs]` | not in v1; use `map`/`filter` |
| Multiprocessing | yes | not in v1 |

If you have used Python with type hints (`from typing import
...`), Aether will feel familiar. The main shifts are: static
typing is mandatory, immutability is the default, no exceptions,
no classes.

## 2. Variables

### 2.1 Bindings

```python
# Python
x = 42
y = 3.14
name = "Alice"
```

```aether
# Aether
let x: int = 42;
let y: float = 3.14;
let name = "Alice";
```

Differences:

- Aether uses `let` (immutable) or `let mut` (mutable); Python
  uses bare `=`.
- Aether requires `let`; Python does not.
- Aether has `int` and `float` as separate types; Python has
  one `int` and one `float`.

### 2.2 Mutable vs. immutable

```python
# Python — mutable by default
x = 1
x = 2  # OK
```

```aether
# Aether — immutable by default
let x = 1;
x = 2;  // error: cannot assign to immutable variable 'x'

# To allow reassignment:
let mut x = 1;
x = 2;  // OK
```

Aether requires `let mut` for variables you intend to reassign.
Python's `= ` works for any name.

### 2.3 Constants

```python
# Python — convention only
PI = 3.14159  # not actually constant
```

```aether
# Aether
const PI: float = 3.14159;
```

Aether's `const` is a declaration. Python's `ALL_CAPS` is a
convention with no language support.

## 3. Functions

### 3.1 Declaration

```python
# Python
def add(a: int, b: int) -> int:
    return a + b
```

```aether
# Aether
fn add(a: int, b: int) -> int {
  a + b
}
```

Differences:

- Aether uses `fn` instead of `def`.
- Aether uses `{ ... }` instead of `:` and indentation.
- Aether's body returns the last expression; Python's body
  needs `return`.

### 3.2 Default arguments

```python
# Python
def greet(name, greeting="hi"):
    return f"{greeting}, {name}"

greet("ada")
greet("ada", "howdy")
```

```aether
# Aether — no default arguments; use a wrapper
fn greet(name: string, greeting: string) -> string {
  f"{greeting}, {name}"
}
fn greet_default(name: string) -> string { greet(name, "hi") }

greet_default("ada");
greet("ada", "howdy");
```

Aether v1 has no default arguments. Use a wrapper function or
`Option<T>` for the optional parameter. v2 will add defaults.

### 3.3 Keyword arguments

```python
# Python
def f(a, b, c): ...
f(1, c=3, b=2)
```

```aether
# Aether — no keyword arguments
fn f(a: int, b: int, c: int) { ... }
f(1, 2, 3);   // positional only
```

Aether v1 has positional arguments only.

### 3.4 *args / **kwargs

```python
# Python
def f(*args, **kwargs): ...
```

```aether
# Aether — not in v1; use an array or map
fn f(args: [int]) { ... }
fn f_kwargs(kwargs: map[string]int) { ... }
```

Aether v1 has no variadic arguments. Pass an array or a map
explicitly.

### 3.5 Lambdas

```python
# Python
doubled = map(lambda x: x * 2, [1, 2, 3])
```

```aether
# Aether
let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
```

Aether closures use `fn(args) -> ret { body }` instead of
`lambda args: body`. Closures require parameter type
annotations in v1.

## 4. Types

### 4.1 Classes → struct

```python
# Python
class User:
    def __init__(self, id: int, name: str):
        self.id = id
        self.name = name

alice = User(1, "Alice")
print(alice.name)
```

```aether
# Aether
struct User { id: int, name: string }
let alice = User { id: 1, name: "Alice" };
print(alice.name);
```

Aether structs are pure data. There are no methods, no
`__init__`, no `self`. Construction is `Name { field: value, ...
}`. Methods are free functions; v2 may add `impl` blocks.

### 4.2 Dataclasses

```python
# Python
from dataclasses import dataclass

@dataclass
class Point:
    x: int
    y: int

p = Point(1, 2)
```

```aether
# Aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

Aether structs are like Python dataclasses, but without
auto-generated `__init__`, `__repr__`, `__eq__`. You write
those yourself if you need them.

### 4.3 Enums (ADTs)

```python
# Python — typing
from typing import Union, Literal
from dataclasses import dataclass

@dataclass
class Circle:
    radius: int

@dataclass
class Rect:
    w: int
    h: int

Shape = Union[Circle, Rect]

def area(s: Shape) -> int:
    if isinstance(s, Circle):
        return 3 * s.radius ** 2
    else:
        return s.w * s.h
```

```aether
# Aether
enum Shape {
  Circle(int),
  Rect(int, int),
}

fn area(s: Shape) -> int {
  match s {
    Shape::Circle(r)    => 3 * r * r,
    Shape::Rect(w, h)   => w * h,
  }
}
```

Aether's `enum` is first-class. The `match` is exhaustive (in
v2; in v1 it is a discipline). There is no need for
`isinstance` checks; the type system handles dispatch.

### 4.4 Optional

```python
# Python — typing.Optional
from typing import Optional

def lookup(xs, i) -> Optional[int]:
    if i < 0 or i >= len(xs):
        return None
    return xs[i]

result = lookup([1, 2, 3], 1)
if result is None:
    print("not found")
else:
    print(result)
```

```aether
# Aether
fn lookup(xs: [int], i: int) -> Option<int> {
  if i < 0 || i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}

match lookup([1, 2, 3], 1) {
  Option::Some(v) => print(v),
  Option::None    => print("not found"),
}
```

Aether has no `None` literal. Use `Option::Some(v)` and
`Option::None`. Pattern match to extract.

### 4.5 Tuples

```python
# Python
p = (1, 2, 3)
a, b, c = p
print(a, b, c)
```

```aether
# Aether
let p = (1, 2, 3);
let (a, b, c) = p;
print(f"{a} {b} {c}");
```

Same shape. Aether tuples are immutable; Python's are too.

### 4.6 Lists

```python
# Python
xs = [1, 2, 3]
xs.append(4)
print(xs[0])
print(len(xs))
```

```aether
# Aether
let xs = [1, 2, 3];
let xs2 = push(xs, 4);
print(xs[0]);
print(len(xs));
```

Aether arrays are `[T]`. The `push` builtin is non-mutating in
v1 — it returns a new array. (Actually, it mutates the
underlying array; see [../tutorials/stdlib-tour.md](../tutorials/stdlib-tour.md)
§2 for the convention.) The idiomatic way to append is to
assign back: `xs = push(xs, 4)`.

### 4.7 Dicts

```python
# Python
m = {"a": 1, "b": 2}
m["c"] = 3
print(m["a"])
print(m.get("z", 0))
```

```aether
# Aether
let m = { "a": 1, "b": 2 };
// m["c"] = 3;   // OK in v1 (index-assign on map)
print(m["a"]);
// print(map_get(m, "z") or 0);  // get with default — use map_has
if map_has(m, "z") { print(map_get(m, "z")); } else { print(0); }
```

Aether maps use `{ k: v }` literals. Get/set is via `[]`.
`m[k]` panics if `k` is not present; use `map_get`/`map_has`
to handle absence.

### 4.8 Sets

```python
# Python
s = set([1, 2, 3])
s.add(4)
print(2 in s)
```

```aether
# Aether
let s = set_new();
set_add(s, 1);
set_add(s, 2);
set_add(s, 3);
set_add(s, 4);
print(set_has(s, 2));
```

Aether sets are from the stdlib `collections` module.
`set_new`, `set_add`, `set_has`, `set_delete`, `set_size`,
`set_to_array`.

## 5. Control flow

### 5.1 if/elif/else

```python
# Python
if n < 0:
    print("neg")
elif n == 0:
    print("zero")
else:
    print("pos")
```

```aether
# Aether — if is an expression
let desc = if n < 0 { "neg" } else if n == 0 { "zero" } else { "pos" };
print(desc);
```

Aether uses `if`/`else if`/`else` (no `elif`). `if` is an
expression; you can bind its value.

### 5.2 while

```python
# Python
i = 0
while i < 10:
    i += 1
```

```aether
# Aether
let mut i = 0;
while i < 10 {
  i = i + 1;
}
```

Aether needs `mut` on the counter. The `+=` operator works
on `let mut` bindings.

### 5.3 for

```python
# Python
for i in range(10):
    print(i)

for x in [1, 2, 3]:
    print(x)

for k, v in m.items():
    print(k, v)
```

```aether
# Aether
for i in range(0, 10) {
  print(i);
}

for x in [1, 2, 3] {
  print(x);
}

// iterating a map: use map_keys / map_values / map_entries
let keys = map_keys(m);
for k in keys {
  print(f"{k}: {map_get(m, k)}");
}
```

Aether `for x in iterable` works on ranges and arrays. There
is no built-in `for k, v in m.items()`; use `map_keys` etc.

### 5.4 List comprehensions

```python
# Python
squares = [x * x for x in range(10)]
evens = [x for x in range(10) if x % 2 == 0]
```

```aether
# Aether — use map and filter
let squares = map(range(0, 10), fn(x: int) -> int { x * x });
let evens = filter(range(0, 10), fn(x: int) -> bool { x % 2 == 0 });
```

Aether v1 has no list comprehensions. Use `map`, `filter`,
`reduce` instead.

### 5.5 match

```python
# Python — match statement (3.10+)
match n:
    case 0:
        print("zero")
    case 1 | 2:
        print("small")
    case _:
        print("many")
```

```aether
# Aether
match n {
  0       => print("zero"),
  1 | 2   => print("small"),
  _       => print("many"),
}
```

Aether `match` is similar to Python 3.10's `match`. The arms
are `pattern => expr` instead of `case pattern:`.

## 6. Errors

### 6.1 try/except → Result

```python
# Python
def parse(s):
    try:
        return int(s)
    except ValueError:
        return None

result = parse("hello")
if result is None:
    print("not a number")
else:
    print(result)
```

```aether
# Aether
fn parse(s: string) -> Result<int, string> {
  // ... imagine parsing
  if s == "42" { Result::Ok(42) } else { Result::Err("not a number") }
}

match parse("hello") {
  Result::Ok(n)  => print(n),
  Result::Err(e) => print(f"error: {e}"),
}
```

Aether has no `try`/`except`. Use `Result<T, E>` for "may
fail". Pattern match at the call site.

### 6.2 raise → panic

```python
# Python
def factorial(n):
    if n < 0:
        raise ValueError("negative")
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

```aether
# Aether — for invariants, use panic
fn factorial(n: int) -> int {
  if n < 0 { panic("negative"); }
  if n <= 1 { 1 } else { n * factorial(n - 1) }
}
```

Aether's `panic(msg)` is like Python's `raise Exception(msg)`,
but it is unrecoverable in v1 (no `try`/`except`). Use `Result`
for recoverable errors; `panic` for invariants.

## 7. Strings

### 7.1 f-strings

```python
# Python
name = "Alice"
print(f"hello, {name}!")
print(f"{1 + 2}")  # 3
```

```aether
# Aether — same syntax
let name = "Alice";
print(f"hello, {name}!");
print(f"{1 + 2}");   // 3
```

Aether f-strings are similar to Python's. The `{expr}`
interpolation works the same way.

### 7.2 String methods

```python
# Python
s = "  hello  "
print(s.strip())
print(s.upper())
print(s.replace("l", "L"))
print(s.startswith("  he"))
print(", ".join(["a", "b", "c"]))
```

```aether
# Aether — free functions, not methods
let s = "  hello  ";
print(trim(s));
print(to_upper(s));
print(replace(s, "l", "L"));
print(starts_with(s, "  he"));
print(join(["a", "b", "c"], ", "));
```

Aether strings do not have methods. Use free functions from
the `string` stdlib module.

## 8. Iteration and comprehensions

```python
# Python
squares = [x * x for x in xs]
total = sum(xs)
evens = [x for x in xs if x % 2 == 0]
```

```aether
# Aether
let squares = map(xs, fn(x: int) -> int { x * x });
let total = reduce(xs, fn(a: int, b: int) -> int { a + b }, 0);
let evens = filter(xs, fn(x: int) -> bool { x % 2 == 0 });
```

Aether's `map`, `filter`, `reduce` replace Python's
comprehensions. `sum` is `reduce` with `+`.

## 9. What is missing in Aether v1

| Python feature | Aether v1 | Workaround |
|----------------|-----------|------------|
| Classes | not present | `struct` + free functions |
| Inheritance | not present | composition with closures |
| Methods | not present | free functions; v2 planned |
| `None` | not present | `Option<T>` |
| `try`/`except`/`raise` | not present | `Result<T, E>` and `panic` |
| `async`/`await` | not present | sync only; v2 planned |
| `threading` | not present | sync only |
| `multiprocessing` | not present | sync only |
| Generators (`yield`) | not present | build arrays |
| Decorators | not present | n/a |
| Comprehensions | not present | `map`/`filter` |
| Default arguments | not present | wrapper functions |
| Keyword arguments | not present | positional only |
| `*args`/`**kwargs` | not present | arrays / maps |
| Context managers (`with`) | not present | n/a; v2 may add `defer` |
| `import` | not present | single file; v2 planned |
| `pip` / packages | not present | single file; v2 planned |
| Reflection (`getattr`, `isinstance`) | not present | `match` |
| Magic methods (`__init__`, `__str__`) | not present | free functions |

## 10. A worked example: porting a small Python program

### 10.1 Python

```python
# stats.py
from typing import List, Dict

def word_count(text: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for word in text.split():
        if word in counts:
            counts[word] += 1
        else:
            counts[word] = 1
    return counts

def main():
    counts = word_count("the cat the dog the bird")
    for word, n in sorted(counts.items()):
        print(f"{word}: {n}")

main()
```

### 10.2 Aether

```aether
// stats.ae
fn word_count(text: string) -> map[string]int {
  let counts = map_new();
  for word in split(text, " ") {
    if map_has(counts, word) {
      map_set(counts, word, map_get(counts, word) + 1);
    } else {
      map_set(counts, word, 1);
    }
  }
  counts
}

let counts = word_count("the cat the dog the bird");
let keys = sort(map_keys(counts));
for w in keys {
  print(f"{w}: {map_get(counts, w)}");
}
// → bird: 1
// → cat: 1
// → dog: 1
// → the: 3
```

Differences:

- No `from typing import ...`; types are built-in.
- No `Dict[str, int]`; use `map[string]int`.
- No `text.split()`; use stdlib `split`.
- No `if word in counts`; use `map_has`.
- No `counts[word] += 1`; use `map_get`/`map_set`.
- No `for word, n in counts.items()`; iterate over `map_keys`.
- No `sorted(counts.items())`; use stdlib `sort` on `map_keys`.

## 11. Where to go next

- **[../tutorials/getting-started.md](../tutorials/getting-started.md)**
  — the first tutorial.
- **[../tutorials/language-basics.md](../tutorials/language-basics.md)**
  — the full surface tour.
- **[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)**
  — the type system.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — `Result` and `Option` in depth.
- **[../guides/idiomatic-aether.md](idiomatic-aether.md)** —
  what good Aether looks like.

Welcome from Python. The mental shift is: static types are
mandatory, immutability is the default, no exceptions, no
classes. Once those four things click, the rest is syntax.
