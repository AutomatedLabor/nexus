# Aether Error Catalog

> Audience: anyone who got an error message and wants to know
> what it means and how to fix it.
> Prerequisites: a passing familiarity with Aether syntax.

This catalog lists 60+ error messages the Aether compiler and
runtime can produce. Each entry has:

- the **error text** (the actual message string),
- what **causes** it,
- how to **fix** it,
- a **bad → good** example.

The errors are grouped by stage:

- **Lexer** (1-8) — from `aether/core/lexer/lexer.ts`.
- **Parser** (9-20) — from `aether/core/parser/parser.ts`.
- **Type checker (sema)** (21-50) — from `aether/core/sema/sema.ts`.
- **Runtime (eval)** (51-65) — from `aether/core/eval/eval.ts`.

For a tutorial on reading errors, see
[../tutorials/getting-started.md](../tutorials/getting-started.md)
§8. For the v2 plan for better diagnostics, see
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§3.

## 1. Lexer errors

Lexer errors come from `aether/core/lexer/lexer.ts`. They are
reported in the Inspector's Tokens tab and the Output pane.

### E01. `unexpected character '<c>'`

**Cause:** The lexer hit a character it does not recognize.

**Fix:** Remove the character or replace it with valid Aether
syntax.

```aether
// Bad
let x = @;

// Good
let x = 42;
```

### E02. `unterminated block comment`

**Cause:** A `/* ... */` block comment is missing its closing
`*/`. The lexer hit end-of-file inside the comment.

**Fix:** Add the closing `*/`.

```aether
// Bad
/* this comment never ends

// Good
/* this comment ends */
```

### E03. `unterminated char literal`

**Cause:** A `'...'` char literal is missing its closing `'`.
The lexer hit end-of-file or a newline inside the literal.

**Fix:** Add the closing `'`.

```aether
// Bad
let c = 'a;

// Good
let c = 'a';
```

### E04. `empty char literal`

**Cause:** You wrote `''` (two single quotes with nothing
between). A char literal must contain exactly one character
(or an escape sequence).

**Fix:** Put a character inside, or use a string if you want
the empty case.

```aether
// Bad
let c = '';

// Good
let c = 'a';
// Or, for the empty case, use a string:
let s = "";
```

### E05. `unterminated string literal`

**Cause:** A `"..."` string literal is missing its closing
`"`. The lexer hit end-of-file inside the string.

**Fix:** Add the closing `"`.

```aether
// Bad
let s = "hello;

// Good
let s = "hello";
```

### E06. `unterminated string interpolation`

**Cause:** An `f"..."` interpolated string has a `{expr}`
without a closing `}`. The lexer hit end-of-file inside the
interpolation.

**Fix:** Add the closing `}`.

```aether
// Bad
let name = "Alice";
let s = f"hello, {name";

// Good
let name = "Alice";
let s = f"hello, {name}";
```

### E07. `invalid number literal '<raw>'`

**Cause:** A number literal has a character that is not a
digit, an underscore, or (for floats) a decimal point. This
usually happens when a letter is glued to a number.

**Fix:** Separate the number and the letter.

```aether
// Bad
let x = 12abc;

// Good
let x = 12;
let y = "abc";
```

## 2. Parser errors

Parser errors come from `aether/core/parser/parser.ts`. They
are reported in the Inspector's AST tab. The format is
typically `expected X, found Y at file:line:col`.

### E08. `expected ';', found '<token>' at <file>:<line>:<col>`

**Cause:** A statement that requires a `;` (e.g., `let x =
...`, an expression statement) is missing the semicolon.

**Fix:** Add the `;`.

```aether
// Bad
let x = 42
print(x);

// Good
let x = 42;
print(x);
```

### E09. `expected identifier, found '<token>'`

**Cause:** The parser expected a name (e.g., after `let`,
`fn`, `struct`) but found something else.

**Fix:** Provide an identifier.

```aether
// Bad
let 42 = 1;

// Good
let x = 1;
```

### E10. `expected 'in', found '<token>'`

**Cause:** A `for` loop is missing the `in` keyword between
the loop variable and the iterable.

**Fix:** Add `in`.

```aether
// Bad
for x [1, 2, 3] { print(x); }

// Good
for x in [1, 2, 3] { print(x); }
```

### E11. `expected parameter name, found '<token>'`

**Cause:** A function parameter is missing its name, or the
name is a reserved word.

**Fix:** Use a valid identifier as the parameter name.

```aether
// Bad
fn f(: int) -> int { 0 }

// Good
fn f(x: int) -> int { 0 }
```

### E12. `expected type, found '<token>'`

