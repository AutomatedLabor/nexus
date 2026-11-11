/**
 * ATLAS seed script — populates the SQLite db with one real Environment
 * (extracted from docs/environment/*.md) plus its Tools, Capabilities,
 * Benchmarks, BenchmarkRuns and Limits. Idempotent: wipes all rows first.
 *
 * Run:  bun run prisma/seed.ts
 *
 * The actual seed data + insert logic live in src/lib/seed.ts so they can be
 * shared with the serverless auto-seed path (ensureSeeded). This file is the
 * CLI entry point: it wipes everything (which the auto-seed deliberately does
 * NOT do — auto-seed only inserts into an empty DB) then re-inserts.
 */
import { db } from '../src/lib/db'
import { insertAll } from '../src/lib/seed'

async function seed() {
  console.log('[atlas-seed] wiping existing rows…')
  await db.report.deleteMany()
  await db.benchmarkRun.deleteMany()
  await db.benchmark.deleteMany()
  await db.limit.deleteMany()
  await db.capability.deleteMany()
  await db.tool.deleteMany()
  await db.environment.deleteMany()

  console.log('[atlas-seed] inserting fresh dataset…')
  await insertAll()

  const counts = {
    environments: await db.environment.count(),
    tools: await db.tool.count(),
    capabilities: await db.capability.count(),
    benchmarks: await db.benchmark.count(),
    benchmarkRuns: await db.benchmarkRun.count(),
    limits: await db.limit.count(),
    reports: await db.report.count(),
  }
  console.log('[atlas-seed] DONE. Final counts:')
  console.table(counts)
}

seed()
  .catch((err) => {
    console.error('[atlas-seed] FATAL:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
