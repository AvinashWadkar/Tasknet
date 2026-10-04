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

/**
 * Turn the env var into a list of strings that might be the service account
 * JSON. Env values get mangled in predictable ways (a pasted variable name,
 * wrapping quotes, a BOM, URL-safe base64, stray spaces), and none of those
 * should stop delivery, so every plausible shape is tried.
 *
 * Every reading is *added* rather than substituted, because the heuristics are
 * ambiguous: base64 padding means a plain base64 blob ends in "=", which also
 * looks like a "NAME=value" line. Nothing that arrives is ever discarded.
 */
function candidatePayloads(raw: string): string[] {
  const out: string[] = []
  const add = (s: string | undefined | null) => {
    const t = (s ?? '').trim().replace(/^\uFEFF/, '')
    if (t && !out.includes(t)) out.push(t)
  }

  const start = raw.trim().replace(/^\uFEFF/, '')
  add(start)

  // Quotes added by the shell or the dashboard.
  if (start.length > 1 && ((start.startsWith('"') && start.endsWith('"')) || (start.startsWith("'") && start.endsWith("'")))) {
    add(start.slice(1, -1))
  }
  // A whole "NAME=value" line pasted into the value box.
  const named = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]+)$/.exec(start)
  if (named) add(named[2])

  // Finally, treat each of those as base64: standard or URL-safe, on one line
  // or wrapped, since some dashboards insert line breaks.
  for (const text of [...out]) {
    const compact = text.replace(/\s+/g, '')
    if (compact.length <= 16 || !/^[A-Za-z0-9+/\-_]+={0,2}$/.test(compact)) continue
    const standard = compact.replace(/-/g, '+').replace(/_/g, '/')
    const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
    try {
      add(Buffer.from(padded, 'base64').toString('utf8'))
    } catch {
      /* not base64 after all */
    }
  }
  return out
}

function parseServiceAccount(json: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(json) as RawServiceAccount
    // Accept both shapes: the downloaded file is snake_case, while the
    // firebase-admin docs use camelCase.
    const projectId = parsed.projectId ?? parsed.project_id
    const clientEmail = parsed.clientEmail ?? parsed.client_email
    const privateKey = parsed.privateKey ?? parsed.private_key
    if (!projectId || !clientEmail || !privateKey) return null
    return { projectId, clientEmail, privateKey }
  } catch {
    return null
  }
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  for (const payload of candidatePayloads(raw)) {
    const sa = parseServiceAccount(payload)
    if (sa) return sa
  }
  console.error('[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be read as a service account')
  return null
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
  const sa = readServiceAccount()
  if (!sa) {
    // The most common mistake: pasting where the file is, not what is in it.
    if (!trimmed.includes('{') && /[\\/]|\.json$/i.test(trimmed)) {
      return {
        configured: false,
        problem:
          'FIREBASE_SERVICE_ACCOUNT_JSON looks like a file path, but the server needs the file contents. Paste the JSON itself, or base64-encode the file.',
      }
    }
    if (trimmed.includes('{')) {
      return {
        configured: false,
        problem:
          'FIREBASE_SERVICE_ACCOUNT_JSON starts like JSON but could not be read. It must be one complete object containing project_id, client_email and private_key — check for a truncated paste.',
      }
    }
    return {
      configured: false,
      problem:
        'FIREBASE_SERVICE_ACCOUNT_JSON is not readable as JSON or base64. Paste the downloaded service account JSON as-is, or base64-encode the file and paste that.',
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