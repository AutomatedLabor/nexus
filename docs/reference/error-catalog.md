# Aether error catalog

> Every error message the Aether v1 implementation can produce, with a cause and a fix for each. The error strings are taken directly from `aether/core/lexer/lexer.ts`, `aether/core/parser/parser.ts`, `aether/core/sema/sema.ts`, and `aether/core/eval/eval.ts`.

Errors are organized by stage:

1. **Lex errors** — from the lexer (`aether/core/lexer/lexer.ts`).
2. **Parse errors** — from the parser (`aether/core/parser/parser.ts`).
3. **Type errors** — from the type checker (`aether/core/sema/sema.ts`).
4. **Runtime errors** — from the evaluator (`aether/core/eval/eval.ts`).

Each error has:

- **The message** as it appears in the playground's Errors tab.
- **Cause** — what you did that triggered it.
- **Fix** — what to change.
- **Bad → Good** — a runnable example of the broken code and the fixed code.

Errors are non-fatal — the pipeline accumulates errors and continues, so you can see *all* errors at once, not just the first. This is "lenient playground semantics" (see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md)).

---

## 1. Lex errors

### `unexpected character 'X'`

**Cause:** The lexer encountered a character it doesn't recognize. Common cases: `@`, backtick, the `$` outside a string, an emoji, a non-ASCII character in an identifier (Aether identifiers are ASCII).

**Fix:** Remove the character or replace with a valid token.

**Bad:**
```aether
let x = 42 @ comment;
```

**Good:**
```aether
let x = 42; // comment
```

### `unterminated block comment`

**Cause:** A `/* ... */` block comment is missing its `*/`. The lexer counts `/*` depth and only ends at the matching `*/`; if it never finds one, it errors at EOF.

**Fix:** Close the comment.

**Bad:**
```aether
/* this is a comment
let x = 42;
```

**Good:**
```aether
/* this is a comment */
let x = 42;
```

### `invalid number literal 'X'`

**Cause:** A number literal that doesn't parse. Common cases: `3.14.15`, `0xGH` (invalid hex), `1e` (incomplete scientific notation).

**Fix:** Write a valid number.

**Bad:**
```aether
let x = 3.14.15;
```

**Good:**
```aether
let x = 3.14;
```

### `unterminated char literal`

**Cause:** A `'...'` char literal is missing its closing `'`. Either the opening `'` was the only character, or the closing `'` is missing.

**Fix:** Close the char.

**Bad:**
```aether
let c: char = 'a;
```

**Good:**
```aether
let c: char = 'a';
```

### `empty char literal`

**Cause:** A `''` literal — the lexer expected a character between the quotes.

**Fix:** Use a single character or `()` for unit.

**Bad:**
```aether
let c: char = '';
```

**Good:**
```aether
let c: char = ' ';
// or
let u: () = ();
```

### `unterminated string interpolation`

**Cause:** A `f"...{expr}..."` interpolated string is missing its closing `}` in the interpolation, or its closing `"` overall.

**Fix:** Close the interpolation.

**Bad:**
```aether
let x = 42;
print(f"x = {x);
```

**Good:**
```aether
let x = 42;
print(f"x = {x}");
```

### `unterminated string literal`

**Cause:** A `"..."` string is missing its closing `"`.

**Fix:** Close the string.

**Bad:**
```aether
let s = "hello world;
```

**Good:**
```aether
let s = "hello world";
```

---

## 2. Parse errors

### `expected 'X', found 'Y' at <file>:line:col`

**Cause:** The parser expected token `X` (e.g., `;`, `)`, `}`) and found `Y` instead. This is the most common parse error.

**Fix:** Add the expected token at the position.

**Bad:**
```aether
let x = 42
let y = 43;
```

**Good:**
```aether
let x = 42;
let y = 43;
```

### `expected identifier, found 'X' at <file>:line:col`

**Cause:** The parser expected an identifier (e.g., after `let`, `fn`, `enum`, `struct`) and found something else.

**Fix:** Add the identifier.

**Bad:**
```aether
let 42 = 1;
```

**Good:**
```aether
let x: int = 42;
```

### `expected type, found 'X' at <file>:line:col`

**Cause:** A type annotation was expected (after `:` or `->`) but the parser found something that isn't a type.

**Fix:** Write a valid type.

**Bad:**
```aether
let x: 42 = 1;
```

**Good:**
```aether
let x: int = 42;
```

### `expected pattern, found 'X' at <file>:line:col`

