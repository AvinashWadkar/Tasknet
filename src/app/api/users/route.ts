import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const DEFAULT_PASSWORD = 'Digitide@123'

/** GET /api/users — directory list for task assignment (any signed-in user). Admin gets extended fields. */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const users = await db.user.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      process: true,
      designation: true,
      role: true,
      managerName: true,
      managerEmail: true,
      isFirstLogin: true,
      createdAt: true,
      passwordPlain: true, // ADMIN-only; stripped below for non-admins
    },
  })

  if (session.role !== 'ADMIN') {
    // Non-admins only need directory basics to assign tasks — never passwords
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        employeeCode: u.employeeCode,
        name: u.name,
        email: u.email,
        process: u.process,
        designation: u.designation,
      })),
    })
  }
  // Admin sees every user's current password (plaintext mirror)
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      password: u.passwordPlain ?? null,
      passwordPlain: undefined,
    })),
  })
}

/** POST /api/users — ADMIN only: create a new employee ID. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can create user IDs' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const employeeCode = String(body.employeeCode || '').trim()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const process = String(body.process || '').trim()
    const designation = String(body.designation || '').trim()
    const managerName = String(body.managerName || '').trim()
    const managerEmail = String(body.managerEmail || '').trim().toLowerCase()

    if (!employeeCode || !name || !email || !process || !designation) {
      return NextResponse.json(
        { error: 'Employee Code, Name, Email, Process and Designation are required' },
        { status: 400 }
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid Email ID' }, { status: 400 })
    }

    const dupeCode = await db.user.findFirst({ where: { employeeCode } })
    if (dupeCode) {
      return NextResponse.json({ error: `Employee Code "${employeeCode}" already exists` }, { status: 409 })
    }
    const dupeEmail = await db.user.findFirst({ where: { email } })
    if (dupeEmail) {
      return NextResponse.json({ error: `Email "${email}" is already registered` }, { status: 409 })
    }

    // Auto-link L1 manager by email (manager must already be a created user)
    let managerId: string | null = null
    if (managerEmail) {
      if (managerEmail === email) {
        return NextResponse.json({ error: 'A user cannot be their own manager' }, { status: 400 })
      }
      const mgr = await db.user.findFirst({ where: { email: managerEmail } })
      if (mgr) managerId = mgr.id
    }

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    const user = await db.user.create({
      data: {
        employeeCode,
        name,
        email,
        process,
        designation,
        managerName: managerName || null,
        managerEmail: managerEmail || null,
        managerId,
        password: hash,
        passwordPlain: DEFAULT_PASSWORD,
        isFirstLogin: true,
        role: 'EMPLOYEE',
      },
    })

    // Retroactive link: existing users that named this new user as their L1 manager
    if (managerEmail) {
      await db.user.updateMany({
        where: { managerEmail: email, id: { not: user.id }, managerId: null },
        data: { managerId: user.id },
      })
    }

    return NextResponse.json({
      user: { id: user.id, employeeCode: user.employeeCode, name: user.name, email: user.email },
      managerLinked: Boolean(managerId),
      defaultPassword: DEFAULT_PASSWORD,
    })
  } catch (e) {
    console.error('create user error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
