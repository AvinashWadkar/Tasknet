import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { publish } from '@/lib/realtime'
import { notifyAssignees } from '@/lib/notify'

/**
 * POST /api/tasks/[id]/comment — participants (creator or assignees) and the
 * admin add a comment that becomes part of the task history.
 * { text: string, mentionIds?: string[] }
 * Tagged employees (@mentions) get a notification + push that opens the task.
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
    if (!isParticipant && session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only task participants can comment' }, { status: 403 })
    }

    // Resolve tagged employees: explicit ids from the picker, plus any
    // @employeeCode tokens typed into the text. Only active users count.
    const mentionIds = Array.isArray(body.mentionIds)
      ? (body.mentionIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    const codeTokens = [...text.matchAll(/@([A-Za-z0-9_]+)/g)].map((m) => m[1])

    const tags = await db.user.findMany({
      where: {
        isActive: true,
        OR: [{ id: { in: mentionIds } }, { employeeCode: { in: codeTokens } }],
      },
      select: { id: true },
    })
    const recipientIds = tags.map((u) => u.id).filter((uid) => uid !== session.id)

    const activity = await db.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'COMMENT',
        detail: text,
      },
    })

    if (recipientIds.length > 0) {
      await notifyAssignees({
        taskId: task.id,
        recipientIds,
        excludeIds: [session.id],
        type: 'MENTION',
        title: `${session.name} tagged you in a comment`,
        message: `${session.name} mentioned you in "${task.title}": ${text.slice(0, 180)}`,
      })
    }

    publish({ type: 'task', taskId: task.id, action: 'comment' })
    return NextResponse.json({ ok: true, activity, mentioned: recipientIds.length })
  } catch (e) {
    console.error('comment error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
