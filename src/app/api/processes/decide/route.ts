import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import {
  DIFFERENT,
  clearDecisions,
  countDecisions,
  recordDifferent,
} from '@/lib/process-decisions'

/**
 * /api/processes/decide — ADMIN only: remember the answers the admin gives in
 * the "Review process names" popup so the same suggestion is never shown again.
 *
 * POST { names: string[], decision: "DIFFERENT" }
 *   Stores every pair of the given names as "these are not the same process".
 * DELETE
 *   Forgets every remembered answer (the admin can be asked again).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can review process names' }, { status: 403 })
  }

  let body: { names?: unknown; decision?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const decision = String(body.decision || DIFFERENT).toUpperCase()
  if (decision !== DIFFERENT) {
    return NextResponse.json({ error: 'Only a "DIFFERENT" decision can be remembered' }, { status: 400 })
  }

  const names = Array.isArray(body.names) ? body.names : []
  const distinct = [...new Set(names.map((n) => String(n ?? '').trim()).filter(Boolean))]
  if (distinct.length < 2) {
    return NextResponse.json({ error: 'At least two names are required' }, { status: 400 })
  }

  const recorded = await recordDifferent(distinct)
  const total = await countDecisions(decision)
  return NextResponse.json({ ok: true, recorded, total })
}

export async function DELETE() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can review process names' }, { status: 403 })
  }

  const cleared = await clearDecisions()
  return NextResponse.json({ ok: true, cleared, total: 0 })
}
