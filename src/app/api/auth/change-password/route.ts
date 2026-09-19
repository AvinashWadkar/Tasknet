import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser, validatePassword } from '@/lib/auth'

/**
 * Mandatory first-login (or voluntary) password change for the signed-in user.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  try {
    const { currentPassword, newPassword } = await req.json()

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Verify current password (mandatory security check)
    const ok = await bcrypt.compare(String(currentPassword || ''), user.password)
    if (!ok) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const policyError = validatePassword(String(newPassword || ''))
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 })
    }
    if (await bcrypt.compare(String(newPassword), user.password)) {
      return NextResponse.json(
        { error: 'New password must be different from the current one' },
        { status: 400 }
      )
    }

    const hash = await bcrypt.hash(String(newPassword), 10)
    await db.user.update({
      where: { id: user.id },
      data: { password: hash, passwordPlain: String(newPassword), isFirstLogin: false },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('change-password error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
