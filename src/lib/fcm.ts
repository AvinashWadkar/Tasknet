import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'

/**
 * Native (Android APK) push delivery over Firebase Cloud Messaging HTTP v1.
 *
 * Web push cannot run inside an Android WebView, so the APK registers an FCM
 * token instead and this module sends to it. Web push stays the fallback for
 * anyone without the app installed.
 *
 * Configure with FIREBASE_SERVICE_ACCOUNT_JSON — either the raw service account
 * JSON, or that JSON base64-encoded (preferred, so it survives env editors).
 */

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string }

/** The service account JSON as Firebase Console downloads it uses snake_case keys. */
type RawServiceAccount = {
  projectId?: string
  clientEmail?: string
  privateKey?: string
  project_id?: string
  client_email?: string
  private_key?: string
}

let cached: Messaging | null = null
let attempted = false

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw.trim(), 'base64').toString('utf8')
    const parsed = JSON.parse(json) as RawServiceAccount
    // Accept both shapes: the downloaded file is snake_case, while the
    // firebase-admin docs use camelCase.
    const projectId = parsed.projectId ?? parsed.project_id
    const clientEmail = parsed.clientEmail ?? parsed.client_email
    const privateKey = parsed.privateKey ?? parsed.private_key
    if (!projectId || !clientEmail || !privateKey) return null
    return { projectId, clientEmail, privateKey }
  } catch {
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed')
    return null
  }
}

export type FcmConfigCheck = {
  configured: boolean
  /** Short, secret-free reason shown to admins. Never contains key material. */
  problem?: string
}

/**
 * Explain the Firebase configuration state in plain language so the admin panel
 * can say what to fix instead of only reporting "not configured".
 */
export function checkFcmConfig(): FcmConfigCheck {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    return {
      configured: false,
      problem: 'FIREBASE_SERVICE_ACCOUNT_JSON is not set on this server. Add it in Render and redeploy.',
    }
  }
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') && !/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    return {
      configured: false,
      problem: 'FIREBASE_SERVICE_ACCOUNT_JSON is neither raw JSON nor base64. Paste the service account JSON, or base64-encode it.',
    }
  }
  const sa = readServiceAccount()
  if (!sa) {
    return {
      configured: false,
      problem: 'FIREBASE_SERVICE_ACCOUNT_JSON could not be read as a service account. It must contain project_id, client_email and private_key (the file Firebase Console gives you).',
    }
  }
  const messagingClient = messaging()
  if (!messagingClient) {
    return {
      configured: false,
      problem: `Firebase rejected the credentials for project "${sa.projectId}". Check that the service account belongs to this project and the private key is complete.`,
    }
  }
  return { configured: true }
}

/** Whether the server runtime holds usable Firebase credentials. */
export function isFcmConfigured(): boolean {
  return checkFcmConfig().configured
}

function messaging(): Messaging | null {
  if (attempted) return cached
  attempted = true
  const sa = readServiceAccount()
  if (!sa) return null
  try {
    const app = getApps()[0] ?? initializeApp({ credential: cert(sa) })
    cached = getMessaging(app)
  } catch (e) {
    console.error('[fcm] failed to initialise Firebase Admin:', (e as Error)?.message)
    cached = null
  }
  return cached
}

export type FcmPayload = {
  title: string
  body: string
  taskId?: string | null
  tag?: string
}

export type FcmResult = {
  /** True when a send was actually attempted (credentials present). */
  attempted: boolean
  /** Tokens the push service accepted. */
  dispatched: number
  /** Tokens the push service rejected for a non-fatal reason. */
  failures: number
  /** Tokens FCM reported as permanently invalid — delete these rows. */
  invalidTokens: string[]
}

/**
 * Send one notification to many FCM tokens. Never throws: FCM is a best-effort
 * side-channel and must not break the task action that triggered it.
 */
export async function sendFcmToTokens(tokens: string[], payload: FcmPayload): Promise<FcmResult> {
  const result: FcmResult = { attempted: false, dispatched: 0, failures: 0, invalidTokens: [] }
  const unique = [...new Set(tokens.filter(Boolean))]
  if (unique.length === 0) return result

  const client = messaging()
  if (!client) return result
  result.attempted = true

  const data: Record<string, string> = {
    title: payload.title,
    body: payload.body,
    taskId: payload.taskId ?? '',
    tag: payload.tag || `tasknet-${Date.now()}`,
  }

  try {
    const res = await client.sendEachForMulticast({
      tokens: unique,
      notification: { title: payload.title, body: payload.body },
      // Data payload is what lets the APK deep-link straight to the task.
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'tasknet-default',
          tag: data.tag,
          clickAction: 'OPEN_TASK',
        },
      },
    })

    res.responses.forEach((r, i) => {
      if (r.success) {
        result.dispatched++
        return
      }
      const code = r.error?.code || ''
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument') ||
        code.includes('invalid-registration')
      ) {
        result.invalidTokens.push(unique[i])
      } else {
        result.failures++
        console.error('[fcm] send error', code, r.error?.message)
      }
    })
  } catch (e) {
    result.failures++
    console.error('[fcm] multicast failed:', (e as Error)?.message)
  }

  return result
}