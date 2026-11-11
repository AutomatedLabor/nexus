import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/export?format=csv|json
 *
 * Exports all benchmark runs and all limits. The CSV variant returns a single
 * CSV document with two sections; the JSON variant returns a structured object.
 */
const querySchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
})

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export async function GET(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-export] auto-seed failed:', e) }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      format: searchParams.get('format') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', details: parsed.error.issues },
        { status: 400 },
      )
    }
    const { format } = parsed.data

    const runs = await db.benchmarkRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        benchmark: true,
        environment: { select: { hostname: true, osName: true, osVersion: true } },
      },
    })
    const limits = await db.limit.findMany({
      orderBy: [{ severity: 'asc' }, { resource: 'asc' }],
      include: { environment: { select: { hostname: true } } },
    })

    if (format === 'json') {
      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        benchmarkRuns: runs,
        limits,
      })
    }

    // CSV
    const header1 = [
      'section',
      'name',
      'category',
      'durationMs',
      'success',
      'environment',
      'details',
      'createdAt',
    ].join(',')
    const runLines = runs.map((r) =>
      [
        'benchmarkRun',
        csvEscape(r.benchmark.name),
        csvEscape(r.benchmark.category),
        r.durationMs.toString(),
        r.success ? 'true' : 'false',
        csvEscape(r.environment.hostname),
        csvEscape(r.details ?? ''),
        r.createdAt.toISOString(),
      ].join(','),
    )
    const header2 = [
      'section',
      'resource',
      'kind',
      'limitValue',
      'unit',
      'severity',
      'details',
      'createdAt',
    ].join(',')
    const limitLines = limits.map((l) =>
      [
        'limit',
        csvEscape(l.resource),
        csvEscape(l.kind),
        csvEscape(l.limitValue),
        csvEscape(l.unit),
        csvEscape(l.severity),
        csvEscape(l.details),
        l.createdAt.toISOString(),
      ].join(','),
    )
    const csv =
      header1 +
      '\n' +
      runLines.join('\n') +
      '\n' +
      header2 +
      '\n' +
      limitLines.join('\n') +
      '\n'

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="atlas-export.csv"',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_export', details: message },
      { status: 500 },
    )
  }
}
