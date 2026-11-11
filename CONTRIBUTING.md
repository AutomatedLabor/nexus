# Contributing to ATLAS

Thanks for taking the time to contribute! 🎉

The following is a short set of guidelines for contributing to ATLAS. Nothing
here is set in stone — if you have a better idea, open an issue and we'll
talk.

## Ground rules

- Be kind. Review the [Code of Conduct](CODE_OF_CONDUCT.md); it applies to
  everyone in this repo.
- Assume good faith. Most disagreements are about trade-offs, not facts.
- Keep PRs focused. One logical change per PR. If you find yourself writing
  "and also…" in the PR description, split it.

## Before you start

1. **Open an issue first** for anything beyond a typo or a one-line fix.
   Use one of the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/).
2. **Check the environment.** Read
   [`docs/environment/00-index.md`](docs/environment/00-index.md) — the repo
   was authored against a specific sandbox (Debian 13, Bun 1.3, Node 24,
   Python 3.12) and your machine may differ. Note any deltas in your PR.
3. **Branch from `main`.** Use a descriptive branch name:
   `feat/short-description`, `fix/short-description`, `docs/short-description`.

## Development setup

```bash
git clone https://github.com/AutomatedLabor/atlas.git
cd atlas
bun install
bunx prisma migrate dev
bun run dev
```

See [`README.md`](README.md) for the full quick-start.

## Making changes

- **Code style** — 2-space indent, UTF-8, LF line endings (see
  [`.editorconfig`](.editorconfig)). ESLint and the project's TS config
  enforce the rest.
- **Components** — the shadcn/ui pattern under `src/components/ui/` is
  generated; prefer regenerating with `bunx shadcn add <component>` rather
  than hand-editing where possible.
- **Database** — any schema change must include a Prisma migration:
  `bunx prisma migrate dev --name <description>`.
- **Docs** — if your change affects the runtime, the environment, or the
  public API, update [`docs/environment/`](docs/environment/) or
  [`README.md`](README.md) as appropriate.

## Submitting a PR

1. Rebase on `main` and squash or rebase your commits so history is clean.
2. Fill out the [PR template](.github/PULL_REQUEST_TEMPLATE.md).
3. CI runs `bun run lint` on every PR — make sure it's green before
   requesting review. (Tests and build are intentionally skipped in CI to
   keep the workflow light; run them locally with `bun run build`.)
4. Link the issue your PR closes (e.g. `Closes #123`).

## Release flow

`main` is always deployable. We tag releases `vMAJOR.MINOR.PATCH` following
[SemVer](https://semver.org/). The changelog is generated from merged PR
titles.

## Questions?

Open a [discussion](https://github.com/AutomatedLabor/atlas/discussions) or
an issue labelled `question`. We're friendly.

— ATLAS Contributors
