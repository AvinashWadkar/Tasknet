import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { publish } from '@/lib/realtime'
import { ensureProcessExists } from '@/lib/processes'
import { syncUserDetails, UserInputError, type UserDetailInput } from '@/lib/user-sync'

/**
 * PATCH /api/users/[id] — ADMIN only. Update an employee's profile fields, or
 * enable / disable their login with { isActive: boolean }. Body may include:
 * employeeCode, name, email, process, designation, role, managerEmails.
 * Uniqueness is enforced excluding the record itself; manager edges are
 * re-resolved from managerEmails. The response lists exactly what changed.
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

  if (typeof body.isActive === 'boolean') {
    if (id === session.id && !body.isActive) {
      return NextResponse.json({ error: 'You cannot disable your own login' }, { status: 400 })
    }
    const updated = await db.user.update({ where: { id }, data: { isActive: body.isActive } })
    publish({ type: 'users', userId: id })
    return NextResponse.json({
      user: {
        id: updated.id,
        employeeCode: updated.employeeCode,
        name: updated.name,
        email: updated.email,
        isActive: updated.isActive,
      },
      changes: [
        {
          field: 'Login',
          from: user.isActive ? 'Enabled' : 'Disabled',
          to: body.isActive ? 'Enabled' : 'Disabled',
        },
      ],
    })
  }

  const input: UserDetailInput = {}
  if ('employeeCode' in body) input.employeeCode = String(body.employeeCode ?? '')
  if ('name' in body) input.name = String(body.name ?? '')
  if ('email' in body) input.email = String(body.email ?? '')
  if ('process' in body) input.process = await ensureProcessExists(body.process)
  if ('designation' in body) input.designation = String(body.designation ?? '')
  if (typeof body.role === 'string') input.role = body.role
  if (Array.isArray(body.managerEmails)) {
    input.managerEmails = (body.managerEmails as unknown[])
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(Boolean)
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const { user: updated, changes } = await syncUserDetails(user, input, { actorId: session.id })
    publish({ type: 'users', userId: id })
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
      changes,
    })
  } catch (err) {
    if (err instanceof UserInputError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('update user error', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/**
 * DELETE /api/users/[id] — ADMIN only. Permanently removes an employee from the
 * database (not the same as disabling their login, which is PATCH { isActive }
 * and keeps the record). Before the row is erased we clear every reference that
 * would otherwise block or dangle: reports that pointed at them lose their
 * manager, the tasks they created are deleted (which cascades their assignments,
 * comments and notifications), their activity on other tasks keeps its history
 * with a null actor, and manager mappings are dropped. Assignments,
 * notifications, push subscriptions and devices cascade at the DB level. The
 * admin cannot delete their own account.
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
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.$transaction([
    db.user.updateMany({
      where: { managerId: id },
      data: { managerId: null, managerName: null, managerEmail: null },
    }),
    db.task.deleteMany({ where: { createdById: id } }),
    db.taskActivity.updateMany({ where: { actorId: id }, data: { actorId: null } }),
    db.managerMapping.deleteMany({ where: { OR: [{ employeeId: id }, { managerId: id }] } }),
    db.user.delete({ where: { id } }),
  ])

  publish({ type: 'users', userId: id })
  return NextResponse.json({ ok: true, removed: user.employeeCode })
}
