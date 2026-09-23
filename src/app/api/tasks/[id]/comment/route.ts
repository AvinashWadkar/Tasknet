import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/**
 * POST /api/tasks/[id]/comment — participants (creator or assignees) add a comment
 * that becomes part of the task history.
 * { text: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  try {
    const body = await req.json()
    const text = String(body.text || '').trim()
    if (!text) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 })

    const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const isParticipant = task.createdById === session.id || task.assignments.some((a) => a.userId === session.id)
    if (!isParticipant) {
      return NextResponse.json({ error: 'Only task participants can comment' }, { status: 403 })
    }

    const activity = await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'COMMENT',
        detail: text,
      },
    })

    return NextResponse.json({ ok: true, activity })
  } catch (e) {
    console.error('comment error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