**Cause:** A `match` arm's left-hand side (the pattern) is not a valid pattern.

**Fix:** Use a literal, identifier, tuple, struct, or enum-variant pattern.

**Bad:**
```aether
match n {
  1 + 1 => "two",
}
```

**Good:**
```aether
match n {
  2 => "two",
}
```

### `expected 'in', found 'X' at <file>:line:col`

**Cause:** A `for x in iterable { ... }` loop is missing the `in` keyword between the loop variable and the iterable.

**Fix:** Add `in`.

**Bad:**
```aether
for i range(0, 10) {
  print(i);
}
```

**Good:**
```aether
for i in range(0, 10) {
  print(i);
}
```

### `expected string after import, found 'X'`

**Cause:** An `import` statement is followed by a non-string token. (Note: `import` is parsed but never resolved in v1 — see [ADR-05](../decisions/adr-05-no-modules-in-v1.md).)

**Fix:** Use a string literal (the deprecated v1 form) or — in v2 — a module path.

**Bad:**
```aether
import 42;
```

**Good:**
```aether
// v1 (no-op): import "foo";
// (or just don't use import — v1 has no modules)
```

### `expected 'fn' after 'pub', found 'X'`

**Cause:** A `pub` keyword is followed by something other than `fn`. (Note: `pub` is reserved for v2 modules; in v1 only `pub fn` is parsed, and even then it's treated like a regular `fn`.)

**Fix:** Use `pub fn` or drop the `pub`.

**Bad:**
```aether
pub let x = 42;
```

**Good:**
```aether
let x = 42;
// (pub fn name() {} works in v1 — it's parsed but treated as fn)
```

### `expected parameter name, found 'X' at <file>:line:col`

**Cause:** A function parameter is missing its name.

**Fix:** Add the parameter name before the type annotation.

**Bad:**
```aether
fn add(: int, b: int) -> int { a + b }
```

**Good:**
```aether
fn add(a: int, b: int) -> int { a + b }
```

### `expected field name, found 'X' at <file>:line:col`

**Cause:** A struct literal is missing a field name (e.g., `Point { , x: 1 }`).

**Fix:** Add the field name.

**Bad:**
```aether
struct Point { x: int, y: int }
let p = Point { : 1, y: 2 };
```

**Good:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

### `unexpected end of input at <file>:line:col`

**Cause:** The parser ran out of tokens in the middle of an expression or statement.

**Fix:** Complete the expression or statement.

**Bad:**
```aether
let x = 1 +
```

**Good:**
```aether
let x = 1 + 2;
```

### `unexpected token 'X' at <file>:line:col`

**Cause:** The parser found a token that doesn't fit at the current position.

**Fix:** Remove the token or replace it with the expected one.

**Bad:**
```aether
let x = 42 ;;
```

**Good:**
```aether
let x = 42;
```

### `failed to parse interpolation 'X': <message>`

**Cause:** The inner expression of an `f"..."` interpolation `{expr}` failed to parse. The parser re-lexes and re-parses the inner text; if it errors, you see this message wrapping the original parse error.

**Fix:** Fix the interpolation's inner expression.

**Bad:**
```aether
let x = 42;
print(f"x = {x +}");
```

**Good:**
```aether
let x = 42;
print(f"x = {x + 1}");
```

### `expected ',' or '}' after match arm at <file>:line:col`

**Cause:** After a `match` arm's body (`pattern => expr`), the parser expected either a `,` (next arm) or a `}` (end of match). It found neither.

**Fix:** Add `,` or `}`.

**Bad:**
```aether
match n {
  1 => "one"
  2 => "two"
}
```

**Good:**
```aether
match n {
  1 => "one",
  2 => "two",
}
```

### `expected ';', found 'X' at <file>:line:col`

**Cause:** A statement is missing its trailing `;`.

**Fix:** Add `;`.

**Bad:**
```aether
let x = 42
```

**Good:**
```aether
let x = 42;
```

### `expected ';' or '}' in block at <file>:line:col`

**Cause:** Inside a `{ ... }` block, the parser expected either `;` (statement boundary) or `}` (end of block) and found neither.

**Fix:** Add `;` to end the statement, or `}` to close the block.

**Bad:**
```aether
fn f() -> int {
  let x = 1
  let y = 2
  x + y
}
```

**Good:**
```aether
fn f() -> int {
  let x = 1;
  let y = 2;
  x + y
}
```

---

## 3. Type errors

### `unknown primitive type 'X'`

**Cause:** A type annotation uses a name that the checker doesn't recognize as a primitive (`int`, `float`, `bool`, `string`, `char`, `()`, or one of the built-in generics).

**Fix:** Use a valid primitive type or a user-defined type.

**Bad:**
```aether
let x: number = 42;
```

**Good:**
```aether
let x: int = 42;
```

### `'break' outside of a loop` / `'continue' outside of a loop`

**Cause:** `break` or `continue` appears outside a `while` or `for in` loop.

**Fix:** Remove the statement or wrap it in a loop.

**Bad:**
```aether
fn f() -> () {
  break;
}
```

**Good:**
```aether
fn f() -> () {
  let mut i = 0;
  while i < 10 {
    if i == 5 { break; }
    i = i + 1;
  }
}
```

### `expected <T>, found <U>` (let binding)

**Cause:** A `let` binding has a type annotation that doesn't match the initializer's type.

**Fix:** Change the annotation or the initializer.

**Bad:**
```aether
let x: int = "hello";
```

**Good:**
```aether
let x: string = "hello";
// or
let x = "hello";
```

### `'return' outside of a function`

**Cause:** A `return` statement appears at the top level (not inside a function).

**Fix:** Remove it or move it into a function.

**Bad:**
```aether
return 42;
```

**Good:**
```aether
fn answer() -> int {
  return 42;
}
```

### `expected return type <T>, found <U>`

**Cause:** A `return expr;` statement returns a value of a different type than the function's declared return type.

**Fix:** Change the return type or the returned value.

**Bad:**
```aether
fn f() -> int {
  return "hello";
}
```

**Good:**
```aether
fn f() -> string {
  return "hello";
}
```

### `while condition must be bool, found <T>`

**Cause:** A `while` loop's condition is not a `bool`. (Truth is restricted to `bool` in Aether; `if 0 { ... }` is also a type error.)

**Fix:** Use a bool condition.

**Bad:**
```aether
let mut i = 5;
while i { i = i - 1; }
```

**Good:**
```aether
let mut i = 5;
while i > 0 { i = i - 1; }
```

### `cannot iterate over <T>`

**Cause:** A `for x in expr { ... }` loop is iterating over a type that isn't iterable (not a range, array, or string).

**Fix:** Use a range, array, or string.

**Bad:**
```aether
for x in 42 { print(x); }
```

**Good:**
```aether
for x in range(0, 42) { print(x); }
```

### `undefined name 'X'`

**Cause:** An identifier is used that isn't in scope — not a binding, not a function, not a type, not a stdlib function.

**Fix:** Define it, import it, or use a different name.

**Bad:**
```aether
print(undefined_thing);
```

**Good:**
```aether
let defined_thing = 42;
print(defined_thing);
```

### `cannot assign to immutable variable 'X'`

**Cause:** You tried to reassign a `let` (immutable) binding. Only `let mut` bindings can be reassigned.

**Fix:** Use `let mut`, or remove the assignment.

**Bad:**
```aether
let x = 1;
x = 2;
```

**Good:**
```aether
let mut x = 1;
x = 2;
```

### `cannot assign <T> to <U>`

**Cause:** An assignment `x = expr` where `expr`'s type doesn't match `x`'s type.

**Fix:** Change the value or the binding's type.

**Bad:**
```aether
let mut x: int = 1;
x = "hello";
```

**Good:**
```aether
let mut x: int = 1;
x = 42;
```

### `? operator can only be applied to Result or Option, found <T>`

**Cause:** The `?` postfix operator was applied to a non-Option/Result value.

**Fix:** Use `?` only on `Option<T>` or `Result<T, E>` values, or remove the `?`.

**Bad:**
```aether
let n = 42?;
```

**Good:**
```aether
fn parse(s: string) -> result<int, string> {
  if s == "42" { Result::Ok(42) } else { Result::Err("bad") }
}
fn double(s: string) -> result<int, string> {
  let n = parse(s)?;
  Result::Ok(n * 2)
}
```

### `left of '<op>' must be bool, found <T>`

**Cause:** A logical operator (`&&`, `||`) was applied to a non-bool left operand.

**Fix:** Use a bool.

**Bad:**
```aether
if 1 && true { print("hi"); }
```

**Good:**
```aether
if true && true { print("hi"); }
```

### `cannot compare <T> with <U>`

**Cause:** A comparison operator was applied to two values of incompatible types.

**Fix:** Compare values of the same type (or use `as` to convert).

**Bad:**
```aether
print(42 == "hello");
```

**Good:**
```aether
print(str(42) == "hello");
```

### `operator '<op>' not defined for <T> and <U>`

**Cause:** A binary operator (e.g., `+`) was applied to types it's not defined for.

**Fix:** Use compatible types.

**Bad:**
```aether
print(42 + "hello");
```

**Good:**
```aether
print(str(42) + "hello");
```

### `bitwise '<op>' requires int operands, found <T> and <U>`

**Cause:** A bitwise operator (`&`, `|`, `^`, `~`, `<<`, `>>`) was applied to non-int operands.

**Fix:** Use int operands.

**Bad:**
```aether
print(1.5 & 0x0F);
```

**Good:**
```aether
print(0xFF & 0x0F);
```

### `unknown binary operator '<op>'`

**Cause:** A binary operator the checker doesn't recognize. (This is an internal error — it shouldn't happen with the standard parser.)

