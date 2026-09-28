import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isPushConfigured, sendPushToUsers } from '@/lib/webpush'

/**
 * POST /api/push/diagnose — send a test native push to the current user and
 * report exactly why it worked or didn't (for diagnosing "no push" setups).
 */
export async function POST() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can send push notifications' }, { status: 403 })
  }

  if (!isPushConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: 'vapid-not-configured',
      message: 'This server has no VAPID keys configured, so native web push is disabled.',
    })
  }

  const subs = await db.pushSubscription.findMany({ where: { userId: session.id } })
  if (subs.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no-subscription',
      message:
        'This browser has not registered for web push. Open the app, allow notifications, and try again.',
    })
  }

  const dispatch = await sendPushToUsers([session.id], {
    title: 'Test notification',
    body: 'Web push is working — you should see this as a browser popup.',
    tag: `test-${Date.now()}`,
  })

  if (dispatch.dispatched === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'send-failed',
      message:
        dispatch.failures > 0
          ? 'The push service rejected your subscription (stale registration or VAPID key mismatch). Reload the page so the app re-registers it, then try again.'
          : 'The push was attempted but no delivery could be confirmed. Reload the page and try again.',
    })
  }

  return NextResponse.json({ ok: true, sent: dispatch.dispatched })
}