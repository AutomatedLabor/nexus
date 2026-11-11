import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Disabled ['query'] logging in dev — it produced ~30 KB of stdout per
    // request which competed with Turbopack's compile memory under the 4.1 GB
    // cgroup limit and contributed to OOM-kills. Re-enable locally if needed.
    log: ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db