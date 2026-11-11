# Chapter 4 — Functions and closures

> Functions are the unit of abstraction in Aether. They can be generic, they can capture variables from enclosing scopes, they can recurse. This chapter covers the syntax, the type system, the closure capture model, and what happens at runtime when you call a function — including the v1 tree-walker's call stack and the v2 VM's frame stack.

---

## 4.1 Function declarations

A function is declared with `fn`:

```aether
fn add(a: int, b: int) -> int { a + b }
```

The parts are:

- `fn` keyword.
- Name (`add`).
- Parameter list: `(a: int, b: int)`. Each parameter has a name and a type annotation. *Type annotations on parameters are required in Aether v1* — the type checker does not infer parameter types from the function body.
- `-> ret_type`. The return type. Optional only if the function never returns a useful value (a `()`-returning function can omit the `-> ()`).
- Body: `{ ... }`. The body is a block; if the block's last expression is a value, that's the function's return value. You can also use `return expr;` to return early.

The function is a top-level statement; it can also be a local declaration (inside another function), where it forms a *nested function* (which closes over the enclosing scope).

### 4.1.1 Functions with no return value

```aether
fn greet(name: string) {
  print(f"Hello, {name}!");
}
```

The `-> ()` is implicit. The body's last expression is `()` (the unit value, from `print`).

### 4.1.2 Functions with multiple statements

```aether
fn fib_iter(n: int) -> int {
  if n < 2 { return n; }
  let mut a = 0;
  let mut b = 1;
  let mut i = 2;
  while i <= n {
    let c = a + b;
    a = b;
    b = c;
    i = i + 1;
  }
  b
}
```

The function's return value is the value of the last expression in the block (here, `b`). The `return n;` is an early exit.

### 4.1.3 Functions calling functions

Functions can call other functions defined later in the file (Aether's top-level scope is "all at once"):

```aether
fn main() -> () {
  print(double(21));   // 42 — double is defined below
}

fn double(x: int) -> int { x * 2 }
```

But *recursion* — calling yourself — requires special handling. See §4.5.

---

## 4.2 Generic functions

A function can be generic over one or more type parameters:

```aether
fn id<T>(x: T) -> T { x }
fn first<T>(xs: [T]) -> option<T> {
  if len(xs) > 0 { Option::Some(xs[0]) } else { Option::None }
}
fn pair<A, B>(a: A, b: B) -> (A, B) { (a, b) }
```

Type parameters are listed in `<...>` after the function name. They're scoped to the function. They can appear in the parameter types and the return type.

When you call a generic function, the type checker *infers* the type parameters from the arguments:

```aether
let x = id(42);        // T = int
let y = id("hello");   // T = string
let z = id(3.14);      // T = float
```

You can also specify them explicitly:

```aether
let x = id<int>(42);
```

Explicit specification is rarely needed; the inference handles the common cases.

### 4.2.1 Constraints

v1 does not have trait bounds on type parameters (`<T: Display>`). The `T` is unconstrained — you can do anything to it that's valid for *any* type, which means: assign it, return it, put it in an `Option`, put it in a tuple. Operations like `+` or `<` are *not* valid on an unconstrained `T` because the type checker doesn't know the operations exist.

```aether
fn add<T>(a: T, b: T) -> T {
  a + b   // type error: operator '+' not defined for T and T
}
```

The workaround in v1 is to write a non-generic version for each type you need. v2.x will add trait bounds.

### 4.2.2 Monomorphization vs generics-by-box

Aether's generics are *monomorphized at the call site* by the type checker, but the runtime representation is the same for all instantiations — there's no specialization. `id<int>(42)` and `id<string>("hi")` run the *same* evaluator code with different values. This is "generics by erasure", like Java/Go, not "generics by monomorphization", like Rust/C++. The v2 VM has the same shape — there's one bytecode body for `id` regardless of `T`.

This is a deliberate v1/v2 choice. v2.x may add specialization for performance (see RFC-002 for the monomorphization-vs-erasure trade-off).

---

## 4.3 Closures

A *closure* is a function expression. It has no name; it captures variables from the enclosing scope:

```aether
let add_x = fn(y: int) -> int { y + x };   // x captured from enclosing scope
```

You can pass closures as arguments (higher-order functions):

```aether
let nums = [1, 2, 3];
let doubled = map(nums, fn(x: int) -> int { x * 2 });
let evens = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
let sum = reduce(nums, fn(a: int, x: int) -> int { a + x }, 0);
```

You can return closures from functions:

```aether
fn make_adder(n: int) -> fn(int) -> int {
  fn(x: int) -> int { x + n }   // n captured
}
let add5 = make_adder(5);
print(add5(10));   // 15
```

### 4.3.1 What closures capture

A closure captures any free variable in its body — a variable that's not a parameter and not a local `let`. The captured variable is *by reference* in v1 (the closure sees updates to the captured variable); v2's closures are by-box for the same behavior.

```aether
let mut counter = 0;
let inc = fn() -> int { counter = counter + 1; counter };
print(inc());   // 1
print(inc());   // 2
print(inc());   // 3
print(counter); // 3
```

(The closure mutates the captured `counter`. The `let mut` is on the *outer* binding; the closure just reads/writes it.)

### 4.3.2 Closures vs nested `fn`

Aether has both `fn name(...) -> T { ... }` (a named function declaration, which is recursive and hoisted within its scope) and `fn(...) -> T { ... }` (an anonymous closure expression). The difference is:

- `fn name` is a *statement*. It binds `name` to the function in the current scope. It can be recursive (it can call `name`).
- `fn(...) -> T { ... }` is an *expression*. It evaluates to a closure value. It has no name; it can't directly recurse (you'd have to assign it to a `let` first, then call through the `let`).

