/**
 * Server bootstrap (Next.js instrumentation hook).
 *
 * Starts an in-process scheduler that dispatches due-soon task reminders
 * ("due in 1 hour" / "due in 15 minutes") so the feature works with no external
 * cron. Only the Node.js runtime is scheduled, and only once per process.
 *
 * Env:
 *   REMINDERS_DISABLED=1   turn the scheduler off (e.g. when using an external cron)
 *   REMINDER_INTERVAL_MS   tick period; defaults to 60000, floored at 30000
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.REMINDERS_DISABLED === '1') return

  const g = globalThis as typeof globalThis & { __tasknetReminderTimer?: ReturnType<typeof setInterval> }
  if (g.__tasknetReminderTimer) return

  const raw = Number(process.env.REMINDER_INTERVAL_MS)
  const period = Number.isFinite(raw) ? Math.max(30_000, raw) : 60_000

  const { runDueReminders } = await import('./lib/reminders')

  const tick = async () => {
    try {
      const { dispatched } = await runDueReminders()
      if (dispatched > 0) console.log(`[reminders] dispatched ${dispatched} due-soon reminder(s)`)
    } catch (err) {
      console.error('[reminders] tick failed', err instanceof Error ? err.message : String(err))
    }
  }

  const timer = setInterval(() => void tick(), period)
  const unref = (timer as { unref?: () => void }).unref
  if (typeof unref === 'function') unref.call(timer)

  g.__tasknetReminderTimer = timer
  setTimeout(() => void tick(), 10_000)
  console.log(`[reminders] due-soon scheduler started (every ${Math.round(period / 1000)}s)`)
}
