import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { employeeCode, password } = await req.json()
    if (!employeeCode || !password) {
      return NextResponse.json({ error: 'Employee Code and Password are required' }, { status: 400 })
    }
    const user = await db.user.findFirst({
      where: { employeeCode: { equals: String(employeeCode).trim() } },
    })
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid Employee Code or Password' }, { status: 401 })
    }
    const ok = await bcrypt.compare(String(password), user.password)
    if (!ok) {
      return NextResponse.json({ error: 'Invalid Employee Code or Password' }, { status: 401 })
    }
    // Lazy backfill: if the plaintext mirror is missing (legacy rows), populate it
    // from the just-verified password so admin password visibility stays accurate.
    if (!user.passwordPlain) {
      await db.user.update({ where: { id: user.id }, data: { passwordPlain: String(password) } })
    }
    await setSessionCookie(user.id)
    return NextResponse.json({
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        name: user.name,
        email: user.email,
        process: user.process,
        designation: user.designation,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
        managerName: user.managerName,
        managerEmail: user.managerEmail,
      },
    })
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
