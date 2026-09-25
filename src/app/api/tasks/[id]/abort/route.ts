import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { taskInclude } from '@/lib/task-include'

/**
 * POST /api/tasks/[id]/abort — the task creator aborts (cancels) their task.
 * Body: { reason?: string }  (optional, ≤ 500 chars, recorded in the task history)
 * Aborted tasks are locked: assignees can no longer update their status and the
 * creator can no longer edit the task or add assignees.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  if (task.createdById !== session.id) {
    return NextResponse.json({ error: 'Only the task creator can abort this task' }, { status: 403 })
  }
  if (task.status === 'ABORTED') {
    return NextResponse.json({ error: 'This task has already been aborted' }, { status: 400 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const reason = String(body?.reason || '').trim().slice(0, 500) || null

    await db.task.update({
      where: { id: task.id },
      data: { status: 'ABORTED', abortedAt: new Date(), abortReason: reason },
    })

    await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'TASK_ABORTED',
        detail: reason ? `Aborted the task — "${reason}"` : 'Aborted the task',
      },
    })

    const updated = await db.task.findUnique({
      where: { id: task.id },
      include: taskInclude,
    })
    return NextResponse.json({ ok: true, task: updated })
  } catch (e) {
    console.error('abort task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
