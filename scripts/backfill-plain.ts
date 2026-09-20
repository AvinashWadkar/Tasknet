/**
 * One-off backfill: populate User.passwordPlain for legacy rows (pre password-visibility feature).
 * A candidate password is only stored after bcrypt confirms it matches the stored hash,
 * so the mirror is always accurate. Rows that can't be matched stay null and are
 * lazily backfilled from the user's next successful login.
 * Run: bun scripts/backfill-plain.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

// Known passwords used during the original demo seed + browser testing
const KNOWN: Record<string, string> = {
  ADMIN: 'Admin@123',
  EMP001: 'Avinash@2026',
  EMP005: 'Suresh@2026',
}
const CANDIDATES = ['Digitide@123', 'Admin@123', 'Avinash@2026', 'Suresh@2026']

async function main() {
  const users = await db.user.findMany({ where: { passwordPlain: null } })
  console.log(`Backfilling plaintext passwords for ${users.length} user(s)…`)
  let fixed = 0
  for (const u of users) {
    const tries = [KNOWN[u.employeeCode], ...CANDIDATES].filter(Boolean) as string[]
    for (const candidate of tries) {
      if (await bcrypt.compare(candidate, u.password)) {
        await db.user.update({ where: { id: u.id }, data: { passwordPlain: candidate } })
        console.log(`  ✓ ${u.employeeCode} (${u.name}) → ${candidate}`)
        fixed++
        break
      }
    }
  }
  const still = users.length - fixed
  console.log(`Done. ${fixed} backfilled, ${still} left null (will auto-backfill on next login).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