**Cause:** A type annotation has something that is not a type
where the parser expected a type.

**Fix:** Provide a valid type.

```aether
// Bad
let x: 42 = 1;

// Good
let x: int = 1;
```

### E13. `expected pattern, found '<token>'`

**Cause:** A `match` arm has something that is not a pattern
where the parser expected a pattern.

**Fix:** Use a valid pattern (literal, identifier, `_`,
tuple, struct, enum variant).

```aether
// Bad
match n { => 0 }

// Good
match n { _ => 0 }
```

### E14. `unexpected end of input`

**Cause:** The parser hit end-of-file in the middle of a
construct (e.g., an unclosed `{`).

**Fix:** Add the missing closing token.

```aether
// Bad
fn f() { print("hi");

// Good
fn f() { print("hi"); }
```

### E15. `unexpected token '<token>'`

**Cause:** The parser found a token that does not start any
valid expression or statement.

**Fix:** Remove the token or replace it with valid syntax.

```aether
// Bad
let x = = 1;

// Good
let x = 1;
```

### E16. `expected ',' or '}' after match arm`

**Cause:** A `match` arm is missing the `,` separator or the
closing `}` of the match.

**Fix:** Add the `,` or `}`.

```aether
// Bad
match n {
  0 => "zero"
  1 => "one"
}

// Good
match n {
  0 => "zero",
  1 => "one",
}
```

### E17. `expected ';' or '}' in block`

**Cause:** A statement inside a block is missing its `;`, and
the parser hit the closing `}` of the block.

**Fix:** Add the `;`.

```aether
// Bad
fn f() {
  let x = 1
}

// Good
fn f() {
  let x = 1;
}
```

### E18. `expected 'fn' after 'pub', found '<token>'`

**Cause:** You wrote `pub` followed by something that is not
a `fn` declaration. In v1, only `pub fn` is supported; there
are no `pub let`, `pub struct`, etc.

**Fix:** Either use `pub fn` or drop the `pub`.

```aether
// Bad
pub let x = 1;

// Good
let x = 1;
// or, in v2:
// pub fn x() -> int { 1 }
```

### E19. `expected string after import, found '<token>'`

**Cause:** An `import` statement is missing its string
argument.

**Fix:** Provide a string.

```aether
// Bad
import std;

// Good (v1 parses but does not resolve imports)
import "std";
```

### E20. `expected field name, found '<token>'`

**Cause:** A struct literal or struct pattern has something
that is not a field name.

**Fix:** Use a valid field name.

```aether
// Bad
let p = Point { 42: 1 };

// Good
let p = Point { x: 42 };
```

## 3. Type checker errors (sema)

Type errors come from `aether/core/sema/sema.ts`. They are
reported in the Inspector's Type errors tab.

### E21. `expected <expected>, found <found>`

**Cause:** A value of one type was used where another type
was expected. The most common type error.

**Fix:** Convert the value (e.g., with `as`), or change the
expected type, or fix the value.

```aether
// Bad
let x: int = "hello";

// Good
let x: int = 42;
// Or:
let x: string = "hello";
// Or:
let x: int = int("hello");
```

### E22. `'return' outside of a function`

**Cause:** A `return` statement appears at the top level,
outside any function.

**Fix:** Move the `return` inside a function, or remove it.

```aether
// Bad
return 42;

// Good
fn f() -> int { return 42; }
```

### E23. `'break' outside of a loop` / `'continue' outside of a loop`

**Cause:** A `break` or `continue` appears outside any
`while` or `for` loop.

**Fix:** Move it inside a loop, or remove it.

```aether
// Bad
let x = 1;
break;

// Good
while true { break; }
```

### E24. `expected return type <ret>, found <found>`

**Cause:** A function's return expression has a type that
does not match the declared return type.

**Fix:** Change the return expression to match the return
type, or change the return type.

```aether
// Bad
fn f() -> int { "hello" }

// Good
fn f() -> int { 42 }
// Or:
fn f() -> string { "hello" }
```

### E25. `while condition must be bool, found <found>`

**Cause:** A `while` loop's condition is not a `bool`.

**Fix:** Make the condition a `bool`.

```aether
// Bad
let mut i = 0;
while i { i = i + 1; }

// Good
let mut i = 0;
while i < 10 { i = i + 1; }
```

### E26. `cannot iterate over <type>`

**Cause:** A `for` loop's iterable is not an array or range.

**Fix:** Use an array or a `range(...)`.

```aether
// Bad
for x in 42 { print(x); }

// Good
for x in [1, 2, 3] { print(x); }
// Or:
for x in range(0, 10) { print(x); }
```

