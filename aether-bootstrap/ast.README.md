# aether-bootstrap/ast.ae — Aether's AST, written in Aether

**Task ID:** V3-W1-AST. Self-hosting bootstrap, part 2 of 6.

This module is the first non-trivial piece of the Aether compiler rewritten in
Aether itself. It defines the abstract syntax tree (every node kind, every
sub-record), a pretty-printer that turns an AST back into source-ish Aether
text, structural equality, location extraction, and a small visitor walker —
all ~850 lines of pure Aether. The TypeScript reference AST it mirrors lives
at `aether/core/ast/ast.ts` (402 LOC, discriminated unions for ~80 node
kinds) and the TS pretty-printer is at `aether/core/ast/visitor.ts` (676 LOC,
`printAst`).

## What's in the file

- `enum Type` (10 variants) — `NamedType`, `GenericType`, `FuncType`,
  `TupleType`, `ArrayType`, `MapType`, `OptionType`, `ResultType`,
  `PrimitiveType`, `UnitType`. Mirrors the TS `TypeNode` union exactly.
- `enum Pattern` (9 variants) — `WildcardPat`, `BindPat`, `LitPat`,
  `TuplePat`, `ArrayPat`, `StructPat`, `EnumPat`, `OrPat`, `RestPat`.
  Mirrors the TS `Pattern` union.
- `enum Expr` (33 variants) — every TS Expr kind, including `Return`
  (which is in BOTH the TS `Expr` and `Stmt` unions; in Aether we use the
  variant name `Return` inside `Expr` and `ReturnStmt` inside `Stmt` since
  the TS kind strings happen to collide).
- `enum Stmt` (17 variants) — every TS Stmt kind. The `Return` Stmt is
  named `ReturnStmt` to avoid colliding with the `Return` Expr variant
  (Aether enum variants live in their enum's namespace, so the collision
  wouldn't be a hard error, but the rename keeps the round-trip story
  cleaner).
- 12 supporting `struct`s: `Loc`, `SrcLoc`, `Param`, `TypeParam`,
  `StructField`, `EnumVariantDecl`, `StringSegment`, `MatchArm`, `MapEntry`,
  `StructExprField`, `StructPatField`, `Program`.
- `enum Option<T> { Some(T), None }` — declared explicitly so the type
  checker resolves the `Option::Some(x)` / `Option::None` constructors and
  pattern arms cleanly. Aether has a built-in `option<T>` syntactic-sugar
  type that maps to the same `TOption` shape, but the sema only resolves
  the `Option` enum name in pattern position when it's declared by the
  user. We re-declare it here; the runtime constructor representation is
  the same regardless of who declares the name.

In total: 33 + 17 + 9 + 10 = 69 enum variants across 4 enums, plus 12
structs — 81 node kinds, matching the TS AST 1-to-1.

## Design: enums as tagged unions, structs as records

Aether's `enum` is a Rust-style tagged union with tuple-variant data. Each
variant is a constructor that packages its arguments into a runtime object
of shape `{ __variant: "Expr", variant: "Binary", data: [op, lhs, rhs,
loc] }`. The `__variant` field names the enum ("Expr"), `variant` names the
specific case ("Binary"), and `data` is the positional argument array.

This is a near-perfect fit for a compiler AST: each TS discriminated-union
member (e.g. `interface Binary { kind: "Binary"; loc; op; left; right }`)
maps to one Aether enum variant (e.g. `Binary(string, Expr, Expr, SrcLoc)`).
The `kind` discriminator becomes the variant name; the named fields become
positional payloads. The TS union (e.g. `type Expr = IntLit | FloatLit | …`)
becomes a single `enum Expr { IntLit(int, SrcLoc), FloatLit(float, SrcLoc), … }`
declaration.

Aether's `struct` is a record with named fields. The TS AST's helper
interfaces (`Param`, `MatchArm`, `MapEntry`, etc.) map to Aether structs
verbatim — `struct MatchArm { pattern: Pattern, guard: option<Expr>, body:
Expr, loc: SrcLoc }` reads almost identically to the TS `interface MatchArm
{ pattern: Pattern; guard?: Expr | null; body: Expr; loc: SourceLocation }`.

