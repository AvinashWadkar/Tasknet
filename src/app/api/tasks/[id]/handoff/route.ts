import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { fmtDate } from '@/lib/dates'
import { taskInclude } from '@/lib/task-include'

/**
 * POST /api/tasks/[id]/handoff — an assignee hands off THEIR part of a task to
 * another employee for further completion.
 * Body: { toUserId: string, note?: string }  (note ≤ 300 chars, recorded in history)
 *
 * Effect: the current user's assignment is transferred — their row is removed and a
 * new PENDING assignment is created for the target user. Other assignees and the task
 * itself are untouched. The full history records who handed off to whom (and why).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  if (task.status === 'ABORTED') {
    return NextResponse.json({ error: 'This task has been aborted — handoff is closed' }, { status: 400 })
  }

  const myAssignment = task.assignments.find((a) => a.userId === session.id)
  if (!myAssignment) {
    return NextResponse.json(
      { error: 'Only an assignee of this task can hand off their part' },
      { status: 403 }
    )
  }
  if (myAssignment.status === 'COMPLETED') {
    return NextResponse.json(
      { error: 'You have already completed your part — nothing left to hand off' },
      { status: 400 }
    )
  }

  let toUserId = ''
  let note: string | null = null
  try {
    const body = await req.json()
    toUserId = String(body?.toUserId || '')
    note = String(body?.note || '').trim().slice(0, 300) || null
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!toUserId) {
    return NextResponse.json({ error: 'Please choose a colleague to hand off to' }, { status: 400 })
  }
  if (toUserId === session.id) {
    return NextResponse.json({ error: 'You cannot hand off to yourself' }, { status: 400 })
  }
  if (task.assignments.some((a) => a.userId === toUserId)) {
    return NextResponse.json(
      { error: 'That colleague is already working on this task' },
      { status: 400 }
    )
  }

  const target = await db.user.findUnique({ where: { id: toUserId } })
  if (!target || !target.isActive) {
    return NextResponse.json({ error: 'Selected colleague not found' }, { status: 404 })
  }

  try {
    await db.$transaction([
      // Transfer: my part moves to the target as a fresh PENDING assignment
      db.taskAssignment.delete({ where: { id: myAssignment.id } }),
      db.taskAssignment.create({
        data: { taskId: task.id, userId: toUserId, status: 'PENDING' },
      }),
      db.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: session.id,
          actorName: `${session.name} (${session.employeeCode})`,
          action: 'TASK_HANDOFF',
          detail: `Handed off their part to ${target.name} (${target.employeeCode}) for further completion${note ? ` — "${note}"` : ''}`,
        },
      }),
      db.notification.create({
        data: {
          userId: toUserId,
          taskId: task.id,
          type: 'TASK_HANDED',
          title: 'A task was handed to you',
          message: `${session.name} handed you "${task.title}" (due ${fmtDate(task.dueDate)}).${note ? ` Note: "${note}"` : ''}`,
        },
      }),
    ])
  } catch (e) {
    console.error('handoff task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  const updated = await db.task.findUnique({
    where: { id: task.id },
    include: taskInclude,
  })
  return NextResponse.json({ ok: true, task: updated, handedTo: { id: target.id, name: target.name } })
}
