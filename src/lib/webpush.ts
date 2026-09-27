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

export type PushPayload = {
  title: string
  body: string
  taskId?: string | null
  tag?: string
}

/**
 * Deliver a native OS push notification to a set of users via their browser
 * web-push subscriptions. Best-effort: never throws; dead subscriptions are
 * pruned. Returns how many pushes were dispatched (0 if no VAPID config).
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  if (!ensureConfig()) return 0
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return 0

  const subs = await db.pushSubscription.findMany({ where: { userId: { in: unique } } })
  if (subs.length === 0) return 0

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    taskId: payload.taskId ?? null,
    tag: payload.tag || `tasknet-${Date.now()}`,
  })

  let sent = 0
  const dead: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.keysAuth, p256dh: sub.keysP256dh } },
          data
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) dead.push(sub.id)
        else console.error('webpush send error', status, (err as Error)?.message)
      }
    })
  )

  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } })
  }
  return sent
}