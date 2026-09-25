import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/admin/notifications — admin sends a custom push/in-app notification.
 * Body: { title, message, userIds?: string[] }
 *  - userIds omitted            → every active user
 *  - userIds = string[] (>=1)   → the targeted users only
 *  - userIds = []               → 400
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  let title = ''
  let message = ''
  let userIds: string[] | undefined
  try {
    const body = await req.json()
    title = typeof body?.title === 'string' ? body.title.trim() : ''
    message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (body && typeof body.userIds !== 'undefined') {
      if (!Array.isArray(body.userIds)) throw new Error('userIds must be an array')
      userIds = body.userIds.filter((v: unknown) => typeof v === 'string')
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!title) return NextResponse.json({ error: 'Notification title is required' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Notification message is required' }, { status: 400 })

  let recipients: string[]
  if (!userIds) {
    const all = await db.user.findMany({ where: { isActive: true }, select: { id: true } })
    recipients = all.map((u) => u.id)
  } else if (userIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one user' }, { status: 400 })
  } else {
    recipients = [...new Set(userIds)]
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients available' }, { status: 400 })
  }

  const created = await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: 'ANNOUNCEMENT',
      title,
      message: message.slice(0, 400),
    })),
  })

  return NextResponse.json({ ok: true, sent: created.count })
}