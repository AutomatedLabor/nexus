import { NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/seed'

const execFileP = promisify(execFile)

/**
 * POST /api/benchmarks/run
 * Body: { name: string }
 *
 * Spawns a Python subprocess to execute the requested benchmark live, parses
 * the printed duration in ms, persists a BenchmarkRun row, and returns it.
 *
 * Supported benchmarks (must match the seed names):
 *   - csv_generate_1m   (write 1,000,000 CSV rows)
 *   - sha256_10k        (SHA-256 of 10,000 strings)
 *   - fib_recursive_30  (recursive Fibonacci n=30)
 *   - matmul_100x100    (pure-python 100x100 triple-loop matmul)
 */
const BENCH_PYTHON: Record<string, string> = {
  csv_generate_1m: `
import csv, time
N = 1_000_000
s = time.perf_counter()
with open('/tmp/atlas-1m.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['n'])
    for i in range(1, N + 1):
        w.writerow([i])
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
  sha256_10k: `
import hashlib, time
N = 10_000
s = time.perf_counter()
out = []
for i in range(N):
    out.append(hashlib.sha256(f"string-{i}-hello-{i*i}".encode()).hexdigest())
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
  fib_recursive_30: `
import time
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
s = time.perf_counter()
fib(30)
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
  matmul_100x100: `
import time
N = 100
A = [[i + j for j in range(N)] for i in range(N)]
B = [[(i * j) % 7 for j in range(N)] for i in range(N)]
C = [[0] * N for _ in range(N)]
s = time.perf_counter()
for i in range(N):
    Ai = A[i]; Ci = C[i]
    for k in range(N):
        aik = Ai[k]; Bk = B[k]
        for j in range(N):
            Ci[j] += aik * Bk[j]
e = time.perf_counter()
print(f"{(e - s) * 1000:.3f}")
`,
}

const BENCH_DETAILS: Record<string, string> = {
  csv_generate_1m: 'generate 1,000,000 integers to /tmp/atlas-1m.csv',
  sha256_10k: 'compute SHA-256 of 10,000 strings',
  fib_recursive_30: 'recursive Fibonacci n=30 (~2.7M calls)',
  matmul_100x100: 'pure-python triple-loop 100x100 matmul (~1,000,000 MACs)',
}

const bodySchema = z.object({
  name: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    try { await ensureSeeded() } catch (e) { console.error('[atlas-bench-run] auto-seed failed:', e) }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'invalid_json_body' },
        { status: 400 },
      )
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'invalid_body',
          details: parsed.error.issues,
          supported: Object.keys(BENCH_PYTHON),
        },
        { status: 400 },
      )
    }
    const { name } = parsed.data

    const script = BENCH_PYTHON[name]
    if (!script) {
      return NextResponse.json(
        {
          error: 'unsupported_benchmark',
          details: `Benchmark '${name}' cannot be run live.`,
          supported: Object.keys(BENCH_PYTHON),
        },
        { status: 400 },
      )
    }

    // Execute the benchmark with a 30-second hard timeout (per ATLAS spec).
    let stdout = ''
    let stderr = ''
    try {
      const res = await execFileP('python3', ['-c', script], {
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      })
      stdout = res.stdout
      stderr = res.stderr
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Detect "binary not found / can't spawn" — happens on serverless
      // platforms (Vercel) where python3 is not on PATH. Node surfaces this
      // as "spawn python3 ENOENT" (ErrnoException with code ENOENT).
      const code = (err as { code?: string }).code
      const isMissingBinary =
        code === 'ENOENT' ||
        /ENOENT/i.test(message) ||
        /spawn\s+python3/i.test(message) ||
        /not found/i.test(message)
      if (isMissingBinary) {
        return NextResponse.json(
          {
            error:
              'Live benchmark execution is not available in this deployment (requires python3 subprocess). Run ATLAS locally to execute live benchmarks.',
            supported: Object.keys(BENCH_PYTHON),
          },
          { status: 501 },
        )
      }
      return NextResponse.json(
        {
          error: 'benchmark_execution_failed',
          details: message,
          stderr,
        },
        { status: 500 },
      )
    }

    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const durationMs = parseFloat(lines[lines.length - 1] ?? '')
    if (!Number.isFinite(durationMs)) {
      return NextResponse.json(
        {
          error: 'benchmark_parse_failed',
          details: 'Could not parse duration from python3 stdout',
          stdout,
          stderr,
        },
        { status: 500 },
      )
    }

    // Find or create the Benchmark definition.
    let bench = await db.benchmark.findUnique({ where: { name } })
    if (!bench) {
      bench = await db.benchmark.create({
        data: {
          name,
          category: 'compute',
          description: BENCH_DETAILS[name] ?? '',
          unit: 'ms',
        },
      })
    }

    // Use the first environment (single-tenant sandbox).
    const env = await db.environment.findFirst()
    if (!env) {
      return NextResponse.json(
        { error: 'no_environment_present' },
        { status: 500 },
      )
    }

    const run = await db.benchmarkRun.create({
      data: {
        benchmarkId: bench.id,
        environmentId: env.id,
        durationMs,
        success: true,
        details: BENCH_DETAILS[name] ?? '',
      },
      include: { benchmark: true, environment: { select: { hostname: true } } },
    })

    return NextResponse.json({ data: run }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'failed_to_run_benchmark', details: message },
      { status: 500 },
    )
  }
}
