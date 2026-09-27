import webpush from 'web-push'
import { db } from '@/lib/db'

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
  /** VAPID keys were present, so pushes could be attempted. */
  configured: boolean
  /** Unique recipient users requested. */
  recipients: number
  /** Stored browser subscriptions found among the recipients. */
  subscriptions: number
  /** Pushes accepted by the push services (the max the server can confirm). */
  dispatched: number
  /** Pushes rejected (stale subscription, VAPID mismatch, expired…). */
  failures: number
  /** Dead (404/410) subscriptions that were pruned as garbage. */
  pruned: number
}

/**
 * Deliver a native OS push notification to a set of users via their browser
 * web-push subscriptions. Best-effort: never throws; dead subscriptions are
 * pruned. Reports exactly what happened so callers can surface it to users.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<PushDispatch> {
  const unique = [...new Set(userIds)]
  const configured = ensureConfig()
  if (!configured || unique.length === 0) {
    return { configured, recipients: unique.length, subscriptions: 0, dispatched: 0, failures: 0, pruned: 0 }
  }

  const subs = await db.pushSubscription.findMany({ where: { userId: { in: unique } } })
  if (subs.length === 0) {
    return { configured, recipients: unique.length, subscriptions: 0, dispatched: 0, failures: 0, pruned: 0 }
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    taskId: payload.taskId ?? null,
    tag: payload.tag || `tasknet-${Date.now()}`,
  })

  let dispatched = 0
  let failures = 0
  const dead: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.keysAuth, p256dh: sub.keysP256dh } },
          data
        )
        dispatched++
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

  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } })
  }
  return {
    configured,
    recipients: unique.length,
    subscriptions: subs.length,
    dispatched,
    failures,
    pruned: dead.length,
  }
}