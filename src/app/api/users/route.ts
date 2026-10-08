import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { replaceManagerMappings, resolveManagersByEmail } from '@/lib/hierarchy'
import { ensureProcessExists } from '@/lib/processes'
import { publish } from '@/lib/realtime'

const DEFAULT_PASSWORD = 'Digitide@123'

/** GET /api/users — directory list for task assignment (any signed-in user). Admin gets extended fields. */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [users, mappings] = await Promise.all([
    db.user.findMany({
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
    }),
    db.managerMapping.findMany({
      where: { employee: { isActive: true }, manager: { isActive: true } },
      select: {
        employeeId: true,
        manager: { select: { id: true, name: true, email: true, employeeCode: true } },
      },
    }),
  ])

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

  const managersByEmployee = new Map<string, { id: string; name: string; email: string; employeeCode: string }[]>()
  for (const m of mappings) {
    const arr = managersByEmployee.get(m.employeeId) || []
    arr.push({
      id: m.manager.id,
      name: m.manager.name,
      email: m.manager.email,
      employeeCode: m.manager.employeeCode,
    })
    managersByEmployee.set(m.employeeId, arr)
  }

  // Admin sees every user's current password (plaintext mirror)
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      managers: managersByEmployee.get(u.id) || [],
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
    // Canonicalise against the controlled Process list so a new name entered
    // here (or via Excel bulk import) is registered for future IDs.
    const process = await ensureProcessExists(body.process)
    const designation = String(body.designation || '').trim()
    const managerName = String(body.managerName || '').trim()
    const managerEmail = String(body.managerEmail || '').trim().toLowerCase()
    const managerEmails = Array.isArray(body.managerEmails)
      ? (body.managerEmails as unknown[]).map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
      : managerEmail
      ? [managerEmail]
      : []

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

    // Resolve managers by email (an employee can report to several, all equal).
    const managers = await resolveManagersByEmail(managerEmails)
    if (managers.some((m) => m.email === email)) {
      return NextResponse.json({ error: 'A user cannot be their own manager' }, { status: 400 })
    }
    if (managerEmails.length && managers.length !== managerEmails.length) {
      const missing = managerEmails
        .filter((e) => !managers.some((m) => m.email === e))
        .join(', ')
      return NextResponse.json(
        { error: `Manager email${missing.includes(',') ? 's' : ''} not found: ${missing}` },
        { status: 400 }
      )
    }
    const managerIds = managers.map((m) => m.id)
    const primary = managers[0] ?? null

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    const user = await db.user.create({
      data: {
        employeeCode,
        name,
        email,
        process,
        designation,
        managerName: primary ? primary.name : managerName || null,
        managerEmail: primary ? primary.email : managerEmail || null,
        managerId: primary ? primary.id : null,
        password: hash,
        passwordPlain: DEFAULT_PASSWORD,
        isFirstLogin: true,
        role: 'EMPLOYEE',
      },
    })

    // Persist the full set of manager edges (single or multiple).
    await replaceManagerMappings(user.id, managerIds)

    // Retroactive link: existing users that named this new user as their (primary) manager.
    if (primary) {
      await db.user.updateMany({
        where: { managerEmail: email, id: { not: user.id }, managerId: null },
        data: { managerId: user.id },
      })
      const existingNamed = await db.user.findMany({
        where: { managerEmail: email, id: { not: user.id } },
        select: { id: true },
      })
      await db.managerMapping.createMany({
        data: existingNamed.map((e) => ({ employeeId: e.id, managerId: user.id })),
        skipDuplicates: true,
      })
    }

    publish({ type: 'users', userId: user.id })
    return NextResponse.json({
      user: { id: user.id, employeeCode: user.employeeCode, name: user.name, email: user.email },
      managerLinked: managerIds.length > 0,
      defaultPassword: DEFAULT_PASSWORD,
    })
  } catch (e) {
    console.error('create user error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
