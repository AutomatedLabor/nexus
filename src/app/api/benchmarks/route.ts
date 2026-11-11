import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/benchmarks
 * Returns all benchmark definitions, each annotated with:
 *   runCount        — number of BenchmarkRun rows
 *   latestRunMs     — durationMs of the most recent run
 *   latestRunAt     — createdAt of the most recent run
 */
export async function GET() {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-benchmarks] auto-seed failed:', e) }
    const benchmarks = await db.benchmark.findMany({
      orderBy: { name: 'asc' },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { durationMs: true, createdAt: true },
        },
        _count: { select: { runs: true } },
      },
    })

    const data = benchmarks.map((b) => {
      const latest = b.runs[0]
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        description: b.description,
        unit: b.unit,
        runCount: b._count.runs,
        latestRunMs: latest?.durationMs ?? null,
        latestRunAt: latest?.createdAt ?? null,
      }
    })

    return NextResponse.json({ data, total: data.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_benchmarks', details: message },
      { status: 500 },
    )
  }
}
