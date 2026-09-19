/**
 * IST (Asia/Calcutta) date helpers.
 * Tasks are scheduled in IST; DB stores UTC.
 */
export const IST_TZ = 'Asia/Calcutta'
const IST_OFFSET_MIN = 330

/** YYYY-MM-DD of a given instant, in IST */
export function istDateStr(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60000)
  return ist.toISOString().slice(0, 10)
}

/** Current date in IST as YYYY-MM-DD */
export function istToday(): string {
  return istDateStr(new Date())
}

/** UTC Date bounds for a YYYY-MM-DD IST calendar day */
export function istDayBounds(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000+05:30`)
  const end = new Date(`${dateStr}T23:59:59.999+05:30`)
  return { start, end }
}

/** First & last day of the IST month containing dateStr, as YYYY-MM-DD */
export function istMonthBounds(dateStr: string): { from: string; to: string } {
  const [y, m] = dateStr.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Format helpers using Intl with IST timezone (client-safe) */
export function fmtTime(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(d))
}

export function fmtDate(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(d))
}

export function fmtDateTime(d: string | Date): string {
  return `${fmtDate(d)}, ${fmtTime(d)}`
}

/** Live IST clock string, e.g. "09:41:23 am" */
export function fmtISTClock(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d)
}

/** "Monday, 22 Sep" style eyebrow date in IST */
export function fmtWeekdayDate(d: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(d))
}

export function istHour(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', hour12: false }).format(d)
  )
}

export function greetingForHour(h: number): string {
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

/** IST weekday names for a month grid, Mon-first like MS Teams */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Build a 6-week month grid (MS Teams style): array of YYYY-MM-DD strings,
 * starting from the Monday on/before the 1st of the month.
 */
export function monthGridDates(dateStr: string): string[] {
  const [y, m] = dateStr.split('-').map(Number)
  const first = new Date(`${y}-${String(m).padStart(2, '0')}-01T12:00:00+05:30`)
  // JS: 0=Sun..6=Sat → Mon-first index
  const jsDay = first.getUTCDay()
  const monIndex = (jsDay + 6) % 7
  const gridStart = new Date(first.getTime() - monIndex * 86400000)
  // Normalize gridStart to 12:00 IST equivalent to avoid DST weirdness (IST has none, safe)
  const days: string[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * 86400000 + 5.5 * 3600000)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export function monthLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00+05:30`))
}

export function shiftMonth(dateStr: string, delta: number): string {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 15))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`
}

export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** Build a due Date from a YYYY-MM-DD + HH:mm (interpreted in IST) */
export function istDueDate(dateStr: string, timeStr?: string): Date {
  const time = timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '18:00'
  return new Date(`${dateStr}T${time}:00+05:30`)
}

/**
 * Human-readable "delayed by" duration between an instant and now.
 * Absolute time difference (timezone-free). Returns '' when not in the past.
 * e.g. "2 days 5 hrs", "7 hrs", "40 mins"
 */
export function delayLabel(due: string | Date, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(due).getTime()
  if (diff <= 0) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'less than a min'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'}`
  const days = Math.floor(hrs / 24)
  const remH = hrs % 24
  const d = `${days} day${days === 1 ? '' : 's'}`
  return remH > 0 ? `${d} ${remH} hr${remH === 1 ? '' : 's'}` : d
}
