import webpush from 'web-push'
import { db } from '@/lib/db'
import { isFcmConfigured, sendFcmToTokens } from '@/lib/fcm'

const PUBLIC = process.env.VAPID_PUBLIC_KEY || ''
const PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@digitide.com'

let configured = false

function ensureConfig(): boolean {
  if (!PRIVATE || !PUBLIC) return false
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE)
    configured = true
  }
  return true
}

/** Whether the server runtime has a usable VAPID keypair for web push. */
export function isPushConfigured(): boolean {
  return ensureConfig()
}

export type PushPayload = {
  title: string
  body: string
  taskId?: string | null
  tag?: string
}

/** Result of a best-effort push dispatch campaign. */
export type PushDispatch = {
/** VAPID keys were present, so browser pushes could be attempted. */
  configured: boolean
  /** Firebase credentials were present, so APK pushes could be attempted. */
  fcmConfigured: boolean
  /** Unique recipient users requested. */
  recipients: number
  /** Stored browser subscriptions actually targeted (users without the app). */
  subscriptions: number
  /** Stored APK/FCM tokens actually targeted (users with the app installed). */
  devices: number
  /** Pushes accepted by the push services (the max the server can confirm). */
  dispatched: number
  /** Rejected (stale subscription, bad token, VAPID mismatch, expired). */
  failures: number
  /** Dead subscriptions/tokens (404/410, invalid-registration) pruned as garbage. */
  pruned: number
}

/**
 * Deliver a native OS push notification to a set of users.
 *
 * Channel policy: an employee who has the Android app installed on any device gets
 * the notification through FCM only; everyone else gets browser web push. That keeps
 * it to one notification per person when they use the APK and the website together.
 *
 * Best-effort: never throws; dead subscriptions and invalid tokens are pruned.
 * Reports exactly what happened so callers can surface it to users.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<PushDispatch> {
  const unique = [...new Set(userIds)]
  const vapid = ensureConfig()
  const fcmReady = isFcmConfigured()

  const result: PushDispatch = {
    configured: vapid,
    fcmConfigured: fcmReady,
    recipients: unique.length,
    subscriptions: 0,
    devices: 0,
    dispatched: 0,
    failures: 0,
    pruned: 0,
  }
  if (unique.length === 0) return result

  // Channel policy: prefer the Android app. Anyone with a live FCM token gets the
  // notification through FCM only; everyone else falls back to browser web push.
  // That way an employee using both the APK and the website gets one notification.
  const deviceRows = fcmReady
    ? await db.pushDevice.findMany({ where: { userId: { in: unique }, active: true } })
    : []
  if (deviceRows.length > 0) {
    const sent = await sendFcmToTokens(
      deviceRows.map((d) => d.token),
      { title: payload.title, body: payload.body, taskId: payload.taskId, tag: payload.tag }
    )
    result.devices = deviceRows.length
    result.dispatched += sent.dispatched
    result.failures += sent.failures
    if (sent.invalidTokens.length > 0) {
      await db.pushDevice.deleteMany({ where: { token: { in: sent.invalidTokens } } })
      result.pruned += sent.invalidTokens.length
    }
  }

  const webUserIds = unique.filter((id) => !deviceRows.some((d) => d.userId === id))
  if (!vapid || webUserIds.length === 0) return result

  const subs = await db.pushSubscription.findMany({ where: { userId: { in: webUserIds } } })
  if (subs.length === 0) return result
  result.subscriptions = subs.length

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    taskId: payload.taskId ?? null,
    tag: payload.tag || `tasknet-${Date.now()}`,
  })

  let failures = 0
  const dead: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.keysAuth, p256dh: sub.keysP256dh } },
          data
        )
        result.dispatched++
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
        else {
          failures++
          console.error('webpush send error', status, (err as Error)?.message)
        }
      }
    })
  )

  result.failures += failures
  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } })
    result.pruned += dead.length
  }
  return result
}
