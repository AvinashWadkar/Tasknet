import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST   /api/push/devices  { token, platform? } — register an FCM token (APK install)
 * DELETE /api/push/devices  { token }           — unregister (app uninstalled / logged out)
 *
 * WebView has no Web Push API, so the Android app registers its Firebase token here
 * and the server prefers it over browser web push for that user.
 */
export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { token?: unknown; platform?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 20) : 'android'

  // Tokens are unique per install, but the same user may re-register after a token
  // rotation — upsert on token so we never create duplicates or orphans.
  await db.pushDevice.upsert({
    where: { token },
    create: { token, userId: session.id, platform, active: true },
    update: { userId: session.id, platform, active: true },
  })

  const devices = await db.pushDevice.count({ where: { userId: session.id, active: true } })
  return NextResponse.json({ ok: true, registered: true, devices })
}

export async function DELETE(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let token = ''
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token.trim() : ''
  } catch {
    // Fall back to the query string, since DELETE bodies can be mangled by proxies.
    token = new URL(req.url).searchParams.get('token')?.trim() || ''
  }
  if (!token) token = new URL(req.url).searchParams.get('token')?.trim() || ''
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

  // Scoped to the caller so one employee can never unregister another's device.
  await db.pushDevice.deleteMany({ where: { token, userId: session.id } })

  const devices = await db.pushDevice.count({ where: { userId: session.id, active: true } })
  return NextResponse.json({ ok: true, devices })
}