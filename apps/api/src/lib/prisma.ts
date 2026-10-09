import 'dotenv/config'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// The database is remote, so a fresh connection costs a TLS handshake across regions. Keep idle
// connections warm (pg's default closes them after 10s, so most requests paid that handshake).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 5 * 60_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
})
const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
