import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { maybeSpawnNextOccurrence } from '@/lib/recurring-server'

const VALID = ['PENDING', 'IN_PROGRESS', 'COMPLETED']

/**
 * POST /api/tasks/[id]/status — an assignee updates their own status.
 * { status: 'PENDING'|'IN_PROGRESS'|'COMPLETED', note?: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await req.json()
    const status = String(body.status || '')
    const note = String(body.note || '').trim() || null
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (task.status === 'ABORTED') {
      return NextResponse.json(
        { error: 'This task was aborted by the creator — status updates are closed' },
        { status: 400 }
      )
    }

    const assignment = task.assignments.find((a) => a.userId === session.id)
    if (!assignment) {
      return NextResponse.json({ error: 'You are not assigned to this task' }, { status: 403 })
    }

    const previous = assignment.status
    await db.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        status,
        note,
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
    })

    const actor = `${session.name} (${session.employeeCode})`
    const label: Record<string, string> = {
      PENDING: 'Pending',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
    }
    const action = previous === 'COMPLETED' && status !== 'COMPLETED' ? 'REOPENED' : 'STATUS_UPDATED'
    let detail =
      previous === 'COMPLETED' && status !== 'COMPLETED'
        ? `Reopened the task (moved from Completed to ${label[status]})`
        : `Marked their status as ${label[status]}`
    if (note) detail += ` — "${note}"`

    await db.taskActivity.create({
      data: { taskId: task.id, actorId: session.id, actorName: actor, action, detail },
    })

    // Recurring series: when the whole task is now complete, auto-create the
    // next occurrence (no-op for non-recurring tasks; guarded & idempotent)
    if (status === 'COMPLETED') {
      try {
        await maybeSpawnNextOccurrence(task.id)
      } catch (recErr) {
        console.error('recurrence spawn error', recErr)
      }
    }

    const updated = await db.task.findUnique({
      where: { id: task.id },
      include: {
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
      },
    })
    return NextResponse.json({ ok: true, task: updated })
  } catch (e) {
    console.error('status update error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
