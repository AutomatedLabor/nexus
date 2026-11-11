/**
 * ATLAS auto-seed library.
 *
 * Used by:
 *   - prisma/seed.ts    (CLI: `bun run prisma/seed.ts`) — wipes & reseeds.
 *   - src/app/api/stats/route.ts — calls ensureSeeded() on first hit to populate
 *     an empty serverless DB (e.g. fresh Vercel deploy with file:/tmp/atlas.db).
 *
 * The seed data is identical to prisma/seed.ts (same Environment, Tools,
 * Capabilities, Benchmarks, Limits). Keeping it here means the deployed app
 * is self-bootstrapping — no manual seed step needed in ephemeral serverless.
 *
 * The benchmark results are imported as a JSON module (rather than read with
 * fs.readFileSync) so Next.js bundles them into the serverless function and
 * Vercel's file tracer doesn't have to infer a runtime path.
 *
 * The DDL for the 7 tables is also inlined here so that ensureSeeded() can
 * bootstrap a completely empty SQLite file (the case on a fresh Vercel
 * serverless instance where /tmp/atlas.db doesn't exist yet). The DDL was
 * generated with `prisma migrate diff --from-empty --to-schema-datamodel
 * prisma/schema.prisma --script` and must stay in sync with the Prisma
 * schema. All statements use CREATE TABLE/INDEX with IF NOT EXISTS so they
 * are safe to re-run.
 */
import { db } from './db'
import benchmarksJson from '../../seed-data/benchmarks.json'

