import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/tools
 * Query params:
 *   q         — case-insensitive substring on name (default: "")
 *   category  — exact category match (e.g. "language")
 *   installed — "true" | "false" (default: any)
 *   page      — 1-based page (default 1)
 *   limit     — page size (default 50, max 200)
 * Returns { data: [], total, page, limit }
 */
const querySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  installed: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-tools] auto-seed failed:', e) }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      installed: searchParams.get('installed') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { q, category, installed, page, limit } = parsed.data

    const where: Record<string, unknown> = {}
    if (q && q.trim().length > 0) {
      where.name = { contains: q.trim() }
    }
    if (category) {
      where.category = category
    }
    if (installed !== undefined) {
      where.installed = installed === 'true'
    }

    const [total, rows] = await Promise.all([
      db.tool.count({ where }),
      db.tool.findMany({
        where,
        orderBy: [{ installed: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { environment: { select: { hostname: true } } },
      }),
    ])

    return NextResponse.json({
      data: rows,
      total,
      page,
      limit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_tools', details: message },
      { status: 500 },
    )
  }
}
