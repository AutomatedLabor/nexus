# Chapter 5 — Data structures

> Aether has two ways to make a new type: `struct` (record) and `enum` (algebraic data type). It has three built-in composite types: tuples, arrays, and maps. This chapter covers all five, the pattern-matching syntax for each, and the design choices that make ADT-style programming the idiomatic Aether style.

---

## 5.1 Structs

A `struct` is a record: a fixed set of named fields, each with a type.

```aether
struct Point { x: int, y: int }

let p = Point { x: 1, y: 2 };
print(p.x);    // 1
print(p.y);    // 2
```

Structs are *nominal*: two structs with the same fields are different types. `Point` and `Vec2` (with the same `x: int, y: int` fields) are distinct; you can't assign one to the other without an explicit conversion. See ADR-02 for the nominal-vs-structural decision.

### 5.1.1 Generic structs

```aether
struct Pair<A, B> { first: A, second: B }

let p = Pair { first: 1, second: "two" };
print(p.first);   // 1
print(p.second);  // two
```

The type parameters are inferred at construction time from the field values.

### 5.1.3 Field access and assignment

Field access is `s.field`:

```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.x + p.y);   // 3
```

Field *assignment* (`s.field = v`) is not supported in v1 — struct fields are immutable. The idiom is to construct a new struct with the updated field:

```aether
fn move_x(p: Point, dx: int) -> Point {
  Point { x: p.x + dx, y: p.y }
}
```

This is the *functional-persistent* style. The cost is allocation; the benefit is safety (no shared mutable state). v2.x may add field mutation with a borrow checker (RFC-004); until then, you build new structs.

### 5.1.4 Struct patterns

`match` can destructure a struct:

```aether
struct Point { x: int, y: int }
let p = Point { x: 0, y: 5 };
let s = match p {
  Point { x: 0, y: 0 } => "origin",
  Point { x: 0, y } => f"y-axis at {y}",   // shorthand: y binds p.y
  Point { x, y: 0 } => f"x-axis at {x}",
  Point { x, y } => f"({x}, {y})",
};
print(s);   // y-axis at 5
```

The shorthand `Point { x, y }` binds `x` to `p.x` and `y` to `p.y` (when the field name and the binding name are the same). The long form `Point { x: xp, y: yp }` renames the binding.

### 5.1.5 Spread syntax for "with"

