# RFC-012 — Package registry

> Status: Draft
> Stage: 0 (Proposal)
> Discussion: open
> Related: [Chapter 17 the package ecosystem](../book/ch17-the-package-ecosystem.md), [RFC-003 modules and packages](rfc-003-modules-and-packages.md), [ADR-22 packages via TOML manifest](../decisions/adr-22-packages-via-toml-manifest.md), [ADR-18 trait coherence no orphans](../decisions/adr-18-trait-coherence-no-orphans.md), [Chapter 19 real apps in Aether](../book/ch19-real-apps-in-aether.md)

## Summary

Aether v3.2 introduces a package registry: a server that hosts `.ae` source files plus `aether.toml` manifests; a client (`aether install`) that resolves a package, downloads it, and adds it to the local `aether.toml`; and a Cargo-style SemVer resolution algorithm. The registry is implemented in Aether itself (using the v3 web-framework app, Chapter 19), which is the kind of self-application that proves the language is real. The registry's MVP supports: publishing (with auth), downloading (by name + version), version resolution (SemVer with a `^` default), and a search API.

The registry is *not* a package *manager* — it doesn't run build scripts, doesn't have post-install hooks, doesn't have a Turing-complete config language. A package is a directory of `.ae` files plus an `aether.toml`; the client copies the files into the local `.aether/` cache and adds the path to the import resolver. Simple, auditable, no surprises. The Cargo-style resolution is the only "smart" part; everything else is file IO and string manipulation.

This RFC specifies the registry's HTTP API, the SemVer resolution algorithm, the `aether install` client, the publishing flow, the auth model, and the relationship to the existing v3 packages (which will be published to the registry as the "v3 stdlib packages").

## Motivation

The v3 milestone ships 25 packages, all in the Aether repo. There's no registry, no `aether install`, no version resolution, no published-vs-local distinction. That's fine for v3 — the packages are part of the language. It's not fine for v3.2, where we want third-party packages.

The motivation:

