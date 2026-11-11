# Types and generics

> Audience: you've read [language-basics.md](language-basics.md); you want the type system in depth.
> Time: ~60 minutes. Every example is runnable.

This tutorial covers the entire Aether type system: the built-in primitives, compound types (tuples, arrays, maps), nominal types (enums and structs), the `Option` and `Result` standard enums, generics, type inference, numeric widening, type aliases, and pattern matching on every kind of type.

The goal is that after this file, you can read the type of any expression in your head, predict whether an assignment will type-check, and write a generic function from scratch.

---

## 1. The type system in one paragraph

Aether is *statically typed* with *nominal* user types (enums, structs) and *structural* built-in compound types (tuples, arrays, maps, functions). Type inference is bidirectional (a Hindley–Milner-ish Algorithm W with a fresh type variable per generic parameter per call site; see `aether/core/sema/sema.ts` for the details). `int` widens to `float` (and `Never` is a subtype of everything). There is no inheritance, no subtyping beyond widening, and no trait resolution in v1 (constraints are recorded but not enforced — see [ADR-02 nominal types, structural functions](../decisions/adr-02-nominal-types-structural-functions.md)). Match arms are not checked for exhaustiveness in v1 — that's a runtime panic if a case falls through.

---

## 2. The primitive types

| Type     | Values                              | Notes                                              |
|----------|-------------------------------------|----------------------------------------------------|
| `int`    | integers, including negatives       | 64-bit. Truncates on `float`-to-`int` cast.        |
| `float`  | IEEE-754 doubles                    |                                                    |
| `bool`   | `true`, `false`                     |                                                    |
| `string` | UTF-16 strings                      | JS `string` under the hood.                        |
| `char`   | single code point                   | Stored as a 1-char `string` at runtime.            |
| `()`     | unit (the empty tuple)              | The type of side-effect-only expressions.          |

Each has a singleton type at the semantic level (`T_INT`, `T_FLOAT`, `T_BOOL`, `T_STRING`, `T_CHAR`, `T_UNIT` in `aether/core/types/types.ts`). They are unequal to each other — `int` and `float` are different types — except that `int` widens to `float` (see §9).

```aether
let i: int = 42;
let f: float = 3.14;
let b: bool = true;
let s: string = "hello";
let c: char = 'a';
let u: () = ();
print(type_of(i));  // int
print(type_of(f));  // float
print(type_of(b));  // bool
print(type_of(s));  // string
print(type_of(c));  // char
print(type_of(u));  // ()
```

`type_of` is an inline builtin that returns the type name as a string. Use it liberally while you're learning.

---

## 3. Function types

A function type is `fn(P1, P2, ...) -> R`. The arguments are positional and named-by-position only (no keyword args in v1).

```aether
let add: fn(int, int) -> int = fn(a: int, b: int) -> int { a + b };
let double: fn(int) -> int = fn(x: int) -> int { x * 2 };

print(add(2, 3));  // 5
print(double(7));  // 14
```

Function types are *structural*: two closures with the same `fn(...) -> ...` signature are interchangeable. A named `fn` declaration produces a closure of the same structural type — there is no nominal distinction at the type level. This is the design decision documented in [ADR-02](../decisions/adr-02-nominal-types-structural-functions.md).

### Higher-order functions

```aether
fn apply_twice(f: fn(int) -> int, x: int) -> int {
  f(f(x))
}

print(apply_twice(fn(x: int) -> int { x + 1 }, 5));  // 7
print(apply_twice(fn(x: int) -> int { x * 2 }, 3));  // 12
```

The `f: fn(int) -> int` parameter accepts any closure with that signature. Calls work normally.

---

## 4. Tuples

A tuple is `(T1, T2, ...)`. Fixed length, heterogeneous, structural.

```aether
let pair: (int, string) = (42, "aether");
let triple: (int, float, bool) = (1, 2.0, true);

print(pair.0);     // 42 — tuple field access
print(pair.1);     // aether
print(triple.1);   // 2.0
```

