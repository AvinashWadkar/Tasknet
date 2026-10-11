import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { runDueReminders } from '@/lib/reminders'

/**
 * POST/GET /api/cron/reminders — dispatch any due-soon reminders now.
 *
 * The app ships an in-process scheduler (see src/instrumentation.ts), so this
 * endpoint is only needed if you prefer an external cron instead. Authorized by
 * either the `x-cron-secret` header matching CRON_SECRET, or an ADMIN session.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('x-cron-secret') === secret) return true
  const session = await getSessionUser()
  return session?.role === 'ADMIN'
}

async function handle(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const result = await runDueReminders()
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
}

export const POST = handle
export const GET = handle