// ---------------------------------------------------------------------------
// 0. Schema DDL — mirrors prisma/schema.prisma. Runs once per cold-start
//    instance on a fresh /tmp/atlas.db (CREATE TABLE IF NOT EXISTS is a
//    no-op on an already-initialised db).
// ---------------------------------------------------------------------------
const SCHEMA_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostname" TEXT NOT NULL,
    "osName" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "kernel" TEXT NOT NULL,
    "cpuModel" TEXT NOT NULL,
    "cpuCores" INTEGER NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "swapMb" INTEGER NOT NULL DEFAULT 0,
    "diskGb" INTEGER NOT NULL DEFAULT 0,
    "container" TEXT NOT NULL,
    "publicIp" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Tool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "installed" BOOLEAN NOT NULL DEFAULT true,
    "environmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tool_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Capability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "environmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Capability_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Benchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "BenchmarkRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "benchmarkId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "durationMs" REAL NOT NULL,
    "throughput" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkRun_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "Benchmark" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Limit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "environmentId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "limitValue" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Limit_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Benchmark_name_key" ON "Benchmark"("name")`,
]

async function ensureSchema(): Promise<void> {
  for (const stmt of SCHEMA_DDL) {
    await db.$executeRawUnsafe(stmt)
  }
}

// ---------------------------------------------------------------------------
// 1. Real benchmark results from seed-data/benchmarks.json (imported as a
//    module so Next bundles it into the serverless function).
// ---------------------------------------------------------------------------
type BenchResult = { name: string; duration_ms: number; details: string }
const BENCHMARKS: BenchResult[] = benchmarksJson as BenchResult[]

// ---------------------------------------------------------------------------
// 2. Real environment values (docs/environment/*.md).
// ---------------------------------------------------------------------------
const ENVIRONMENT = {
  hostname: 'c-6af44108-140d72b5-6bf513003f7a',
  osName: 'Debian GNU/Linux',
  osVersion: '13 (trixie)',
  kernel: '5.10.134-013.15.kangaroo.al8.x86_64',
  cpuModel: 'Intel(R) Xeon(R) Processor',
  cpuCores: 2,
  memoryMb: 4100,
  swapMb: 0,
  diskGb: 10,
  container: 'kata-container (KVM)',
  publicIp: '8.212.10.159',
  arch: 'x86_64',
}

// ---------------------------------------------------------------------------
// 3. Tools (20 installed + 8 representative absences).
// ---------------------------------------------------------------------------
type ToolSeed = {
  name: string
  category: string
  version: string
  path: string
  installed: boolean
}

const INSTALLED_TOOLS: ToolSeed[] = [
  { name: 'node', category: 'runtime', version: 'v24.22.2', path: '/usr/bin/node', installed: true },
  { name: 'bun', category: 'runtime', version: '1.3.14', path: '/usr/local/bin/bun', installed: true },
  { name: 'python3', category: 'runtime', version: 'Python 3.12.16', path: '/home/z/.venv/bin/python3', installed: true },
  { name: 'java', category: 'runtime', version: 'openjdk 21.0.13', path: '/usr/bin/java', installed: true },
  { name: 'gcc', category: 'dev-tool', version: 'gcc (Debian 14.2.0-19) 14.2.0', path: '/usr/bin/gcc', installed: true },
  { name: 'g++', category: 'dev-tool', version: 'g++ (Debian 14.2.0-19) 14.2.0', path: '/usr/bin/g++', installed: true },
  { name: 'make', category: 'dev-tool', version: 'GNU Make 4.4.1', path: '/usr/bin/make', installed: true },
  { name: 'git', category: 'dev-tool', version: 'git version 2.47.3', path: '/usr/bin/git', installed: true },
  { name: 'jq', category: 'dev-tool', version: 'jq-1.7', path: '/usr/bin/jq', installed: true },
  { name: 'sed', category: 'dev-tool', version: 'sed (GNU sed) 4.9', path: '/usr/bin/sed', installed: true },
  { name: 'awk', category: 'dev-tool', version: 'mawk 1.3.4', path: '/usr/bin/awk', installed: true },
  { name: 'vim', category: 'dev-tool', version: 'VIM 9.1', path: '/usr/bin/vim', installed: true },
  { name: 'nano', category: 'dev-tool', version: 'GNU nano 8.4', path: '/usr/bin/nano', installed: true },
  { name: 'pandoc', category: 'dev-tool', version: 'pandoc 3.1.11.1', path: '/usr/bin/pandoc', installed: true },
  { name: 'dot', category: 'dev-tool', version: 'graphviz 2.42.4', path: '/usr/bin/dot', installed: true },
  { name: 'curl', category: 'web', version: 'curl 8.14.1', path: '/usr/bin/curl', installed: true },
  { name: 'wget', category: 'web', version: 'GNU Wget 1.25.0', path: '/usr/bin/wget', installed: true },
  { name: 'caddy', category: 'web', version: 'v2.8.4', path: '/usr/bin/caddy', installed: true },
  { name: 'vercel', category: 'build-deploy', version: 'Vercel CLI 65.14.0', path: '/home/z/.npm-global/bin/vercel', installed: true },
  { name: 'ffmpeg', category: 'media', version: '7.1.5', path: '/usr/bin/ffmpeg', installed: true },
]

const NOT_INSTALLED_TOOLS: ToolSeed[] = [
  { name: 'rust', category: 'runtime', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'go', category: 'runtime', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'ruby', category: 'runtime', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'php', category: 'runtime', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'clang', category: 'dev-tool', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'sqlite3', category: 'database', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'gh', category: 'build-deploy', version: 'NOT INSTALLED', path: '', installed: false },
  { name: 'docker', category: 'build-deploy', version: 'NOT INSTALLED', path: '', installed: false },
]

// ---------------------------------------------------------------------------
// 4. Capabilities (5 measured + 10 benchmark-mirrored).
// ---------------------------------------------------------------------------
type CapabilitySeed = {
  category: string
  name: string
  value: number
  unit: string
  details: string
}

const MEASURED_CAPABILITIES: CapabilitySeed[] = [
  { category: 'filesystem', name: 'file_write_1000_files', value: 0.28, unit: 's', details: 'write 1000 small files via shell, ~3586 files/s (docs 02-filesystem.md)' },
  { category: 'filesystem', name: 'large_file_100mb', value: 0.038, unit: 's', details: 'dd 100MB from /dev/zero, ~2.7 GB/s (docs 02-filesystem.md)' },
  { category: 'network', name: 'parallel_http_50', value: 50, unit: 'count', details: '50 concurrent HTTPS GETs to example.com, all 200 (docs 05-network.md)' },
  { category: 'network', name: 'http_latency_example_com', value: 23, unit: 'ms', details: 'curl HTTPS GET https://example.com time_total ~23ms (docs 05-network.md)' },
  { category: 'network', name: 'dns_resolvers', value: 2, unit: 'count', details: 'nameserver 100.100.2.136 and 100.100.2.138 (docs 05-network.md)' },
]

const BENCH_CATEGORY: Record<string, string> = {
  csv_generate_1m: 'filesystem',
  read_sort_1m: 'filesystem',
  json_generate_10k: 'serialization',
  sha256_10k: 'crypto',
  regex_match_1m: 'text',
  str_replace_1m: 'text',
  matmul_100x100: 'compute',
  fib_recursive_30: 'compute',
  write_10k_files: 'filesystem',
  read_delete_10k_files: 'filesystem',
}

// ---------------------------------------------------------------------------
// 5. Limits (10 — hard/architectural/tool/filesystem/network/tested).
// ---------------------------------------------------------------------------
type LimitSeed = {
  resource: string
  limitValue: string
  unit: string
  kind: string
  details: string
  severity: string
}

const LIMITS: LimitSeed[] = [
  { resource: 'memory', limitValue: '4100', unit: 'MB', kind: 'hard', details: 'cgroup memory limit ~4.1 GiB, no swap as safety net (docs 01)', severity: 'warning' },
  { resource: 'swap', limitValue: '0', unit: 'MB', kind: 'hard', details: 'free -h Swap: 0B — OOM killer has no buffer (docs 01)', severity: 'critical' },
  { resource: 'cpu_cores', limitValue: '2', unit: 'count', kind: 'hard', details: 'lscpu CPU(s): 2, single Intel Xeon socket, no SMT (docs 01)', severity: 'info' },
  { resource: 'container_isolation', limitValue: 'kata-container', unit: 'kind', kind: 'architectural', details: 'PID 1 is tini, /.dockerenv present, cgroup under /k8s.io/, full KVM virt (docs 01)', severity: 'info' },
  { resource: 'no_docker', limitValue: 'absent', unit: 'boolean', kind: 'tool', details: 'docker / dockerd not installed; cannot run nested containers (docs 03)', severity: 'info' },
  { resource: 'no_gh_cli', limitValue: 'absent', unit: 'boolean', kind: 'tool', details: 'gh (GitHub CLI) not installed — cannot create PRs/issues from CLI (docs 03)', severity: 'info' },
  { resource: 'no_rust', limitValue: 'absent', unit: 'boolean', kind: 'tool', details: 'rustc/cargo not installed (docs 03)', severity: 'info' },
  { resource: 'read_only_home', limitValue: '/home,/opt,/srv', unit: 'paths', kind: 'filesystem', details: '/home /opt /srv read-only; writable: /tmp /var/tmp /home/z /home/z/my-project (docs 02)', severity: 'warning' },
  { resource: 'egress_ip', limitValue: '8.212.10.159', unit: 'ip', kind: 'network', details: 'public egress IP from curl https://api.ipify.org, Alibaba Cloud range (docs 05)', severity: 'info' },
  { resource: 'max_concurrent_http', limitValue: '50', unit: 'count', kind: 'tested', details: '50 parallel HTTPS GETs to example.com all returned 200, no throttling (docs 05)', severity: 'info' },
]

// ---------------------------------------------------------------------------
// Internal: insert all seed rows for an empty DB. Does NOT delete anything
// (assumes the DB is empty — caller checks Environment.count() === 0).
// ---------------------------------------------------------------------------
async function insertAll(): Promise<void> {
  const env = await db.environment.create({ data: ENVIRONMENT })

  const allTools = [...INSTALLED_TOOLS, ...NOT_INSTALLED_TOOLS]
  for (const t of allTools) {
    await db.tool.create({ data: { ...t, environmentId: env.id } })
  }

  for (const c of MEASURED_CAPABILITIES) {
    await db.capability.create({ data: { ...c, environmentId: env.id } })
  }
  for (const b of BENCHMARKS) {
    await db.capability.create({
      data: {
        category: 'benchmark',
        name: b.name,
        value: b.duration_ms,
        unit: 'ms',
        details: b.details,
        environmentId: env.id,
      },
    })
  }

  for (const b of BENCHMARKS) {
    const bench = await db.benchmark.create({
      data: {
        name: b.name,
        category: BENCH_CATEGORY[b.name] ?? 'general',
        description: b.details,
        unit: 'ms',
      },
    })
    await db.benchmarkRun.create({
      data: {
        benchmarkId: bench.id,
        environmentId: env.id,
        durationMs: b.duration_ms,
        success: true,
        details: b.details,
      },
    })
  }

  for (const l of LIMITS) {
    await db.limit.create({ data: { ...l, environmentId: env.id } })
  }
}

// ---------------------------------------------------------------------------
// Public: ensureSeeded()
//
// On first call per cold-start instance:
//   1. ensureSchema() — create the 7 tables (CREATE TABLE IF NOT EXISTS) on a
//      fresh /tmp/atlas.db. This is the key step for serverless: Vercel
//      gives the function a fresh /tmp on every cold start, so the SQLite
//      file does not exist and `db.environment.count()` would otherwise throw
//      "The table `main.Environment` does not exist in the current database."
//   2. Check if Environment has any rows. If yes, return (already seeded).
//   3. Otherwise, insertAll() the full ATLAS seed dataset.
//
// Wrapped in try/catch by the caller (the /api/stats route) so a seed failure
// never breaks the API. Uses a module-level Promise guard so concurrent
// first-request calls share one seed run instead of racing.
// ---------------------------------------------------------------------------
let seedPromise: Promise<void> | null = null

export async function ensureSeeded(): Promise<void> {
  // If a seed is already in flight on this cold-start instance, reuse it.
  if (seedPromise) return seedPromise
  seedPromise = (async () => {
    await ensureSchema()
    const envCount = await db.environment.count()
    if (envCount > 0) return // already seeded
    await insertAll()
  })()
  return seedPromise
}

// Exposed for the CLI seed script (which wipes first, then inserts).
export { insertAll }