### E27. `undefined name '<name>'`

**Cause:** An identifier is used that is not in scope.

**Fix:** Define the name, or import it, or fix the typo.

```aether
// Bad
print(undefined_name);

// Good
let x = 42;
print(x);
```

### E28. `cannot assign to immutable variable '<name>'`

**Cause:** You tried to reassign a `let`-bound variable.

**Fix:** Use `let mut` instead, or introduce a new binding.

```aether
// Bad
let x = 1;
x = 2;

// Good
let mut x = 1;
x = 2;
// Or:
let x = 1;
let y = 2;
```

### E29. `cannot assign <found> to <expected>`

**Cause:** An assignment (including compound assignment) has a
right-hand side whose type does not match the variable's
type.

**Fix:** Convert the value or fix the variable's type.

```aether
// Bad
let mut x: int = 0;
x = "hello";

// Good
let mut x: int = 0;
x = 42;
```

### E30. `'self' used outside of method`

**Cause:** `self` is used outside a method (which Aether v1
does not have anyway).

**Fix:** Remove the `self` reference, or use a parameter.

```aether
// Bad
fn f() -> int { self.x }

// Good
fn f(p: Point) -> int { p.x }
```

### E31. `range bounds must be numeric, found <found>`

**Cause:** A `range` call has non-numeric arguments.

**Fix:** Pass `int` values to `range`.

```aether
// Bad
for i in range("a", "z") { print(i); }

// Good
for i in range(0, 26) { print(i); }
```

### E32. `? operator can only be applied to Result or Option, found <found>`

**Cause:** The `?` operator was applied to a value that is
not an `Option` or `Result`.

**Fix:** Make the value an `Option` or `Result`, or remove
the `?`.

```aether
// Bad
let x = 5?;
print(x);

// Good
fn f() -> Option<int> {
  let x = Option::Some(5)?;
  Option::Some(x)
}
```

### E33. `left of '<op>' must be bool, found <found>` / `right of '<op>' must be bool, found <found>`

**Cause:** A logical operator (`&&`, `||`) has a non-bool
operand.

**Fix:** Make the operands `bool`.

```aether
// Bad
if 1 && 2 { print("yes"); }

// Good
if true && true { print("yes"); }
```

### E34. `cannot compare <left> with <right>`

**Cause:** A comparison operator (`==`, `!=`, `<`, `<=`,
`>`, `>=`) is used on incompatible types.

**Fix:** Convert one or both operands to a common type.

```aether
// Bad
if 1 < "a" { print("yes"); }

// Good
if 1 < 2 { print("yes"); }
```

### E35. `operator '<op>' not defined for <left> and <right>`

**Cause:** An arithmetic operator is used on types that do
not support it (e.g., `+` on `string` and `int`).

**Fix:** Convert the operands to compatible types.

```aether
// Bad
print(1 + "two");

// Good
print(1 + 2);
// Or:
print("1" + "two");
// Or:
print((1 as string) + "two");
```

### E36. `bitwise '<op>' requires int operands, found <left> and <right>`

**Cause:** A bitwise operator (`&`, `|`, `^`, `~`, `<<`,
`>>`) is used on non-`int` operands.

**Fix:** Convert the operands to `int`.

```aether
// Bad
print(1.5 & 2.5);

// Good
print(1 & 2);
```

### E37. `'!' requires bool, found <found>`

**Cause:** The `!` (logical not) operator is applied to a
non-bool.

**Fix:** Make the operand a `bool`.

```aether
// Bad
print(!1);

// Good
print(!true);
```

### E38. `unary '-' requires int or float, found <found>`

**Cause:** The unary `-` (negation) operator is applied to
a non-numeric value.

**Fix:** Make the operand numeric.

```aether
// Bad
print(-"hello");

// Good
print(-42);
```

### E39. `'~' requires int, found <found>`

**Cause:** The `~` (bitwise not) operator is applied to a
non-`int`.

**Fix:** Make the operand an `int`.

```aether
// Bad
print(~"hello");

// Good
print(~0);
```

### E40. `cannot call non-function of type <type>`

**Cause:** A call `f(...)` has `f` bound to something that is
not a function.

**Fix:** Make `f` a function.

```aether
// Bad
let x = 42;
print(x(1, 2));

// Good
let f = fn(a: int, b: int) -> int { a + b };
print(f(1, 2));
```

### E41. `expected <expected> arguments, found <found>`

**Cause:** A function call has the wrong number of arguments.

**Fix:** Match the function's arity.