```aether
// Named, recursive:
fn fact(n: int) -> int {
  if n <= 1 { 1 } else { n * fact(n - 1) }
}

// Anonymous, non-recursive:
let fact_lambda = fn(n: int) -> int {
  if n <= 1 { 1 } else { ??? }   // can't call fact_lambda from inside
};
```

The workaround for the anonymous recursive case is to use a Y-combinator-style wrapper, or — more practically — to use a named `fn` instead.

### 4.3.3 Closure type

A closure has a *function type*: `fn(A, B) -> C`. The type is structural: two closures with the same parameter and return types have the same type. You can store closures in arrays, pass them around, etc.

```aether
let ops: [fn(int, int) -> int] = [
  fn(a: int, b: int) -> int { a + b },
  fn(a: int, b: int) -> int { a - b },
  fn(a: int, b: int) -> int { a * b },
];
for op in ops {
  print(op(10, 3));
}
// 13, 7, 30
```

### 4.3.4 The closure's parameter types are required

Aether does *not* infer closure parameter types from the call site. You must annotate them:

```aether
// Type error: missing type annotation on x
// let f = fn(x) -> int { x + 1 };

// Fix:
let f = fn(x: int) -> int { x + 1 };
```

This is a v1 limitation; v2 may relax it for closures assigned to typed bindings (bidirectional inference).

---

## 4.4 Recursion

A function can call itself:

```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(15));   // 610
```

`fib(15)` makes ~1973 calls. The default step limit is 1M, so it's fine. `fib(25)` makes ~242,785 calls — still fine. `fib(30)` makes ~2.7M calls — over the limit.

For mutual recursion (two functions that call each other):

```aether
fn is_even(n: int) -> bool {
  if n == 0 { true } else { is_odd(n - 1) }
}
fn is_odd(n: int) -> bool {
  if n == 0 { false } else { is_even(n - 1) }
}
print(is_even(10));   // true
```

Mutual recursion works because Aether's top-level scope is "all at once" — both functions are defined before either is called. (For *nested* mutual recursion, you need a forward declaration or a single recursive helper that takes a tag.)

### 4.4.1 Tail calls

Aether v1 has *no tail-call optimization*. A tail call (a function call in tail position — the last thing the function does) uses a regular call frame on the host's stack. Deep tail recursion blows the stack at around 10k-50k frames (depends on the host; the JS engine's stack limit).

Aether v2's TCO pass (Chapter 10) *marks* tail calls in the IR so the VM can reuse the current frame — *but* the VM doesn't yet implement the frame reuse. The TCO pass is for the v2.x native backend; the v2 VM still uses regular calls.

The workaround is *iteration*:

```aether
fn sum_to(n: int) -> int {
  let mut acc = 0;
  let mut i = 1;
  while i <= n { acc = acc + i; i = i + 1; }
  acc
}
print(sum_to(1000000));   // 500000500000 — fine, no recursion
```

---

## 4.5 The call stack (v1 and v2)

### 4.5.1 v1 tree-walker

