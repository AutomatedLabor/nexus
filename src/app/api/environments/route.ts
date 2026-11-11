import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

/**
 * GET /api/environments
 * List all environments with related counts (tools, capabilities, runs, limits).
 * Supports ?id=<cuid> to return a single environment with full nested data.
 */
const querySchema = z.object({
  id: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-env] auto-seed failed:', e) }
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({
      id: searchParams.get('id') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_query', details: parsed.error.issues },
        { status: 400 },
      )
    }
    const { id } = parsed.data

    if (id) {
      const env = await db.environment.findUnique({
        where: { id },
        include: {
          tools: true,
          capabilities: true,
          limits: true,
          benchmarkRuns: {
            include: { benchmark: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
      if (!env) {
        return NextResponse.json(
          { error: 'environment_not_found' },
          { status: 404 },
        )
      }
      return NextResponse.json({ data: env })
    }

    const envs = await db.environment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            tools: true,
            capabilities: true,
            benchmarkRuns: true,
            limits: true,
          },
        },
      },
    })

    const data = envs.map((e) => ({
      ...e,
      counts: {
        tools: e._count.tools,
        capabilities: e._count.capabilities,
        benchmarkRuns: e._count.benchmarkRuns,
        limits: e._count.limits,
      },
      _count: undefined,
    }))

    return NextResponse.json({ data, total: data.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_fetch_environments', details: message },
      { status: 500 },
    )
  }
}
