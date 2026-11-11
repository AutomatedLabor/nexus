<p align="center">
  <pre>
   █████╗ ███████╗██████╗  ██████╗ ██╗  ██╗
  ██╔══██╗╚══███╔╝██╔══██╗██╔═══██╗╚██╗██╔╝
  ███████║  ███╔╝ ██████╔╝██║   ██║ ╚███╔╝
  ██╔══██║ ███╔╝  ██╔══██╗██║   ██║ ██╔██╗
  ██║  ██║███████╗██████╔╝╚██████╔╝██╔╝ ██╗
  ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝
  </pre>
</p>

<h1 align="center">ATLAS</h1>
<p align="center">
  <em>An opinionated, environment-aware fullstack starter — Next.js 16 · TypeScript · Prisma · Vercel.</em>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6.svg" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-ready-black.svg" />
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
</p>

---

## Overview

**ATLAS** is a fullstack web application scaffold designed to be reproducible
from a clean sandbox container. It ships with a Next.js 16 App Router
frontend, a Prisma-backed data layer, an opinionated component library based
on shadcn/ui, and an exhaustive **environment cartography** under
[`docs/environment/`](docs/environment/00-index.md) so that any agent or
human picking up the repo can know exactly which tools, runtime versions,
filesystem limits, and CPU/memory budget they are working with.

The project is intentionally small, well-typed, and vercel-ready: `bun install`
→ `bun run dev` (or `vercel deploy`) and you are live.

## Features

- ⚡️ **Next.js 16** App Router, React Server Components, streaming
- 🎨 **Tailwind CSS** + **shadcn/ui** component library (50+ components)
- 🗄️ **Prisma** ORM with SQLite default (`prisma/schema.prisma`)
- 🧪 **Bun-first** toolchain (fast install, fast test, fast build)
- 🛰️ **Caddy** reverse-proxy config included for self-hosting
- 📚 **Environment cartography** — real probe data for OS, hardware,
  filesystem, software, network, and a computational benchmark suite
- 🤖 **Agent-friendly** — every assumption about the runtime is written
  down; nothing is left to "you know, the usual setup"

## Quick start

```bash
# 1. Install deps (bun is the supported package manager — see bun.lock)
bun install

# 2. Set up the database
bunx prisma migrate dev

# 3. Run the dev server
bun run dev
# → http://localhost:3000

# 4. (Optional) Deploy to Vercel
vercel
```

> The sandbox this repo was built in ships with Node 24, Bun 1.3, and the
> Vercel CLI pre-installed. See [`docs/environment/03-software.md`](docs/environment/03-software.md)
> for the full tool inventory.

## Architecture

```mermaid
flowchart LR
  Browser[Browser / Client] -->|HTTPS| Next[Next.js 16 App Router]
  Next -->|Server Components| UI[shadcn/ui + Tailwind]
  Next -->|Route Handlers| API[/app/api/route.ts]
  API --> Prisma[Prisma Client]
  Prisma --> DB[(SQLite / Postgres)]
  Next -->|deploy| Vercel[Vercel Edge / Node Runtime]
  Caddy[Caddy reverse proxy] -.->|self-host| Next
  Env[docs/environment/] -.->|informs| Next
```

## Documentation

| Topic | File |
|-------|------|
| Environment cartography (index) | [`docs/environment/00-index.md`](docs/environment/00-index.md) |
| OS & hardware probe | [`docs/environment/01-os-hardware.md`](docs/environment/01-os-hardware.md) |
| Filesystem probe | [`docs/environment/02-filesystem.md`](docs/environment/02-filesystem.md) |
| Software inventory | [`docs/environment/03-software.md`](docs/environment/03-software.md) |
| Network probe | [`docs/environment/05-network.md`](docs/environment/05-network.md) |
| Runtime smoke tests | [`docs/environment/06-runtime-capabilities.md`](docs/environment/06-runtime-capabilities.md) |
| Computational benchmarks | [`docs/environment/07-benchmarks.md`](docs/environment/07-benchmarks.md) |
| Contributing guide | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Code of conduct | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) |

## Project layout

```
atlas/
├── src/
│   ├── app/            # Next.js App Router pages & route handlers
│   ├── components/ui/  # shadcn/ui component library
│   ├── hooks/          # React hooks
│   └── lib/            # Shared utilities (db, utils)
├── prisma/             # Prisma schema & migrations
├── public/             # Static assets
├── docs/environment/  # Live environment probes
├── seed-data/          # Raw benchmark JSON & seed inputs
├── tests/              # Build/runtime container tests
├── examples/           # Standalone example apps (e.g. websocket)
├── .github/            # Issue templates, PR template, CI workflow
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── eslint.config.mjs
├── package.json
└── Caddyfile
```

## License

MIT © ATLAS Contributors — see [`LICENSE`](LICENSE).

## Contributing

PRs welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) first. Open an issue using one of
the templates in [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) before
starting work on anything substantial.
