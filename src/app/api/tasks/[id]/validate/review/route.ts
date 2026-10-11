import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { taskInclude } from '@/lib/task-include'
import { publish } from '@/lib/realtime'
import { notifyAssignees } from '@/lib/notify'

/**
 * POST /api/tasks/[id]/validate/review — the task's validator approves or
 * reopens one employee's sent part.
 * Body: { userId: string, action: 'APPROVE'|'REOPEN', comment?: string }
 *  - APPROVE → the part is marked VALIDATED.
 *  - REOPEN  → the part moves back to PENDING (a comment is required).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({
    where: { id },
    include: { assignments: { include: { user: { select: { id: true, name: true } } } } },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'ABORTED') {
    return NextResponse.json({ error: 'This task was aborted — validation is closed' }, { status: 400 })
  }
  if (!task.validatorId || task.validatorId !== session.id) {
    return NextResponse.json({ error: 'Only the task validator can review sent work' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const userId = String(body?.userId || '')
    const action = String(body?.action || '').toUpperCase()
    const comment = String(body?.comment || '').trim().slice(0, 1000)
    if (action !== 'APPROVE' && action !== 'REOPEN') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const assignment = task.assignments.find((a) => a.userId === userId)
    if (!assignment) {
      return NextResponse.json({ error: 'That employee is not part of this task' }, { status: 400 })
    }

    const actor = `${session.name} (${session.employeeCode})`
    const logs: { actorId: string; actorName: string; action: string; detail: string }[] = []

    if (action === 'APPROVE') {
      if (assignment.validationStatus !== 'PENDING') {
        return NextResponse.json({ error: 'This part is not awaiting validation' }, { status: 400 })
      }
      await db.taskAssignment.update({
        where: { id: assignment.id },
        data: { validationStatus: 'VALIDATED', validatedAt: new Date() },
      })
      logs.push({
        actorId: session.id,
        actorName: actor,
        action: 'VALIDATED',
        detail: `Validated ${assignment.user.name}'s part`,
      })
    } else {
      if (assignment.status !== 'COMPLETED' && assignment.validationStatus !== 'PENDING') {
        return NextResponse.json({ error: 'This part is not awaiting validation' }, { status: 400 })
      }
      if (!comment) {
        return NextResponse.json({ error: 'Add a comment explaining what needs to be redone' }, { status: 400 })
      }
      await db.taskAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'PENDING',
          completedAt: null,
          note: null,
          validationStatus: 'NOT_REQUIRED',
          sentForValidationAt: null,
          validatedAt: null,
        },
      })
      logs.push({ actorId: session.id, actorName: actor, action: 'COMMENT', detail: comment })
      logs.push({
        actorId: session.id,
        actorName: actor,
        action: 'REOPENED',
        detail: `Validator reopened ${assignment.user.name}'s part (moved from Completed to Pending)`,
      })
    }

    await db.taskActivity.createMany({ data: logs.map((l) => ({ ...l, taskId: task.id })) })

    const updated = await db.task.findUnique({ where: { id: task.id }, include: taskInclude })

    await notifyAssignees({
      taskId: task.id,
      recipientIds: [userId],
      excludeIds: [session.id],
      type: 'TASK_VALIDATION',
      title: action === 'APPROVE' ? 'Your task part was validated' : 'Your task part was reopened',
      message:
        action === 'APPROVE'
          ? `${session.name} validated your part of "${task.title}".`
          : `${session.name} reopened your part of "${task.title}" — please redo it.${comment ? ` Note: "${comment}"` : ''}`,
    })

    publish({ type: 'task', taskId: task.id, action: action === 'APPROVE' ? 'validated' : 'validation-reopened' })
    return NextResponse.json({ ok: true, task: updated })
  } catch (e) {
    console.error('validate review error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
