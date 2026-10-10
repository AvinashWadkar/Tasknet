import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds } from '@/lib/hierarchy'
import { taskInclude } from '@/lib/task-include'
import { publish } from '@/lib/realtime'
import { notifyAssignees } from '@/lib/notify'

/**
 * POST /api/tasks/[id]/reopen — the creator or a hierarchy manager reopens the
 * completed part(s) of one or more employees, optionally leaving a comment.
 * Reopened parts move back to PENDING. Aborted tasks are locked.
 * Body: { userIds: string[], comment?: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'ABORTED') {
    return NextResponse.json({ error: 'This task was aborted and can no longer be reopened' }, { status: 400 })
  }

  // Creator, or a manager standing above the creator or an assignee.
  const isCreator = task.createdById === session.id
  let isManager = false
  if (!isCreator) {
    const downline = await getDescendantIds(session.id)
    isManager =
      downline.includes(task.createdById) || task.assignments.some((a) => downline.includes(a.userId))
  }
  if (!isCreator && !isManager) {
    return NextResponse.json(
      { error: 'Only the task creator or a manager of the assignees can reopen this task' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const comment = String(body?.comment || '').trim().slice(0, 1000)
    const requested = Array.isArray(body?.userIds) ? (body.userIds as unknown[]).map(String) : []

    // Only parts that are actually completed can be reopened.
    const completed = new Map(
      task.assignments.filter((a) => a.status === 'COMPLETED').map((a) => [a.userId, a])
    )
    const reopenIds = [...new Set(requested)].filter((uid) => completed.has(uid))
    if (reopenIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one completed employee to reopen' },
        { status: 400 }
      )
    }

    const reopenedNames = task.assignments
      .filter((a) => reopenIds.includes(a.userId))
      .map((a) => a.user.name)
    const actor = `${session.name} (${session.employeeCode})`

    const logs: { actorId: string; actorName: string; action: string; detail: string }[] = []
    if (comment) {
      logs.push({ actorId: session.id, actorName: actor, action: 'COMMENT', detail: comment })
    }
    logs.push({
      actorId: session.id,
      actorName: actor,
      action: 'REOPENED',
      detail: `Reopened the task for ${reopenedNames.join(', ')} (moved from Completed to Pending)`,
    })

    await db.$transaction([
      db.taskAssignment.updateMany({
        where: { taskId: task.id, userId: { in: reopenIds }, status: 'COMPLETED' },
        data: { status: 'PENDING', completedAt: null, note: null },
      }),
      db.taskActivity.createMany({ data: logs.map((l) => ({ ...l, taskId: task.id })) }),
    ])

    const updated = await db.task.findUnique({ where: { id: task.id }, include: taskInclude })

    await notifyAssignees({
      taskId: task.id,
      recipientIds: reopenIds,
      excludeIds: [session.id],
      title: 'A task was reopened for you',
      message: `${session.name} reopened "${task.title}" — please complete it again.`,
    })

    publish({ type: 'task', taskId: task.id, action: 'reopened' })
    return NextResponse.json({ ok: true, task: updated })
  } catch (e) {
    console.error('reopen task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
