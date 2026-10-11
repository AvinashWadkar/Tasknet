import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { notifyAssignees } from '@/lib/notify'
import { fmtDate, fmtTime } from '@/lib/dates'

/**
 * Due-soon reminders (server-only).
 *
 * A task's still-open assignees get a native push + in-app notification:
 *   • once when it is due within the next hour ("Task due in 1 hour"), and
 *   • once when it is due within the next 15 minutes ("Task due in 15 minutes").
 *
 * The two windows are disjoint — the 1-hour pass only looks 15–60 minutes out,
 * the 15-minute pass only 0–15 minutes out — so a task never gets both at once.
 * Each threshold is claimed atomically on the task before dispatch (tracked by
 * Task.reminder1hSentAt / reminder15mSentAt), so overlapping timer ticks or an
 * external cron can never double-send. Safe to call as often as you like.
 */

const FIFTEEN_MIN_MS = 15 * 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000

export type ReminderResult = {
  /** Tasks that got the "due in 1 hour" reminder this run. */
  oneHour: number
  /** Tasks that got the "due in 15 minutes" reminder this run. */
  fifteenMin: number
  /** Total reminders dispatched. */
  dispatched: number
}

type Threshold = {
  title: string
  /** dueDate must be strictly after `from`. */
  from: Date
  /** ...and at or before `to`. */
  to: Date
  /** Matches tasks whose this-threshold reminder has not gone out yet. */
  pending: Prisma.TaskWhereInput
  /** Mutation that stamps the threshold as sent. */
  claim: Prisma.TaskUpdateManyMutationInput
}

async function runThreshold(t: Threshold): Promise<number> {
  const tasks = await db.task.findMany({
    where: { status: 'ACTIVE', dueDate: { gt: t.from, lte: t.to }, ...t.pending },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assignments: { select: { userId: true, status: true } },
    },
  })

  let dispatched = 0
  for (const task of tasks) {
    // Claim the threshold atomically; a concurrent tick loses this race and skips.
    const claimed = await db.task.updateMany({
      where: { id: task.id, ...t.pending },
      data: t.claim,
    })
    if (claimed.count === 0) continue

    const recipients = task.assignments
      .filter((a) => a.status !== 'COMPLETED')
      .map((a) => a.userId)
    if (recipients.length === 0) continue

    await notifyAssignees({
      taskId: task.id,
      recipientIds: recipients,
      type: 'TASK_REMINDER',
      title: t.title,
      message: `${task.title} — due at ${fmtTime(task.dueDate)} IST on ${fmtDate(task.dueDate)}.`,
    })
    dispatched++
  }
  return dispatched
}

/**
 * Dispatch any due-soon reminders. Idempotent; each task receives the 1-hour and
 * the 15-minute reminder at most once. Runs against `now` (injectable for tests).
 */
export async function runDueReminders(now: Date = new Date()): Promise<ReminderResult> {
  const oneHour = await runThreshold({
    title: 'Task due in 1 hour',
    from: new Date(now.getTime() + FIFTEEN_MIN_MS),
    to: new Date(now.getTime() + ONE_HOUR_MS),
    pending: { reminder1hSentAt: null },
    claim: { reminder1hSentAt: now },
  })

  const fifteenMin = await runThreshold({
    title: 'Task due in 15 minutes',
    from: now,
    to: new Date(now.getTime() + FIFTEEN_MIN_MS),
    pending: { reminder15mSentAt: null },
    claim: { reminder15mSentAt: now },
  })

  return { oneHour, fifteenMin, dispatched: oneHour + fifteenMin }
}
