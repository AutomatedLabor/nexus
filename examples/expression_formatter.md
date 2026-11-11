# expression_formatter.ae

A pretty-printer for a tiny arithmetic-expression AST. The AST is a
recursive enum, and the formatter is pure recursion + pattern matching
+ string concat — no for-loops, no mutable state, no arrays.

## What it does

The AST type is:

```aether
enum Expr {
  Num(int),
  Add(Expr, Expr),
  Mul(Expr, Expr),
  Neg(Expr),
}
```

A `Num(n)` is a leaf carrying an integer. `Add(a, b)` and `Mul(a, b)`
are binary nodes carrying two sub-expressions. `Neg(inner)` is a
unary negation node. Because `Add`/`Mul` carry `Expr` values, the type
is recursive.

The program implements two pure functions:

- `fmt(e)` — pretty-prints an expression as a fully-parenthesized
  infix string. For example, `Mul(Add(Num(1), Num(2)), Num(3))` →
  `"(1 + 2) * 3"`, while `Add(Num(1), Mul(Num(2), Num(3)))` →
  `"1 + (2 * 3)"`. The top-level call doesn't wrap the result in
  outer parens; nested binary operations do.
- `eval_expr(e)` — evaluates the AST to an integer. Mirrors the
  structure of `fmt`. Used to cross-check the pretty-printed result
  against the expected numeric value.

`fmt` uses a nested `go(e, top)` helper: the `top` flag is `true`
only at the outermost call, telling it to skip the enclosing
parentheses. Each recursive call passes `top = false` so nested
`Add`/`Mul` always wrap themselves in parens. `Num` and `Neg` never
need parens, so they ignore `top`.

The driver builds seven example expressions by hand from the enum
constructors, prints each one's constructor form (as a label), its
formatted string, and its evaluated integer. It then constructs one
deeply-nested left-leaning addition
(`1 + (2 + (3 + (4 + 5)))`) to stress-test the recursion.

## How to run

Open the file in the playground and click **Run**, or:

```bash
bun /home/z/my-project/verify_one.ts /home/z/my-project/examples/expression_formatter.ae
```

## Key language features

- **Recursive enums** with multiple payloads — `Add(Expr, Expr)` and
  `Mul(Expr, Expr)` carry two `Expr` values each.
- **Enum variant construction** with the qualified syntax
  `Expr::Add(Expr::Num(1), Expr::Num(2))`. Unqualified `Add(Num(1),
  Num(2))` is rejected by the type checker ("undefined name 'Add'")
  because variant names live under their enum's namespace, so we use
  the qualified form throughout.
- **Pattern matching** with binding sub-patterns:
  `Expr::Add(a, b) => …` binds `a` and `b` to the two sub-exprs.
- **Block-body match arms** with multiple statements:
  `Expr::Add(a, b) => { let s = …; if top { s } else { "(" + s + ")" } }`.
- **Nested function declarations** inside a function — `go` is
  declared inside `fmt` and captures `fmt`'s parameter `e` via lexical
  scope (or rather, just calls itself — the parameter `e` is shadowed
  by the inner `e` of `go`).
- **`if cond { a } else { b }` as a value expression** — the last
  expression in a match arm can be an `if/else` expression that
  evaluates to either branch.
- **Tuple array iteration** — `for pair in exs { let label = pair.0;
  let e = pair.1; … }` walks an array of `(string, Expr)` tuples,
  destructuring by index.

## Expected output

```
== Expression formatter (recursive enum + pattern match) ==

  Mul(Add(Num(1),Num(2)),Num(3))
    formatted: (1 + 2) * 3
    value:     9
  Add(Num(1),Mul(Num(2),Num(3)))
    formatted: 1 + (2 * 3)
    value:     7
  Neg(Add(Num(1),Num(2)))
    formatted: -(1 + 2)
    value:     -3
  ...
  Mul(Num(2),Mul(Num(3),Mul(Num(4),Num(5))))
    formatted: 2 * (3 * (4 * 5))
    value:     120

deep nested add: 1 + (2 + (3 + (4 + 5)))  =  15

All assertions passed.
```

## Design notes

- **Why fully parenthesized, not minimal?** A minimal pretty-printer
  would use precedence and associativity rules to drop redundant
  parens (e.g., `1 + 2 + 3` instead of `(1 + 2) + 3`). The fully-
  parenthesized style is simpler to implement and unambiguous to read
  — and it makes the AST structure explicit, which is the point of an
  AST pretty-printer in the first place. A production tool would offer
  both modes.
- **`fmt` and `eval_expr` have identical structure**: both are a
  single `match` whose arms recurse into the sub-expressions. This is
  the *interpreter pattern* — every operation on the AST is a
  structural recursion. Adding a new constructor (say, `Sub(Expr,
  Expr)`) would require adding one arm to each function. This is
  exactly how AST-manipulating tools are written in ML-family
  languages (and Aether follows that tradition).
- **The `top : bool` flag** is the simplest way to give the outermost
  call different parenthesization from nested calls without a wrapper
  function. An alternative is a thin outer wrapper that strips one
  layer of parens; the `top` flag is more direct.
- Aether doesn't have a `char` literal type that supports `+` for
  strings — we use the inline `str(n)` builtin to render integers and
  `+` to concatenate, which is the canonical string-building style.
- The `exs` array is a list of `(string, Expr)` tuples. Iterating over
  it with `for pair in exs { pair.0; pair.1 }` lets us show the
  constructor form (as a label) alongside the formatted result without
  duplicating the structure of each example.