Field access is `.N` where N is a non-negative integer literal. The parser has a special `TupleField` AST node for this — it's distinct from the `Field` node used for struct field access, because the type checker handles them differently. `pair.0` is a `TupleField` with `index = 0`; `pair[0]` is an `Index` and also works, but the type checker reports different error messages for the two forms (`tuple index 0 out of bounds (length 2)` for `Index`, `tuple field .5 out of bounds (length 2)` for `TupleField`).

### Destructuring

```aether
let (a, b) = pair;
print(a);  // 42
print(b);  // aether

let (x, y, z) = triple;
print(z);  // true
```

Tuple destructuring in `let` works; the right-hand side has to be a tuple-typed expression. Patterns can be nested (see §13).

### Unit and one-tuples

`()` is the unit value and the unit type — the empty tuple. There is no one-tuple in Aether: `(x)` is just `x` parenthesized. (Compare Rust, which uses `(x,)` for one-tuples — Aether does not.)

---

## 5. Arrays

An array is `[T]` — homogeneous, variable length, indexed by `int`.

```aether
let empty: [int] = [];
let nums = [1, 2, 3, 4, 5];
let pairs: [(int, int)] = [(1, 2), (3, 4)];

print(nums[0]);    // 1
print(len(nums));  // 5

for n in nums { print(n); }   // 1 2 3 4 5
```

The element type is uniform across the array; the type checker infers it from the initializer. `let mixed = [1, "two", 3.0];` is a type error (`cannot unify int with string` at element-position 1).

### Indexing

```aether
let xs = [10, 20, 30];
print(xs[0]);  // 10
print(xs[2]);  // 30
// print(xs[3]); // panic: array index out of bounds: 3
// print(xs[-1]); // panic — array index must be int (well, -1 IS int, but negative panics)
```

Indexing by a non-`int` is a type error: `array index must be int, found string`. Out-of-bounds is a runtime panic, not a type error — the type checker doesn't track array length (no dependent types in v1).

### Index assignment

```aether
let mut xs = [1, 2, 3];
xs[0] = 99;
print(xs);   // [99, 2, 3]
```

Index assignment requires the binding to be `mut`. The element type has to match: `xs[0] = "string"` would fail with `cannot assign string to int`.

### Nested arrays

```aether
let grid: [[int]] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
print(grid[1][2]);  // 6
```

Arrays of arrays work as expected; the element type of an outer array is the inner array's type.

---

## 6. Maps

A map is `map[K]V` — keyed, heterogeneous-by-typing (all keys share type `K`, all values share type `V`).

In v1, there's no map literal — the parser's `{` is reserved for blocks and structs. Maps are built with the stdlib `mapNew`, `mapSet`, `mapGet`, `mapHas`, `mapDelete`, `mapKeys`, `mapValues`, `mapEntries`, `mapSize` functions:

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
mapSet(m, "two", 2);
mapSet(m, "three", 3);

print(mapGet(m, "one"));    // 1
print(mapHas(m, "two"));    // true
print(mapSize(m));          // 3

let keys = mapKeys(m);
print(keys);  // ["one", "two", "three"]
```

Map literal syntax is on the v2 list — see [RFC-003 modules and packages](../rfcs/rfc-003-modules-and-packages.md).

### Indexing maps

Aether v1 also supports `m[key]` syntax for map access (the evaluator handles it as `Index` on a `Map` value), but the type checker in v1 doesn't have a way to refer to a `map[K]V` annotation explicitly through the standard parser — you mostly access maps via `mapGet`. The full discussion is in the [stdlib tour](stdlib-tour.md) § collections.

---

## 7. Enums (algebraic data types)

Enums are Aether's nominal product/sum type. Each variant is one of three kinds:

- **Unit**: `Red,` — no data.
- **Tuple**: `Some(T),` — positional data.
- **Struct**: `Point { x: int, y: int },` — named fields.

```aether
enum Color {
  Red,
  Green,
  Blue,
}

enum Option<T> {
  Some(T),
  None,
}

