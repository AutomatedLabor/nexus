# Chapter 6 — Types and generics

> Aether's type system is Hindley-Milner-flavored with explicit annotations, generic instantiation at the call site, and a numeric widening rule. This chapter covers the primitive types, the composite types, generic functions and types, type inference, numeric widening, and type aliases.

---

## 6.1 Primitive types

Aether has six *primitive* types:

| Type     | Literal examples                       | Notes                                                |
|----------|----------------------------------------|------------------------------------------------------|
| `int`    | `42`, `0x2A`, `0o755`, `0b1010`        | Host JS number. Integer operations truncate.         |
| `float`  | `3.14`, `6.022e23`, `1.0`              | IEEE-754 double.                                     |
| `bool`   | `true`, `false`                        | Only these two. Truth is restricted to `bool`.       |
| `string` | `"hello"`, `f"x = {x}"`                | UTF-16 internally; Unicode-aware in `string` module.|
| `char`   | `'a'`, `' '`, `'\n'`                   | Single UTF-16 code unit.                             |
| `unit`   | `()`                                   | The no-value value.                                  |

Each primitive has a unique identity: `int` is not `float`, `bool` is not `int`, etc. The compiler does not coerce between them except for the numeric widening rule (§6.5).

### 6.1.1 Numeric literals

Integers can be decimal, hex, octal, or binary:

```aether
let a = 42;
let b = 0x2A;     // 42
let c = 0o755;    // 493
let d = 0b1010;   // 10
```

Floats must have a `.` or an `e`:

```aether
let a = 3.14;
let b = 6.022e23;
let c = 1.0;       // not 1 — that's an int
let d = 1.;        // also valid float — trailing dot
```

The lexer reports `invalid number literal 'X'` for malformed literals like `3.14.15` or `0xGH`.

### 6.1.2 The unit value

`()` is the unit value. Functions that don't return a useful value return `()`. The `print` builtin returns `()`. A block whose last statement is a statement (not an expression) yields `()`.

```aether
fn greet(name: string) -> () {
  print(f"Hello, {name}!");
}
let r = greet("Aether");
print(r);     // ()
print(type_of(r));   // unit (or similar — type_of returns a string)
```

---

## 6.2 Composite types

### 6.2.1 Tuples

The type is `(T1, T2, ...)`:

```aether
let p: (int, string) = (1, "one");
let q: (int, int, int) = (1, 2, 3);
let unit: () = ();
```

The arity is part of the type: `(int, int)` and `(int, int, int)` are different types. The 0-tuple `()` is the unit type.

### 6.2.2 Arrays

The type is `[T]` — a single-element type wrapped in brackets:

```aether
let xs: [int] = [1, 2, 3];
let ys: [string] = ["a", "b"];
let zs: [(int, int)] = [(1, 2), (3, 4)];
```

The element type is the type of all elements. Aether's arrays are *homogeneous*: `[1, "two"]` is a type error (`cannot unify int with string`).

### 6.2.3 Maps

Maps are created with `mapNew()` and have *inferred* key/value types:

```aether
let mut m = mapNew();
mapSet(m, "one", 1);
// m's type is inferred as map<string, int>
```

The `map` type is not directly writable in a type annotation in v1 — you have to use the `mapNew`/`mapSet` pattern. v2.x will likely add `map<K, V>` syntax.

### 6.2.4 Function types

Function types are written `fn(A, B) -> C`:

```aether
let f: fn(int) -> int = fn(x: int) -> int { x + 1 };
let g: fn(int, int) -> int = fn(a: int, b: int) -> int { a + b };
let h: fn(int) -> fn(int) -> int = fn(x: int) -> fn(int) -> int {
  fn(y: int) -> int { x + y }
};
```

Function types are *structural*: two closures with the same parameter and return types have the same type.

### 6.2.5 Enums and structs

```aether
enum Color { Red, Green, Blue, }
struct Point { x: int, y: int }

let c: Color = Color::Red;
let p: Point = Point { x: 1, y: 2 };
```

These are *nominal* — the name is part of the type. See ADR-02.

### 6.2.6 `option<T>` and `result<T, E>`

These are built-in generic enums:

```aether
let o: option<int> = Option::Some(42);
let r: result<int, string> = Result::Ok(42);
let e: result<int, string> = Result::Err("bad");
```

