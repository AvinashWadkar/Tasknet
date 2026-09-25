import { db } from '@/lib/db'
import { nextDueDate, seriesContinues, parseWeekdays, type RecurFreq } from './recurring'
import { fmtDate, fmtTime } from './dates'
import { notifyAssignees } from './notify'

/**
 * Recurring-series spawner (server-only).
 *
 * Called after an assignment status change to COMPLETED. If every assignee
 * of a recurring task has completed it, the next occurrence is created:
 * - same title / description / creator / current assignee set (fresh PENDING)
 * - due date advanced by the cadence, anchored to the previous due date and
 *   landing strictly in the future (never instantly overdue)
 * - occurrence counter incremented, rootTaskId linking the series
 * - end conditions honored (AFTER_N count, ON_DATE inclusive end)
 * - idempotent: skipped if occurrence N+1 already exists (reopen → re-complete)
 *
 * Aborting a recurring task ends the series (no spawn).
 * Returns the created task id, or null when nothing was spawned.
 */
export async function maybeSpawnNextOccurrence(taskId: string): Promise<string | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { assignments: { select: { userId: true, status: true } } },
  })
  if (!task || !task.recurring || !task.recurFreq) return null
  if (task.status === 'ABORTED') return null
  if (task.assignments.length === 0 || !task.assignments.every((a) => a.status === 'COMPLETED')) return null

  const root = task.rootTaskId ?? task.id
  const nextOccurrence = task.recurOccurrence + 1

  // Idempotency guard: this occurrence already spawned its successor
  const existing = await db.task.findFirst({
    where: { rootTaskId: root, recurOccurrence: nextOccurrence },
    select: { id: true },
  })
  if (existing) return null

  const freq = task.recurFreq as RecurFreq
  const interval = task.recurInterval ?? 1
  // Repeat-day aware cadence (weekly weekday set / monthly day-of-month)
  const stepOpts = { weekdays: parseWeekdays(task.recurWeekdays), monthDay: task.recurMonthDay ?? null }
  const nextDue = nextDueDate(task.dueDate, freq, interval, new Date(), stepOpts)
  if (
    !seriesContinues(
      {
        recurOccurrence: task.recurOccurrence,
        recurEndType: task.recurEndType,
        recurEndDate: task.recurEndDate,
        recurCount: task.recurCount,
      },
      nextDue
    )
  ) {
    return null
  }

  const dueLabel = `${fmtDate(nextDue)}, ${fmtTime(nextDue)} IST`
  const created = await db.task.create({
    data: {
      title: task.title,
      description: task.description,
      dueDate: nextDue,
      createdById: task.createdById,
      recurring: true,
      recurFreq: task.recurFreq,
      recurInterval: task.recurInterval,
      recurEndType: task.recurEndType,
      recurEndDate: task.recurEndDate,
      recurCount: task.recurCount,
      recurOccurrence: nextOccurrence,
      rootTaskId: root,
      recurWeekdays: task.recurWeekdays,
      recurMonthDay: task.recurMonthDay,
      assignments: { create: task.assignments.map((a) => ({ userId: a.userId })) },
      activities: {
        create: [
          {
            actorId: task.createdById,
            actorName: 'Tasknet Recurrence',
            action: 'TASK_CREATED',
            detail: `Occurrence #${nextOccurrence} of this recurring series — auto-created when the previous occurrence was completed`,
          },
          {
            actorId: task.createdById,
            actorName: 'Tasknet Recurrence',
            action: 'ASSIGNED',
            detail: 'Assigned to the same employees as the previous occurrence',
          },
        ],
      },
    },
  })

  await db.taskActivity.create({
    data: {
      taskId: task.id,
      actorId: task.createdById,
      actorName: 'Tasknet Recurrence',
      action: 'RECURRENCE',
      detail: `All assignees completed — occurrence #${nextOccurrence} scheduled for ${dueLabel}`,
    },
  })

  // Tell the assignees a new occurrence is on their plate.
  await notifyAssignees({
    taskId: created.id,
    recipientIds: task.assignments.map((a) => a.userId),
    type: 'RECURRING',
    title: 'New occurrence of a recurring task',
    message: `${task.title} — occurrence #${nextOccurrence} is due ${dueLabel}.`,
  })

  return created.id
}
