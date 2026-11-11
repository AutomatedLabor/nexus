# ADR-07 — Single playground route

> Status: Accepted
> Date: 2023-10-01
> Decision-maker: Aether playground team
> Supersedes: none
> Superseded by: none

## Context

The Aether playground is a Next.js app. Next.js supports multiple routes (`/`, `/about`, `/docs`, `/playground`, etc.), and the default for a new project is to set up several routes from the start. The question was: how many routes does the playground actually need?

The options were:

1. **Single route (`/`) with in-page view switching.** Everything happens on the home page: editor, output, inspector, examples, stdlib, benchmarks, about. A sidebar (or tabs) selects which *view* is shown. The Zustand store tracks the current `view: ViewId`.
2. **A few routes (`/`, `/examples`, `/docs`, `/about`).** The playground is `/`, examples are `/examples`, docs are `/docs` (rendered from the spec), about is `/about`.
3. **Many routes (`/`, `/examples/<name>`, `/docs/<section>`, `/benchmarks`, `/share/<id>`, `/user/<name>`, etc.).** A full multi-page app.

The constraints on the decision were:

- **v1 scope.** v1 is a teaching playground: an editor, an output panel, an inspector with tabs (Tokens / AST / Errors / Stats), plus a few auxiliary views (Examples, Stdlib, Benchmarks, Explorer, About).
- **Implementation size.** Each route is a page component, plus layout, plus navigation. More routes = more code.
- **User mental model.** A single page is the simplest mental model: "the playground". Multi-page apps need navigation, which is a cognitive load.
- **Shareability.** A single URL that contains everything (the source) is the easiest to share. Multi-page apps need to encode state in query params or path segments.
- **State continuity.** The user's source code, the last compile result, the selected example — these should persist across view switches. Multi-page apps would lose this on every navigation.

## Decision

**The Aether playground v1 has a single route (`/`).** The page contains the playground shell, with a left sidebar selecting a view (Playground, Examples, Stdlib, Benchmarks, Explorer, About). The Zustand store (`src/lib/view-store.ts`) tracks `view: ViewId`, and the shell renders the corresponding view component. There is no Next.js navigation, no router, no URL changes when switching views.

The Share button produces a URL with the source encoded in the URL hash (`#<base64-of-code>`), so sharing a program is a single URL. There is no separate `/share/<id>` route in v1 (planned for v2 with a database-backed share).

## Alternatives considered

### A few routes (option 2)

Adding `/examples` and `/docs` routes would be ~200 lines of Next.js code each. The cost is small, but the v1 priority was "keep the playground a single tab", and the Examples and Stdlib views work just fine as in-page views. The Examples view loads a chosen example into the editor (via `loadCode` in the Zustand store), which is a single in-page state change — no navigation needed.

The `/about` route is essentially the README; we already have a README. The About view in the sidebar serves the same purpose without a route.

### Many routes (option 3)

This is the right answer for v2 if the project grows: a `/examples` page (with a gallery of community programs), a `/docs` page (with the rendered spec), a `/share/<id>` route (with database-backed shared programs), a `/u/<name>` route (with user profiles). v1 deliberately does not build any of this.

### Full app shell with sidebar (option 4, the chosen approach)

The playground uses a full app shell — a left sidebar with the six views, a top header with the Run button, a main area that switches between views — but it's all in one route. This is a hybrid of options 1 and 4: the app shell pattern (sidebar + content) without the multi-page routing. The state stays in the Zustand store, which is global to the page.

## Consequences

### Positive

- **Smallest possible playground routing.** One route, one page component (`src/app/page.tsx`), one layout. The Next.js routing config is empty beyond the root.
- **Easiest to share.** A single URL with the source in the URL hash is the simplest possible sharing mechanism. Bookmark the URL; the code is in the bookmark.
- **No navigation to learn.** The user opens the page and writes code. View switching is a sidebar click, not a navigation. There is no "where do I click?" question.
- **State continuity.** Switching from the Playground view to the Examples view (to find a program to study) and back preserves the source. The Zustand store's `code` field doesn't reset on view change. This is the killer feature vs. multi-page.
- **Forward-compatible with v2.** Adding routes in v2 is additive. The `/` route stays; new routes (`/examples`, `/docs`, `/share/<id>`) are added alongside it.

### Negative

- **Long Share URLs.** A program with 1000 lines of source produces a URL with ~10,000 characters in the hash. Some chat apps and email clients truncate long URLs. v2 will add a database-backed Share that produces short URLs.
- **No persistent state across sessions.** v1 does not save the source across page reloads (other than via the Share URL). v2 may add localStorage or a server-backed user account.
- **All views share the same JS bundle.** The Benchmarks view's Recharts dependency loads even if the user only wants to write code. v2 should lazy-load view code on demand.
- **Back button doesn't switch views.** Because view switches are in-page state, the browser's back button doesn't navigate between views. The user has to click the sidebar. (We could use Next.js's `useSearchParams` or a `?view=` query param to fix this in v2.)

## Mitigations

- The [../tutorials/](../tutorials/) directory has many runnable examples that users can copy into the editor — but they don't have to, because the in-page Examples view loads them with one click.
- The [../reference/faq.md](../reference/faq.md) and [../reference/glossary.md](../reference/glossary.md) are short enough to read on the repo.
- The Share URL is a one-click mechanism; the encoded source is in the URL hash and survives page reloads.
- For v2, the plan is to add the missing routes (see [../tutorials/tooling.md](../tutorials/tooling.md) § 3).

## Reversibility

The decision is **easily reversible**. Adding routes in v2 is additive; the `/` route stays as the playground. There is no breaking change to v1 programs or shared URLs.

## Cross-references

- [../decisions/adr-05-no-modules-in-v1.md](adr-05-no-modules-in-v1.md) — the related decision to keep v1 single-file (no modules).
- [../decisions/adr-03-zustand-for-view-state.md](adr-03-zustand-for-view-state.md) — the state management decision for the playground.
- [../tutorials/tooling.md](../tutorials/tooling.md) § 7 — the Share URL mechanism; § 3 the v2 plan for additional routes.
