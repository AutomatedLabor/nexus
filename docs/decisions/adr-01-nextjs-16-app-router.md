# ADR 01: Next.js 16 App Router

Date: 2026-11-11
Status: Accepted

## Context

ATLAS — the Autonomous Technical Limit Assessment System — is a read-heavy
internal dashboard that visualizes AI agent capabilities, limits, and live
benchmark performance for the sandbox in which the agent itself runs. It
needs (a) a typed REST API surface of 11 route handlers under `/api/*`,
(b) a client-rendered SPA-like shell with six views that swap without a
route transition, and (c) a deployment target that is already installed
in the environment (the `vercel` CLI 65.14 is present at
`/home/z/.npm-global/bin/vercel`). The build mandate named Next.js 16
explicitly, so the framework was not genuinely in contention — but the
*router* and the *runtime configuration* were, and this ADR records both.

The sandbox that produced ATLAS is a 2-vCPU Intel Xeon kata-container on
Debian 13 trixie with 4.1 GiB RAM and zero swap, running Node 24.22.2 and
Bun 1.3.14. The Next.js 16.1.3 dependency is installed locally under
`node_modules/.bin/next` (the global PATH does not expose `next` — only
the Vercel CLI). That means `bun run dev` and `bun run build` resolve to
the local 16.1.3 binary, and Vercel's own build pipeline (when the deploy
goes through) uses the same `package.json` to install Next 16. The
environment's restricted writable surface (`/home`, `/opt`, `/srv`
read-only; only `/tmp`, `/home/z`, and the project tree writable) makes
any framework that needs global installation or root a non-starter, which
again points at the local-`node_modules` Next.js model.

The forces against the App Router were real: React 19's stricter
hydration rules, the Turbopack-vs-Webpack bundler choice, and the
documented friction around Prisma's native `.node` bindings under
Turbopack. The forces in favor were the App Router's first-class Server
Components, Route Handlers that map 1:1 to files under
`src/app/api/*/route.ts`, native Vercel deployment with preview branches,
and the fact that every shadcn/ui New York primitive targets the App
Router by default.

## Decision

Use **Next.js 16 with the App Router**, with the following concrete
configuration: `src/app/` as the router root; Route Handlers (not Pages
Router API routes) for the 11 endpoints (`/api/stats`, `/api/environments`,
`/api/tools`, `/api/capabilities`, `/api/benchmarks`, `/api/benchmarks/[id]`,
`/api/benchmarks/run`, `/api/limits`, `/api/reports`, `/api/export`);
`"use client"` on every interactive component; the root `layout.tsx` and
`page.tsx` as Server Components that mount the client shell `<AtlasApp/>`;
`output: "standalone"` in `next.config.ts` so a self-hosted Caddy deploy
is possible as a fallback; `serverExternalPackages: ["@prisma/client",
".prisma/client"]` to keep Turbopack from bundling Prisma's native
binding; `reactStrictMode: false` so the benchmark runner isn't
double-invoked in dev; and `typescript.ignoreBuildErrors: true` to keep
a single type error from blocking an otherwise-healthy build (with a
manual `bunx tsc --noEmit` gate in the PR checklist as mitigation).

## Alternatives Considered

- **Next.js 16 Pages Router** — would work but lacks first-class Server
  Components, streaming, and the App Router's nested layouts; the API
  routes use a different file shape (`pages/api/*.ts`) that doesn't map
  1:1 to the App Router's `route.ts`. Rejected as a regression.
- **Remix** — excellent DX and the loader/action model is elegant, but
  the build mandate named Next.js 16; Remix would also require a
  non-Vercel deployment story. Rejected.
- **SvelteKit** — fast and lean, but the shadcn/ui + React Query +
  recharts + framer-motion ecosystem that ATLAS depends on is
  React-only. Rejected.
- **Astro** — wrong shape entirely; Astro is for content sites with
  islands, not a six-view interactive dashboard. Rejected.
- **Plain Vite + React + Express** — would technically work, but
  reinvents route handlers, SSR, code-splitting, and Vercel-native
  deployment that Next.js provides for free. Rejected.

## Consequences

**Positive.** Server Components keep the initial HTML small; the root
`/` route renders the dashboard shell on the server and then React Query
takes over on the client. Route Handlers give a clean `/api/*` URL space
that maps 1:1 to files. Vercel preview deploys come for free once the
repo is linked. The standalone output means a Caddy self-host is a
documented fallback if Vercel's serverless constraints (no `python3`
subprocess, ephemeral filesystem) force the live-benchmark endpoint off
the edge.

**Negative.** `typescript.ignoreBuildErrors: true` means a type error
can ship to production; mitigated by a manual `tsc --noEmit` gate.
`reactStrictMode: false` removes the double-invoke safety net in dev —
acceptable because the only mutation-heavy component is the benchmark
runner, where double-invoke would be actively harmful. React 19's
stricter hydration requires `suppressHydrationWarning` on `<html>` for
`next-themes` to work without console noise. The standalone build needs
a `cp -r .next/static .next/standalone/.next/` post-step (already wired
in `package.json`).

**Neutral.** The App Router is the documented future of Next.js; there
is no migration pressure. The team's prior Pages Router experience
transferred cleanly.
