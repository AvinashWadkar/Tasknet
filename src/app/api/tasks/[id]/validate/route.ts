import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { maybeSpawnNextOccurrence } from '@/lib/recurring-server'
import { taskInclude } from '@/lib/task-include'
import { publish } from '@/lib/realtime'
import { notifyAssignees } from '@/lib/notify'

/**
 * POST /api/tasks/[id]/validate — an assignee sends their own completed part to
 * the task's validator/collator. This is the ONLY way an assignee can complete a
 * task that has a validator (status updates to COMPLETED are blocked otherwise).
 * Body: { note?: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await req.json().catch(() => ({}))
    const note = String(body?.note || '').trim().slice(0, 500) || null

    const task = await db.task.findUnique({
      where: { id },
      include: { assignments: true, validator: { select: { id: true, name: true } } },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (task.status === 'ABORTED') {
      return NextResponse.json({ error: 'This task was aborted — it can no longer be sent for validation' }, { status: 400 })
    }
    if (!task.validatorId || !task.validator) {
      return NextResponse.json({ error: 'This task has no validator set' }, { status: 400 })
    }

    const assignment = task.assignments.find((a) => a.userId === session.id)
    if (!assignment) {
      return NextResponse.json({ error: 'You are not assigned to this task' }, { status: 400 })
    }
    if (assignment.status === 'COMPLETED' && assignment.validationStatus === 'PENDING') {
      return NextResponse.json({ error: 'This part has already been sent for validation' }, { status: 400 })
    }

    await db.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        note,
        validationStatus: 'PENDING',
        sentForValidationAt: new Date(),
        validatedAt: null,
      },
    })

    const detail = `Sent to ${task.validator.name} for validation${note ? ` — "${note}"` : ''}`
    await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'VALIDATION_SENT',
        detail,
      },
    })

    try {
      await maybeSpawnNextOccurrence(task.id)
    } catch (recErr) {
      console.error('recurrence spawn error', recErr)
    }

    const updated = await db.task.findUnique({ where: { id: task.id }, include: taskInclude })

    await notifyAssignees({
      taskId: task.id,
      recipientIds: [task.validatorId],
      excludeIds: [session.id],
      type: 'TASK_VALIDATION',
      title: 'A task was sent to you for validation',
      message: `${session.name} sent "${task.title}" to you for validation.`,
    })

    publish({ type: 'task', taskId: task.id, action: 'validation-sent' })
    return NextResponse.json({ ok: true, task: updated })
  } catch (e) {
    console.error('validate send error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
