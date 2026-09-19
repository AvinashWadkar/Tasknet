import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds } from '@/lib/hierarchy'

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
  activities: {
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, actorName: true, action: true, detail: true, createdAt: true },
  },
}

/**
 * GET /api/tasks/[id] — full detail incl. all assignees' statuses + complete history.
 * Visible to: creator, any assignee, or any manager whose downline includes
 * the creator or an assignee. Downline can never view upline's tasks.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: taskInclude })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const isParticipant = task.createdById === session.id || task.assignments.some((a) => a.userId === session.id)
  let canEdit = task.createdById === session.id
  let canAct = isParticipant

  if (!isParticipant) {
    const downline = await getDescendantIds(session.id)
    const teamVisible =
      downline.includes(task.createdById) || task.assignments.some((a) => downline.includes(a.userId))
    if (!teamVisible) {
      return NextResponse.json({ error: 'You do not have access to this task' }, { status: 403 })
    }
    // Manager viewing a downline task: read-only
    canEdit = false
    canAct = false
  }

  return NextResponse.json({ task, canEdit, canAct })
}

/**
 * PATCH /api/tasks/[id] — creator only: edit fields and/or add more assignees.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.createdById !== session.id) {
    return NextResponse.json({ error: 'Only the task creator can edit this task' }, { status: 403 })
  }
  if (task.status === 'ABORTED') {
    return NextResponse.json(
      { error: 'This task has been aborted and can no longer be edited' },
      { status: 400 }
    )
  }

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    const logs: { actorId: string; actorName: string; action: string; detail: string }[] = []
    const actor = `${session.name} (${session.employeeCode})`

    if (typeof body.title === 'string' && body.title.trim() && body.title.trim() !== task.title) {
      data.title = body.title.trim()
      logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: `Title changed to "${data.title}"` })
    }
    if (typeof body.description === 'string' && body.description.trim() !== (task.description || '')) {
      data.description = body.description.trim() || null
      logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: 'Description updated' })
    }
    if (body.dueDate) {
      const nd =
        typeof body.dueDate === 'object' && body.dueDate.date
          ? istDueDate(String(body.dueDate.date), body.dueDate.time)
          : new Date(body.dueDate)
      if (!isNaN(nd.getTime())) {
        data.dueDate = nd
        logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: 'Due date changed' })
      }
    }

    if (Array.isArray(body.addAssigneeIds) && body.addAssigneeIds.length > 0) {
      const existing = new Set(task.assignments.map((a) => a.userId))
      const toAdd = [...new Set(body.addAssigneeIds as string[])].filter((uid) => !existing.has(uid))
      if (toAdd.length > 0) {
        const users = await db.user.findMany({ where: { id: { in: toAdd }, isActive: true } })
        for (const u of users) {
          await db.taskAssignment.create({ data: { taskId: task.id, userId: u.id } })
        }
        if (users.length) {
          logs.push({
            actorId: session.id,
            actorName: actor,
            action: 'ASSIGNED',
            detail: `Assigned to ${users.map((u) => u.name).join(', ')}`,
          })
        }
      }
    }

    await db.task.update({ where: { id: task.id }, data })
    if (logs.length) {
      await db.taskActivity.createMany({ data: logs.map((l) => ({ ...l, taskId: task.id })) })
    }

    const updated = await db.task.findUnique({ where: { id: task.id }, include: taskInclude })
    return NextResponse.json({ task: updated })
  } catch (e) {
    console.error('update task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
