import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { replaceManagerMappings, resolveManagersByEmail } from '@/lib/hierarchy'
import { ensureProcessExists } from '@/lib/processes'
import { resolvePermissions } from '@/lib/permissions'
import { publish } from '@/lib/realtime'
import { syncUserDetails, UserInputError } from '@/lib/user-sync'

const DEFAULT_PASSWORD = 'Digitide@123'

/** GET /api/users — directory list for task assignment (any signed-in user). Admin gets extended fields. */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const canManage = session.permissions.manageUsers
  const includeInactive = canManage && new URL(req.url).searchParams.get('includeInactive') === '1'

  const [users, mappings, appDevices] = await Promise.all([
    db.user.findMany({
      where: includeInactive ? {} : { isActive: true },
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
        isActive: true,
        createdAt: true,
        permissions: true, // admin-granted right overrides (resolved below)
        passwordPlain: true, // ADMIN-only; stripped below for non-admins
      },
    }),
    db.managerMapping.findMany({
      where: includeInactive
        ? { manager: { isActive: true } }
        : { employee: { isActive: true }, manager: { isActive: true } },
      select: {
        employeeId: true,
        manager: { select: { id: true, name: true, email: true, employeeCode: true } },
      },
    }),
    // All active Android installs (for the admin indicator). Ordered newest-first so
    // the reported app version is the most recent one any of their devices reported.
    canManage
      ? db.pushDevice.findMany({
          where: { active: true },
          select: { userId: true, appVersion: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([] as { userId: string; appVersion: string | null }[]),
  ])

  if (!canManage) {
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

  // Newest-first, so the first version seen per user is their most recent known one.
  const appVersionByUser = new Map<string, string | null>()
  for (const d of appDevices) {
    if (!appVersionByUser.has(d.userId) && d.appVersion) {
      appVersionByUser.set(d.userId, d.appVersion)
    }
  }
  const appUserIds = new Set(appDevices.map((d) => d.userId))
  const managerIds = new Set(mappings.map((m) => m.manager.id))

  // Admin sees every user's current password (plaintext mirror)
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      managers: managersByEmployee.get(u.id) || [],
      isManager: managerIds.has(u.id),
      permissions: resolvePermissions(u.role, managerIds.has(u.id), u.permissions),
      password: u.passwordPlain ?? null,
      passwordPlain: undefined,
      hasApp: appUserIds.has(u.id),
      appVersion: appVersionByUser.get(u.id) ?? null,
    })),
  })
}

/** POST /api/users — manage-users right: create a new employee ID. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!session.permissions.manageUsers) {
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
      try {
        const { user: updated, changes } = await syncUserDetails(
          dupeCode,
          { employeeCode, name, email, process, designation, managerEmails, reactivate: true },
          { actorId: session.id }
        )
        publish({ type: 'users', userId: updated.id })
        return NextResponse.json({
          user: { id: updated.id, employeeCode: updated.employeeCode, name: updated.name, email: updated.email },
          changes,
          updated: true,
          managerLinked: managerEmails.length > 0,
          defaultPassword: DEFAULT_PASSWORD,
        })
      } catch (err) {
        if (err instanceof UserInputError) {
          return NextResponse.json({ error: err.message }, { status: err.status })
        }
        throw err
      }
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
