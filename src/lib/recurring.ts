/**
 * Recurring-task helpers — pure functions, safe on client and server.
 *
 * Mechanism: when EVERY assignee completes a recurring task, the server
 * spawns the next occurrence (same title/description/creator/assignees,
 * fresh PENDING statuses) with its due date advanced by the cadence.
 * Aborting a recurring task ends the series.
 *
 * Cadences:
 * - DAILY: every N days
 * - WEEKLY: every N weeks, OR on selected weekdays ("1,3,5" = Mon, Wed, Fri).
 *   When repeat days are picked the series repeats every week on those days
 *   (interval is clamped to 1).
 * - MONTHLY: every N months on the due date's day-of-month, or on an
 *   explicit day-of-month (recurMonthDay, clamped to month length).
 */
import { istDateStr, WEEKDAY_LABELS } from './dates'

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

/** Parse a weekday string ("1,3,5") → sorted unique ISO weekday numbers (1=Mon..7=Sun) */
export function parseWeekdays(s?: string | null): number[] {
  if (!s) return []
  const set = new Set<number>()
  for (const part of String(s).split(',')) {
    const n = Math.floor(Number(part.trim()))
    if (n >= 1 && n <= 7) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

/** Encode weekday numbers → canonical comma-separated string (or null when empty) */
export function weekdaysToStr(days: number[]): string | null {
  const parsed = parseWeekdays(days.join(','))
  return parsed.length ? parsed.join(',') : null
}

/** IST weekday number of an instant (1=Mon..7=Sun) — derived from the IST calendar date */
export function istWeekday(d: Date): number {
  const [y, m, day] = istDateStr(d).split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7) + 1
}

/** Human label for a set of weekday numbers, e.g. "Mon, Wed & Fri" */
export function weekdayListLabel(days: number[]): string {
  const names = days.map((d) => WEEKDAY_LABELS[d - 1]).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/**
 * Short chip label: "Repeats weekly on Mon, Wed & Fri" / "Repeats every 3 days" /
 * "Repeats monthly on day 15". Returns null when the task is not recurring.
 */
export function recurrenceLabel(t: {
  recurring?: boolean | null
  recurFreq?: string | null
  recurInterval?: number | null
  recurWeekdays?: string | null
  recurMonthDay?: number | null
}): string | null {
  if (!t.recurring || !t.recurFreq) return null
  const freq = t.recurFreq as RecurFreq
  if (!(freq in ALWAYS_LABEL)) return null
  const n = t.recurInterval ?? 1

  if (freq === 'WEEKLY') {
    const days = parseWeekdays(t.recurWeekdays)
    if (days.length > 0) return `Repeats weekly on ${weekdayListLabel(days)}`
  }
  if (freq === 'MONTHLY') {
    const md = t.recurMonthDay ?? null
    if (md && md >= 1 && md <= 31) {
      return n > 1 ? `Repeats every ${n} months on day ${md}` : `Repeats monthly on day ${md}`
    }
  }
  if (n <= 1) return ALWAYS_LABEL[freq]
  return `Repeats every ${n} ${RECUR_UNIT[freq]}${n > 1 ? 's' : ''}`
}

/** Advance a due date by one interval step (IST-safe: IST has no DST). */
export function stepDue(due: Date, freq: RecurFreq, interval: number): Date {
  const n = Math.max(1, Math.floor(interval))
  if (freq === 'DAILY') return new Date(due.getTime() + n * 86400000)
  if (freq === 'WEEKLY') return new Date(due.getTime() + n * 7 * 86400000)
  // MONTHLY: keep day-of-month, clamp to the last day of the target month
  return monthlyStep(due, n, null)
}

/** MONTHLY step keeping an explicit day-of-month (or the due date's own day), clamped */
function monthlyStep(due: Date, n: number, monthDay: number | null): Date {
  const [y, m] = istDateStr(due).split('-').map(Number)
  const target = m - 1 + n
  const yy = y + Math.floor(target / 12)
  const mm = ((target % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  const baseDay = monthDay && monthDay >= 1 && monthDay <= 31 ? monthDay : istDateStr(due).slice(8, 10) | 0
  const dd = Math.min(baseDay, lastDay)
  return new Date(
    Date.UTC(yy, mm, dd, due.getUTCHours(), due.getUTCMinutes(), due.getUTCSeconds(), due.getUTCMilliseconds())
  )
}

export interface StepOptions {
  /** WEEKLY repeat days (1=Mon..7=Sun). When present, interval is treated as 1. */
  weekdays?: number[]
  /** MONTHLY explicit day-of-month (1..31) */
  monthDay?: number | null
}

/**
 * One cadence step from `due` honoring repeat-day options.
 * With weekdays: the next selected weekday strictly after `due`.
 */
export function stepSlot(due: Date, freq: RecurFreq, interval: number, opts?: StepOptions): Date {
  const days = opts?.weekdays ?? []
  if (freq === 'WEEKLY' && days.length > 0) {
    let c = new Date(due.getTime())
    for (let i = 0; i < 14; i++) {
      c = new Date(c.getTime() + 86400000)
      if (days.includes(istWeekday(c))) return c
    }
    return new Date(due.getTime() + 7 * 86400000) // unreachable fallback
  }
  const md = opts?.monthDay ?? null
  if (freq === 'MONTHLY' && md && md >= 1 && md <= 31) return monthlyStep(due, Math.max(1, Math.floor(interval)), md)
  return stepDue(due, freq, interval)
}

/**
 * Next occurrence's due date: anchored to the current due date and stepped
 * forward until it lands strictly AFTER `from`, so completing a task long
 * after its due date never spawns an instantly-overdue copy and the
 * weekday/month-day cadence stays stable.
 */
export function nextDueDate(
  due: Date,
  freq: RecurFreq,
  interval: number,
  from: Date = new Date(),
  opts?: StepOptions
): Date {
  let next = stepSlot(due, freq, interval, opts)
  let guard = 0
  while (next.getTime() <= from.getTime() && guard < 1000) {
    next = stepSlot(next, freq, interval, opts)
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

export interface ProjectedSlot {
  /** IST calendar day (YYYY-MM-DD) of the projected occurrence */
  day: string
  /** Exact scheduled instant */
  at: Date
  /** 1-based occurrence number within the series */
  occ: number
}

/**
 * Project the FUTURE occurrences of an active recurring task inside a day
 * range — used to preview the series schedule on the calendar before each
 * copy is actually spawned (a copy only materializes once its predecessor
 * is completed).
 *
 * Rules:
 * - only slots strictly after today AND strictly after the current due date
 *   (a slot between the current due date and today was skipped)
 * - end conditions honored: AFTER_N count, ON_DATE inclusive end
 * - `cap` guards infinite series
 */
export function projectOccurrences(
  t: {
    recurring?: boolean | null
    status?: string | null
    dueDate: string | Date
    recurFreq?: string | null
    recurInterval?: number | null
    recurWeekdays?: string | null
    recurMonthDay?: number | null
    recurEndType?: string | null
    recurEndDate?: string | Date | null
    recurCount?: number | null
    recurOccurrence?: number | null
  },
  rangeStartDay: string,
  rangeEndDay: string,
  todayDay: string,
  cap = 90
): ProjectedSlot[] {
  if (!t.recurring || !t.recurFreq) return []
  if (t.status === 'ABORTED' || t.status === 'COMPLETED') return []
  const freq = t.recurFreq as RecurFreq
  const due = new Date(t.dueDate)
  if (isNaN(due.getTime())) return []
  const opts: StepOptions = {
    weekdays: parseWeekdays(t.recurWeekdays),
    monthDay: t.recurMonthDay ?? null,
  }

  const out: ProjectedSlot[] = []
  let slot = due
  let occ = t.recurOccurrence ?? 1
  let guard = 0
  while (guard < cap) {
    guard++
    slot = stepSlot(slot, freq, t.recurInterval ?? 1, opts)
    occ++
    const day = istDateStr(slot)
    if (day > rangeEndDay) break
    if (t.recurEndType === 'AFTER_N' && occ > (t.recurCount ?? 0)) break
    if (t.recurEndType === 'ON_DATE' && t.recurEndDate && day > istDateStr(new Date(t.recurEndDate))) break
    if (day > todayDay && day > istDateStr(due) && day >= rangeStartDay) {
      out.push({ day, at: slot, occ })
    }
  }
  return out
}
