# ADR-07 — Single playground route

> Status: Accepted
> Date: 2023-10-01
> Decision-maker: Aether playground team
> Supersedes: none
> Superseded by: none

## Context

The Aether playground is a Next.js app. Next.js supports
multiple routes (`/`, `/about`, `/docs`, `/playground`,
etc.), and the default for a new project is to set up
several routes from the start. The question was: how many
routes does the playground actually need?

The options were:

1. **Single route (`/`).** Everything happens on the home
   page: editor, output, inspector. No navigation. No
   multi-page state.
2. **A few routes (`/`, `/examples`, `/docs`, `/about`).**
   The playground is `/`, examples are `/examples`, docs
   are `/docs` (rendered from the spec), about is `/about`.
3. **Many routes (`/`, `/examples/<name>`,
   `/docs/<section>`, `/benchmarks`, `/share/<id>`,
   `/user/<name>`, etc.).** A full multi-page app.

The constraints on the decision were:

- **v1 scope.** v1 is the smallest possible playground:
  an editor, an output, an inspector. There is no examples
  page in v1 (planned for v2); there is no docs page in v1
  (the spec is read off-repo); there is no share page in v1
  (the Share URL encodes the source in the query string).
- **Implementation size.** Each route is a page component,
  plus layout, plus navigation. More routes = more code.
- **User mental model.** A single page is the simplest
  mental model: "the playground". Multi-page apps need
  navigation, which is a cognitive load.
- **Shareability.** A single URL that contains everything
  (the source) is the easiest to share. Multi-page apps
  need to encode state in query params or path segments.

## Decision

**The Aether playground v1 has a single route (`/`).** The
page contains the editor, output, and inspector. There is
no navigation, no other routes.

The Share button produces a URL with the source encoded in
the query string (`?src=<encoded>`), so sharing a program
is a single URL. There is no separate `/share/<id>` route
in v1 (planned for v2 with a database-backed share).

## Alternatives considered

### A few routes (option 2)

Adding `/examples` and `/docs` routes would be ~200 lines
of Next.js code each. The cost is small, but the v1
priority was "ship the smallest possible playground", and
those routes are not essential. The examples can live in
the spec docs (`../tutorials/`); the docs are the spec.

The `/about` route is essentially the README; we already
have a README. There is no need to duplicate it in the app.

### Many routes (option 3)

This is the right answer for v2: a `/examples` page (with
a gallery), a `/docs` page (with the rendered spec), a
`/benchmarks` page (with the chart, see
[../decisions/adr-04-recharts-for-benchmark-viz.md](adr-04-recharts-for-benchmark-viz.md)),
a `/share/<id>` route (with database-backed shared
programs). v1 deliberately does not build any of this.

### Full app shell with sidebar (option 4)

Some playgrounds (like Rust's) have a full app shell with
a sidebar for examples, a top bar for actions, a bottom
panel for output. This is great for a production tool, but
it is overkill for v1, which is a teaching artifact.

## Consequences

### Positive

- **Smallest possible playground.** One route, one page
  component, one layout. The implementation is ~500 lines
  of Next.js + React + Tailwind.
- **Easiest to share.** A single URL with the source in
  the query string is the simplest possible sharing
  mechanism.
- **No navigation to learn.** The user opens the page and
  writes code. There is no "where do I click?" question.
- **Forward-compatible with v2.** Adding routes in v2 is
  additive. The `/` route stays; new routes (`/examples`,
  `/docs`, `/benchmarks`, `/share/<id>`) are added.

### Negative

- **No examples in the playground.** v1 has no in-app
  examples gallery. Users have to copy examples from the
  tutorials into the editor. v2 will add an examples
  page.
- **No docs in the playground.** v1 has no in-app docs.
  Users have to read the spec off-repo. v2 will add a
  docs page (rendered from the spec).
- **The Share URL is long.** A program with 1000 lines
  of source produces a URL with ~10,000 characters in the
  query string. Some chat apps and email clients truncate
  long URLs. v2 will add a database-backed Share that
  produces short URLs.
- **No persistent state across sessions.** v1 does not
  save the source across page reloads (other than via the
  Share URL). v2 may add localStorage or a server-backed
  user account.

## Mitigations

- The [../tutorials/](../tutorials/) directory has many
  runnable examples that users can copy into the editor.
- The [../reference/faq.md](../reference/faq.md) and
  [../reference/glossary.md](../reference/glossary.md) are
  short enough to read on the repo.
- The Share URL is a one-click mechanism; the encoded
  source is in the query string and survives page reloads.
- For v2, the plan is to add the missing routes (see
  [../tutorials/tooling.md](../tutorials/tooling.md) §5).

## Reversibility

The decision is **easily reversible**. Adding routes in v2
is additive; the `/` route stays as the playground. There
is no breaking change to v1 programs or shared URLs.

## Cross-references

- [../decisions/adr-05-no-modules-in-v1.md](adr-05-no-modules-in-v1.md)
  — the related decision to keep v1 single-file (no modules).
- [../decisions/adr-03-zustand-for-view-state.md](adr-03-zustand-for-view-state.md)
  — the state management decision for the playground.
- [../tutorials/tooling.md](../tutorials/tooling.md) §2.3 —
  the Share URL mechanism.
- [../tutorials/tooling.md](../tutorials/tooling.md) §5 —
  the v2 plan for additional routes.