**Fix:** Report a bug; use a valid operator.

### `'!' requires bool, found <T>`

**Cause:** The `!` (logical not) operator was applied to a non-bool value.

**Fix:** Use a bool.

**Bad:**
```aether
let b = !42;
```

**Good:**
```aether
let b = !true;
```

### `unary '-' requires int or float, found <T>`

**Cause:** The unary `-` operator was applied to a non-numeric value.

**Fix:** Use a numeric type.

**Bad:**
```aether
let s = -"hello";
```

**Good:**
```aether
let n = -42;
```

### `'~' requires int, found <T>`

**Cause:** The `~` (bitwise not) operator was applied to a non-int value.

**Fix:** Use an int.

**Bad:**
```aether
let n = ~3.14;
```

**Good:**
```aether
let n = ~0;
```

### `cannot call non-function of type <T>`

**Cause:** A call `expr(...)` where `expr` is not a function-typed value.

**Fix:** Call a function (or closure, or stdlib function).

**Bad:**
```aether
let x = 42;
print(x(1, 2));
```

**Good:**
```aether
let f = fn(a: int, b: int) -> int { a + b };
print(f(1, 2));
```

### `expected N arguments, found M`

**Cause:** A function call with the wrong number of arguments.

**Fix:** Pass the right number.

**Bad:**
```aether
fn add(a: int, b: int) -> int { a + b }
print(add(1));
```

