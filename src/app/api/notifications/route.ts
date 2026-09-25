import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** GET /api/notifications — the signed-in user's notifications (newest first). */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        taskId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { userId: session.id, readAt: null } }),
  ])

  return NextResponse.json({ notifications: items, unread })
}