```aether
// Bad
fn add(a: int, b: int) -> int { a + b }
print(add(1));      // missing argument

// Good
fn add(a: int, b: int) -> int { a + b }
print(add(1, 2));
```

### E42. `argument <n>: expected <expected>, found <found>`

**Cause:** A function call argument has the wrong type.

**Fix:** Convert the argument to the expected type.

```aether
// Bad
fn add(a: int, b: int) -> int { a + b }
print(add(1, "two"));

// Good
fn add(a: int, b: int) -> int { a + b }
print(add(1, 2));
```

### E43. `array index must be int, found <found>`

**Cause:** An array index `xs[i]` has `i` of a non-`int` type.

**Fix:** Make the index an `int`.

```aether
// Bad
let xs = [1, 2, 3];
print(xs[1.5]);

// Good
let xs = [1, 2, 3];
print(xs[1]);
```

### E44. `map key must be <expected>, found <found>`

**Cause:** A map index `m[k]` has `k` of a type that does not
match the map's key type.

**Fix:** Make the key the map's key type.

```aether
// Bad
let m: map[string]int = { "a": 1 };
print(m[1]);

// Good
let m: map[string]int = { "a": 1 };
print(m["a"]);
```

### E45. `tuple index <i> out of bounds (length <n>)`

**Cause:** A tuple field access `t.i` has `i` outside the
tuple's length.

**Fix:** Use a valid index.

```aether
// Bad
let p = (1, 2);
print(p.5);

// Good
let p = (1, 2);
print(p.0);
```

### E46. `tuple index must be an integer literal`

**Cause:** A tuple field access `t.i` has `i` that is not an
integer literal.

**Fix:** Use an integer literal.

```aether
// Bad
let p = (1, 2);
let i = 0;
print(p.i);

// Good
let p = (1, 2);
print(p.0);
```

### E47. `string index must be int`

**Cause:** A string index `s[i]` has `i` of a non-`int` type.

**Fix:** Make the index an `int`.

```aether
// Bad
print("hello"["a"]);

// Good
print("hello"[0]);
```

### E48. `cannot index <type>`

**Cause:** An index `x[i]` has `x` of a type that does not
support indexing (not array, map, tuple, or string).

**Fix:** Use an array, map, tuple, or string.

```aether
// Bad
print(42[0]);

// Good
print([42][0]);
```

### E49. `struct <name> has no field '<field>'`

**Cause:** A struct field access `s.field` has `field` that
does not exist on the struct.

**Fix:** Use a valid field name, or add the field to the
struct.

```aether
// Bad
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.z);

// Good
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
print(p.x);
```

### E50. `missing field '<field>' in struct <name>`

**Cause:** A struct literal is missing a required field.

**Fix:** Add the field.

```aether
// Bad
struct Point { x: int, y: int }
let p = Point { x: 1 };

// Good
struct Point { x: int, y: int }
let p = Point { x: 1, y: 2 };
```

### E51. `unknown enum '<name>'`

**Cause:** An enum variant constructor `Name::Variant` has
`Name` that is not a declared enum.

**Fix:** Declare the enum, or use an existing enum's name.

```aether
// Bad
let x = Foo::Bar(1);

// Good
enum Foo { Bar(int), }
let x = Foo::Bar(1);
```

### E52. `enum <name> has no variant '<variant>'`

**Cause:** An enum variant `Name::Variant` has `Variant`
that does not exist on the enum.

**Fix:** Use a valid variant name.

```aether
// Bad
enum Color { Red, Green, Blue }
let c = Color::Purple;

// Good
enum Color { Red, Green, Blue }
let c = Color::Red;
```

### E53. `if condition must be bool, found <found>`

**Cause:** An `if` condition is not a `bool`.

**Fix:** Make the condition a `bool`.

```aether
// Bad
if 1 { print("yes"); }

// Good
if 1 == 1 { print("yes"); }
```

### E54. `cannot cast <source> as <target>`

**Cause:** An `as` cast between two types that are not
convertible.

**Fix:** Use a valid cast (`int` ↔ `float`, `int` ↔ `string`,
`bool` ↔ `string`, etc.), or convert manually.

```aether
// Bad
let x = "hello" as int;

// Good
let x = int("hello");
```

## 4. Runtime errors (eval)

Runtime errors come from `aether/core/eval/eval.ts`. They are
reported in the Output pane (not the Type errors tab) because
they happen at execution time.

### E55. `execution step limit exceeded (<N>)`

**Cause:** The evaluator hit the step limit (default
1,000,000). This usually means an infinite loop or
unboundedly deep recursion.

**Fix:** Find the loop or recursion and bound it, or raise
the step limit via `maxSteps`.

