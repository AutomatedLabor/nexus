# Aether Glossary

> Audience: anyone needing a definition of a term used in the
> Aether docs.
> Prerequisites: none.

This glossary defines 150+ terms used across the Aether
specification, tutorials, guides, RFCs, and ADRs. Each term
is in *italics* the first time it appears in a given document
and is defined here for reference. Terms are grouped
alphabetically; cross-references are marked with →.

## A

**ADT**
: Algebraic Data Type. A type built from sums (`enum`) and
products (`struct`, tuple). Aether's `enum` and `struct` are
ADTs in the ML tradition. See
[../spec/03-type-system.md](../spec/03-type-system.md) §3.

**Affine type**
: A type whose values can be used *at most once*. Aether v1
does not have affine types; v2 will, via the borrow checker.
See [../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).

**Alias**
: A name for an existing value or type. Aether `type`
declarations are aliases (transparent); v2 may add newtype
(distinct).

**Arena**
: A per-compilation bump-allocator used by the parser to store
AST nodes. Arena allocation is fast and never frees
individual nodes; the whole arena is freed at the end of
compilation. See [../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§2.3.

**Argument**
: A value passed to a function at a call site. See also
→ parameter.

**Array**
: A growable, homogeneous, contiguous sequence of values. The
type is `[T]`. See [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§3.

**Arrow type**
: A function type, written `fn(T) -> R` in Aether. See also
→ function type.

**AST**
: Abstract Syntax Tree. The tree-shaped intermediate
representation produced by the parser from a token stream.
See [../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§2.3.

**Async function**
: A function declared with `async fn` whose body may suspend
at `await` points. Calling it returns a `Future<Output = T>`.
Not in v1; planned for v2. See
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

**Atomic**
: An operation that is indivisible — either it completes
entirely or it does not happen at all. Aether v1 is
single-threaded, so atomicity is automatic. v2's async
runtime will need atomic primitives for synchronization.

## B

**Binding**
: A name introduced into scope. Aether has three binding
forms: `let`, `let mut`, and `const`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§1.

**Block**
: A sequence of statements and a final expression, enclosed
in `{ }`. The block's value is its final expression. See
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

**Bool**
: The boolean type. Two values: `true` and `false`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.3.

**Bound**
: A constraint on a generic type parameter, written `T: Trait`.
A bound requires the parameter to implement the named trait.
Aether v1 records but does not enforce bounds; v2 will enforce
them. See [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§7.4.

**Bytecode**
: The intermediate representation emitted by codegen and
executed by the VM. Not in v1; planned for v2. See
[../spec/10-vm-and-bytecode.md](../spec/10-vm-and-bytecode.md)
and [../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

## C

**Capture**
: A variable referenced (read or written) inside a closure
body. Aether v1 captures by reference; v2 will infer capture
modes (`&T`, `&mut T`, `move T`). See
[../tutorials/ownership.md](../tutorials/ownership.md) §6.

**Channel**
: An asynchronous queue for sending values between tasks. Not
in v1; planned for v2. See
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

**Char**
: The Unicode scalar value type. A single character. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.5.

**Checker**
: The compiler stage that runs after sema and verifies
exhaustiveness, definite-assignment, borrow-checking, and
trait conformance. Not fully in v1; planned for v2. See
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§2.5.

**Closure**
: A function value together with a captured environment.
Aether closures use `fn(args) -> ret { body }` syntax. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§6.

**Compile**
: To run the pipeline: lex → parse → check → run. The public
entry point is `compileAndRun(source)` in
`aether/core/index.ts`. See
[../tutorials/getting-started.md](../tutorials/getting-started.md)
§7.

**Concatenation**
: Joining two strings or arrays with `+`. For strings, this
is O(n) per concatenation; in a loop, use `join` instead. See
[../guides/anti-patterns.md](../guides/anti-patterns.md) §11.

**Const**
: A compile-time constant. Declared with `const name: T =
value;`. In v1, `const` is mostly cosmetic; v2 will enforce
compile-time evaluation. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§1.3.

**Constraint**
: A bound on a generic type parameter. See → bound.

**Constructor**
: A function or syntax that produces a value of a type. For
enums, the variant names (`Option::Some`, `Result::Ok`) are
constructors. For structs, the literal syntax (`Point { x: 0,
y: 0 }`) is the constructor.

**Control flow**
: The order in which a program's statements and expressions
are evaluated. Aether has `if`, `while`, `for`, `match`,
`break`, `continue`, and `return` for control flow.

**Copy**
: A type whose values can be duplicated without losing the
original. In Aether v1, primitives (`int`, `float`, `bool`,
`char`) are copy types. v2 will add a `Copy` trait. See
[../tutorials/ownership.md](../tutorials/ownership.md) §5.

## D

**Default argument**
: A parameter that takes a value if not provided at the call
site. Aether v1 does not support default arguments; v2 will.
See [../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

**Definite assignment**
: The guarantee that a variable is assigned before it is
read. Aether v1 does not enforce this; v2 will. See
[../spec/03-type-system.md](../spec/03-type-system.md) §6.3.

**Discriminated union**
: A type whose values are tagged with a discriminator that
identifies the variant. Aether's `enum` is a discriminated
union. Same as → sum type.

**Display**
: A trait (planned for v2) for converting a value to a string
for human reading. In v1, the `str` builtin provides this.

**Drop**
: A trait (not in v1) that runs when a value goes out of
scope. The GC handles cleanup in v1. See
[../tutorials/ownership.md](../tutorials/ownership.md) §11.

## E

**Enum**
: An algebraic data type with one or more variants. Each
variant is either a unit, a tuple, or a struct. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§5.

**Escape sequence**
: A backslash followed by a character in a string or char
literal, denoting a special character (`\n`, `\t`, `\\`,
`\'`, `\"`, `\u{...}`).

**Evaluator**
: The compiler stage that runs the program by walking the
AST. Aether v1's evaluator is in
`aether/core/eval/eval.ts`. See
[../tutorials/getting-started.md](../tutorials/getting-started.md)
§7.

**Exhaustiveness**
: The property that a `match` covers every possible value of
the scrutinee. Aether v1 does not enforce this; v2 will. See
[../spec/03-type-system.md](../spec/03-type-system.md) §6.6.

**Expression**
: A construct that produces a value. In Aether, most things
are expressions: `if`, `match`, blocks, function calls,
arithmetic, etc. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§3.

**Expression-oriented**
: A language design where most constructs produce values.
Aether is expression-oriented, like ML and Rust. See
[../spec/01-overview.md](../spec/01-overview.md) §3.2.

## F

**Field**
: A named component of a struct. Accessed as `s.field_name`.
See [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§6.

**Float**
: The IEEE 754 double-precision floating-point type. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.2.

**fn**
: The keyword that introduces a function or closure. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§5.

**For loop**
: A loop that iterates over an iterable. Aether has `for x in
iterable { ... }`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§4.3.

**Function**
: A reusable block of code with parameters and a return
value. Declared with `fn name(params) -> ret { body }`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§5.

**Function type**
: The type of a function or closure, written `fn(T1, T2, ...)
-> R`. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§1.

**Future**
: A value that may not be available yet, produced by an
async function. Not in v1; planned for v2. See
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

## G

**GC**
: Garbage collector. Aether v1 uses the host JavaScript
runtime's GC. v2 will add an Aether-specific GC (tricolor,
generational). See
[../tutorials/ownership.md](../tutorials/ownership.md) §1.

**Generic**
: A function or type parameterized over other types. Aether
generics use `<T>` syntax. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§7.

**Guard**
: A `match` arm condition that further restricts when the arm
matches. Aether v1 supports guards via nested `if`; v2 will
support `pattern if guard => body` directly. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§10.9.

## H

**Hindley-Milner**
: A type inference algorithm used in ML-family languages.
Aether uses a bidirectional inference algorithm inspired by
Hindley-Milner and Swift's contextual typing. See
[../spec/03-type-system.md](../spec/03-type-system.md).

**Higher-order function**
: A function that takes a function as an argument or returns
a function. `map`, `filter`, `reduce` are higher-order
functions. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§6.2.

## I

**Identifier**
: A name. Aether identifiers follow the Unicode Standard
Annex #31 `XID_Start` / `XID_Continue` profiles, with `_` as
a valid identifier. See
[../spec/02-lexical-structure.md](../spec/02-lexical-structure.md)
§4.

**Immutability**
: The property that a value cannot be changed after it is
created. Aether `let` and `const` bindings are immutable;
`let mut` bindings are mutable. See
[../tutorials/ownership.md](../tutorials/ownership.md) §3.1.

**Inlining**
: Replacing a function call with the body of the function.
Aether v1 does no inlining; v2 may. See
[../tutorials/performance.md](../tutorials/performance.md).

**Inspector**
: The bottom-right pane in the Aether playground, with tabs
for Tokens, AST, Type errors, and Steps. See
[../tutorials/tooling.md](../tutorials/tooling.md) §2.

**Integer literal**
: A sequence of digits denoting an `int` value. Aether
supports decimal, hex (`0x`), binary (`0b`), and octal (`0o`)
forms. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.1.

**Interpolation**
: Embedding expressions inside a string literal. Aether uses
`f"..."` for interpolated strings; the `{expr}` syntax
interpolates. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§7.3.

**Invariant**
: A property that should always hold. A panic signals an
invariant violation. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§4.

## J-K

**JoinHandle**
: A handle to a spawned task, used to await the task's result.
Not in v1; planned for v2. See
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

**Keyword**
: A reserved identifier that has special meaning in the
language. Aether keywords include `let`, `mut`, `const`,
`fn`, `enum`, `struct`, `match`, `if`, `else`, `while`, `for`,
`in`, `return`, `break`, `continue`, `print`, `true`,
`false`, `unit`, `as`, `range`, `import`, `pub`, `use`, `or`,
`do`. See `aether/core/lexer/lexer.ts` for the full list.

## L

**Lambda**
: A closure. See → closure.

**Lexer**
: The compiler stage that turns source text into tokens.
Aether's lexer is in
`aether/core/lexer/lexer.ts`. See
[../spec/02-lexical-structure.md](../spec/02-lexical-structure.md).

**Lifetime**
: A scope during which a reference is valid. Aether v1 has no
lifetimes; v2 will, via the borrow checker. See
[../rfcs/rfc-004-borrow-checker.md](../rfcs/rfc-004-borrow-checker.md).

**Literal**
: A source representation of a value. Aether literals include
integers, floats, strings, chars, booleans, and `()` (unit).

**LSP**
: Language Server Protocol. An editor integration standard
for syntax highlighting, autocomplete, goto-definition,
hover, and diagnostics. Not in v1; planned for v2. See
[../rfcs/rfc-005-lsp.md](../rfcs/rfc-005-lsp.md).

## M

**Map**
: A hash-based key/value store. The type is `map[K]V`. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§4.

**Match**
: A control-flow construct that performs pattern matching on
a scrutinee and produces a value. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§10.

**Method**
: A function associated with a type. Aether v1 has no
methods; v2 will (via `impl` blocks). See
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

**Module**
: A unit of code organization. Aether v1 has no modules; v2
will. See
[../rfcs/rfc-003-modules-and-packages.md](../rfcs/rfc-003-modules-and-packages.md).

**Monomorphization**
: A strategy for implementing generics by compiling a
separate copy of the generic function or type for each
concrete instantiation. Aether v1 effectively does this; v2
will formalize it. See
[../spec/03-type-system.md](../spec/03-type-system.md) §1.6.

**Move**
: To transfer ownership of a value from one binding to
another. Aether v1 has no move semantics; v2 will, via the
borrow checker.

**Mutable**
: A binding or value that can be changed. Aether `let mut`
bindings are mutable; `let` and `const` are not. See
[../tutorials/ownership.md](../tutorials/ownership.md) §4.

## N

**Name resolution**
: The sema stage that resolves each identifier to its
definition. See
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§2.4.

**Never type**
: The type `!`, which is the type of expressions that do not
return a value (return, break, continue, panic, infinite
loops). Aether v1 has a partial implementation. See
[../spec/03-type-system.md](../spec/03-type-system.md) §1.9.

**Nominal type**
: A type whose identity is its name, not its structure. Two
structs with the same fields are distinct types in Aether.
See [../spec/03-type-system.md](../spec/03-type-system.md) §1.5.

**Null**
: A special value indicating "no value". Aether has no null;
use `Option<T>`. See
[../tutorials/ownership.md](../tutorials/ownership.md) §3.2.

## O

**Option**
: An enum with `Some(T)` and `None` variants, representing
"may be absent". See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§2.

**Ownership**
: The discipline that determines who is responsible for
freeing a value. Aether v1 uses GC; v2 will add a borrow
checker. See
[../tutorials/ownership.md](../tutorials/ownership.md).

## P

**Parameter**
: A name in a function declaration that receives an argument
at the call site. See → argument.

**Parser**
: The compiler stage that turns tokens into an AST. Aether's
parser is in
`aether/core/parser/parser.ts`. It is a recursive-descent +
Pratt parser. See
[../spec/04-expressions.md](../spec/04-expressions.md).

**Pattern**
: A syntactic form that matches a value's structure, used in
`match` and `let` destructuring. Aether patterns include
literals, wildcards, identifiers, tuples, arrays, structs,
and enum variants. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§10.

**Pattern matching**
: The act of matching a value against a pattern. See →
pattern.

**Panic**
: An unrecoverable abort of the current task with a message.
Use `panic(msg)` for invariant violations. See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§4.

**Polymorphism**
: The ability of a function or type to operate on values of
multiple types. Aether has parametric polymorphism (generics);
v2 will add ad-hoc polymorphism (traits). See
[../spec/03-type-system.md](../spec/03-type-system.md) §1.6.

**Pratt parser**
: A parsing technique that handles operator precedence
elegantly. Aether's parser is Pratt-style. See
`aether/core/parser/parser.ts`.

**Primitive type**
: A type built into the language, not user-defined. Aether
primitives: `int`, `float`, `bool`, `string`, `char`, `unit`.
See [../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§1.

## Q-R

**Range**
: A sequence of integers from `start` to `end - 1`. Aether
ranges are produced by the `range` builtin, not by `..`
syntax. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§4.3.

**Recursion**
: A function calling itself. Aether supports recursion, but
the step limit bounds the depth. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§5.4.

**Reference**
: A pointer to a value. Aether v1 has implicit references (no
`&`); v2 will add explicit references via the borrow checker.

**Result**
: An enum with `Ok(T)` and `Err(E)` variants, representing "may
fail". See
[../tutorials/error-handling.md](../tutorials/error-handling.md)
§3.

**Runtime**
: The environment in which a program executes. Aether v1's
runtime is the host JavaScript runtime. v2 will add an
Aether-specific runtime with a scheduler.

## S

**Scalar**
: A single value (int, float, bool, char). Not a compound
type.

**Scope**
: A region of code where a name is visible. Aether has block
scope (`{ ... }`), function scope, and (in v2) module scope.

**Scrutinee**
: The value being matched in a `match` expression. `match
scrutinee { ... }`.

**Sema**
: The compiler stage that performs name resolution and type
inference. Aether's sema is in
`aether/core/sema/sema.ts`. See
[../spec/09-compiler-pipeline.md](../spec/09-compiler-pipeline.md)
§2.4.

**Shadowing**
: Declaring a new binding with the same name as a previous
binding in the same scope. Aether allows shadowing; the
convention is to use distinct names unless the shadow is one
step. See
[../guides/anti-patterns.md](../guides/anti-patterns.md) §18.

**Slice**
: A view into a contiguous sequence. Aether v1 uses arrays
(`[T]`) instead of slices; v2 may add explicit slices.

**Spawn**
: To start a new task. Not in v1; planned for v2. See
[../rfcs/rfc-001-async-await.md](../rfcs/rfc-001-async-await.md).

**SSA**
: Static Single Assignment form. An IR where each variable is
assigned exactly once. Aether does not use SSA in v1; the v2
bytecode VM may.

**Statement**
: A construct that does not produce a value. Aether has
declarations (`let`, `const`, `fn`, `enum`, `struct`, `type`),
`return`, `break`, `continue` as statements. Everything else
is an expression. See
[../spec/05-statements-and-declarations.md](../spec/05-statements-and-declarations.md).

**Step**
: A unit of work in the v1 evaluator. Each AST node visit is
one step. The default limit is 1,000,000 steps. See
[../tutorials/performance.md](../tutorials/performance.md)
§3.

**Step limit**
: The maximum number of steps the evaluator will execute
before aborting. The default is 1,000,000; configurable via
the `maxSteps` option. See
[../tutorials/performance.md](../tutorials/performance.md)
§3.

**String**
: The UTF-8 string type. Growable. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.4.

**String interpolation**
: Embedding expressions inside a string literal, with
`f"..."` and `{expr}`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§7.3.

**Struct**
: A nominal record type with named fields. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§6.

**Structural type**
: A type whose identity is its structure (fields, variants),
not its name. Aether tuples and function types are
structural; structs and enums are nominal.

**Sum type**
: A type whose values are one of several variants. Aether
`enum` is a sum type. Same as → discriminated union.

## T

**Tail call**
: A function call that is the last action of the calling
function. Aether v1 does not optimize tail calls; v2 may. See
[../spec/07-functions-closures-async.md](../spec/07-functions-closures-async.md)
§1.1.

**Token**
: A unit of lexing. Aether token kinds: Int, Float, Hex,
Binary, Octal, Char, String, Ident, Keyword, Punct, Eof. See
[../spec/02-lexical-structure.md](../spec/02-lexical-structure.md)
§7.

**Trait**
: An interface-like construct for ad-hoc polymorphism. Aether
v1 has no traits; v2 will. See
[../spec/03-type-system.md](../spec/03-type-system.md) §4.

**Tree-walking interpreter**
: An interpreter that runs the program by walking the AST
directly, without compiling to bytecode. Aether v1 is a
tree-walking interpreter. See
[../decisions/adr-01-tree-walking-interpreter-for-v1.md](../decisions/adr-01-tree-walking-interpreter-for-v1.md).

**Tuple**
: A fixed-size, heterogeneous, structural collection. The
type is `(T1, T2, ..., Tn)`. Field access is by position
(`t.0`, `t.1`). See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§2.

**Turbofish**
: The `::<T>` syntax for explicitly providing type arguments
at a call site. Borrowed from Rust. Rarely needed in Aether
v1 because of type inference.

**Type alias**
: A transparent synonym for a type, declared with `type
Name = T;`. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§9.

**Type inference**
: The compiler's process of filling in types that the
programmer did not write. Aether uses bidirectional inference.
See [../spec/03-type-system.md](../spec/03-type-system.md).

**Type parameter**
: A placeholder for a type in a generic declaration. `T` in
`fn id<T>(x: T) -> T`. See → generic.

## U

**Unary operator**
: An operator with one operand. Aether has `-`, `!`, `~`.
See [../spec/04-expressions.md](../spec/04-expressions.md) §5.

**Unification**
: The process of finding a substitution that makes two types
equal. Used in type inference. Aether's sema uses an
Algorithm-W-style unification. See
[../spec/03-type-system.md](../spec/03-type-system.md).

**Unit**
: The type with exactly one value, `()`. The type of
expressions that have no meaningful value (function calls
that return nothing, empty blocks). See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§2.6.

## V

**Value**
: A runtime instance of a type. Aether v1 values are
JavaScript values: numbers, strings, booleans, arrays, maps,
objects.

**Variant**
: A constructor of an enum. `Option::Some(T)` is a tuple
variant; `Option::None` is a unit variant. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§5.

**Variable**
: A binding that can be reassigned. Aether `let mut`
bindings are variables; `let` and `const` are not.

**VM**
: Virtual Machine. The runtime that executes bytecode. Not
in v1; planned for v2. See
[../rfcs/rfc-002-bytecode-vm.md](../rfcs/rfc-002-bytecode-vm.md).

## W-X-Y-Z

**While loop**
: A loop that executes its body as long as a condition is
true. Aether has `while cond { ... }`. See
[../tutorials/language-basics.md](../tutorials/language-basics.md)
§4.2.

**Wildcard**
: A pattern that matches anything, written `_`. See
[../tutorials/types-and-generics.md](../tutorials/types-and-generics.md)
§10.2.

**Yield**
: To produce a value from a generator. Aether v1 has no
generators; v2 may add them.

**Zero-cost abstraction**
: An abstraction that compiles to code as efficient as the
hand-written equivalent. A Rust principle; Aether v1 does
not promise this; v2 may, via the bytecode VM.
