import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { normalizeProcessName } from '@/lib/processes'
import { publish } from '@/lib/realtime'

/** GET /api/processes — the admin-controlled list, for the Process dropdown. */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const rows = await db.process.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
  return NextResponse.json({ processes: rows })
}

/** POST /api/processes — ADMIN only: add a process so later IDs can pick it. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can add a process' }, { status: 403 })
  }

  let body: { name?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = normalizeProcessName(body.name)
  if (!name) return NextResponse.json({ error: 'Please enter a process name' }, { status: 400 })
  if (name.length > 60) {
    return NextResponse.json({ error: 'Process name must be 60 characters or fewer' }, { status: 400 })
  }

  // Case-insensitive guard. Postgres unique is exact-match, so without this
  // "Customer Support" and "customer support" would both slip in and the whole
  // point of the controlled list would be lost.
  const dupe = await db.process.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })
  if (dupe) return NextResponse.json({ process: dupe, created: false })

  const created = await db.process.create({ data: { name }, select: { id: true, name: true } })
  publish({ type: 'processes' })
  return NextResponse.json({ process: created, created: true })
}