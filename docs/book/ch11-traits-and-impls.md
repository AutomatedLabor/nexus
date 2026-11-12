# Chapter 11 — Traits and impls

> Aether v3 introduces a trait system: the language mechanism for ad-hoc polymorphism that lets you write `fn sort<T: Ord>(xs: [T])` and have the compiler figure out the right comparison function for `int`, `float`, `string`, and your own `struct Point`. This chapter covers declaring traits, implementing them on types, the coherence rules that prevent conflicting impls, object safety, the `dyn` keyword, the `#[derive]` attribute, super-traits, and associated types. Ten runnable examples show every feature in action.

Traits are the v3 cornerstone. Without them, Aether has overloading (you can write `+` on `int` and `float` because the type checker dispatches at compile time), but you can't write a single function that works on "anything that has a comparison." Traits fill that gap. They're the Rust trait / Haskell typeclass / Swift protocol analogue, with the same fundamental shape: a trait is a set of method signatures, a type implements the trait by providing the methods, and generic functions constrain their type parameters with trait bounds.

Aether v3 ships four built-in traits in the stdlib: `Ord` (ordering), `Eq` (equality), `Show` (string representation), and `Iterator` (streaming). The `#[derive]` attribute generates implementations of `Eq`, `Ord`, and `Show` for any struct or enum whose fields all implement the same trait. The `dyn` keyword gives you runtime dispatch via trait objects (when you don't know the concrete type at compile time). Associated types let a trait expose a type that's determined by the implementing type — `Iterator::Item` is the canonical example.

---

## 11.1 Declaring a trait

A trait declaration introduces a name and a set of method signatures:

```aether
trait Show {
  fn show(self) -> string;
}

trait Ord {
  fn cmp(self, other: Self) -> int;   // -1, 0, +1
}

trait Iterator {
  type Item;
  fn next(self) -> Option<Self::Item>;
}
```

The `Self` keyword inside a trait refers to the implementing type. `Self::Item` (with associated types) refers to a type that the implementing type chooses. Method signatures use `self` (by value) or `&self` / `&mut self` (by reference) — see Chapter 12 for the borrowing semantics.

### Example 1: a custom trait

```aether
trait Greet {
  fn greet(self) -> string;
}

struct English {}
struct French {}

impl Greet for English {
  fn greet(self) -> string { "Hello" }
}

impl Greet for French {
  fn greet(self) -> string { "Bonjour" }
}

let e = English {};
let f = French {};
print(e.greet());   // Hello
print(f.greet());   // Bonjour
```

The trait declares the contract (`greet` returns a string); each `impl` block provides the implementation for a specific type. Calling `e.greet()` dispatches to the `English` impl because `e` has type `English`.

---

## 11.2 Implementing traits

An `impl Trait for Type` block provides method bodies for every method declared in the trait. The compiler checks that:

1. Every method signature in the trait has a matching method body in the impl.
2. The impl is in the same module as either the trait or the type (coherence — see §11.4).
3. No two impls of the same trait for the same type exist (no overlaps).

### Example 2: implementing `Show` for a struct

```aether
struct Point { x: int, y: int }

impl Show for Point {
  fn show(self) -> string {
    "Point { x: " + str(self.x) + ", y: " + str(self.y) + " }"
  }
}

let p = Point { x: 3, y: 4 };
print(p.show());   // Point { x: 3, y: 4 }
```

The `Show` trait (defined in `aether/stdlib/traits/index.ts`) has one method: `show(self) -> string`. The `Point` impl formats the struct as a string. Now any function that takes a `T: Show` works on `Point`.

### Example 3: implementing `Ord` for ordering

```aether
struct Vec2 { x: int, y: int }

impl Ord for Vec2 {
  fn cmp(self, other: Vec2) -> int {
    if self.x != other.x {
      if self.x < other.x { -1 } else { 1 }
    } else {
      if self.y < other.y { -1 } else {
        if self.y > other.y { 1 } else { 0 }
      }
    }
  }
}

let a = Vec2 { x: 1, y: 2 };
let b = Vec2 { x: 1, y: 3 };
print(a.cmp(b));   // -1 (a < b by y)
```

Once `Ord` is implemented, the stdlib's `sort` works on `[Vec2]`:

```aether
let xs = [Vec2 { x: 3, y: 1 }, Vec2 { x: 1, y: 5 }, Vec2 { x: 2, y: 0 }];
let sorted = sort(xs);   // uses Vec2::cmp
print(sorted[0].x);      // 1
```

---

## 11.3 Generic functions with trait bounds

A generic function can declare trait bounds on its type parameters. The compiler then resolves the trait methods at compile time (static dispatch) — there's no runtime cost.

### Example 4: a function generic over `Show`

```aether
fn print_all<T: Show>(xs: [T]) -> () {
  let mut i = 0;
  while i < len(xs) {
    print(xs[i].show());
    i = i + 1;
  }
}

print_all([1, 2, 3]);                  // int implements Show
print_all([Point { x: 1, y: 2 }, Point { x: 3, y: 4 }]);
```

The `print_all` function takes a `[T]` where `T` implements `Show`. The compiler monomorphises the function: for each concrete `T` it instantiates a specialized version that calls the right `show` method. No vtable, no dynamic dispatch.

### Example 5: a function generic over `Ord`

```aether
fn max<T: Ord>(xs: [T]) -> T {
  let mut best = xs[0];
  let mut i = 1;
  while i < len(xs) {
    if xs[i].cmp(best) > 0 {
      best = xs[i];
    };
    i = i + 1;
  }
  best
}

print(max([3, 1, 4, 1, 5]));          // 5
print(max([Vec2 { x: 0, y: 9 }, Vec2 { x: 5, y: 0 }]));   // Vec2 { x: 5, y: 0 }
```

`max` works on any `T: Ord` — `int`, `float`, `string`, `Vec2`, anything. The trait bound is the only constraint.

---

## 11.4 Coherence — no orphan impls

Aether v3 forbids *orphan* impls: an `impl Trait for Type` must live in the same module as either the trait or the type. This is the Rust coherence rule. Without it, two packages could both implement `Show for int` and the compiler couldn't decide which to call.

### Example 6: orphan impl rejected

```aether
// In package a:
trait MyTrait { fn foo(self) -> int; }

// In package b (which imports a's MyTrait):
impl MyTrait for int { fn foo(self) -> int { 42 } }   // ERROR: orphan impl
```

The fix is to either declare `MyTrait` in package `b`, or wrap `int` in a newtype declared in package `b`. See ADR-18 for the full argument.

Coherence is checked at compile time. The error message names the trait, the type, and the modules that own each — so the caller can see exactly what to move where.

---

## 11.5 Object safety and `dyn`

A trait is *object-safe* if it can be used as a `dyn` (trait object) — a runtime-polymorphic value. The rule: a trait is object-safe iff all its methods:

1. Take `self` by reference (`&self` or `&mut self`), not by value.
2. Don't use `Self` in the return type (the concrete type would be lost).
3. Don't have generic type parameters (each monomorphisation would need a separate vtable entry).

`Show` (with `fn show(&self) -> string`) is object-safe. `Iterator` (with `type Item; fn next(&mut self) -> Option<Self::Item>`) is *not* object-safe in v3 because of the associated type — `Self::Item` would need to be fixed across all values in the trait object. A future `dyn Iterator<Item = int>` syntax (RFC under discussion) would lift this restriction.

### Example 7: `dyn` for runtime dispatch

```aether
trait Shape {
  fn area(&self) -> float;
}

struct Circle { radius: float }
struct Square { side: float }

impl Shape for Circle {
  fn area(&self) -> float { 3.14159 * self.radius * self.radius }
}

impl Shape for Square {
  fn area(&self) -> float { self.side * self.side }
}

fn total_area(shapes: [dyn Shape]) -> float {
  let mut sum = 0.0;
  let mut i = 0;
  while i < len(shapes) {
    sum = sum + shapes[i].area();
    i = i + 1;
  }
  sum
}

let xs: [dyn Shape] = [Circle { radius: 1.0 }, Square { side: 2.0 }];
print(total_area(xs));   // 3.14159 + 4.0 = 7.14159
```

The `[dyn Shape]` array holds different concrete types (`Circle` and `Square`), and `shapes[i].area()` dispatches via a vtable at runtime. The cost is one indirection per call (the vtable lookup) — small but nonzero. For monomorphic code, use generic `T: Shape` instead (Example 4-5).

---

## 11.6 `#[derive]` for boilerplate impls

The `#[derive]` attribute generates trait implementations for you. The supported traits in v3 are `Eq`, `Ord`, and `Show`. Derivation works on any struct or enum whose fields all implement the trait being derived.

### Example 8: deriving `Eq`, `Ord`, `Show`

```aether
#[derive(Eq, Ord, Show)]
struct Point3 { x: int, y: int, z: int }

let p1 = Point3 { x: 1, y: 2, z: 3 };
let p2 = Point3 { x: 1, y: 2, z: 3 };
let p3 = Point3 { x: 1, y: 2, z: 4 };

print(p1.show());         // Point3 { x: 1, y: 2, z: 3 }
print(p1.eq(p2));          // true
print(p1.cmp(p3));         // -1 (z is less)
print(p1 == p2);           // true   (== uses derived Eq)
print(p1 < p3);            // true   (< uses derived Ord)
```

The derived `Eq` compares field-by-field; the derived `Ord` orders lexicographically (first field, then second, etc.); the derived `Show` formats as `TypeName { field: value, ... }`. Derivation is a syntactic convenience — the same impls could be written by hand, but at the cost of ~10 lines per trait per type.

### Example 9: deriving on enums

```aether
#[derive(Eq, Show)]
enum Color { Red, Green, Blue }

let r = Color::Red;
let g = Color::Green;
print(r.show());           // Color::Red
print(r == r);             // true
print(r == g);             // false
```

The derived `Eq` on an enum compares variant tags (and any associated data). The derived `Show` formats as `EnumName::VariantName` (plus payload in parentheses if the variant has one).

---

## 11.7 Super-traits

A trait can declare super-traits: `trait B: A { ... }` means every type that implements `B` must also implement `A`. The methods of `A` are available inside `B`'s method bodies.

### Example 10: a trait with a super-trait

```aether
trait Eq {
  fn eq(self, other: Self) -> bool;
}

trait Ord: Eq {
  fn cmp(self, other: Self) -> int;
  fn lt(self, other: Self) -> bool { self.cmp(other) < 0 }
  fn le(self, other: Self) -> bool { self.cmp(other) <= 0 }
}

struct Money { cents: int }

impl Eq for Money {
  fn eq(self, other: Money) -> bool { self.cents == other.cents }
}

impl Ord for Money {
  fn cmp(self, other: Money) -> int {
    if self.cents < other.cents { -1 } else {
      if self.cents > other.cents { 1 } else { 0 }
    }
  }
}

let a = Money { cents: 100 };
let b = Money { cents: 200 };
print(a.eq(b));      // false   (from Eq)
print(a.lt(b));      // true    (default method from Ord, uses cmp)
print(a.le(b));      // true
```

`Ord` has a default method `lt` that uses `cmp`. Because `Ord: Eq`, any `T: Ord` is also `T: Eq`, and `eq` is callable on `T`. The compiler enforces this: you can't `impl Ord for Money` without also `impl Eq for Money` (the impl above provides both).

---

## 11.8 Associated types

An associated type is a type that's part of the trait but chosen by the implementing type. The canonical example is `Iterator::Item` — the type of elements the iterator yields.

```aether
trait Iterator {
  type Item;
  fn next(self) -> Option<Self::Item>;
}

struct Range { lo: int, hi: int, cur: int }

impl Iterator for Range {
  type Item = int;
  fn next(self) -> Option<int> {
    if self.cur >= self.hi {
      Option::None
    } else {
      let v = self.cur;
      self.cur = self.cur + 1;
      Option::Some(v)
    }
  }
}

let r = Range { lo: 0, hi: 5, cur: 0 };
let mut s = 0;
let mut it = r;
let mut keep = true;
while keep {
  let n = it.next();
  if n is Some(v) {
    s = s + v;
  } else {
    keep = false;
  };
}
print(s);   // 0+1+2+3+4 = 10
```

The `type Item = int;` line in the impl tells the compiler that `Range`'s iterator yields `int`. The trait method's return type `Option<Self::Item>` is then `Option<int>` for `Range`. Functions generic over `Iterator` can refer to `T::Item`:

```aether
fn sum<T: Iterator>(it: T) -> int where T::Item: int {
  let mut total = 0;
  // ...
  total
}
```

(Where-clauses are a v3.1 extension; in v3, the constraint `T::Item = int` is written with an explicit assertion or a separate trait.)

---

## 11.9 Summary

- **Traits** are Aether's mechanism for ad-hoc polymorphism. Declare with `trait Name { method signatures }`. Implement with `impl Name for Type { method bodies }`.
- **Generic functions** declare trait bounds: `fn f<T: Trait>(x: T) -> ...`. The compiler monomorphises — no runtime cost.
- **Coherence** forbids orphan impls: an impl must live in the same module as the trait or the type. Prevents two packages from implementing the same trait for the same type. (ADR-18)
- **Object safety** determines whether a trait can be a `dyn` (trait object). Object-safe traits take `&self`, don't return `Self`, and aren't generic.
- **`dyn`** is runtime polymorphism via a vtable. Useful when the concrete type isn't known at compile time. Cost: one indirection per call.
- **`#[derive(Eq, Ord, Show)]`** generates boilerplate impls. Works on structs and enums whose fields all implement the derived trait.
- **Super-traits** (`trait B: A`) require every `B` impl to also be an `A`. `A`'s methods are available in `B`'s bodies.
- **Associated types** (`type Item;`) are types chosen by the implementing type. The canonical example is `Iterator::Item`.

The next chapter (Chapter 12) covers the v3 borrow checker — the other half of v3's type system story, which uses traits (`Drop`, `Copy`) to determine when values can be moved, copied, or borrowed.