```aether
// Bad
let mut i = 0;
while true { i = i + 1; }

// Good
let mut i = 0;
while i < 1000 { i = i + 1; }
```

### E56. `division by zero`

**Cause:** A `/` operation has a zero divisor.

**Fix:** Check for zero before dividing.

```aether
// Bad
print(7 / 0);

// Good
fn safe_div(a: int, b: int) -> int {
  if b == 0 { 0 } else { a / b }
}
print(safe_div(7, 0));
```

### E57. `modulo by zero`

**Cause:** A `%` operation has a zero divisor.

**Fix:** Check for zero before modulo.

```aether
// Bad
print(7 % 0);

// Good
fn safe_mod(a: int, b: int) -> int {
  if b == 0 { 0 } else { a % b }
}
print(safe_mod(7, 0));
```

### E58. `array index out of bounds: <i>`

**Cause:** An array index `xs[i]` has `i` outside the
array's bounds.

**Fix:** Check the index before accessing, or use a safe
wrapper.

```aether
// Bad
let xs = [1, 2, 3];
print(xs[5]);

// Good
let xs = [1, 2, 3];
fn safe_get(xs: [int], i: int) -> Option<int> {
  if i < 0 || i >= len(xs) { Option::None }
  else { Option::Some(xs[i]) }
}
print(safe_get(xs, 5));
```

### E59. `string index out of bounds: <i>`

**Cause:** A string index `s[i]` has `i` outside the string's
length.

**Fix:** Check the index before accessing.

```aether
// Bad
print("hello"[10]);

// Good
fn safe_char(s: string, i: int) -> Option<char> {
  if i < 0 || i >= len(s) { Option::None }
  else { Option::Some(s[i]) }
}
print(safe_char("hello", 10));
```

### E60. `map key not found: <key>`

**Cause:** A map index `m[k]` has `k` that is not in the
map.

**Fix:** Use `map_has` to check, or `map_get` (which
returns null).

```aether
// Bad
let m = { "a": 1 };
print(m["missing"]);

// Good
let m = { "a": 1 };
if map_has(m, "missing") {
  print(m["missing"]);
} else {
  print("not found");
}
```

### E61. `no match arm matched`

**Cause:** A `match` expression fell through all arms without
matching. This happens when you forget a variant.

**Fix:** Add the missing arm, or a `_` wildcard.

```aether
// Bad
fn describe(o: Option<int>) -> int {
  match o { Option::Some(v) => v }
}
print(describe(Option::None));

// Good
fn describe(o: Option<int>) -> int {
  match o {
    Option::Some(v) => v,
    Option::None    => 0,
  }
}
print(describe(Option::None));
```

### E62. `panic: <message>`

**Cause:** A `panic(msg)` call was executed.

**Fix:** Find the `panic` call and replace with `Result` if
the failure is expected.

```aether
// Bad
fn f(n: int) -> int {
  if n < 0 { panic("negative"); }
  n
}

// Good
fn f(n: int) -> Result<int, string> {
  if n < 0 { Result::Err("negative") }
  else { Result::Ok(n) }
}
```

### E63. `assertion failed` / `assertion failed: <msg>`

**Cause:** An `assert(cond)` call had `cond` evaluate to
`false`.

**Fix:** Fix the condition, or fix the code that violates the
assertion.

```aether
// Bad
assert(1 == 2);

// Good
assert(1 == 1);
```

### E64. `assertion failed: <a> != <b>`

**Cause:** An `assert_eq(a, b)` call had `a` and `b` not
deep-equal.

**Fix:** Fix the values, or fix the code that produces them.

```aether
// Bad
assert_eq(1, 2);

// Good
assert_eq(1, 1);
```

### E65. `undefined name '<name>'` (runtime)

**Cause:** The evaluator hit an undefined name at runtime
(this should be a compile-time error, but v1's flow analysis
is limited).

**Fix:** Define the name.

```aether
// Bad
print(undefined_name);

// Good
let x = 42;
print(x);
```

## 5. Where to go next

- **[../tutorials/getting-started.md](../tutorials/getting-started.md)
  §8** — reading errors tutorial.
- **[../tutorials/error-handling.md](../tutorials/error-handling.md)**
  — `Result`, `Option`, `?`.
- **[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
  §3** — the diagnostic model.
- **[../guides/anti-patterns.md](../guides/anti-patterns.md)**
  — patterns that produce these errors.

Errors in Aether v1 are short and direct. The v2 plan adds
error codes, structured notes, and machine-applicable
suggestions; see
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§3. Until then, this catalog is the reference.