**Good:**
```aether
fn add(a: int, b: int) -> int { a + b }
print(add(1, 2));
```

### `argument N: expected <T>, found <U>`

**Cause:** The Nth argument of a function call has the wrong type.

**Fix:** Pass a value of the expected type.

**Bad:**
```aether
fn add(a: int, b: int) -> int { a + b }
print(add(1, "two"));
```

**Good:**
```aether
fn add(a: int, b: int) -> int { a + b }
print(add(1, 2));
```

### `array index must be int, found <T>`

**Cause:** An array indexing `arr[idx]` where `idx` is not an int.

**Fix:** Use an int index.

**Bad:**
```aether
let xs = [1, 2, 3];
print(xs["0"]);
```

**Good:**
```aether
let xs = [1, 2, 3];
print(xs[0]);
```

### `map key must be <T>, found <U>`

**Cause:** A map indexing `m[key]` where `key` is not the map's key type.

**Fix:** Use the right key type.

**Bad:**
```aether
let mut m = mapNew();
mapSet(m, "one", 1);
print(m[1]);   // map's key is string
```

**Good:**
```aether
let mut m = mapNew();
mapSet(m, "one", 1);
print(mapGet(m, "one"));
```

### `tuple index N out of bounds (length M)`

**Cause:** A tuple index `t.N` where N is greater than or equal to the tuple's length.

**Fix:** Use a valid index.

**Bad:**
```aether
let t = (1, 2);
print(t.5);
```

**Good:**
```aether
let t = (1, 2);
print(t.0);
print(t.1);
```

### `tuple index must be an integer literal`

**Cause:** A tuple index `t[idx]` (with `[...]` syntax) where `idx` is not a constant int. (Tuple field access `t.N` accepts only a literal `N`.)

**Fix:** Use a literal index, or use `.N` for tuple field access.

**Bad:**
```aether
let t = (1, 2);
let i = 0;
print(t[i]);
```

**Good:**
```aether
let t = (1, 2);
print(t.0);
// or use a real array if you need dynamic indexing
let arr = [1, 2];
let i = 0;
print(arr[i]);
```

### `string index must be int`

**Cause:** A string indexing `s[i]` where `i` is not an int.