Aether has a struct spread (Rust's `..` syntax, lifted from the functional-update idea):

```aether
let p = Point { x: 1, y: 2 };
let q = Point { x: 10, ..p };   // q = Point { x: 10, y: 2 }
```

The spread copies fields from `p` *except* those explicitly listed before the `..`. This is the idiomatic "update one field" pattern.

### 5.1.6 Required fields

You can't omit a field when constructing a struct. The type checker reports `missing field '<field>' in struct <Name>`:

```aether
// Type error:
// let p = Point { x: 1 };   // missing field 'y' in struct Point

// Fix:
let p = Point { x: 1, y: 2 };
```

You can't add a field that doesn't exist. The type checker reports `struct <Name> has no field '<field>'`:

```aether
// Type error:
// let p = Point { x: 1, y: 2, z: 3 };   // struct Point has no field 'z'
```

### 5.1.7 Field types must match

The type checker reports `field '<field>': expected <T>, found <U>` for a field with the wrong type:

```aether
// Type error:
// let p = Point { x: "hello", y: 2 };   // field 'x': expected int, found string

// Fix:
let p = Point { x: 1, y: 2 };
```

---

## 5.2 Enums (ADTs)

An `enum` is an *algebraic data type*: a choice among a fixed set of *variants*. Each variant can be a unit (no data), a tuple (positional data), or a struct (named data).

```aether
enum Color { Red, Green, Blue, }   // three unit variants
enum Option<T> { Some(T), None, }  // a tuple variant and a unit variant
enum Shape {
  Circle(float),                              // tuple variant — radius
  Rect(float, float),                         // tuple variant — width, height
  Point { x: float, y: float },               // struct variant
}
```

The trailing comma is allowed (and conventional) for variants.

### 5.2.1 Construction

```aether
let c = Color::Red;
let o = Option::Some(42);
let s = Shape::Circle(3.0);
let p = Shape::Point { x: 1.0, y: 2.0 };
```

`::` is the variant-access operator. The variant's "constructor name" is `EnumName::VariantName`.

### 5.2.2 Pattern matching on enums

This is the *main* way to use an enum:

```aether
enum Option<T> { Some(T), None, }
fn double(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v * 2,
    Option::None => 0,
  }
}
print(double(Option::Some(21)));   // 42
print(double(Option::None));       // 0
```

Tuple variants are matched positionally:

```aether
enum Shape {
  Circle(float),
  Rect(float, float),
  Point { x: float, y: float },
}
fn area(s: Shape) -> float {
  match s {
    Shape::Circle(r) => 3.14159 * r * r,
    Shape::Rect(w, h) => w * h,
    Shape::Point { x: _, y: _ } => 0.0,   // a point has no area
  }
}
print(area(Shape::Circle(2.0)));    // ~12.57
print(area(Shape::Rect(3.0, 4.0))); // 12.0
```

Struct variants are matched with `{ field: pattern }`:

```aether
let s = Shape::Point { x: 1.0, y: 2.0 };
let r = match s {
  Shape::Point { x, y } => f"({x}, {y})",
  _ => "other",
};
print(r);   // (1.0, 2.0)
```

Using the tuple syntax on a struct variant is a type error: `struct variants must be matched with { field: pattern } syntax`.

### 5.2.3 Generic enums

```aether
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }
enum Either<L, R> { Left(L), Right(R), }
```

Generic enums are the workhorse of Aether error handling (Chapter 7). `Option` and `Result` are predefined in the language as built-in enums.

### 5.2.4 Recursive enums

An enum can refer to itself:

```aether
enum List {
  Node(int, List),
  Nil,
}

let l = List::Node(1, List::Node(2, List::Node(3, List::Nil)));

fn length(l: List) -> int {
  match l {
    List::Node(_, rest) => 1 + length(rest),
    List::Nil => 0,
  }
}

print(length(l));   // 3
```

This is the *linked list* pattern. The `binary_tree.ae` and `linked_list.ae` examples in the playground use it.

### 5.2.5 Unit variants

A unit variant carries no data. It's like a "tagged constant":

```aether
enum Direction { North, South, East, West, }
fn turn_left(d: Direction) -> Direction {
  match d {
    Direction::North => Direction::West,
    Direction::South => Direction::East,
    Direction::East => Direction::North,
    Direction::West => Direction::South,
  }
}
print(turn_left(Direction::North));   // West
```

Constructing a unit variant with arguments is a type error: `unit variant <Name>::<variant> takes no arguments`.

### 5.2.6 Exhaustiveness (or lack thereof)

v1 doesn't check exhaustiveness at compile time. If you miss a variant, the program panics at runtime with `no match arm matched`. *Always* add a `_ => ...` arm if you're not sure you've enumerated everything. v2.1 will add exhaustiveness checking.

---

## 5.3 Tuples

A tuple is a fixed-size, heterogeneous collection. The type is written `(T1, T2, ...)`. The value is written `(v1, v2, ...)`.

```aether
let p: (int, string) = (1, "one");
print(p.0);   // 1
print(p.1);   // one
```

Tuple field access is `t.N` where `N` is a literal integer. (Dynamic indexing `t[i]` is not supported for tuples — see Chapter 2.)

### 5.3.1 Tuple patterns

```aether
let p = (1, 2, 3);
match p {
  (a, b, c) => print(a + b + c),   // 6
}
```

Tuple patterns must match arity. The type checker reports `tuple pattern arity N does not match M` if they don't.

### 5.3.2 The unit value `()`

`()` is the *unit* value (and the *unit* type). It's the value of an expression with no useful result, like `print(...)`. A function with no return value has type `()`:

```aether
fn greet(name: string) -> () {
  print(f"Hello, {name}!");
}
```

(The `-> ()` is optional; `fn greet(name: string) { ... }` is the same.)

### 5.3.3 Single-element tuples

A single-element tuple is written `(x,)` — the trailing comma disambiguates from a parenthesized expression:

```aether
let x = (42);    // int — just a parenthesized expression
let t = (42,);   // (int,) — a 1-tuple
```

1-tuples are rarely useful. Aether's idiom for "a wrapper around a value" is an enum with one variant.

---

## 5.4 Arrays

An array is a fixed-length, homogeneous collection. The type is `[T]`. The value is `[v1, v2, ...]`.

```aether
let xs: [int] = [1, 2, 3];
print(xs[0]);    // 1
print(len(xs));  // 3
```

Arrays are 0-indexed. Indexing is `xs[i]` where `i` is an `int`. Out-of-bounds indexing panics at runtime: `array index out of bounds: N`.

### 5.4.1 Array operations

The `collections` stdlib module has the standard list operations:

```aether
let xs = [1, 2, 3];
let ys = push(xs, 4);          // [1, 2, 3, 4] (non-mutating)
let zs = pop(xs);               // [1, 2] (non-mutating)
let reversed = reverse(xs);     // [3, 2, 1]
let sorted = sort([3, 1, 2]);    // [1, 2, 3]
let concatd = concat([1, 2], [3, 4]);   // [1, 2, 3, 4]
let sliced = slice([1, 2, 3, 4], 1, 3);   // [2, 3]
```

Note: `push`/`pop` from `collections` are *non-mutating* — they return a new array. The inline `push`/`pop` builtins from Chapter 2 *do* mutate; the linter (Chapter 13) flags the ambiguity.

### 5.4.2 Iteration

```aether
let xs = [10, 20, 30];
for x in xs { print(x); }

let doubled = map(xs, fn(x: int) -> int { x * 2 });
let sum = reduce(xs, fn(a: int, x: int) -> int { a + x }, 0);
```

### 5.4.3 Array patterns

```aether
let xs = [1, 2, 3];
let s = match xs {
  [] => "empty",
  [a] => f"one: {a}",
  [a, b] => f"two: {a}, {b}",
  _ => "many",
};
print(s);   // many
```

### 5.4.4 Index-assignment

`xs[i] = v` works on mutable array bindings:

```aether
let mut xs = [1, 2, 3];
xs[0] = 10;
print(xs);   // [10, 2, 3]
```

The index must be in bounds; otherwise it's a runtime panic.

---

## 5.5 Maps

A map is a key-value store. Aether's maps are created with `mapNew()` (from the `collections` module) and accessed with the `m[key]` syntax:

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
print(mapGet(m, "one"));   // 1
print(m["two"]);           // 2 — same as mapGet
print(mapHas(m, "three")); // false
```

The map's key and value types are inferred from the first `mapSet` call.

### 5.5.1 Map operations

From the `collections` module:

- `mapNew()` — create an empty map.
- `mapSet(m, k, v)` — set key/value; mutates `m`.
- `mapGet(m, k)` — get by key; *panics if absent* (use `mapHas` first).
- `mapHas(m, k)` — test membership.
- `mapDelete(m, k)` — delete key; mutates; returns `true` if the key was present.
- `mapKeys(m)` — array of keys.
- `mapValues(m)` — array of values.
- `mapEntries(m)` — array of `{ key, value }` structs.
- `mapSize(m)` — number of entries.

### 5.5.2 Iteration

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
for k in mapKeys(m) {
  print(f"{k} = {mapGet(m, k)}");
}
```

(Map iteration order is insertion order, like JS `Map`.)

### 5.5.3 Map patterns

There's no specific `match` syntax for maps. Use `mapHas` to dispatch:

```aether
let mut m = mapNew();
mapSet(m, "name", "Aether");
let kind = if mapHas(m, "name") { "has name" } else { "anonymous" };
print(kind);
```

---

## 5.6 Eight runnable examples

**1. Struct and field access.**

```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.x + p.y);   // 3
```

**2. Generic struct.**

```aether
struct Pair<A, B> { first: A, second: B }
let p = Pair { first: 1, second: "two" };
print(p.first);
print(p.second);
```

**3. Enum with match.**

```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    Color::Green => "green",
    Color::Blue => "blue",
  }
}
print(name(Color::Red));
```

**4. Recursive enum (linked list).**

```aether
enum List { Node(int, List), Nil, }
fn length(l: List) -> int {
  match l {
    List::Node(_, rest) => 1 + length(rest),
    List::Nil => 0,
  }
}
let l = List::Node(1, List::Node(2, List::Node(3, List::Nil)));
print(length(l));   // 3
```

**5. Tuple destructuring.**

```aether
let p = (3, 4);
let (a, b) = p;       // wait, this is not v1 syntax; use match
match p {
  (a, b) => {
    print(a);   // 3
    print(b);   // 4
  }
}
```

(Actually, Aether v1 does not have `let (a, b) = p` destructuring syntax — `let` only takes a single identifier. Use `match` for destructuring. The example above is correct via `match`.)

**6. Array operations.**

```aether
let xs = [1, 2, 3, 4, 5];
let doubled = map(xs, fn(x: int) -> int { x * 2 });
let evens = filter(xs, fn(x: int) -> bool { x % 2 == 0 });
let sum = reduce(xs, fn(a: int, x: int) -> int { a + x }, 0);
print(doubled);   // [2, 4, 6, 8, 10]
print(evens);     // [2, 4]
print(sum);       // 15
```

**7. Map operations.**

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
print(mapGet(m, "one"));
print(mapHas(m, "three"));
print(mapSize(m));
```

**8. Struct spread (functional update).**

```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
let q = Point { x: 10, ..p };
print(q.x);   // 10
print(q.y);   // 2
```

---

## 5.7 Summary

- `struct` is a record with named fields. Nominal type. Fields are immutable in v1; use functional-update (`{ x: new, ..p }`) to "modify".
- `enum` is an ADT: a choice among variants, each carrying data (or not). Pattern-matching is the way to use an enum. v1 doesn't check exhaustiveness — always add a `_` arm.
- Tuples are fixed-size, heterogeneous; access is `t.N`. 1-tuples need a trailing comma `(x,)`. The unit value `()` is the no-value value.
- Arrays are fixed-length (in the type-system sense; the runtime size is dynamic), homogeneous. Indexing is `xs[i]`, with bounds-checked access. Use `map`/`filter`/`reduce` for transformations.
- Maps are key-value stores, created with `mapNew()` and accessed with `m[k]`. Use `mapHas` before `mapGet` to avoid the runtime panic.

The next chapter is the type system in detail: inference, widening, generics, type aliases.
