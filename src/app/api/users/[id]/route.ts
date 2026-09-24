import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * PATCH /api/users/[id] — ADMIN only. Update an employee's profile fields.
 * Body may include: employeeCode, name, email, process, designation,
 * managerName, managerEmail, role. Uniqueness is enforced excluding the record
 * itself; the L1 manager link is re-resolved from managerEmail.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can edit users' }, { status: 403 })
  }

  const { id } = await params
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const str = (v: unknown) => (typeof v === 'string' ? String(v).trim() : undefined)
  const data: Record<string, unknown> = {}

  const employeeCode = str(body.employeeCode)
  const name = str(body.name)
  const email = str(body.email)?.toLowerCase()
  const process = str(body.process)
  const designation = str(body.designation)
  const managerName = str(body.managerName)
  const managerEmail = str(body.managerEmail)?.toLowerCase()
  let role: string | undefined

  if (typeof body.role === 'string') {
    role = String(body.role).toUpperCase()
    if (role !== 'ADMIN' && role !== 'EMPLOYEE') {
      return NextResponse.json({ error: 'Role must be ADMIN or EMPLOYEE' }, { status: 400 })
    }
    if (id === session.id && role !== 'ADMIN') {
      return NextResponse.json({ error: 'You cannot remove your own ADMIN role' }, { status: 400 })
    }
  }

  if (employeeCode !== undefined) {
    if (!employeeCode) return NextResponse.json({ error: 'Employee Code is required' }, { status: 400 })
    if (employeeCode !== user.employeeCode) {
      const dupe = await db.user.findFirst({ where: { employeeCode } })
      if (dupe) return NextResponse.json({ error: `Employee Code "${employeeCode}" already exists` }, { status: 409 })
    }
    data.employeeCode = employeeCode
  }
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    data.name = name
  }
  if (email !== undefined) {
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid Email ID' }, { status: 400 })
    if (email !== user.email) {
      const dupe = await db.user.findFirst({ where: { email } })
      if (dupe) return NextResponse.json({ error: `Email "${email}" is already registered` }, { status: 409 })
    }
    data.email = email
  }
  if (process !== undefined) {
    if (!process) return NextResponse.json({ error: 'Process is required' }, { status: 400 })
    data.process = process
  }
  if (designation !== undefined) {
    if (!designation) return NextResponse.json({ error: 'Designation is required' }, { status: 400 })
    data.designation = designation
  }
  if (managerName !== undefined) data.managerName = managerName || null
  if (role !== undefined) data.role = role

  let relinkManager = false
  if (managerEmail !== undefined) {
    if (!managerEmail) {
      data.managerEmail = null
      data.managerId = null
    } else {
      if (managerEmail === (email ?? user.email)) {
        return NextResponse.json({ error: 'A user cannot be their own manager' }, { status: 400 })
      }
      data.managerEmail = managerEmail
      const mgr = await db.user.findFirst({ where: { email: managerEmail } })
      data.managerId = mgr ? mgr.id : null
      relinkManager = Boolean(mgr)
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await db.user.update({ where: { id }, data })

  // Retroactive link: existing users that named this user as their L1 manager
  const finalEmail = updated.email
  if (relinkManager) {
    await db.user.updateMany({
      where: { managerEmail: finalEmail, id: { not: id }, managerId: null },
      data: { managerId: id },
    })
  }

  return NextResponse.json({
    user: {
      id: updated.id,
      employeeCode: updated.employeeCode,
      name: updated.name,
      email: updated.email,
      process: updated.process,
      designation: updated.designation,
      role: updated.role,
      managerName: updated.managerName,
      managerEmail: updated.managerEmail,
    },
  })
}

/**
 * DELETE /api/users/[id] — ADMIN only. Soft-deletes a user (isActive = false):
 * they can no longer log in and disappear from directory features, while task
 * history stays intact. The admin cannot delete their own account.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can delete users' }, { status: 403 })
  }

  const { id } = await params
  if (id === session.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id } })
  if (!user || !user.isActive) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.user.update({
    where: { id },
    data: {
      isActive: false,
      managerId: null,
      managerEmail: null,
      managerName: null,
    },
  })

  return NextResponse.json({ ok: true })
}