**Fix:** Use an int index.

**Bad:**
```aether
let s = "hello";
print(s["0"]);
```

**Good:**
```aether
let s = "hello";
print(s[0]);
```

### `cannot index <T>`

**Cause:** Indexing (with `[...]`) was applied to a type that can't be indexed (not an array, map, string, or tuple).

**Fix:** Use an indexable type.

**Bad:**
```aether
let x = 42;
print(x[0]);
```

**Good:**
```aether
let xs = [1, 2, 3];
print(xs[0]);
```

### `struct <Name> has no field '<field>'`

**Cause:** A field access `s.field` (or a struct pattern matching `Name { field: ... }`) where the struct doesn't have that field.

**Fix:** Use a field that exists, or add the field to the struct.

**Bad:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.z);
```

**Good:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.x);
print(p.y);
```

### `tuple field .N out of bounds (length M)`

**Cause:** A tuple field access `t.N` where N is greater than or equal to the tuple's length. (Similar to `tuple index N out of bounds`, but for the `.` syntax.)

**Fix:** Use a valid index.

### `cannot access tuple field on <T>`

**Cause:** A tuple field access `t.N` where `t` is not a tuple.

**Fix:** Use a tuple.

### `unknown struct '<Name>'`

**Cause:** A struct literal `Name { ... }` (or a struct pattern) where `Name` is not a defined struct.

**Fix:** Define the struct or use an existing one.

**Bad:**
```aether
let p = Unknown { x: 1 };
```

**Good:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

### `field '<field>': expected <T>, found <U>`

**Cause:** A struct literal's field has the wrong type.

**Fix:** Use the right type.

**Bad:**
```aether
struct Point { x: int, y: int }
let p = Point { x: "hello", y: 2 };
```

**Good:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

### `missing field '<field>' in struct <Name>`

**Cause:** A struct literal is missing a required field.

**Fix:** Add the field.

**Bad:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1 };
```

**Good:**
```aether
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

### `unknown enum '<Name>'`

**Cause:** An enum variant construction `Name::Variant(...)` (or pattern) where `Name` is not a defined enum.

**Fix:** Define the enum or use an existing one.

**Bad:**
```aether
let x = Unknown::Foo;
```

**Good:**
```aether
enum Foo { Bar, Baz, }
let x = Foo::Bar;
```

### `enum <Name> has no variant '<variant>'`

**Cause:** An enum variant construction `Name::Variant(...)` where `Variant` doesn't exist on `Name`.

**Fix:** Use a variant that exists.

**Bad:**
```aether
enum Color { Red, Green, Blue, }
let c = Color::Purple;
```

**Good:**
```aether
enum Color { Red, Green, Blue, }
let c = Color::Red;
```

### `variant <Name>::<variant> expects N args, found M`

**Cause:** A tuple-variant construction with the wrong number of arguments.

**Fix:** Pass the right number.

**Bad:**
```aether
enum Option<T> { Some(T), None, }
let x = Option::Some(1, 2);   // Some takes 1 arg
```

**Good:**
```aether
enum Option<T> { Some(T), None, }
let x = Option::Some(1);
```

### `variant arg N: expected <T>, found <U>`

**Cause:** A tuple-variant's argument has the wrong type.

**Fix:** Use the right type.

**Bad:**
```aether
enum Option<T> { Some(T), None, }
let x = Option::Some("hello");   // if T was inferred as int elsewhere
```

### `unit variant <Name>::<variant> takes no arguments`

**Cause:** A unit variant was constructed with arguments.

**Fix:** Drop the arguments.

**Bad:**
```aether
enum Color { Red, Green, Blue, }
let c = Color::Red(42);
```

**Good:**
```aether
enum Color { Red, Green, Blue, }
let c = Color::Red;
```

### `if condition must be bool, found <T>`

**Cause:** An `if cond { ... }` where `cond` is not a bool.

**Fix:** Use a bool condition.

**Bad:**
```aether
let n = 1;
if n { print("hi"); }
```

**Good:**
```aether
let n = 1;
if n > 0 { print("hi"); }
```

### `match guard must be bool, found <T>`

**Cause:** A `match` arm guard `pattern if cond => ...` where `cond` is not a bool.

**Fix:** Use a bool guard.

**Bad:**
```aether
match n {
  x if x => "x",
}
```

**Good:**
```aether
match n {
  x if x > 0 => "positive",
}
```

### `cannot cast <T> as <U>`

**Cause:** An explicit cast `expr as Type` where the cast is not allowed.