The optional fields (`?`) become `option<T>` payloads, modeled at runtime
as the `Option::Some(x)` / `Option::None` constructors. The TS `T[]` becomes
Aether `[T]`. The TS `string | null` becomes Aether `option<string>`. The TS
`number` splits into Aether `int` or `float` based on the field's intent
(loc/offset are `int`; FloatLit's value is `float`).

## The pretty-printer

`printExpr(e: Expr) -> string` is the heart of the module. It's a single
`match` with one arm per variant. Each arm recursively prints its
sub-expressions and concatenates the result with the right separators.

The TS printer uses a mutable `Ctx` with an indent counter and an output
array, threading it through every recursive call. The Aether printer is
pure-functional — no mutable context, no for-loop-scope quirks. Indentation
is threaded explicitly through `printStmt(s, indent)` and `blockLines(stmts,
expr, level)`; list joining is done by a small recursive `join(arr, sep)`
helper (which uses an index-aware `joinRec` rather than a 3-argument
`reduce` callback, because the sema only models the 2-arg reduce signature).

`printBlock` makes a stylistic choice: blocks with no statements and a
single trailing expression print inline as `{ expr }`; anything with
statements goes multi-line so the result can be re-parsed back to the same
AST. This matches the Aether source convention for short functions (`fn
id<T>(x: T) -> T { x }`) and short `if` arms (`if n < 2 { n } else { fib(n -
1) + fib(n - 2) }`).

`printStmt`, `printType`, `printPattern`, `printProgram` round out the
printer. `printProgram` joins the top-level statements with `\n`. `printStmt`
threads an `indent` argument so nested `BlockStmt`s can re-indent their
children.

## Equality

Aether's `==` operator already does deep equality on enum variants (via
`valueEq` in `eval.ts`, which recurses into the `data` array of each
variant). It also deep-compares structs (all fields), arrays (element by
element), and strings/ints/floats/bools (primitive `===`).

So `exprEqual(a, b) = a == b` is correct as long as both sides were
constructed with the same `SrcLoc`. The tests use `zeroSrc()` for
consistency. `typeEqual`, `patternEqual`, `stmtEqual` are similar one-line
wrappers. A "value equality ignoring location" variant could be written as
a manual recursive match — but it would be ~200 lines for a feature nobody
asked for, so we keep it simple.

## `locOf` — extracting the location

Each `locOf*` function (`locOfExpr`, `locOfStmt`, `locOfType`,
`locOfPattern`) is a single `match` with one arm per variant, returning the
last payload (which is always the `SrcLoc`). The dispatcher pattern is
intentional — Aether doesn't have a single "any AST node" union, so the
caller picks the typed accessor. A thin `locTag(node: string) -> string`
placeholder is included for callers that need a tag-only dispatch.

## `walkExpr` — visitor

