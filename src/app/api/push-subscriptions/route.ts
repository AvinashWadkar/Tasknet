import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/push-subscriptions — upsert the caller's web-push subscription
 * { endpoint, keys: { auth, p256dh } }
 * DELETE /api/push-subscriptions — forget the subscription for { endpoint }
 */
async function readBody(req: NextRequest) {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await readBody(req)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : ''
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : ''
  if (!endpoint || !auth || !p256dh) {
    return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
  }

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.id, endpoint, keysAuth: auth, keysP256dh: p256dh },
    update: { userId: session.id, keysAuth: auth, keysP256dh: p256dh },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await readBody(req)
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (endpoint) {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.id } })
  }
  return NextResponse.json({ ok: true })
}