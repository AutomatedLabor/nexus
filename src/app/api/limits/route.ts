import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/limits
 * Query params:
 *   severity — exact severity match (e.g. "critical", "warn", "info")
 *   kind     — exact kind match (e.g. "hard", "architectural", "tool", "network", "tested")
 *   page     — 1-based page (default 1)
 *   limit    — page size (default 50, max 200)
 * Returns { data: [], total, page, limit }
 */
const querySchema = z.object({
  severity: z.string().optional(),
  kind: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-limits] auto-seed failed:', e) }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      severity: searchParams.get('severity') ?? undefined,
      kind: searchParams.get('kind') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { severity, kind, page, limit } = parsed.data

    const where: Record<string, unknown> = {}
    if (severity) where.severity = severity
    if (kind) where.kind = kind

    const [total, rows] = await Promise.all([
      db.limit.count({ where }),
      db.limit.findMany({
        where,
        orderBy: [{ severity: 'asc' }, { kind: 'asc' }, { resource: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { environment: { select: { hostname: true } } },
      }),
    ])

    return NextResponse.json({ data: rows, total, page, limit })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_limits', details: message },
      { status: 500 },
    )
  }
}
