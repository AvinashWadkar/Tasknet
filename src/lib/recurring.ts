/**
 * Recurring-task helpers — pure functions, safe on client and server.
 *
 * Mechanism: when EVERY assignee completes a recurring task, the server
 * spawns the next occurrence (same title/description/creator/assignees,
 * fresh PENDING statuses) with its due date advanced by the cadence.
 * Aborting a recurring task ends the series.
 */
import { istDateStr } from './dates'

export type RecurFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type RecurEndType = 'NEVER' | 'ON_DATE' | 'AFTER_N'

export const RECUR_FREQS: { value: RecurFreq; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
]

/** Singular unit word for the "every N ___" control */
export const RECUR_UNIT: Record<RecurFreq, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
}

const ALWAYS_LABEL: Record<RecurFreq, string> = {
  DAILY: 'Repeats daily',
  WEEKLY: 'Repeats weekly',
  MONTHLY: 'Repeats monthly',
}

/**
 * Short chip label: "Repeats weekly" / "Repeats every 3 days" / …
 * Returns null when the task is not recurring.
 */
export function recurrenceLabel(t: {
  recurring?: boolean | null
  recurFreq?: string | null
  recurInterval?: number | null
}): string | null {
  if (!t.recurring || !t.recurFreq) return null
  const freq = t.recurFreq as RecurFreq
  const n = t.recurInterval ?? 1
  if (!(freq in ALWAYS_LABEL)) return null
  if (n <= 1) return ALWAYS_LABEL[freq]
  return `Repeats every ${n} ${RECUR_UNIT[freq]}${n > 1 ? 's' : ''}`
}

/** Advance a due date by one interval step (IST-safe: IST has no DST). */
export function stepDue(due: Date, freq: RecurFreq, interval: number): Date {
  const n = Math.max(1, Math.floor(interval))
  if (freq === 'DAILY') return new Date(due.getTime() + n * 86400000)
  if (freq === 'WEEKLY') return new Date(due.getTime() + n * 7 * 86400000)
  // MONTHLY: keep day-of-month, clamp to the last day of the target month
  const y = due.getUTCFullYear()
  const m = due.getUTCMonth() + n
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(y, m, Math.min(due.getUTCDate(), lastDay), due.getUTCHours(), due.getUTCMinutes(), due.getUTCSeconds(), due.getUTCMilliseconds())
  )
}

/**
 * Next occurrence's due date: anchored to the current due date and stepped
 * forward until it lands strictly AFTER `from`, so completing a task long
 * after its due date never spawns an instantly-overdue copy and the
 * weekday/month-day cadence stays stable.
 */
export function nextDueDate(due: Date, freq: RecurFreq, interval: number, from: Date = new Date()): Date {
  let next = stepDue(due, freq, interval)
  let guard = 0
  while (next.getTime() <= from.getTime() && guard < 1000) {
    next = stepDue(next, freq, interval)
    guard++
  }
  return next
}

/**
 * Whether the series should continue past the current occurrence.
 * - NEVER: continues forever
 * - ON_DATE: continues while the next due IST date is on/before the end date
 * - AFTER_N: continues while the next occurrence number is within the count
 */
export function seriesContinues(
  t: {
    recurOccurrence?: number | null
    recurEndType?: string | null
    recurEndDate?: Date | string | null
    recurCount?: number | null
  },
  nextDue: Date
): boolean {
  const occ = t.recurOccurrence ?? 1
  if (t.recurEndType === 'AFTER_N') return occ < (t.recurCount ?? 1)
  if (t.recurEndType === 'ON_DATE' && t.recurEndDate) return istDateStr(nextDue) <= istDateStr(new Date(t.recurEndDate))
  return true
}