`walkExpr(e, onEnter, onLeave)` walks the sub-`Expr`s of an `Expr` tree in
source order, calling `onEnter` before descending and `onLeave` after. It
walks sub-`Expr`s only — `Stmt`s inside `Block`, `Type`s inside `Cast`, etc.
are NOT walked. Callers wanting full traversal should compose their own
walker for those node categories. This keeps the visitor's signature small
(`fn(Expr) -> ()` callbacks) and matches the spec's "simple `fn walk(node,
visitor)` if feasible" hint.

The recursion is hand-coded per variant in `walkSubExprs`. `Option::Some`
sub-trees (`If.else`, `Lambda.ret`, `MatchArm.guard`, `Block.expr`,
`Return.expr`, `StructExpr.spread`) are walked via the small `walkOptExpr`
helper. Map / struct / array collections are walked by iterating with
`reduce` (forced ordering, no for-loop-scope bug).

## How to extend (add a new node kind)

1. **Declare the variant** in the right enum (e.g. `Expr`). Add it to the
   `enum Expr { …, YourNewNode(payload1, payload2, SrcLoc) }` list. Place
   `SrcLoc` last so the printer and `locOfExpr` can ignore it with `_`.
2. **Add a printer arm** in `printExpr` (or `printStmt` / `printType` /
   `printPattern`). Write the source-like string by concatenating the
   printed sub-expressions. If your variant has a list, use `join(map(arr,
   fn(x: T) -> string { printX(x) }), ", ")`.
3. **Add a `locOfExpr` arm** that returns the variant's last payload.
4. **Add a `walkSubExprs` arm** that recurses into every sub-`Expr`. Use
   `walkExpr` for direct children, `walkExprs` for arrays, `walkOptExpr`
   for `option<Expr>` payloads.
5. **Equality** is automatic — `==` already deep-compares enum variants.
6. **Add tests** in `ast.tests.body.ae`: construct the new node, assert
   `printExpr` produces the expected source, assert `locOfExpr` returns
   the right `SrcLoc`, assert `exprEqual` of two equal nodes is `true`.
7. **Rebuild** `ast.test.ae` with `cat ast.ae ast.tests.body.ae >
   ast.test.ae`, run `bun /tmp/verify_bootstrap.ts ast.test.ae`.

No other code needs to change. The TS AST has 33 Expr kinds and we mirror
all of them; if you add a 34th in the TS AST, mirror it here.

## Known limitations

- The Aether type checker doesn't fully unify `option<T>` with
  `Option::Some(x)` — when a field's expected type is `option<Expr>` and
  the value is the constructor `Option::Some(e)`, the sema infers
  `option<T9>` (a fresh type var) instead of `option<Expr>` (see
  `sema.ts:979`, which returns `optionOf(subst.get(genericNames[0]))`
  without applying the substitution). This produces one type warning per
  `Option::Some` use site. The warnings do NOT block execution — the
  Aether playground runs programs with type warnings by design — and all
  asserts pass at runtime. A future fix is one line in `sema.ts`
  (`t = applySubst(t, subst)` before returning).

- `walkExpr` covers only `Expr` sub-trees. A full `walkAny` would require
  either an `AnyNode` wrapper enum or per-category walkers (one each for
  `Stmt`, `Type`, `Pattern`). The spec asked for "a simple `fn walk(node,
  visitor)` if feasible" — `walkExpr` is the feasible part.

- The printer is a pretty-printer, not a formatter: it doesn't normalize
  whitespace, wrap long lines, or enforce a column limit. It round-trips
  for ASTs built with consistent `zeroSrc()` locations; for ASTs from the
  parser (with real `SrcLoc`s), the printed source is correct but the
  layout may differ from the original.

- `enum Option<T> { Some(T), None }` is declared at the top of `ast.ae`.
  If another module also declares `enum Option<T>`, the second declaration
  wins (or shadows the first at the type-checker level). The runtime
  representation is identical either way.

## File layout

- `ast.ae` (~850 LOC) — the AST module: all enums, structs, the printer,
  equality, `locOf*`, `walkExpr`. Has a small demo at the bottom that
  prints `1 + 2` so a bare `bun ast.ae` run shows output.
- `ast.tests.body.ae` (~530 LOC) — 114 `assert_eq` calls covering every
  variant, equality, `locOf`, and `walkExpr`. Concatenated onto `ast.ae`
  to build `ast.test.ae`.
- `ast.test.ae` (~1400 LOC) — the concatenated self-contained test file
  that `compileAndRun` executes.

## Verification

```bash
bun /tmp/verify_bootstrap.ts aether-bootstrap/ast.ae
# ok= true err= none output= == aether-bootstrap/ast.ae loaded == ...
bun /tmp/verify_bootstrap.ts aether-bootstrap/ast.test.ae
# ok= false err= none output= ... == all asserts passed ==
# (ok=false is type warnings only; no runtime error, all asserts pass)
```
