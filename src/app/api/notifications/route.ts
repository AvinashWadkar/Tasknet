import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isPushConfigured } from '@/lib/webpush'
import type { NextRequest } from 'next/server'

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

  return NextResponse.json({ notifications: items, unread, pushConfigured: isPushConfigured() })
}

/** DELETE /api/notifications — clear notifications. Query: ?ids=id1,id2 (optional). No ids clears ALL. */
export async function DELETE(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let ids: string[] = []
  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  if (raw) ids = raw.split(',').filter(Boolean)

  const result = await db.notification.deleteMany({
    where: {
      userId: session.id,
      ...(ids.length ? { id: { in: ids } } : {}),
    },
  })

  const unread = await db.notification.count({ where: { userId: session.id, readAt: null } })
  return NextResponse.json({ ok: true, deleted: result.count, unread })
}