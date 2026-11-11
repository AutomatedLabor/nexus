import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/stats
 * Returns aggregate ATLAS stats:
 *   { environments, tools, capabilities, benchmarks, benchmarkRuns, limits,
 *     reports, lastRunAt, avgRunMs }
 *
 * Auto-seeds the DB on first call if it is empty (so a fresh serverless
 * deploy with an ephemeral file:/tmp/atlas.db shows real data on first hit).
 * Seed failures are swallowed — the stats call still returns (with zeros)
 * rather than 500-ing the whole dashboard.
 */
export async function GET() {
  // Best-effort auto-seed. Wrapped so a seed failure never breaks stats.
  try {
    await ensureSeeded()
  } catch (seedErr) {
    console.error('[atlas-stats] auto-seed failed:', seedErr)
  }

  try {
    const [
      environments,
      tools,
      capabilities,
      benchmarks,
      benchmarkRuns,
      limits,
      reports,
    ] = await Promise.all([
      db.environment.count(),
      db.tool.count(),
      db.capability.count(),
      db.benchmark.count(),
      db.benchmarkRun.count(),
      db.limit.count(),
      db.report.count(),
    ])

    const lastRun = await db.benchmarkRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, durationMs: true },
    })

    const agg = await db.benchmarkRun.aggregate({
      _avg: { durationMs: true },
    })

    return NextResponse.json({
      environments,
      tools,
      capabilities,
      benchmarks,
      benchmarkRuns,
      limits,
      reports,
      lastRunAt: lastRun?.createdAt ?? null,
      avgRunMs: agg._avg.durationMs ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_compute_stats', details: message },
      { status: 500 },
    )
  }
}