enum Shape {
  Circle(float),
  Rect(float, float),
  Square(float),
}

enum Event {
  Key(char),
  Click(int, int),
  Quit,
}
```

Each variant is referred to as `EnumName::Variant`. `Color::Red` is a unit variant value; `Option::Some(42)` constructs a `Some` carrying an `int`. The compiler infers the enum's generic arguments from the payload.

### Constructing variants

```aether
let red = Color::Red;
let some_int = Option::Some(42);
let some_str = Option::Some("hello");
let rect = Shape::Rect(3.0, 4.0);
let quit = Event::Quit;
let click = Event::Click(10, 20);

print(type_of(red));       // enum Color
print(type_of(some_int)); // option<int>
print(type_of(some_str)); // option<string>
print(type_of(rect));     // enum Shape
print(type_of(quit));     // enum Event
print(type_of(click));    // enum Event
```

### Recursive enums

An enum variant can refer to the enum itself, which is how you build linked lists and trees:

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

print(length(l));  // 3
```

This is the example from `examples/linked_list.ae`. Note that `Nil` is a unit variant (no payload) and `Node(int, List)` is a tuple variant carrying an `int` and a `List`. The `length` function pattern-matches on the two variants; the wildcard `_` ignores the int payload.

### Struct variants

```aether
enum Point3 {
  Cartesian { x: float, y: float, z: float },
  Spherical { r: float, theta: float, phi: float },
}

fn x_coord(p: Point3) -> float {
  match p {
    Point3::Cartesian { x, y: y_, z: z_ } => x,
    Point3::Spherical { r, theta, phi }   => r * math.sin(theta) * math.cos(phi),
  }
}
```

