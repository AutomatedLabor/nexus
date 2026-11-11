# PROGRESS — Project Nexus (Aether)

Phase-by-phase status of the brief. Last updated: Phase J (deployment).

| Phase | Topic                                  | Status         | One-line status                                                                          |
| ----- | -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| A     | Language core (lex/parse/sema/eval)    | ✅ Done         | Lexer, parser, AST, sema, evaluator — 703 tests pass.                                    |
| B     | Type system (nominal + structural fns) | ✅ Done         | ADR-02 — nominal types, structural function types, inference, generics.                 |
| C     | Tree-walking evaluator                 | ✅ Done         | Closures, mutability, pattern matching, stdlib builtins. (For-loop closure quirk noted.) |
| D     | Standard library                       | 🟡 Partial     | 10 modules / 212 functions (brief asked 25 / 300+).                                       |
| E     | Toolchain (LSP, formatter, lint, CLI)  | 🔵 Spec only    | All specced in RFCs (`rfc-001/002/003/005`); none implemented in v1.                       |
| F     | Example programs                       | 🟡 Partial     | 15 programs in HEAD (brief asked 30). Live deploy shipped 15 after final redeploy.            |
| G     | Playground UI                          | ✅ Done         | 6 views, in-browser execution, dark/light, responsive. Live on Vercel.                   |
| H     | Documentation                          | 🟡 Partial     | 51 markdown files / ~111k words (brief asked ~300k).                                       |
| I     | Testing                                | ✅ Done         | vitest, 703 tests / 14 files. CI runs `bunx vitest run aether` + `bun run lint`.           |
| J     | Deployment (GitHub + Vercel)           | ✅ Done         | Pushed to `AutomatedLabor/nexus`; live at `nexus-aip-roj-builder.vercel.app`.            |
| K     | Project files (README/LICENSE/etc.)    | ✅ Done         | README, LICENSE (MIT), CONTRIBUTING, .github templates + CI workflow.                    |

## Live URLs

- Production (project alias): https://nexus-aip-roj-builder.vercel.app
- Production (custom alias):   https://nexus-sigma-nine-86.vercel.app
- Branch alias (main):          https://nexus-git-main-aip-roj-builder.vercel.app
- GitHub:                       https://github.com/AutomatedLabor/nexus

## Phase J verification (deployment)

- [x] Pre-deploy fixes: header GitHub URL → `AutomatedLabor/nexus`; tsconfig `@aether/*` path alias already present.
- [x] Repo files: README, LICENSE (MIT, "Project Nexus Contributors"), CONTRIBUTING (~800 words), `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ci.yml` (vitest + lint on push/PR), `.gitignore` (node_modules, .next, *.log, .env*, dist, .vercel, tool-results/, agent-ctx/, scratch_*, verify_*, dump_*, debug_*).
- [x] Commit `7254f48 Project Nexus: Aether language + playground + docs + examples`.
- [x] Push to `origin main`: `[new branch] main -> main` (first push).
- [x] `git ls-remote origin main` → `7254f487c94191b5d95ed1aafcc9d9de21df0507`.
- [x] Vercel project `nexus` created via `POST /v11/projects` (id `prj_Lm4i6O1xs42HG9c9koMserbzNlNj`).
- [x] `DATABASE_URL=file:/tmp/nexus.db` env var set (production target) to avoid prisma build errors.
- [x] Production deployment triggered via `POST /v13/deployments` with `gitSource` (GitHub repo `AutomatedLabor/nexus`, ref `main`). Deployment id `dpl_7Cw2u9wy6h2mXr4qyPJQNVuQTeF9`.
- [x] Deployment poll: BUILDING → READY in ~60s.
- [x] SSO protection disabled via `PATCH /v9/projects/<projectId>` (`{"ssoProtection":null}`).
- [x] `curl /` → HTTP 200, 41,036 bytes.
- [x] `grep -c -iE 'aether|playground' /tmp/deployed.html` → ≥ 2.
- [x] `curl /api/examples` → HTTP 200, JSON with example programs.
- [x] Agent-browser verification: playground renders, 6 sidebar items, Run works (output `55` + `hello, world!`), Stdlib view (10 modules, 212 fns), Examples view (11 cards), About view, theme toggle DARK→LIGHT, footer present.

## Next steps (v2)

- Bytecode VM (`docs/rfcs/rfc-002-bytecode-vm.md`)
- Async/await (`docs/rfcs/rfc-001-async-await.md`)
- Modules & packages (`docs/rfcs/rfc-003-modules-and-packages.md`)
- LSP (`docs/rfcs/rfc-005-lsp.md`)
- Formatter, linter, package manager
- Fix for-loop closure capture in evaluator (or replace evaluator with VM)
- Grow stdlib to 25+ modules / 300+ functions
- Grow examples to 30+
- Grow docs to ~300k words
