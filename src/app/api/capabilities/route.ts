import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/capabilities
 * Query params:
 *   category       — exact category match (e.g. "filesystem")
 *   environmentId  — exact environment id
 *   page           — 1-based page (default 1)
 *   limit          — page size (default 50, max 200)
 * Returns { data: [], total, page, limit }
 */
const querySchema = z.object({
  category: z.string().optional(),
  environmentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-capabilities] auto-seed failed:', e) }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      category: searchParams.get('category') ?? undefined,
      environmentId: searchParams.get('environmentId') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { category, environmentId, page, limit } = parsed.data

    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (environmentId) where.environmentId = environmentId

    const [total, rows] = await Promise.all([
      db.capability.count({ where }),
      db.capability.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { environment: { select: { hostname: true } } },
      }),
    ])

    return NextResponse.json({ data: rows, total, page, limit })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_capabilities', details: message },
      { status: 500 },
    )
  }
}