1. **Third-party packages.** The v3 packages are the "stdlib + common utilities" set; the v3.2 milestone wants third-party packages (e.g., `aether-http`, `aether-graphql`, `aether-tensor`, `aether-game-engine`) developed by the community. A registry is the mechanism: a package author publishes, a user installs.
2. **Version resolution.** A package depends on other packages; the user installs the package, the registry resolves the transitive dependencies, the user gets a consistent set. Without a registry, the user has to manually resolve dependencies (download this version of A, that version of B, hope they're compatible). With a registry, the resolution is automatic (Cargo-style SemVer).
3. **Self-application.** The registry is implemented in Aether (using the v3 web-framework app, Chapter 19). This is the second self-application (the first is the Python port, ADR-24): a real server, written in Aether, running on Aether, serving Aether packages. The registry is the proof that Aether is a real language for real workloads.
4. **The v4 self-replication foundation.** The v4 self-replicating compiler is a package, published to the registry, installed by users. The registry is the distribution mechanism.

The motivation is *not* "match npm" or "match crates.io" — those are mature ecosystems with millions of packages. The v3.2 registry is the MVP: a working server, a working client, a working resolution algorithm, a few hundred packages. The growth is a v3.3+ concern.

## Detailed design

### The HTTP API

The registry is a thin HTTP API. The endpoints:

```
GET  /packages/<name>                       Returns the package's manifest (latest version)
GET  /packages/<name>/<version>             Returns the package's manifest at a specific version
GET  /packages/<name>/<version>/download    Returns the package's source tarball (.tar.gz)
GET  /packages/<name>/<version>/sha256      Returns the package's SHA-256 hash (for verification)
GET  /search?q=<query>                       Returns a list of packages matching the query
GET  /packages/<name>/versions              Returns the list of versions for the package

POST /packages                               Publishes a package (requires auth)
                                            Body: the package's source tarball + manifest
                                            Returns: the published version

GET  /users/<username>                      Returns the user's profile (published packages, etc.)
POST /users                                  Creates a user (requires email verification)
POST /auth/login                             Logs in (returns a token)
POST /auth/logout                            Logs out (invalidates the token)
```

The API is intentionally simple. A package is a tarball of `.ae` files plus an `aether.toml`; the registry stores the tarball and the manifest; the client downloads the tarball, verifies the hash, and extracts it into the local cache.

### The SemVer resolution algorithm

The resolution is Cargo-style:

1. The user's `aether.toml` lists direct dependencies: `aether-http = "0.4.2"` (which means `^0.4.2`, i.e., `>=0.4.2, <0.5.0`).
2. The client fetches the manifest for each direct dependency. The manifest lists the dependency's dependencies: `aether-http` 0.4.2 depends on `aether-string = "0.1.0"` and `aether-bytes = "0.2.0"`.
3. The client fetches the manifests for the transitive dependencies, recursively.
4. The client resolves the version constraints: for each package, find a version that satisfies all the constraints (the `^` ranges from all the dependent packages).
5. The client downloads the resolved versions and extracts them into the local cache.

The algorithm is the same as Cargo's, with Aether-specific differences:

- **No build scripts.** Cargo has `build.rs`; Aether packages don't have build scripts (the package is just `.ae` files). The resolution is purely a versioning exercise; no compilation, no code generation.
- **No features.** Cargo has feature flags; Aether packages don't have features (the package is what it is). The resolution is simpler.
- **No dev-dependencies.** Cargo has dev-dependencies (for tests); Aether packages don't have a separate test step (tests are in the same package). The resolution is simpler.
- **Lockfile.** The client generates a `aether.lock` file (the resolved versions), checked into git. Re-running `aether install` reproduces the same versions.

The algorithm is implemented in `aether/core/modules/resolver.ts` (~500 LOC), in Aether (as part of the `aether` CLI's Aether port, the v3.1 plan).

### The `aether install` client

The client (`aether install <package>@<version>` or `aether install <package>` for the latest) does:

1. Fetches the manifest for the requested package.
2. Resolves the version (using the SemVer algorithm above).
3. Downloads the tarball, verifies the SHA-256 hash, extracts it into `.aether/cache/<package>/<version>/`.
4. Adds the package to the local `aether.toml`'s `[dependencies]` section.
5. Runs the resolver on the full dependency set; downloads and extracts any new transitive dependencies.
6. Writes the `aether.lock` file.

The client is implemented in `aether/cli/install.ts` (~300 LOC), in Aether (as part of the `aether` CLI's Aether port).

### The publishing flow

A package author publishes with:

1. `aether login` (authenticates with the registry).
2. `aether package init` (creates the `aether.toml`, if it doesn't exist).
3. `aether package publish` (uploads the package to the registry).

The publish command:

1. Verifies the `aether.toml` is well-formed.
2. Verifies the package is not already published at this version (the registry rejects duplicate publishes; a version is immutable once published).
3. Verifies the package compiles (`aether check` passes).
4. Verifies the package's tests pass (`aether test` passes).
5. Verifies the package's coherence (no orphan impls, per ADR-18).
6. Packages the package into a tarball (excluding `.git/`, `target/`, etc.).
7. Computes the SHA-256 hash of the tarball.
8. Uploads the tarball + manifest to the registry.
9. The registry verifies the auth token, the manifest, the tarball, and the coherence (it re-runs the orphan-impl check on the server); if all pass, the registry publishes the package.

The publishing flow is implemented in `aether/cli/publish.ts` (~400 LOC), in Aether.

### The auth model

The auth model is a simple token-based scheme:

- The user creates an account (`POST /users`) with a username, email, and password.
- The user logs in (`POST /auth/login`) with the username and password; the server returns a token (a JWT or a simple random token).
- The user uses the token for authenticated requests (`Authorization: Bearer <token>`).
- The user logs out (`POST /auth/logout`), which invalidates the token.

The auth model is intentionally simple. The v3.2 registry is for the Aether community (a few thousand users, not a few million); the simple token-based scheme is sufficient. A future v3.3+ might add OAuth (for GitHub login), 2FA, or scoping (per-package tokens).

### The server implementation (in Aether)

The server is implemented in Aether, using the v3 web-framework app (Chapter 19). The architecture:

- `aether-apps/registry/server.ae` — the main server (~500 LOC of Aether).
- `aether-apps/registry/store.ae` — the storage layer (a flat-file store, with one directory per package; each directory has one subdirectory per version; each subdirectory has the manifest + the tarball + the hash). ~200 LOC.
- `aether-apps/registry/auth.ae` — the auth layer (token generation, verification, invalidation). ~150 LOC.
- `aether-apps/registry/resolver.ae` — the SemVer resolver (used both by the client and by the server, for the "find a version that satisfies the constraints" API). ~500 LOC.
- `aether-apps/registry/main.ae` — the entry point (starts the server on port 3000, registers the routes). ~50 LOC.

The server runs on the v3 Aether VM (the bytecode VM, since it's the production runtime). The server uses the v3 web-framework's routing, middleware, and request/response types. The server uses the v3 stdlib's `aether-string`, `aether-list`, `aether-dict`, `aether-json` (for the JSON serialization).

The server is the second real Aether app (the first is the v3 web-framework itself; the third is the v3 database, used as the registry's store). The server is the demonstration that Aether is a real language for real workloads.

### The published v3 packages

The 25 v3 packages (Chapter 17) are published to the registry as the "v3 stdlib packages." They're the first packages in the registry; the community can depend on them. The packages are:

- `aether-list`, `aether-string`, `aether-result`, `aether-math`, `aether-dict`, `aether-iterator`, `aether-set`, `aether-sort`, `aether-parser`, `aether-regex`, `aether-json`, `aether-base64`, `aether-uuid`, `aether-rb-tree`, `aether-lru`, `aether-functional`, `aether-validate`, `aether-tree`, `aether-heap-extra`, `aether-graph`, `aether-matrix`, `aether-state-machine`, `aether-diff`, `aether-logger`, `aether-base64-extra`.

The packages are versioned `0.1.0` (the v3 versions). Future versions (`0.2.0`, `1.0.0`, etc.) are released through the registry; the v3 stdlib packages are no longer special (they're just packages, like any other).

### The relationship to the bootstrap (ADR-21)

The bootstrap (the v3 lexer + parser written in Aether, Chapter 16) is published to the registry as `aether-bootstrap`. The bootstrap is the first "self-application" package; the v4 self-replicating compiler (Chapter 20 §20.6) is published as `aether-compiler`. The registry is the distribution mechanism for the bootstrap and the v4 self-replicating compiler.

## Alternatives considered

### Use crates.io (or npm) as the registry

Publish Aether packages to crates.io (with a `aether-` prefix) or npm (with an `@aether/` scope). Pros: no new registry to build; mature infrastructure. Cons:

- **Not Aether.** The registry should be in Aether, not in Rust or JavaScript. The self-application motivation (point 3 above) requires an Aether registry.
- **Mismatched metadata.** crates.io uses Cargo's `Cargo.toml`; npm uses `package.json`. Aether uses `aether.toml`. The translation would be lossy.
- **Cargo-style resolution vs npm-style resolution.** Cargo uses SemVer with `^`; npm uses SemVer with `~` (and a more complex algorithm). The resolution would have to match the registry's, which is a constraint.

This option is rejected. The Aether registry is in Aether.

### Use a federated registry (like Gemfederated or a Git-based registry)

A federated registry: each package author hosts their own package (e.g., on GitHub), and the registry is a directory of pointers (URLs). The client fetches the package from the author's URL. Pros: no central registry; no single point of failure; the author controls the package. Cons:

- **Availability.** If the author's URL is down, the package is unavailable. A central registry is highly available; a federated registry is at the mercy of the authors.
- **Immutability.** A central registry makes versions immutable (a published version can't be replaced). A federated registry lets the author change the version (e.g., re-tag a git commit), which is a security risk.
- **Discovery.** A central registry has a search API; a federated registry has to crawl the authors' URLs to find packages.

This option is rejected for v3.2. A future v3.3+ might add federated packages (with a "this package is hosted at <URL>" field in the manifest), but the central registry is the MVP.

### Use Git submodules (no registry)

Each package is a git submodule; the user adds the submodule, the build system includes it. Pros: no registry; uses existing Git infrastructure. Cons:

- **No version resolution.** Git submodules pin a specific commit; the user has to manually resolve dependencies (find a commit of A that works with a commit of B). This is the problem the registry solves.
- **No discovery.** Git doesn't have a search API; the user has to know the URL of the package.
- **No immutability.** The author can re-write the git history (force-push); the user's submodule pin becomes invalid.

This option is rejected.

## Drawbacks

- **Self-hosting cost.** The registry is a server; it has to be hosted. The v3.2 plan is to host it on a Vercel Worker (the same infrastructure as the playground). The cost is small (~$10/month for the Worker + a database), but it's a recurring cost.
- **Moderation.** The registry has to moderate the packages (no malware, no abuse, no name-squatting). The v3.2 plan is a manual moderation (the Aether core team reviews each new package); the v3.3+ plan is automated moderation (with a flag-and-review system).
- **Account management.** The registry has user accounts; the accounts have to be managed (passwords, password resets, email verification, abuse handling). The v3.2 plan is a simple account model (email + password); the v3.3+ plan is OAuth (GitHub login).
- **Immutability.** A published version is immutable (can't be replaced). If a package has a security bug, the author has to publish a new version (e.g., 0.4.3 with the fix). The user has to update their dependency. The v3.2 plan is to support "yank" (hide a version from new installs, but allow existing installs to continue), mirroring Cargo's behavior.
- **The v3 stdlib packages are now dependencies.** The v3 packages (the 25 in the repo) become dependencies (the user has to `aether install aether-list` to use them). This is a v3-to-v3.2 migration, with a tool (`aether migrate v3-to-v3.2`) that adds the dependencies automatically.

## Open questions

1. **The hosting.** Vercel Worker vs a dedicated server vs a cloud-provider (AWS, GCP, Azure). The v3.2 plan is Vercel Worker (cheap, fast, simple); the v3.3+ plan might be a dedicated server (for more control).
2. **The database.** The v3.2 plan is a flat-file store (one directory per package); the v3.3+ plan might be a real database (PostgreSQL, SQLite) for search and indexing.
3. **The package signing.** The v3.2 plan is SHA-256 hashes (for tamper detection); the v3.3+ plan might add package signing (with GPG or Sigstore) for non-repudiation.
4. **The namespace.** The v3.2 plan is a flat namespace (`aether-list`, `aether-string`, etc.); the v3.3+ plan might add a scoped namespace (`@user/package`, mirroring npm).

## Cross-references

- [Chapter 17 the package ecosystem](../book/ch17-the-package-ecosystem.md) — the 25 v3 packages.
- [RFC-003 modules and packages](rfc-003-modules-and-packages.md) — the v2 RFC for modules and packages (the manifest format was TBD).
- [ADR-22 packages via TOML manifest](../decisions/adr-22-packages-via-toml-manifest.md) — the v3 manifest format.
- [ADR-18 trait coherence no orphans](../decisions/adr-18-trait-coherence-no-orphans.md) — the coherence rule, which the registry enforces (no orphan impls in published packages).
- [ADR-21 bootstrap host builtins](../decisions/adr-21-bootstrap-host-builtins.md) — the bootstrap, which will be published to the registry.
- [Chapter 19 real apps in Aether](../book/ch19-real-apps-in-aether.md) — the web-framework app, which the registry is built on.
- [Chapter 20 the road ahead](../book/ch20-the-road-ahead.md) §20.5 — the registry in the roadmap.

## Prior art

- **crates.io (Rust)** — the Cargo registry; the closest analogue to the Aether registry.
- **npm (JavaScript)** — the JavaScript registry; a different model (flat namespace, no SemVer `^` by default).
- **PyPI (Python)** — the Python registry; a different model (no SemVer, no built-in resolver).
- **RubyGems (Ruby)** — the Ruby registry; a different model (no SemVer `^`).
- **The v3 web-framework app** — the Aether web framework, which the registry is built on.

## Status

This RFC is at stage 0 (Proposal). The next step is to prototype the registry (server + client + resolver) and validate it with the 25 v3 packages published. If the prototype can resolve a dependency tree of 25 packages with 100 transitive dependencies, the RFC moves to stage 1 (Implementation sketch). The v3.2 milestone is the implementation; the v3.3 milestone is the growth (community packages, automated moderation, OAuth).
