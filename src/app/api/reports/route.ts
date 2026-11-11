import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/reports
 *   Returns { data: Report[], total }
 *
 * POST /api/reports
 *   Body: { title: string, format: 'html'|'json'|'csv', parameters?: object }
 *   Generates a Report row and returns it.
 *     - format=json: content = JSON.stringify of { stats, environment, benchmarks, limits }
 *     - format=csv:  content = CSV of all benchmark runs
 *     - format=html: content = simple HTML document with summary + run table
 */
const postSchema = z.object({
  title: z.string().min(1).max(200),
  format: z.enum(['html', 'json', 'csv']),
  parameters: z.record(z.string(), z.unknown()).optional(),
})

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export async function GET() {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-reports] auto-seed failed:', e) }
    const reports = await db.report.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: reports, total: reports.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_reports', details: message },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-reports] auto-seed failed:', e) }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'invalid_json_body' },
        { status: 400 },
      )
    }
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.issues },
        { status: 400 },
      )
    }
    const { title, format, parameters } = parsed.data

    const environment = await db.environment.findFirst({
      include: { _count: { select: { tools: true, capabilities: true, limits: true } } },
    })
    if (!environment) {
      return NextResponse.json(
        { error: 'no_environment_present' },
        { status: 500 },
      )
    }

    const runs = await db.benchmarkRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: { benchmark: true },
    })
    const limits = await db.limit.findMany({
      orderBy: [{ severity: 'asc' }, { resource: 'asc' }],
    })

    const stats = {
      environment: {
        hostname: environment.hostname,
        osName: environment.osName,
        osVersion: environment.osVersion,
        kernel: environment.kernel,
        cpuModel: environment.cpuModel,
        cpuCores: environment.cpuCores,
        memoryMb: environment.memoryMb,
        swapMb: environment.swapMb,
      },
      toolCount: environment._count.tools,
      capabilityCount: environment._count.capabilities,
      limitCount: environment._count.limits,
      runCount: runs.length,
      avgRunMs: runs.length
        ? runs.reduce((a, r) => a + r.durationMs, 0) / runs.length
        : null,
    }

    let content: string

    if (format === 'json') {
      content = JSON.stringify({ stats, runs, limits }, null, 2)
    } else if (format === 'csv') {
      const header = [
        'benchmarkName',
        'category',
        'durationMs',
        'success',
        'details',
        'createdAt',
      ].join(',')
      const lines = runs.map((r) =>
        [
          csvEscape(r.benchmark.name),
          csvEscape(r.benchmark.category),
          r.durationMs.toString(),
          r.success ? 'true' : 'false',
          csvEscape(r.details ?? ''),
          r.createdAt.toISOString(),
        ].join(','),
      )
      content = [header, ...lines].join('\n')
    } else {
      // html
      const rowsHtml = runs
        .map(
          (r) =>
            `        <tr><td>${r.benchmark.name}</td><td>${r.benchmark.category}</td><td>${r.durationMs.toFixed(3)}</td><td>${r.success ? '✓' : '✗'}</td><td>${(r.details ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</td><td>${r.createdAt.toISOString()}</td></tr>`,
        )
        .join('\n')
      content = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 14px; }
  th { background: #f4f4f5; }
  h1 { margin-bottom: 0; }
  .meta { color: #555; margin-top: 0.25rem; }
</style></head>
<body>
  <h1>${title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</h1>
  <p class="meta">Environment: ${stats.environment.hostname} &middot; ${stats.environment.osName} ${stats.environment.osVersion} &middot; ${stats.environment.cpuModel} (${stats.environment.cpuCores} cores) &middot; ${stats.environment.memoryMb} MB RAM</p>
  <h2>Benchmark Runs (${stats.runCount})</h2>
  <table>
    <thead><tr><th>Name</th><th>Category</th><th>Duration (ms)</th><th>OK</th><th>Details</th><th>Created At</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
</body>
</html>
`
    }

    const report = await db.report.create({
      data: {
        title,
        format,
        parameters: JSON.stringify(parameters ?? {}),
        content,
      },
    })

    return NextResponse.json({ data: report }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_create_report', details: message },
      { status: 500 },
    )
  }
}
