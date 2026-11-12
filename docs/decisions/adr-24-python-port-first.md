# ADR-24 — Python was the first port

> Status: Accepted
> Date: 2026-11-12
> Decision-maker: Aether core team
> Related: [Chapter 16 self-hosting](../book/ch16-self-hosting.md), [Chapter 19 real apps in Aether](../book/ch19-real-apps-in-aether.md), [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.6

## Context

Aether v3 ships a Python compiler port (in `aether-apps/python-compiler/`, ~3000 LOC of Aether): a real lexer and parser for the Python language, written in Aether. It runs on the v3 Aether VM, parses Python source, and produces an AST that could (in v3.1) be lowered to Aether IR. See Chapter 16 for the design.

This is the first "language port" — a real compiler (for a non-Aether language) written in Aether. The v3.3 plan (Chapter 20 §20.6) is to add four more ports: Ruby, Lua, Scheme, and a second-pass Aether. Python was chosen as the first.

Five languages were on the table:

1. **Python.** The most popular dynamic language; large user base; clean grammar (mostly). Pros: large audience; the parser is non-trivial but tractable (the indentation-sensitive grammar is the main complication); the AST is well-documented (the Python ast module).
2. **Ruby.** Similar audience to Python; grammar is more complex (heredocs, regex literals, the `END { }` block, string interpolation forms). Pros: similar audience. Cons: the grammar is harder.
3. **Lua.** Small grammar (50 productions); simple semantics (one data structure: the table). Pros: small implementation. Cons: smaller audience.
4. **JavaScript.** The language of the host; large audience. Pros: large audience. Cons: the grammar is well-known to be full of edge cases (ASI, the `with` statement, the `eval` indirection); the spec is huge (ECMAScript 2024 is ~700 pages).
5. **Scheme.** The Lisp of the set; s-expressions, tail calls, `call/cc`. Pros: small grammar (s-expressions are trivial to parse); the AST is the syntax. Cons: smaller audience; the macros are a separate, large project.

The constraints on the decision were:

- **Audience.** The first port should target the largest audience, to maximize the number of users who can engage with it. Python's audience is the largest (the most popular dynamic language).
- **Implementation size.** The first port should fit in a sprint. Python's parser is ~2000 LOC of Aether; Ruby's would be ~3000; Lua's would be ~1000; JavaScript's would be ~5000; Scheme's would be ~500.
- **Demonstration value.** The first port should demonstrate that Aether is a good host for a real compiler — that the language's primitives (structs, enums, pattern matching, recursion, closures, the stdlib) are sufficient to write a non-trivial compiler. Python's parser is non-trivial enough to be a real test; Lua's is too small to demonstrate; JavaScript's is too large for a first port.
- **Difficulty.** The first port should be moderately difficult — hard enough to be a real test, easy enough to ship in a sprint. Python's indentation-sensitive grammar is moderately difficult; Ruby's heredocs are harder; JavaScript's ASI is much harder; Lua's and Scheme's are too easy.

## Decision

**Python is the first port.** The Python compiler port (in `aether-apps/python-compiler/`) is ~3000 LOC of Aether: a lexer, a parser, an AST, and a small visitor framework. It runs on the v3 Aether VM, parses Python source, and produces an AST.

The port covers:

- **Lexer** — tokens, indentation (the INDENT/DEDENT mechanism), strings (with all the prefix/suffix forms: `r"..."`, `f"..."`, `b"..."`, `"""..."""`), numbers (int, float, with the `1_000_000` underscore separator), comments, operators.
- **Parser** — the full Python grammar (statements: `if`/`elif`/`else`, `for`, `while`, `try`/`except`/`finally`, `with`, `def`, `class`, `import`, `global`, `nonlocal`; expressions: arithmetic, comparison, boolean, conditional, lambda, list/dict/set comprehensions, f-strings, function calls, subscripts, attribute access, the walrus operator `:=`).
- **AST** — a set of structs (one per AST node: `Module`, `FunctionDef`, `If`, `For`, `BinOp`, `Name`, `Constant`, etc.), pattern-matched by the visitor framework.
- **Visitor framework** — a small base struct with a `visit(node)` method that dispatches on the node type via pattern matching. Subclass it to implement specific visitors (e.g., a pretty-printer, a name resolver, a type checker).

The port doesn't include:

- **Type checker.** Python is dynamically typed; the port doesn't include a type checker. (A v3.1 plan is to add the gradual type checker, using `typing` annotations.)
- **Codegen.** The port produces an AST; it doesn't lower to Aether IR. (A v3.1 plan is to add the lowering, producing an Aether program with the same semantics.)
- **Runtime.** The port doesn't run Python code; it parses it. (A v3.1 plan is to add an interpreter, using the AST.)

The choice of Python is the choice of "large audience, moderate difficulty, real test." The audience is the largest of the five; the difficulty is moderate (the indentation grammar is the main complication, but it's a known problem with known solutions); the test is real (a Python parser is ~2000 LOC, not a toy).

## Alternatives considered

### Ruby as the first port

Similar audience; more complex grammar. Pros: similar audience. Cons:

- **Grammar complexity.** Ruby's heredocs (`<<~HEREDOC`, `<<-HEREDOC`, `<<HEREDOC`), regex literals (`/pattern/flags`), the `END { }` block, and the various string interpolation forms (`"#{expr}"`, `'%{val}' % {val: 1}`) are significantly more complex than Python's. The parser would be ~3000 LOC vs Python's ~2000.
- **Spec ambiguity.** Ruby's spec is the MRI implementation; there's no formal spec. Edge cases are decided by "what MRI does." This makes a port harder (you have to match the implementation, not a spec).
- **Audience overlap.** Ruby's audience overlaps with Python's; the marginal gain from porting Ruby first (vs Python first) is small.

Ruby is the second port (v3.3, Chapter 20 §20.6), not the first.

### Lua as the first port

Small grammar, simple semantics. Pros: small implementation (~1000 LOC); very tractable. Cons:

- **Too easy.** A Lua parser is a weekend project. The first port should be a real test, not a toy. Porting Lua wouldn't demonstrate that Aether is a good host for a non-trivial compiler.
- **Smaller audience.** Lua's audience is smaller than Python's. The marginal gain from porting Lua first (vs Python first) is smaller.

Lua is the third port (v3.3), not the first.

### JavaScript as the first port

Large audience, the host's language. Pros: large audience; the JS engine is the host (so we know the semantics). Cons:

- **Spec size.** ECMAScript 2024 is ~700 pages. The parser has to handle every edge case (ASI, the `with` statement, the `eval` indirection, the `function*` generators, the `async function*` async-generators, the optional chaining `?.`, the nullish coalescing `??`, the `??=`/`||=`/`&&=` assignment operators, the private class fields `#x`, the decorators, etc.). A real JS parser is ~5000 LOC.
- **Too large.** The first port should fit in a sprint. JS is too large for a sprint.
- **Auditability.** A 5000-LOC parser is hard to audit. The v3 milestone values auditability.

JavaScript is rejected as the first port. A future "Aether-to-JS" transpiler (v4) is a different project.

### Scheme as the first port

Small grammar, simple semantics, Lisp-style. Pros: small implementation (~500 LOC); s-expressions are trivial to parse. Cons:

- **Too easy.** A Scheme parser is a weekend project (s-expressions are just nested lists). The first port should be a real test.
- **Macros.** A real Scheme port has to handle macros (`syntax-rules`, `syntax-case`, `define-macro`), which is a separate, large project (~2000 LOC on top of the parser). The v3 port would either skip macros (making it a toy) or include them (making it too large for a sprint).
- **Smaller audience.** Scheme's audience is smaller than Python's.

Scheme is the fourth port (v3.3), not the first.

## Consequences

### Positive

- **Large audience.** Python is the most popular dynamic language. The Python port is approachable by millions of developers. The playground's "Python" tab (when added in v3.1) will be the most-visited tab.
- **Moderate difficulty.** The Python parser is non-trivial enough to be a real test (the indentation grammar is the main complication) but tractable enough to ship in a sprint. The port demonstrates that Aether is a good host for a real compiler.
- **Real test.** The port uses Aether's structs, enums, pattern matching, recursion, closures, and the stdlib (`aether-string`, `aether-list`, `aether-dict`). Each feature is exercised. If any feature were insufficient (e.g., if pattern matching couldn't handle the AST's 50+ node types), the port would have found it.
- **Foundation for the next ports.** The Python port's architecture (lexer + AST + parser + visitor) is reused for the Ruby, Lua, and Scheme ports. The Python port is the design template; the others adapt it.
- **Self-application seed.** The Python port is the first "real compiler written in Aether." It's the seed for the v4 self-replicating compiler. The Python port's lexer/parser is the kind of code the v4 Aether compiler will use (the Aether lexer/parser, written in Aether, will reuse the Python port's architecture).

### Negative

- **Indentation grammar.** Python's INDENT/DEDENT mechanism is the hardest part of the parser. The lexer has to track indentation levels, emit INDENT/DEDENT tokens at line starts, and handle the edge cases (blank lines, comments, line continuations with `\`, multi-line strings, implicit line joining inside brackets). The implementation is ~300 LOC of careful code; the bugs are subtle.
- **No type checker.** The port doesn't include a type checker. A real Python compiler needs to handle `typing` annotations; the v3 port skips this. (The v3.1 plan is to add it.)
- **No codegen.** The port produces an AST; it doesn't lower to Aether IR. (The v3.1 plan is to add the lowering, producing an Aether program with the same semantics.) The v3 port is "a parser, not a compiler." It's a step toward a real compiler, not the whole thing.
- **No runtime.** The port doesn't run Python code; it parses it. (The v3.1 plan is to add an interpreter, using the AST.) The v3 port is "a parser, not an implementation." A reader can't run Python in the playground (yet); they can only parse it.

### Mitigations

- For the indentation grammar: the implementation is documented (in `aether-apps/python-compiler/lexer.ae` and in the chapter walkthrough, Chapter 16). The edge cases are tested (the test suite has ~50 tests for the indentation logic).
- For the no-type-checker: the v3.1 plan is to add a gradual type checker, using `typing` annotations. The checker will be ~500 LOC on top of the parser.
- For the no-codegen: the v3.1 plan is to add the lowering (AST → Aether IR), producing an Aether program with the same semantics. The lowering will be ~1000 LOC on top of the parser.
- For the no-runtime: the v3.1 plan is to add an interpreter (using the AST), so the user can run Python in the playground. The interpreter will be ~800 LOC on top of the parser.

## Reversibility

This decision is **not reversible** in the sense of "un-port Python." The Python port is shipped; it's the first port. The decision is reversible in the sense of "add other ports" — that's the v3.3 plan, with Ruby, Lua, Scheme, and the second-pass Aether.

## Cross-references

- [Chapter 16 self-hosting](../book/ch16-self-hosting.md) — the chapter walkthrough of the Aether bootstrap, which uses the same architecture as the Python port.
- [Chapter 19 real apps in Aether](../book/ch19-real-apps-in-aether.md) — the three real apps, one of which is the Python port.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.6 — the v3.3 plan for the four additional ports.
- [ADR-21 bootstrap host builtins](adr-21-bootstrap-host-builtins.md) — the bootstrap's three-builtin contract, which the Python port uses.
