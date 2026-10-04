import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { isPushConfigured, sendPushToUsers } from '@/lib/webpush'
import { isFcmConfigured } from '@/lib/fcm'

/**
 * POST /api/push/diagnose — send a test native push to the current user and
 * report exactly why it worked or didn't (for diagnosing "no push" setups).
 *
 * Covers both channels: browser web push and the Android app (FCM).
 */
export async function POST() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only admins can send push notifications' }, { status: 403 })
  }

  const web = isPushConfigured()
  const fcm = isFcmConfigured()
  if (!web && !fcm) {
    return NextResponse.json({
      ok: false,
      reason: 'vapid-not-configured',
      message: 'This server has no push credentials configured (VAPID keys for the web, Firebase for the app).',
    })
  }

  const subs = await db.pushSubscription.findMany({ where: { userId: session.id } })
  const devices = await db.pushDevice.findMany({ where: { userId: session.id, active: true } })
  if (subs.length === 0 && devices.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no-subscription',
      message:
        'This device is not registered for push. On the website: allow notifications and reload. On the Android app: sign in once after installing.',
      web: { registered: 0, configured: web },
      app: { registered: 0, configured: fcm },
    })
  }

  const dispatch = await sendPushToUsers([session.id], {
    title: 'Test notification',
    body: 'Push is working — you should see this as a system notification.',
    tag: `test-${Date.now()}`,
  })

  // Which channel was used: the app wins when this device has an FCM token.
  const detail = {
    channel: devices.length > 0 ? 'app' : 'web',
    web: { registered: subs.length, configured: web },
    app: { registered: devices.length, configured: fcm },
  }

  if (dispatch.dispatched === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'send-failed',
      message:
        dispatch.failures > 0
          ? 'The push service rejected this registration (stale registration or credential mismatch). Reopen the app so it re-registers, then try again.'
          : 'The push was attempted but no delivery could be confirmed. Reopen the app and try again.',
      ...detail,
    })
  }

  return NextResponse.json({ ok: true, sent: dispatch.dispatched, ...detail })
}