**Fix:** Use a valid cast (int ↔ float are the main ones).

**Bad:**
```aether
let b = 0 as bool;
```

**Good:**
```aether
let f = 42 as float;     // int -> float
let i = 3.99 as int;      // float -> int (truncates)
```

### `pattern expects <T>, scrutinee is <U>`

**Cause:** A match arm's pattern doesn't match the scrutinee's type.

**Fix:** Use a pattern of the right type.

**Bad:**
```aether
let n: int = 42;
match n {
  Option::Some(v) => print(v),
  Option::None => print("none"),
}
```

**Good:**
```aether
let o: option<int> = Option::Some(42);
match o {
  Option::Some(v) => print(v),
  Option::None => print("none"),
}
```

### `literal pattern <T> does not match scrutinee <U>`

**Cause:** A literal pattern (e.g., `1`) doesn't match the scrutinee's type.

**Fix:** Use a literal of the right type.

**Bad:**
```aether
let s = "hello";
match s {
  1 => "one",
  _ => "other",
}
```

**Good:**
```aether
let s = "hello";
match s {
  "hello" => "hi",
  _ => "other",
}
```

### `tuple pattern cannot match <T>`

**Cause:** A tuple pattern was applied to a non-tuple scrutinee.

**Fix:** Use a tuple scrutinee or a different pattern.

### `tuple pattern arity N does not match M`

**Cause:** A tuple pattern has the wrong number of elements.

**Fix:** Use the right arity.

**Bad:**
```aether
match (1, 2) {
  (a, b, c) => print(a),
}
```

**Good:**
```aether
match (1, 2) {
  (a, b) => print(a),
}
```

### `array pattern cannot match <T>`

**Cause:** An array pattern was applied to a non-array scrutinee.

**Fix:** Use an array scrutinee.

### `unknown struct '<Name>' in pattern`

**Cause:** A struct pattern `Name { ... }` where `Name` is not a defined struct.

**Fix:** Define the struct or use an existing one.

### `unknown enum '<Name>' in pattern`

**Cause:** An enum pattern `Name::Variant(...)` where `Name` is not a defined enum.

**Fix:** Define the enum or use an existing one.

### `enum <Name> has no variant '<variant>'` (in pattern)

**Cause:** An enum pattern uses a variant that doesn't exist.

**Fix:** Use a variant that exists.

### `variant <Name>::<variant> expects N subpatterns, found M`

**Cause:** A variant pattern has the wrong number of subpatterns.

**Fix:** Use the right number.

### `struct variants must be matched with { field: pattern } syntax`

**Cause:** A struct variant pattern uses the wrong syntax (tuple syntax for a struct variant).

**Fix:** Use `{ field: pattern, ... }` syntax.

**Bad:**
```aether
enum P { Point { x: int, y: int } }
match p {
  P::Point(a, b) => print(a),   // wrong syntax
}
```

**Good:**
```aether
enum P { Point { x: int, y: int } }
match p {
  P::Point { x, y } => print(x),
}
```

### `unit variant <Name>::<variant> takes no subpatterns`

**Cause:** A unit variant was pattern-matched with subpatterns.

**Fix:** Drop the subpatterns.

**Bad:**
```aether
enum Color { Red, Green, Blue, }
match c {
  Color::Red(x) => print(x),
}
```

**Good:**
```aether
enum Color { Red, Green, Blue, }
match c {
  Color::Red => print("red"),
}
```

### `cannot unify <T> with <U>`

**Cause:** A unification failure during type inference — two types that the compiler tried to unify (e.g., match arm types, generic instantiation) are incompatible.

**Fix:** Make the types compatible.

**Bad:**
```aether
let x = if true { 1 } else { "two" };
// arms have type int and string — can't unify
```

**Good:**
```aether
let x = if true { 1 } else { 2 };
// both arms are int
```

---

## 4. Runtime errors

### `panic: <message>`

**Cause:** A `panic(msg)` call from the user program.

**Fix:** Don't panic; or fix the condition that triggered it.

**Bad:**
```aether
fn divide(a: int, b: int) -> int {
  if b == 0 { panic("div by zero"); }
  a / b
}
divide(10, 0);
```

**Good:**
```aether
fn divide(a: int, b: int) -> result<int, string> {
  if b == 0 { Result::Err("div by zero") } else { Result::Ok(a / b) }
}
```

### `array index out of bounds: N`

**Cause:** An array index `arr[N]` where N is negative or ≥ length.