`option<T>` is shorthand for `Option<T>` (the enum). `result<T, E>` is shorthand for `Result<T, E>`. The lower-case and upper-case forms are interchangeable in type annotations.

---

## 6.3 Generic functions

```aether
fn id<T>(x: T) -> T { x }
fn first<T>(xs: [T]) -> option<T> {
  if len(xs) > 0 { Option::Some(xs[0]) } else { Option::None }
}
fn pair<A, B>(a: A, b: B) -> (A, B) { (a, b) }
```

Type parameters are listed in `<...>` after the function name. They're scoped to the function. The type checker *infers* them at the call site from the argument types:

```aether
let x = id(42);            // T = int, x : int
let y = id("hello");       // T = string, y : string
let z = id(3.14);          // T = float, z : float

let f = first([1, 2, 3]);  // T = int, f : option<int>
let g = first([]);          // T = ?, g : option<?>
                            // (the type variable stays open for `g`)
```

For an empty array `[]`, the element type is a fresh type variable. Subsequent uses of `g` constrain it. (Aether's inference is *not* bidirectional across statements, but it does propagate within a single expression.)

### 6.3.1 Explicit type arguments

You can specify the type arguments explicitly:

```aether
let x = id<int>(42);
let f = first<int>([1, 2, 3]);
```

This is rarely necessary; the inference handles the common cases.

### 6.3.2 Multiple type parameters

```aether
fn pair<A, B>(a: A, b: B) -> (A, B) { (a, b) }
fn make_result<T, E>(ok: T) -> result<T, E> { Result::Ok(ok) }

let p = pair(1, "two");   // (int, string)
let r = make_result<int, string>(42);   // result<int, string>
```

`make_result` is a contrived example — `E` is unconstrained, so the type checker leaves it as a free variable. (In practice, the context where the result is used constrains `E`.)

---

## 6.4 Generic types

`struct` and `enum` can be generic:

```aether
struct Pair<A, B> { first: A, second: B }
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }
enum Either<L, R> { Left(L), Right(R), }
```

The type parameters are part of the type:

```aether
let p: Pair<int, string> = Pair { first: 1, second: "two" };
let o: Option<int> = Option::Some(42);
let e: Either<int, string> = Either::Left(42);
```

### 6.4.1 Generic struct construction

The type parameters are inferred from the field values:

```aether
let p = Pair { first: 1, second: "two" };   // Pair<int, string>
let q = Pair { first: 1.0, second: 2.0 };    // Pair<float, float>
```

### 6.4.2 Generic enum construction

```aether
let o = Option::Some(42);   // Option<int>
let r = Result::Ok(42);      // Result<int, ?>
let e = Result::Err("bad");   // Result<?, string>
```

The `Result` example shows that *one* type parameter can be undetermined by the construction. The type checker leaves it as a free variable until a use site constrains it.

### 6.4.3 Recursive generic types

```aether
enum Tree<T> {
  Node(T, Tree<T>, Tree<T>),
  Leaf,
}

let t = Tree::Node(1,
  Tree::Node(2, Tree::Leaf, Tree::Leaf),
  Tree::Node(3, Tree::Leaf, Tree::Leaf),
);   // Tree<int>

fn sum_tree(t: Tree<int>) -> int {
  match t {
    Tree::Node(v, l, r) => v + sum_tree(l) + sum_tree(r),
    Tree::Leaf => 0,
  }
}
print(sum_tree(t));   // 6
```

---

## 6.5 Numeric widening

Aether has *one* automatic coercion: `int` widens to `float`. This means:

- `let f: float = 42;` works (42 widens to 42.0).
- `let n = 42 + 1.0;` works (42 widens; the result is `float`).
- `42 == 42.0` works (42 widens for comparison).
- `let n: int = 3.14;` does *not* work (the reverse, narrowing, requires `as int`).
- `let n = 3.14 as int;` works (explicit cast, truncates to 3).

The widening rule fires:

- In `let` bindings: `let f: float = 42;`.
- In assignment: `let mut f: float = 0.0; f = 42;`.
- In function arguments: `fn f(x: float) -> ...; f(42);`.
- In binary operations: `42 + 1.0` → `float`.
- In comparisons: `42 == 42.0` → `bool`.

The widening rule does *not* fire for:

- Array element types: `[1, 2.0, 3]` is a type error (`cannot unify int with float`). Use `map` to convert: `let xs = map([1, 2, 3], fn(x: int) -> float { x as float });`.
- Tuple element types: same.
- The "outer" type of a generic instantiation: `Option::Some(42)` has type `Option<int>`, not `Option<float>`, even if used in a context expecting the latter. (Generic instantiation is exact; widening happens *after* the generic instantiation.)

### 6.5.1 Explicit casts

The `as` operator converts between types:

```aether
let n: int = 42;
let f: float = n as float;   // int -> float
let m: int = 3.99 as int;     // float -> int (truncates to 3)
let b: bool = ... (no as bool — type error: cannot cast int as bool)
```

The valid casts are:

- `int` ↔ `float` (widening no-op; narrowing truncates).
- `T` → `T` (no-op).

Everything else is a type error: `cannot cast <T> as <U>`. There is no `as bool` from `int` — Aether doesn't have truthiness. There is no `as string` — use `str(x)` (the builtin) instead.

---

## 6.6 Type inference

Aether's inference is a simplified Hindley-Milner with these rules:

1. **`let` bindings:** the type is the type of the initializer. If there's an annotation, the initializer's type must be assignable to the annotation (with widening).
2. **Function parameters:** types are required (no inference for parameter types).
3. **Generic instantiation:** when calling a generic function, fresh type variables are created for each type parameter; they're unified with the argument types; the result is the inferred instantiation.
4. **`if`/`else` arms:** the types of the arms unify to a common type.
5. **`match` arms:** the body types unify pairwise.
6. **No let-polymorphism:** a `let f = id` is monomorphic — `f` has the type that `id` was instantiated at for that one call site. Subsequent calls to `f` with different types are *type errors*. (Aether v1 doesn't generalize let-bound lambdas; v2.x may.)

### 6.6.1 Example: inference in action

```aether
let x = 42;          // int
let y = x + 1;       // int (x is int, 1 is int, + is int+int->int)
let z = x + 1.0;     // float (x widens, 1.0 is float, + is float+float->float)
let s = "hello";      // string
let n = len(s);       // int (len: string -> int)
let m = len([1, 2]);  // int (len: [T] -> int)
```

### 6.6.2 When inference is too weak

Aether's inference is *local* — it doesn't propagate across statements in a way that requires look-ahead. If a type can't be determined locally, the type checker reports an error (rather than deferring):

```aether
let mut xs = [];     // empty array, element type is a fresh type variable
xs[0] = 1;            // wait — index-assign into an empty array panics at runtime
                     // even though the type would unify with int
```

The fix is to annotate:

```aether
let mut xs: [int] = [];
push(xs, 1);          // OK — xs's type is now [int]
```

### 6.6.3 Inferring generic instantiation

```aether
fn id<T>(x: T) -> T { x }
let x = id(42);       // T = int
let y = id(x);        // T = int (x is int)
let z = id(id(42));   // T = int (the inner id instantiates T = int; the outer also T = int)
```

### 6.6.4 Unification failures

When two types don't unify, the type checker reports `cannot unify <T> with <U>`:

```aether
// Type error: cannot unify int with string
// let x = if true { 1 } else { "two" };
```

The fix is to make both arms the same type:

```aether
let x = if true { 1 } else { 2 };           // both int
let y = if true { "a" } else { "b" };       // both string
let z = if true { 1 } else { 0 };           // both int (with widening)
```

---

## 6.7 Type aliases

Aether supports `type` aliases:

```aether
type IntPair = (int, int);
type IntFn = fn(int) -> int;
type StringList = [string];

let p: IntPair = (1, 2);
let f: IntFn = fn(x: int) -> int { x + 1 };
let xs: StringList = ["a", "b"];
```

Type aliases are *transparent* — they don't create a new type, just a new name. `IntPair` and `(int, int)` are the same type. (Contrast with `struct`, which is nominal.)

### 6.7.1 Generic aliases

```aether
type Pair<A, B> = (A, B);
type IntResult<T> = result<T, int>;

let p: Pair<int, string> = (1, "two");
let r: IntResult<bool> = Result::Ok(true);   // result<bool, int>
```

---

## 6.8 The `option` and `result` types

These are built-in generic enums (defined in the language, not in the stdlib):

```aether
enum Option<T> { Some(T), None, }
enum Result<T, E> { Ok(T), Err(E), }
```

They're used for *optional* and *fallible* values. Chapter 7 covers them in depth. The shorthand `option<T>` (lowercase) is interchangeable with `Option<T>`; same for `result<T, E>` and `Result<T, E>`.

### 6.8.1 Constructing

```aether
let o: option<int> = Option::Some(42);
let n: option<int> = Option::None;
let r: result<int, string> = Result::Ok(42);
let e: result<int, string> = Result::Err("bad");
```

### 6.8.2 Pattern matching

```aether
fn double(o: option<int>) -> int {
  match o {
    Option::Some(v) => v * 2,
    Option::None => 0,
  }
}
fn sqrt_or_zero(r: result<float, string>) -> float {
  match r {
    Result::Ok(x) => sqrt(x),
    Result::Err(_) => 0.0,
  }
}
```

### 6.8.3 The `?` operator

The `?` postfix operator unwraps an `Option` or `Result`, propagating the "failure" to the caller:

```aether
fn parse_int(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("bad") }
}
fn double_parse(s: string) -> result<int, string> {
  let n = parse_int(s)?;   // if Err, return Err; if Ok, n = 42
  Result::Ok(n * 2)
}
print(double_parse("42"));   // Ok(84)
print(double_parse("x"));    // Err("bad")
```

The `?` operator requires the enclosing function to return a `Result` (or `Option`). The error type must unify with the enclosing function's error type. Chapter 7 covers `?` in depth.

---

## 6.9 Eight runnable examples

**1. Numeric widening.**

```aether
let i: int = 42;
let f: float = i;       // int widens to float
print(f);               // 42
```

**2. Explicit cast (narrowing).**

```aether
let f: float = 3.99;
let i: int = f as int;   // truncates to 3
print(i);
```

**3. Generic function with inferred type.**

```aether
fn id<T>(x: T) -> T { x }
let a = id(42);
let b = id("hello");
let c = id(3.14);
print(a);
print(b);
print(c);
```

**4. Generic struct.**

```aether
struct Pair<A, B> { first: A, second: B }
let p = Pair { first: 1, second: "two" };
print(p.first);
print(p.second);
```

**5. Type alias.**

```aether
type IntFn = fn(int) -> int;
let f: IntFn = fn(x: int) -> int { x * x };
print(f(5));   // 25
```

**6. `option<T>` and match.**

```aether
fn double(o: option<int>) -> int {
  match o {
    Option::Some(v) => v * 2,
    Option::None => 0,
  }
}
print(double(Option::Some(21)));
print(double(Option::None));
```

**7. `result<T, E>` with `?`.**

```aether
fn parse(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("bad") }
}
fn dbl(s: string) -> result<int, string> {
  let n = parse(s)?;
  Result::Ok(n * 2)
}
print(dbl("42"));
print(dbl("x"));
```

**8. Recursive generic type.**

```aether
enum Tree<T> { Node(T, Tree<T>, Tree<T>), Leaf, }
fn sum(t: Tree<int>) -> int {
  match t {
    Tree::Node(v, l, r) => v + sum(l) + sum(r),
    Tree::Leaf => 0,
  }
}
let t = Tree::Node(1, Tree::Node(2, Tree::Leaf, Tree::Leaf), Tree::Node(3, Tree::Leaf, Tree::Leaf));
print(sum(t));   // 6
```

---

## 6.10 Summary

- Six primitives: `int`, `float`, `bool`, `string`, `char`, `unit`. Each is a distinct type.
- Composite types: tuples `(T1, T2)`, arrays `[T]`, maps (inferred), functions `fn(A) -> B`, structs (nominal), enums (nominal).
- `int` widens to `float` automatically in five contexts: `let` bindings, assignment, function arguments, binary operations, comparisons. The reverse requires `as int` (truncates).
- Generic functions: `fn id<T>(x: T) -> T { x }`. Type parameters are inferred at the call site. No trait bounds in v1.
- Generic structs and enums: `struct Pair<A, B>`, `enum Option<T>`. Type parameters are part of the type.
- `option<T>` and `result<T, E>` are built-in generic enums, used for optional and fallible values. The `?` operator propagates errors.
- Type aliases are transparent: `type IntPair = (int, int)` doesn't create a new type, just a new name.

The next chapter is error handling: `Result`, `?`, `panic` vs error, `match` on `Result`, propagation, and how the error catalog is organized.
