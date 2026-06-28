import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const email = 'admin@omnipulse.local'
  const password = 'admin123'

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Seed: user ${email} already exists — skipping`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'OWNER',
      workspaces: { create: { name: 'My Workspace' } },
    },
  })

  console.log(`Seed: created user ${user.email} (id: ${user.id}) with default workspace`)
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
