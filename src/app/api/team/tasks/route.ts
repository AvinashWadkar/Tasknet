import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds, getDirectReporteeIds, getManagedEmployeeIds } from '@/lib/hierarchy'

const taskInclude = {
  creator: { select: { id: true, name: true, employeeCode: true, designation: true } },
  assignments: {
    select: {
      id: true,
      userId: true,
      status: true,
      completedAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, employeeCode: true, designation: true, process: true } },
    },
  },
}

/**
 * GET /api/team/tasks — tasks the viewer sees through their TEAM:
 * - manager: creator or any assignee is in the viewer's downline
 * - admin:   creator or any assignee is a non-admin employee (org scope)
 * Tasks the viewer personally created or is assigned to are EXCLUDED —
 * they already appear in the viewer's own "My Tasks" list, so the home
 * page shows each task in exactly one list.
 * The "for today" window (due today + still-open overdue) is applied
 * client-side, mirroring the My Tasks roll-forward behaviour.
 */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let visibleIds: string[]
  if (session.role === 'ADMIN') {
    // Admin: whole non-admin org — or, under DIRECT scope, only top-level
    // (employees with no manager edge anywhere)
    const managed = await getManagedEmployeeIds()
    const users = await db.user.findMany({
      where:
        session.teamScope === 'DIRECT'
          ? { isActive: true, role: { not: 'ADMIN' } }
          : { isActive: true, role: { not: 'ADMIN' } },
      select: { id: true },
    })
    visibleIds = users
      .map((u) => u.id)
      .filter((id) => session.teamScope !== 'DIRECT' || !managed.has(id))
  } else {
    visibleIds =
      session.teamScope === 'DIRECT'
        ? await getDirectReporteeIds(session.id)
        : await getDescendantIds(session.id)
  }

  // Plain employee (no downline): no team view
  if (visibleIds.length === 0) return NextResponse.json({ tasks: [] })

  const tasks = await db.task.findMany({
    where: {
      AND: [
        {
          OR: [
            { createdById: { in: visibleIds } },
            { assignments: { some: { userId: { in: visibleIds } } } },
          ],
        },
        // exclude tasks I'm personally part of (already in My Tasks)
        {
          NOT: {
            OR: [{ createdById: session.id }, { assignments: { some: { userId: session.id } } }],
          },
        },
      ],
    },
    include: taskInclude,
    orderBy: { dueDate: 'asc' },
    take: 500,
  })

  return NextResponse.json({ tasks })
}
