import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds } from '@/lib/hierarchy'
import { notifyAssignees } from '@/lib/notify'

/** Ignore a repeat buzz to the same person within this window (anti-spam). */
const BUZZ_COOLDOWN_MS = 10_000

/**
 * POST /api/tasks/[id]/buzz — nudge one assignee.
 * { userId }
 *
 * Only the task creator, the collation validator, a manager of anyone on the
 * task, or the admin may buzz. The target must be an assignee (and not the
 * person doing the buzzing). The recipient gets a bell notification plus an
 * OS push with a long, high-vibration pattern.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (task.status === 'ABORTED') {
    return NextResponse.json({ error: 'This task was aborted.' }, { status: 400 })
  }

  const isAdmin = session.role === 'ADMIN'
  const isCreator = task.createdById === session.id
  const isValidator = task.validatorId === session.id
  let allowed = isAdmin || isCreator || isValidator
  if (!allowed) {
    // A manager (anyone whose downline includes the creator or an assignee).
    const downline = await getDescendantIds(session.id)
    allowed = downline.includes(task.createdById) || task.assignments.some((a) => downline.includes(a.userId))
  }
  if (!allowed) {
    return NextResponse.json(
      { error: 'Only the task creator, the validator, a manager, or the admin can buzz.' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const targetId = String((body as { userId?: string }).userId || '')
  if (!targetId) return NextResponse.json({ error: 'Pick who to buzz.' }, { status: 400 })
  if (targetId === session.id) return NextResponse.json({ error: 'You cannot buzz yourself.' }, { status: 400 })

  const target = task.assignments.find((a) => a.userId === targetId)
  if (!target) return NextResponse.json({ error: 'That employee is not part of this task.' }, { status: 400 })

  const recent = await db.notification.findFirst({
    where: { taskId: task.id, userId: targetId, type: 'BUZZ' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (recent && Date.now() - recent.createdAt.getTime() < BUZZ_COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'You already buzzed them a moment ago — give it a few seconds.' },
      { status: 429 }
    )
  }

  const targetUser = await db.user.findUnique({ where: { id: targetId }, select: { name: true } })

  await notifyAssignees({
    taskId: task.id,
    recipientIds: [targetId],
    title: `${session.name} buzzed you`,
    message: `${session.name} buzzed you about "${task.title}".`,
    type: 'BUZZ',
    highVibration: true,
  })

  return NextResponse.json({ ok: true, buzzed: { id: targetId, name: targetUser?.name || 'employee' } })
}
