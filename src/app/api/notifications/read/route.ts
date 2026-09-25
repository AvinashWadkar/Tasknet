import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/notifications/read — mark notifications as read.
 * Body: { ids?: string[] }. Empty/no ids marks ALL of the user's notifications read.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let ids: string[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body?.ids)) ids = body.ids.filter((v: unknown) => typeof v === 'string')
  } catch {
    // malformed body → treat as mark-all
  }

  await db.notification.updateMany({
    where: {
      userId: session.id,
      readAt: null,
      ...(ids.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  })

  const unread = await db.notification.count({ where: { userId: session.id, readAt: null } })
  return NextResponse.json({ ok: true, unread })
}