import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser, validatePassword } from '@/lib/auth'

const DEFAULT_PASSWORD = 'Digitide@123'

/**
 * POST /api/users/[id]/reset-password — ADMIN only.
 * Resets an employee's password. Body { password } is optional; when omitted the
 * default 'Digitide@123' is used and the mandatory first-login flow is re-triggered.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can reset passwords' }, { status: 403 })
  }

  const { id } = await params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    const body = await req.json().catch(() => ({}))
    const requested = String(body?.password || '').trim()
    const newPassword = requested || DEFAULT_PASSWORD

    if (requested) {
      const policyError = validatePassword(newPassword)
      if (policyError) return NextResponse.json({ error: policyError }, { status: 400 })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await db.user.update({
      where: { id },
      data: {
        password: hash,
        passwordPlain: newPassword,
        isFirstLogin: true, // force mandatory password setup at next login
      },
    })

    return NextResponse.json({ ok: true, password: newPassword, forcedChange: true })
  } catch (e) {
    console.error('reset-password error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