The v1 tree-walker uses the *host's* call stack. Each `eval(expr, env)` call is a JavaScript function call; each Aether function call is several nested `eval` calls. Deep Aether recursion = deep JS recursion. The host engine's stack limit (Chrome's V8 is ~15k frames) bounds Aether recursion. The step counter (default 1M) usually trips first.

### 4.5.2 v2 bytecode VM

The v2 VM has its own frame stack. Each Aether function call pushes a `Frame` (with `registers`, `pc`, `upvalues`, `closure`) onto an explicit `frames` array. There's no host recursion — the VM is a loop. The frame stack is bounded by available memory.

The benefit: the VM doesn't blow the JS stack. The cost: the VM has to manage its own stack (allocating frames, freeing them, handling upvalue capture).

### 4.5.3 What "calling" looks like

For a call `f(1, 2)`:

1. Evaluate the callee. In v1, look up `f` in the environment; in v2, look it up in the constant pool or as a `LoadGlobal`.
2. Evaluate the arguments left-to-right. In v1, push them onto a temp list; in v2, store them in the next available registers.
3. Type-check the call (this happened at sema time, not call time — but it's worth knowing that the *types* of the arguments were checked against `f`'s parameter types).
4. Push a new frame. In v1, create a new `Env` with the parameters bound; in v2, push a `Frame` with the args in `r1`, `r2`, ...
5. Run the function body. In v1, recursively `eval` the body's statements; in v2, the VM's main loop processes instructions until `Return`.
6. Pop the frame. In v1, return the value (the body's last expression or the `return`'s argument); in v2, `Return r0` writes the result to the caller's destination register.

For *closures*, there's an extra step: capture upvalues. In v1, the closure captures the enclosing `Env` directly (by reference). In v2, the closure records which upvalues it needs; the VM creates boxes for captured mutable bindings and reads them via `GetUpvalue`/`SetUpvalue`.

---

## 4.6 Higher-order function patterns

`map`, `filter`, and `reduce` are the three classic higher-order functions. They're inline builtins in Aether (Chapter 2's list), but they take closures as arguments:

```aether
let nums = [1, 2, 3, 4, 5];

let squared = map(nums, fn(x: int) -> int { x * x });
print(squared);   // [1, 4, 9, 16, 25]

let evens = filter(nums, fn(x: int) -> bool { x % 2 == 0 });
print(evens);     // [2, 4]

let sum = reduce(nums, fn(a: int, x: int) -> int { a + x }, 0);
print(sum);       // 15

let product = reduce(nums, fn(a: int, x: int) -> int { a * x }, 1);
print(product);   // 120
```

You can compose them:

```aether
let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
let result = reduce(
  filter(map(nums, fn(x: int) -> int { x * x }), fn(x: int) -> bool { x % 2 == 1 }),
  fn(a: int, x: int) -> int { a + x },
  0
);
print(result);   // 1+9+25+49+81+121 = 165 — wait, 121 is 11^2; let me recompute.
// map: [1,4,9,16,25,36,49,64,81,100]
// filter odd: [1,9,25,49,81]
// sum: 165
```

(165.)

The `functional` stdlib module (Chapter 8) has `compose`, `pipe`, `curry`, `partial`, `flip`, `memoize`, `once`, `debounce`, `throttle`, `after`, `before`, `wrap`, `tap`, `try_`, `when`, `unless`, `condTuples` — a fuller functional-programming toolkit.

---

## 4.7 Eight runnable examples

**1. Basic function.**

```aether
fn square(x: int) -> int { x * x }
print(square(7));   // 49
```

**2. Generic identity.**

```aether
fn id<T>(x: T) -> T { x }
print(id(42));
print(id("hello"));
```

**3. Closure capturing a variable.**

```aether
let base = 100;
let add_base = fn(x: int) -> int { x + base };
print(add_base(5));   // 105
```

**4. Returning a closure.**

```aether
fn make_multiplier(factor: int) -> fn(int) -> int {
  fn(x: int) -> int { x * factor }
}
let double = make_multiplier(2);
let triple = make_multiplier(3);
print(double(5));   // 10
print(triple(5));   // 15
```

**5. Recursion — factorial.**

```aether
fn fact(n: int) -> int {
  if n <= 1 { 1 } else { n * fact(n - 1) }
}
print(fact(5));   // 120
```

**6. Higher-order: `map`.**

```aether
let xs = [1, 2, 3];
let ys = map(xs, fn(x: int) -> int { x + 10 });
print(ys);   // [11, 12, 13]
```

**7. Higher-order: `reduce`.**

```aether
let xs = ["a", "b", "c"];
let s = reduce(xs, fn(acc: string, x: string) -> string { acc + x }, "");
print(s);   // abc
```

**8. Mutable closure (counter).**

```aether
let mut counter = 0;
let inc = fn() -> int { counter = counter + 1; counter };
print(inc());   // 1
print(inc());   // 2
print(inc());   // 3
print(counter); // 3
```

---

## 4.8 Summary

- `fn name(params) -> ret { body }` declares a function. Parameter types are required. The return type is optional only for `()`.
- Functions can be generic: `fn id<T>(x: T) -> T { x }`. Type parameters are inferred at the call site. No trait bounds in v1.
- Closures (`fn(...) -> T { ... }`) capture variables from enclosing scopes, by reference. They have structural function types.
- v1 has no TCO; deep recursion blows the host stack (or, more likely, trips the step counter first). v2 has a TCO *pass* but the VM doesn't yet reuse frames — that's a v2.x item.
- Higher-order functions (`map`, `filter`, `reduce`) are the workhorse of idiomatic Aether. The `functional` stdlib module adds `compose`, `pipe`, `curry`, `partial`, `memoize`, etc.
- v1 uses the host's call stack; v2 has its own frame stack (no host recursion).

The next chapter is data structures: structs, enums (ADTs), tuples, arrays, maps — and pattern matching for each.