Struct variants are matched with `{ field: pattern, ... }` syntax. The field pattern can be a binding (`x` binds to the field's value), a literal (`1`), or a wildcard (`_`). Field order doesn't matter in the pattern.

### Generic enums

```aether
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }
enum Either<L, R> { Left(L), Right(R), }

let some_int = Option::Some(42);
let ok_str = Result::Ok("hello");
let either = Either::Left(42);
```

Multiple type parameters: `<T, E>`. The compiler instantiates them at the construction site from the payload types.

### Type aliases

```aether
type Age = int;
type Point = (int, int);
type IntResult = result<int, string>;
type IntList = Option<[int]>;

let a: Age = 42;
let p: Point = (3, 4);
let r: IntResult = Result::Ok(42);
let l: IntList = Option::Some([1, 2, 3]);

print(type_of(a)); // int  — type aliases are erased
print(type_of(p)); // (int, int)
print(type_of(r)); // result<int, string>
print(type_of(l)); // option<[int]>
```

`type Name = T;` creates a *transparent* alias — `Age` and `int` are interchangeable everywhere. `type_of` reports the underlying type, not the alias name (because the evaluator doesn't know about aliases). Aliases are useful for readability and for shortening long signatures.

---

## 8. Structs

A struct is a nominal record with named fields:

```aether
struct Point { x: int, y: int }
struct Person { name: string, age: int, admin: bool }
struct Box<T> { value: T }

let p = Point { x: 3, y: 4 };
let ada = Person { name: "Ada", age: 36, admin: true };
let b = Box { value: 42 };

print(p.x);    // 3
print(p.y);    // 4
print(ada.name); // Ada
print(ada.age);  // 36
print(b.value);  // 42
```

Construction looks like `Name { field: value, ... }`. Field order doesn't matter — `Point { y: 4, x: 3 }` works too. The type checker enforces that you provide every required field:

```aether
let p = Point { x: 3 };   // ERROR: missing field 'y' in struct Point
```

### Generic structs

```aether
struct Box<T> { value: T }
struct Pair<A, B> { first: A, second: B }

let b = Box { value: 42 };           // Box<int>
let p = Pair { first: 1, second: "two" }; // Pair<int, string>

print(b.value);  // 42
print(p.first);  // 1
```

### Field access on structs

```aether
let p = Point { x: 3, y: 4 };
print(p.x);  // 3 — field access
// print(p.z); // ERROR: struct Point has no field 'z'
```

Field access on a struct value uses the `Field` AST node. The type checker looks up the field in the struct's declaration and rejects unknown fields with `struct Point has no field 'z'`.

### Struct spread

```aether
let p1 = Point { x: 3, y: 4 };
let p2 = Point { x: 10, ..p1 };   // x: 10, y: 4 (from p1)
print(p2.x);  // 10
print(p2.y);  // 4
```

`..p1` in a struct literal copies the fields from `p1` that aren't explicitly listed. In v1 the type checker handles this; the spread is implemented by the `StructExpr.spread` field in the AST. Spread is only supported on struct literals (not enum variants or arrays), and only at the end of the field list.

### Mutation? No — v1 structs are immutable

```aether
let mut p = Point { x: 3, y: 4 };
// p.x = 99;  // ERROR — field assignment is not supported in v1
p = Point { x: 99, y: p.y };  // reassign the whole binding
print(p.x);  // 99
```

Struct field assignment (`p.x = 99`) is not supported in v1. You reassign the binding with a new struct value (with spread if you want to keep some fields). The v2 plan, [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md), includes field mutation with ownership tracking. See [ownership.md](ownership.md) for the v1/v2 story.

---

## 9. Numeric widening

`int` widens to `float` automatically. The reverse does *not* happen — `float` does not narrow to `int`.

```aether
let i: int = 42;
let f: float = i;   // OK — int widens to float
print(f);           // 42

let g: float = 7;
print(g);           // 7 — int literal widens to float

// let j: int = 3.14; // ERROR — float doesn't narrow to int
let k: int = 3.14 as int;  // explicit cast, truncates
print(k);           // 3
```

This is implemented in `isSubtype` in `aether/core/types/types.ts`:

```ts
if (aR.kind === "Int" && bR.kind === "Float") return true;
```

Widening is also applied recursively through compound types — `option<int>` widens to `option<float>`, `[int]` widens to `[float]`, `(int, int)` widens to `(int, float)` and to `(float, int)`.

```aether
let xs: [float] = [1, 2, 3];   // OK — [int] widens to [float]
let some_f: option<float> = Option::Some(42);  // OK — option<int> widens to option<float>
```

### The asymmetry

Why does `int` widen to `float` but not the other way? Because widening is *lossless*: every `int` is exactly representable as a `float` (within 53 bits of precision). Narrowing `float` to `int` would lose the fractional part, so the language forces you to do it explicitly with `as int`. This matches Rust, C#, and TypeScript (where `number` is unified but Aether keeps them split).

---

## 10. `Option` and `Result`

The two standard enums you'll use most.

### `Option<T>`

```aether
enum Option<T> { Some(T), None, }

fn find_first(xs: [int], target: int) -> Option<int> {
  let mut i = 0;
  while i < len(xs) {
    if xs[i] == target {
      return Option::Some(i);
    }
    i = i + 1;
  }
  Option::None
}

match find_first([1, 2, 3], 2) {
  Option::Some(i) => print(f"found at {i}"),
  Option::None => print("not found"),
}
```

`Option<T>` represents "maybe a T". `Some(v)` carries a value; `None` is the absence. Use it where you'd use `null` in TypeScript or `None` in Python. The type system forces you to handle the `None` case (or to propagate it; see §11).

### `Result<T, E>`

```aether
enum Result<T, E> { Ok(T), Err(E), }

fn parse_int(s: string) -> result<int, string> {
  // imagine a real implementation
  if s == "42" {
    Result::Ok(42)
  } else {
    Result::Err(f"not a number: {s}")
  }
}

match parse_int("42") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),
}
```

`Result<T, E>` represents "either a T or an E". `Ok(v)` carries the success; `Err(e)` carries the error. Use it for fallible operations where the error is meaningful. See [error-handling.md](error-handling.md) for the full pattern.

### Why two enums?

`Option` is for absence (`null`-replacement). `Result` is for fallibility (error-replacement). Using `Option` for errors loses the error information; using `Result` for absence forces you to invent an "error" for "no value". Aether follows Rust/OCaml/Haskell in keeping them separate.

---

## 11. The `?` operator

Postfix `?` on an `Option<T>` or `Result<T, E>` either unwraps the value or propagates the error.

```aether
fn parse_and_double(s: string) -> result<int, string> {
  let n = parse_int(s)?;     // unwrap Ok, propagate Err
  Result::Ok(n * 2)
}

match parse_and_double("42") {
  Result::Ok(n)  => print(f"got {n}"),     // got 84
  Result::Err(e) => print(f"error: {e}"),
}

match parse_and_double("hello") {
  Result::Ok(n)  => print(f"got {n}"),
  Result::Err(e) => print(f"error: {e}"),  // error: not a number: hello
}
```

`expr?` desugars to "match on `expr` — if `Ok(v)`/`Some(v)`, evaluate to `v`; if `Err(e)`/`None`, `return Err(e)`/`return None` from the enclosing function". The return type of the enclosing function must be a compatible `Result`/`Option`.

Applying `?` to a non-Option/Result is a type error:

```aether
let x = 42?;   // ERROR: ? operator can only be applied to Result or Option, found int
```

See [error-handling.md](error-handling.md) for the full pattern and the propagation rules.

---

## 12. Generics

### Generic functions

```aether
fn id<T>(x: T) -> T { x }
fn first<T>(xs: [T], default: T) -> T {
  if len(xs) == 0 { default } else { xs[0] }
}
fn unwrap<T>(o: Option<T>, default: T) -> T {
  match o {
    Option::Some(v) => v,
    Option::None => default,
  }
}

print(id(42));              // 42 — T = int
print(id("hello"));         // hello — T = string
print(first([1, 2, 3], 0)); // 1
print(first([], 0));        // 0
print(unwrap(Option::Some(42), 0));   // 42
print(unwrap(Option::None, 0));       // 0
```

`<T>` introduces a type parameter. At each call site, the compiler infers `T` from the argument types — `id(42)` instantiates `T = int`. You can also specify the type argument explicitly: `id<int>(42)` works. Multiple type parameters: `<T, E>`. With constraints: `<T: Ord>` (recorded but not enforced in v1 — see [ADR-02](../decisions/adr-02-nominal-types-structural-functions.md)).

### Generic enums and structs

We covered these in §7 and §8. The type parameters are introduced after the type name: `enum Option<T>`, `struct Box<T>`, `enum Result<T, E>`, `struct Pair<A, B>`. The compiler infers them at construction from the payloads/fields.

### Generic instantiation

Aether v1 uses *fresh-type-var-per-call-site* instantiation: each call to a generic function gets a fresh `TypeVar` per type parameter, and Algorithm W unifies them with the argument types. The implementation is in `aether/core/sema/sema.ts` (`checkCall` / `instantiateFn`). This means:

```aether
fn id<T>(x: T) -> T { x }
let a = id(42);     // T = int — a: int
let b = id("hi");   // T = string — b: string
let c = id(true);   // T = bool — c: bool
```

Each call independently instantiates `T`. The same `id` is reused; no monomorphization happens at compile time (the evaluator doesn't even know about generics — they're erased at runtime). v1 has no *let-polymorphism* — `let f = id` makes `f` monomorphic (you can't then use `f(42)` and `f("hi")` in the same program), because the let-binding is generalized to a single type at its first use. See [ADR-02](../decisions/adr-02-nominal-types-structural-functions.md) for the design discussion.

### Trait constraints (recorded, not enforced)

```aether
fn max<T: Ord>(a: T, b: T) -> T {
  if a < b { b } else { a }
}

print(max(2, 3));     // 3 — int implements Ord
print(max("a", "b")); // b — string implements Ord
// print(max(true, false)); // would compile in v1 (constraint not enforced)
```

`<T: Ord>` records the constraint `T: Ord` in the function's signature, but the v1 type checker doesn't *enforce* it — `max(true, false)` would compile (and fail at runtime with `operator '<' not defined for bool and bool` if `Ord` isn't defined for `bool`). v2 will enforce traits properly; see [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md) and [ADR-02](../decisions/adr-02-nominal-types-structural-functions.md).

---

## 13. Pattern matching

`match` is the workhorse for working with enums, tuples, structs, and literals.

### On enums

```aether
fn describe(o: Option<int>) -> string {
  match o {
    Option::Some(n) => f"got {n}",
    Option::None => "nothing",
  }
}

print(describe(Option::Some(42)));  // got 42
print(describe(Option::None));      // nothing
```

Patterns can bind variables (the `n` in `Some(n)`), use wildcards (`_`), nest.

### With guards

```aether
fn classify(n: int) -> string {
  match n {
    x if x < 0 => "negative",
    0 => "zero",
    x if x < 10 => "small",
    _ => "large",
  }
}

print(classify(-5));  // negative
print(classify(0));   // zero
print(classify(5));   // small
print(classify(100)); // large
```

A guard is `pattern if cond => arm`. The guard is evaluated *after* the pattern matches; if the guard is false, the next arm is tried. The guard must be `bool` (else `match guard must be bool`).

### On tuples

```aether
fn describe(p: (int, int)) -> string {
  match p {
    (0, 0) => "origin",
    (x, 0) => f"on x-axis at {x}",
    (0, y) => f"on y-axis at {y}",
    (x, y) => f"point ({x}, {y})",
  }
}

print(describe((0, 0))); // origin
print(describe((3, 0))); // on x-axis at 3
print(describe((2, 5))); // point (2, 5)
```

Tuple patterns must match arity: `match (1, 2) { (a, b, c) => ... }` is a type error: `tuple pattern arity 3 does not match 2`.

### On structs

```aether
struct Point { x: int, y: int }

fn on_x_axis(p: Point) -> bool {
  match p {
    Point { x: _, y: 0 } => true,
    Point { x: _, y: _ } => false,
  }
}

print(on_x_axis(Point { x: 5, y: 0 }));  // true
print(on_x_axis(Point { x: 5, y: 9 }));  // false
```

Struct patterns use `Name { field: pattern, ... }`. The field pattern can be a binding, a literal, or a wildcard. Field order doesn't matter; missing fields are an error (`struct Point has no field 'z'`).

### On arrays (limited)

```aether
match [1, 2, 3] {
  [a] => print(f"one element: {a}"),
  [a, b] => print(f"two: {a}, {b}"),
  [a, b, c] => print(f"three: {a}, {b}, {c}"),
  _ => print("many"),
}
```

Array patterns match by length — the pattern must have the same number of elements as the array. There's no `..` rest syntax in v1 array patterns.

### On literals

```aether
fn day_name(n: int) -> string {
  match n {
    0 => "Sunday",
    1 => "Monday",
    2 => "Tuesday",
    3 => "Wednesday",
    4 => "Thursday",
    5 => "Friday",
    6 => "Saturday",
    _ => "unknown",
  }
}

print(day_name(2));  // Tuesday
print(day_name(99)); // unknown
```

Literal patterns work for `int`, `float`, `bool`, `char`, `string`. The wildcard `_` matches anything.

### Exhaustiveness — a v1 caveat

v1 does *not* check exhaustiveness. The following compiles:

```aether
enum Color { Red, Green, Blue, }

fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
  }
}

print(name(Color::Green));
```

But at runtime it panics: `no match arm matched`. The fix is to add the missing arms or a wildcard. v2 will enforce exhaustiveness (see [RFC-004 borrow checker](../rfcs/rfc-004-borrow-checker.md) — exhaustiveness checking is part of the borrow checker's flow analysis).

### Wildcards and `as`-bindings

```aether
match o {
  Option::Some(n) => print(f"got {n}"),
  _ => print("none"),
}

match pair {
  (a, b) => print(f"{a}, {b}"),
  _ => print("not a pair"),  // unreachable but allowed
}
```

`_` is the wildcard pattern. There's no `pattern @ name` binding syntax in v1 — you bind the value, you don't bind the pattern. (That's a v2 list item.)

---

## 14. Type inference

Aether uses bidirectional type inference (an Algorithm-W-style Hindley–Milner-ish system — see `aether/core/sema/sema.ts`). The compiler infers:

- The type of every binding from its initializer.
- The type of every expression bottom-up.
- Generic parameters at call sites, top-down from argument types.
- The common type of `match` arms by pairwise unification.
- The return type of a function from its body's trailing expression and `return` statements.

### What gets inferred

```aether
let x = 42;              // int
let y = "hello";         // string
let z = [1, 2, 3];       // [int]
let pair = (1, "two");   // (int, string)
let f = fn(a: int) -> int { a + 1 };  // fn(int) -> int (parameter types are explicit)

let doubled = map([1, 2, 3], fn(x: int) -> int { x * 2 });
// doubled: [int]

let n = first([1, 2, 3], 0);   // n: int — T = int inferred from [int]
```

### What does *not* get inferred

- Lambda parameter types. `fn(x) -> int { x * 2 }` is a type error — write `fn(x: int) -> int { x * 2 }`. See [RFC-005 LSP](../rfcs/rfc-005-lsp.md) for the v2 plan to infer them.
- Function return types. You must write `-> int` on every `fn` declaration. (Body-only return type inference is on the v2 list.)
- Generic let-bindings. `let f = id` is monomorphic — you can't then use `f(42)` and `f("hi")` in the same program. (v1 has no let-polymorphism; see [ADR-02](../decisions/adr-02-nominal-types-structural-functions.md).)

### Inferring `match` arm types

```aether
let x = match n {
  0 => "zero",
  _ => "nonzero",
};
// x: string — arms unify
```

The compiler unifies the arm body types pairwise to find the common type. If they don't unify, you get a `cannot unify ... with ...` error.

---

## 15. A worked example — a tiny expression evaluator

Putting it all together: a small arithmetic expression evaluator using generic `Result`, pattern matching on a recursive enum, the `?` operator, and `match` arm type inference.

```aether
enum Expr {
  Num(float),
  Add(Expr, Expr),
  Mul(Expr, Expr),
  Neg(Expr),
}

fn eval(e: Expr) -> float {
  match e {
    Expr::Num(n)    => n,
    Expr::Add(a, b) => eval(a) + eval(b),
    Expr::Mul(a, b) => eval(a) * eval(b),
    Expr::Neg(a)    => -eval(a),
  }
}

let expr = Expr::Add(
  Expr::Mul(Expr::Num(2.0), Expr::Num(3.0)),
  Expr::Neg(Expr::Num(4.0)),
);
print(eval(expr));  // 2.0
```

That's `2 * 3 + (-4) = 6 + (-4) = 2`. The `match` arms each evaluate to `float`; the compiler infers the common type. The recursive `enum Expr` references itself in its own variants. The closures `eval(a)` and `eval(b)` recurse through the tree.

This pattern — a recursive enum, a `match` that recurses on each variant — is the bread and butter of Aether (and Rust, and OCaml, and Haskell). You'll see it everywhere.

---

## 16. What's next

- [error-handling.md](error-handling.md) — `Result<T, E>`, the `?` operator, panic vs. error.
- [ownership.md](ownership.md) — honest about v1 (GC, immutability) and v2 (borrow checker).
- [stdlib-tour.md](stdlib-tour.md) — the stdlib modules.
- [reference/glossary.md](../reference/glossary.md) — every type-system term defined.
- [reference/error-catalog.md](../reference/error-catalog.md) — type errors decoded.
- [decisions/adr-02-nominal-types-structural-functions.md](../decisions/adr-02-nominal-types-structural-functions.md) — the design rationale for nominal user types and structural function types.

If you want a longer worked example using every construct in this tutorial, `examples/json_parser.ae` in the playground's Examples view is a 350-line recursive-descent JSON parser built around a 6-variant enum `JV` and pattern-matched accessors.
