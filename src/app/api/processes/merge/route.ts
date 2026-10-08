import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { normalizeProcessName } from '@/lib/processes'
import { publish } from '@/lib/realtime'

/**
 * POST /api/processes/merge — ADMIN only: act on an admin's decision in the
 * duplicate-process popup.
 *
 * Body: { canonical: "Federal Agri", drop: ["Federal_Agri", "Federal Agri "] }
 *
 * Rewrites every User.process to the canonical spelling, then removes the
 * rejected variants from the Process list. Unwraps in a transaction so a
 * process row can never survive without its users, or vice versa.
 *
 * Returns what actually changed so the popup can say "12 employees relabelled"
 * rather than trusting the request body.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can merge process names' }, { status: 403 })
  }

  let body: { canonical?: unknown; drop?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const canonical = normalizeProcessName(body.canonical)
  if (!canonical) return NextResponse.json({ error: 'Please choose a process name to keep' }, { status: 400 })
  if (canonical.length > 60) {
    return NextResponse.json({ error: 'Process name must be 60 characters or fewer' }, { status: 400 })
  }

  const drop = Array.isArray(body.drop)
    ? [...new Set((body.drop as unknown[]).map((n) => normalizeProcessName(n)).filter(Boolean))]
    : []
  if (drop.length === 0) {
    return NextResponse.json({ error: 'Select at least one variant to merge' }, { status: 400 })
  }

  // Merge-on-normalised-case: the admin may have picked a spelling that differs
  // only by case from an existing row. Target every such variant so nothing is
  // left behind as a near-identical duplicate.
  const targetKeys = new Set([canonical, ...drop].map((n) => n.toLowerCase()))

  const [users, processRows] = await Promise.all([
    db.user.findMany({ select: { id: true, process: true } }),
    db.process.findMany({ select: { id: true, name: true } }),
  ])

  const userIds = users
    .filter((u) => targetKeys.has(normalizeProcessName(u.process).toLowerCase()))
    .map((u) => u.id)

  const rowIds = processRows
    .filter((p) => targetKeys.has(normalizeProcessName(p.name).toLowerCase()))
    .map((p) => p.id)

  if (userIds.length === 0 && rowIds.length === 0) {
    return NextResponse.json({ error: 'No users or process entries matched those names' }, { status: 404 })
  }

  const [userResult] = await db.$transaction([
    db.user.updateMany({ where: { id: { in: userIds } }, data: { process: canonical } }),
    db.process.deleteMany({ where: { id: { in: rowIds } } }),
  ])

  // Re-seed the canonical row so the dropdown keeps offering it even when every
  // user was on a variant and the Process table had no clean copy.
  const stillExists = await db.process.findFirst({
    where: { name: { equals: canonical, mode: 'insensitive' } },
    select: { id: true },
  })
  if (!stillExists) {
    await db.process.create({ data: { name: canonical } }).catch(() => {
      /* lost a concurrent create race — the row is there either way */
    })
  }

  const remaining = await db.process.findMany({
    orderBy: { name: 'asc' },
    select: { name: true },
  })

  publish({ type: 'processes' })
  publish({ type: 'users' })
  return NextResponse.json({
    canonical,
    updatedUsers: userResult.count,
    removedVariants: rowIds.length,
    processes: remaining.map((p) => p.name),
  })
}