**Fix:** Check the length first, or use a valid index.

**Bad:**
```aether
let xs = [1, 2, 3];
print(xs[5]);
```

**Good:**
```aether
let xs = [1, 2, 3];
if 5 < len(xs) {
  print(xs[5]);
} else {
  print("out of bounds");
}
```

### `string index out of bounds: N`

**Cause:** A string index `s[N]` where N is negative or ≥ length.

**Fix:** Check the length first.

### `tuple index out of bounds: N`

**Cause:** A tuple index `t[N]` where N is out of range. (Similar to the type-level error, but at runtime — usually this means a dynamic index.)

### `map key not found: <key>`

**Cause:** A `mapGet(m, k)` (or `m[k]`) where the key isn't in the map. `mapGet` panics; use `mapHas` to check first.

**Fix:** Check with `mapHas` first, or use a safe accessor.

**Bad:**
```aether
let mut m = mapNew();
print(mapGet(m, "missing"));
```

**Good:**
```aether
let mut m = mapNew();
if mapHas(m, "missing") {
  print(mapGet(m, "missing"));
} else {
  print("no such key");
}
```

### `division by zero`

**Cause:** `a / b` where `b` is 0.

**Fix:** Check for zero first, or return a `Result`.

### `modulo by zero`

**Cause:** `a % b` where `b` is 0.

**Fix:** Check for zero first.

### `no match arm matched`

**Cause:** A `match` expression where the scrutinee doesn't match any arm. (Note: v1 doesn't enforce exhaustiveness at compile time, so this is a runtime panic. See [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md).)

**Fix:** Add a wildcard `_ => ...` arm, or add the missing variants.

**Bad:**
```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
  }
}
print(name(Color::Green));   // panic
```

**Good:**
```aether
enum Color { Red, Green, Blue, }
fn name(c: Color) -> string {
  match c {
    Color::Red => "red",
    _ => "other",   // wildcard
  }
}
```

### `cannot call non-function value <description>`

**Cause:** A call `expr(...)` at runtime where `expr` isn't a function. (The type checker usually catches this; this is a runtime fallback.)

**Fix:** Call a function.

### `struct <Name> has no field '<field>'` (runtime)

**Cause:** A field access `s.field` at runtime where `s` is a struct that doesn't have `field`. (Type checker usually catches this; runtime fallback.)

### `? operator applied to non-Result/Option: <value>`

**Cause:** The `?` operator at runtime applied to a non-Result/Option value. (Type checker usually catches this.)

### `cannot iterate over <type>`

**Cause:** A `for x in expr { ... }` where `expr` is not iterable at runtime. (Type checker usually catches this for static types; this fires for dynamic values.)

### `execution step limit exceeded (N)`

**Cause:** The program exceeded the step limit (default 1M). See [performance.md](../tutorials/performance.md).

**Fix:** Bump `maxSteps` (host code) or rewrite the program (use iteration instead of recursion, use stdlib instead of hand-rolled loops, use a closed form).

**Bad:**
```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
print(fib(40));   // ~330M calls, blows the limit
```

**Good:**
```aether
fn fib(n: int) -> int {
  let mut a = 0;
  let mut b = 1;
  let mut i = 0;
  while i < n {
    let c = a + b;
    a = b;
    b = c;
    i = i + 1;
  }
  a
}
print(fib(40));   // ~120 steps
```

### `assertion failed` / `assertion failed: <message>`

**Cause:** `assert(false)` or `assert(false, "msg")` — the condition was false.

**Fix:** Fix the condition.

### `assertion failed: <a> != <b>`

**Cause:** `assert_eq(a, b)` where `a` and `b` aren't deeply equal.

**Fix:** Fix the expected value or the actual value.

**Bad:**
```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
assert_eq(fib(10), 54);   // wrong — should be 55
```

**Good:**
```aether
fn fib(n: int) -> int {
  if n < 2 { n } else { fib(n - 1) + fib(n - 2) }
}
assert_eq(fib(10), 55);
```

### `undefined name '<name>'` (runtime)

