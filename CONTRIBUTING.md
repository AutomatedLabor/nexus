# Contributing to Project Nexus (Aether)

Thanks for taking the time to contribute! 🎉

This guide covers the most common ways to contribute to Aether — adding a
language feature, adding an example program, adding a stdlib function — and
the test requirements that go with each. Nothing here is set in stone; if
you have a better idea, open an issue and we'll talk.

## Ground rules

- Be kind. Assume good faith. Most disagreements are about trade-offs, not
  facts.
- Keep PRs focused: one logical change per PR. If you find yourself
  writing "and also…" in the PR description, split the PR.
- Branch from `main`. Use a descriptive branch name: `feat/short-description`,
  `fix/short-description`, `docs/short-description`.
- Open an issue first for anything beyond a typo. Use one of the templates in
  [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/).

## Development setup

```bash
git clone https://github.com/AutomatedLabor/nexus.git
cd nexus
bun install                # Bun is the supported package manager
bunx vitest run aether     # 703 tests across 14 files — should be green
bun run dev                # playground at http://localhost:3000
```

The repo ships with a single-page Next.js 16 playground at `/` that imports
the Aether core (`@aether/core`) and stdlib (`@aether/stdlib`) via the
TypeScript path alias configured in `tsconfig.json`:

```json
"paths": { "@aether/*": ["./aether/*"], "@/*": ["./src/*"] }
```

The Aether core is pure TypeScript and runs in the browser — no Node-only
imports in `aether/core/`. Stdlib modules with Node-only branches
(`io`, `crypto`) gate on `typeof process` and throw a clear error in-browser.

## How to add a language feature

Most language features touch all four stages: lexer, parser, semantic
checker (sema), and evaluator. The typical loop is:

1. **Lexer** — add a new token kind to `aether/core/lexer/lexer.ts` if your
   feature introduces new syntax (e.g. a new keyword or operator). Add lexer
   tests to `lexer.test.ts` that exercise the new token.
2. **Parser** — add a parsing method in `aether/core/parser/parser.ts` and
   wire it into the precedence table or statement dispatch. Add parser
   tests that assert the resulting AST shape (use `expect(parse(...).body).toEqual(...)`).
3. **AST** — add a node type in `aether/core/ast/ast.ts` if needed, and
   update `aether/core/ast/visitor.ts` if you use the visitor.
4. **Semantic checker** — add a check in `aether/core/sema/sema.ts`. The
   checker is the right place to reject undefined names, duplicate
   declarations, and type mismatches. Add sema tests that assert the
   checker accepts valid programs and rejects invalid ones with the
   expected error.
5. **Evaluator** — implement the runtime behavior in `aether/core/eval/eval.ts`.
   Add eval tests that assert the runtime value produced (or the error
   raised) for representative programs.
6. **Docs** — add a section to the relevant file in `docs/spec/` and, if
   the feature is user-visible, a short example in `examples/` and a note
   in the relevant tutorial under `docs/tutorials/`.

Run `bunx vitest run aether` after every stage — the 703-test suite is the
safety net.

## How to add an example program

1. Write the program in `examples/<name>.ae`. Keep it self-contained and
   under ~80 lines. It should produce observable output via `print`/`println`.
2. Write a `examples/<name>.md` walkthrough that explains what the program
   does, line by line, and links to the relevant spec section.
3. Add a one-line entry in the examples index view (`src/components/playground/views/examples-view.tsx`)
   if you want the program surfaced in the playground's Examples view.
4. Run the program in the playground (paste into the code editor, click
   **Run**) and confirm it produces the expected output.

## How to add a stdlib function

1. Pick the right module under `aether/stdlib/<module>/index.ts`. If
   you need a new module, mirror the structure of an existing one
   (string is a good template — small, well-documented).
2. Add the function with a typed signature. Every stdlib function is
   a plain TypeScript function `(args: Value[]) => Value` that receives
   evaluated Aether arguments. Register it via the module's `register`
   helper and add an entry to the module's `MANIFEST` so the playground
   can document it.
3. Add tests in `aether/stdlib/<module>/index.test.ts` that call the
   function with representative inputs and assert the output. Use
   `runAether` (from the test harness) where possible to exercise the
   full evaluator path.
4. Update the module's README to list the new function.
5. Run `bunx vitest run aether/stdlib/<module>` and confirm green.

## Test requirements

- Every new language feature needs at least one lexer, parser, sema, and
  eval test (where applicable). The 703-test baseline is non-negotiable;
  PRs that drop the count will be blocked.
- Every new stdlib function needs at least one test that calls it through
  the evaluator (not just direct TypeScript).
- Every example program needs to actually run in the playground and
  produce output — no examples that "would work if X were implemented."
- Lint must be green: `bun run lint`. (CI runs only lint + tests — see
  `.github/workflows/ci.yml` — so the build is your responsibility locally
  before pushing.)

## Known quirk: for-loop scope in the evaluator

The current evaluator (`aether/core/eval/eval.ts`) implements `for` loops
with a single loop variable binding that is reused across iterations rather
 than a fresh binding per iteration. Concretely, this means **closures
captured inside a `for` loop body see the *final* value of the loop
variable**, not the value at the time the closure was created. For example:

```aether
let fns: List[() -> Int] = []
for i in 0..3 {
  fns.push(() => i)
}
for f in fns {
  println(f())   // prints 3, 3, 3 in v1 (not 0, 1, 2)
}
```

This is a known v1 limitation tracked alongside the v2 bytecode VM work
(see `docs/rfcs/rfc-002-bytecode-vm.md`). **Contributor guidance: avoid
capturing loop variables in closures in example programs and docs.** If
you need a fresh binding per iteration, use an immediately-invoked
function or an explicit `let x = i` shadow inside the body:

```aether
for i in 0..3 {
  let captured = i
  fns.push(() => captured)
}
```

The sema checker does not currently reject the buggy pattern — be
disciplined about it.

## Submitting a PR

1. Rebase on `main`. Squash or rebase your commits so history is clean.
2. Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
3. CI runs `bunx vitest run aether` and `bun run lint` on every PR. Make
   sure both are green before requesting review. (Build is intentionally
   skipped in CI to keep the workflow light; run `bun run build` locally
   if your change touches `next.config.ts`, the playground, or anything
   the build could break.)
4. Link the issue your PR closes, e.g. `Closes #123`.

## Release flow

`main` is always deployable. We tag releases `vMAJOR.MINOR.PATCH`
following [SemVer](https://semver.org/). The changelog is generated from
merged PR titles. v1 is `v1.0.x`; v2 (bytecode VM) will bump to `v2.0.0`.

## Questions?

Open a [discussion](https://github.com/AutomatedLabor/nexus/discussions)
or an issue labelled `question`. We're friendly.

— Project Nexus Contributors