**Cause:** A reference to an undefined name that slipped past the type checker (shouldn't happen; the type checker catches `undefined name` first).

### `cannot assign to immutable variable '<name>'` (runtime)

**Cause:** A reassignment to an immutable binding that slipped past the type checker.

### `invalid assignment target: <kind>`

**Cause:** An assignment target that's not a valid l-value (not a name, field, index, or tuple field).

**Fix:** Use a valid assignment target.

**Bad:**
```aether
1 = 2;
```

**Good:**
```aether
let mut x = 1;
x = 2;
```

### `cannot assign field '<field>' on non-struct`

**Cause:** A field assignment `s.field = v` where `s` is not a struct.

**Fix:** Use a struct, or (note: v1 doesn't support field assignment anyway — see [ownership.md](../tutorials/ownership.md) § 8).

### `unknown binary operator '<op>'` (runtime)

**Cause:** A binary operator the evaluator doesn't recognize. (Internal error — shouldn't happen with valid parser.)

### `unknown unary operator '<op>'` (runtime)

**Cause:** A unary operator the evaluator doesn't recognize.

### `unknown compound assign '<op>='` (runtime)

**Cause:** A compound assignment (`+=`, etc.) the evaluator doesn't recognize.

### `cannot index-assign into non-array/map`

**Cause:** An index assignment `t[i] = v` where `t` is not an array or map.

### `cannot index into <type>`

**Cause:** An indexing `t[i]` where `t` is not an indexable type (array, map, string, tuple).

### `cannot access field '<field>' on <type>`

**Cause:** A field access `s.field` where `s` is not a struct.

### `no method '<name>' on <type>`

**Cause:** A method call `s.name(...)` where `s` doesn't have that method. (Note: methods are not yet a feature; this is reserved for v2.)

### `spread base is not a struct`

**Cause:** A struct spread `Name { ..base }` where `base` is not a struct.

### `cannot apply tuple field .N to non-tuple`

**Cause:** A tuple field access `t.N` where `t` is not a tuple.

### `int: cannot parse '<value>'`

**Cause:** A call to the inline `int(x)` builtin where `x` is a string that doesn't parse as an integer.

**Fix:** Use a valid string.

**Bad:**
```aether
let n = int("hello");
```

**Good:**
```aether
let n = int("42");
```

### `float: cannot parse '<value>'`

**Cause:** A call to the inline `float(x)` builtin where `x` is a string that doesn't parse as a float.

### `push: expected array`

**Cause:** `push(arr, v)` where `arr` is not an array.

### `pop: expected array`

**Cause:** `pop(arr)` where `arr` is not an array.

### `map: expected array`

**Cause:** `map(arr, fn)` where `arr` is not an array.

### `filter: expected array`

**Cause:** `filter(arr, fn)` where `arr` is not an array.

### `reduce: expected array`

**Cause:** `reduce(arr, fn, init)` where `arr` is not an array.

### `len: unsupported value <type>`

**Cause:** `len(x)` where `x` is not an array, string, map, or set.

### `Maximum call stack size exceeded`

**Cause:** The host JS engine's stack overflowed. Aether has no tail-call optimization in v1; deep recursion hits this. The step limit usually fires first; this fires for very deep tail-recursion that doesn't trip the step counter.

**Fix:** Use iteration instead of deep recursion.

---

## 5. Reading errors in the playground

The Errors tab in the playground shows each error with its stage (`lex`, `parse`, `type`, `runtime`) and the source location (`line:col`). Errors are color-coded by stage; clicking an error scrolls the editor to the relevant line.

The "lenient playground semantics" (see [ADR-09](../decisions/adr-09-vitest-for-implementation-tests.md)) means type errors don't block execution — the program runs anyway, and you see both the type error and the runtime output (which may itself include a runtime error). This is intentional: in a teaching playground, it's often instructive to see what a slightly-typed-wrong program does at runtime.

The Stats tab shows the step count and elapsed time, useful for distinguishing "type error in my head, runtime went crazy" from "type error and runtime is consistent with the type checker's view".

## 6. Common gotchas

- A single typo can produce multiple errors. Fix the first error; the rest often disappear.
- Type errors don't block the run; a runtime error after a type error is often a symptom of the type error.
- The step limit fires after the program has run partway; output emitted before the panic is preserved.
- Match exhaustiveness isn't checked in v1 — write a `_` arm or check the runtime error.
- Lambda parameter types are required in v1; missing them is a parse error, not a type error.

## 7. What's next

- [getting-started.md](../tutorials/getting-started.md) § 7 — reading errors in depth.
- [error-handling.md](../tutorials/error-handling.md) — `Result` and `?` for recoverable errors.
- [testing.md](../tutorials/testing.md) — `assert` and `assert_eq` as panic-based testing.
- [decisions/adr-09-vitest-for-implementation-tests.md](../decisions/adr-09-vitest-for-implementation-tests.md) — the lenient-semantics decision.
