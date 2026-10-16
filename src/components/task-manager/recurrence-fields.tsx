'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RECUR_FREQS, RECUR_UNIT, recurrenceLabel, type RecurFreq, type RecurEndType } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { Repeat } from 'lucide-react'

const WEEKDAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // index 0 = ISO 1 (Monday)

export interface RecurrenceValue {
  recurring: boolean
  recurFreq: RecurFreq
  recurInterval: number
  recurEndType: RecurEndType
  recurEndDate: string
  recurCount: number
  recurDays: number[] // ISO weekdays 1=Mon..7=Sun (WEEKLY)
  recurMonthDay: string // "1".."31" or ""
}

export const RECURRENCE_DEFAULT: RecurrenceValue = {
  recurring: false,
  recurFreq: 'WEEKLY',
  recurInterval: 1,
  recurEndType: 'NEVER',
  recurEndDate: '',
  recurCount: 4,
  recurDays: [],
  recurMonthDay: '',
}

/** Effective every-N interval: repeat days force a weekly cadence of 1. */
export function effectiveRecurInterval(v: RecurrenceValue): number {
  return v.recurFreq === 'WEEKLY' && v.recurDays.length > 0 ? 1 : v.recurInterval
}

/** The recurrence payload for the tasks API (POST/PATCH). */
export function recurrencePayload(v: RecurrenceValue) {
  if (!v.recurring) return { recurring: false }
  return {
    recurring: true,
    recurFreq: v.recurFreq,
    recurInterval: effectiveRecurInterval(v),
    recurEndType: v.recurEndType,
    recurEndDate: v.recurEndType === 'ON_DATE' ? v.recurEndDate : undefined,
    recurCount: v.recurEndType === 'AFTER_N' ? v.recurCount : undefined,
    recurWeekdays: v.recurFreq === 'WEEKLY' ? v.recurDays.join(',') || undefined : undefined,
    recurMonthDay: v.recurFreq === 'MONTHLY' && v.recurMonthDay ? Number(v.recurMonthDay) : undefined,
  }
}

/** The recurrence label for the current editor value (or '—'). */
export function recurrenceSummary(v: RecurrenceValue): string {
  return (
    recurrenceLabel({
      recurring: true,
      recurFreq: v.recurFreq,
      recurInterval: effectiveRecurInterval(v),
      recurWeekdays: v.recurFreq === 'WEEKLY' ? v.recurDays.join(',') || null : null,
      recurMonthDay: v.recurFreq === 'MONTHLY' && v.recurMonthDay ? Number(v.recurMonthDay) : null,
    }) ?? '—'
  )
}

/**
 * Controlled recurrence editor shared by the create and edit task dialogs.
 * All state lives in the parent's RecurrenceValue; this component only emits
 * partial patches so both dialogs stay in sync with one implementation.
 */
export function RecurrenceFields({
  value,
  onChange,
  describedById = 'recur-help',
}: {
  value: RecurrenceValue
  onChange: (patch: Partial<RecurrenceValue>) => void
  describedById?: string
}) {
  const { recurring, recurFreq, recurInterval, recurEndType, recurEndDate, recurCount, recurDays, recurMonthDay } = value
  const daySet = new Set(recurDays)

  function toggleDay(day: number) {
    const next = new Set(recurDays)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    onChange({ recurDays: [...next].sort((a, b) => a - b) })
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2.5">
        <Checkbox id="recur" checked={recurring} onCheckedChange={(v) => onChange({ recurring: v === true })} />
        <Repeat className="h-4 w-4 text-brand-600" aria-hidden="true" />
        <Label htmlFor="recur" className="cursor-pointer text-sm font-medium text-slate-800">
          Recurring
        </Label>
      </div>
      <p id={describedById} className="mt-1 pl-[26px] text-xs text-slate-400">
        A new copy with the same team is created automatically each time this task is completed. Upcoming repeats are
        previewed on the My Tasks calendar.
      </p>

      {recurring && (
        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3" role="group" aria-label="Recurrence options">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">Repeats</span>
            <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
              {RECUR_FREQS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onChange({ recurFreq: f.value })}
                  aria-pressed={recurFreq === f.value}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-semibold transition',
                    recurFreq === f.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {recurFreq === 'WEEKLY' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Repeat on
              </span>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Repeat weekdays">
                {WEEKDAY_CHIPS.map((label, idx) => {
                  const day = idx + 1
                  const active = daySet.has(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className={cn(
                        'h-8 w-11 rounded-lg text-xs font-semibold transition',
                        active
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!(recurFreq === 'WEEKLY' && recurDays.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor="recur-int" className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Every
              </label>
              <Input
                id="recur-int"
                type="number"
                min={1}
                max={99}
                value={recurInterval}
                onChange={(e) => onChange({ recurInterval: Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))) })}
                className="w-20"
              />
              <span className="text-sm text-slate-600">
                {RECUR_UNIT[recurFreq]}
                {recurInterval > 1 ? 's' : ''}
              </span>
              {recurFreq === 'WEEKLY' && <span className="text-xs text-slate-400">— or pick repeat days above</span>}
            </div>
          )}
          {recurFreq === 'WEEKLY' && recurDays.length > 0 && (
            <p className="text-xs text-slate-500">
              The task will repeat <span className="font-semibold text-slate-700">every week</span> on the selected days.
            </p>
          )}

          {recurFreq === 'MONTHLY' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor="recur-monthday" className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                On day
              </label>
              <Input
                id="recur-monthday"
                type="number"
                min={1}
                max={31}
                placeholder="—"
                value={recurMonthDay}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '')
                  onChange({ recurMonthDay: v === '' ? '' : String(Math.min(31, Math.max(1, Math.floor(Number(v) || 1)))) })
                }}
                className="w-20"
              />
              <span className="text-xs text-slate-400">of the month — leave empty to reuse the due date&apos;s day</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">Ends</span>
            <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
              {(
                [
                  { value: 'NEVER', label: 'Never' },
                  { value: 'ON_DATE', label: 'On date' },
                  { value: 'AFTER_N', label: 'After N times' },
                ] as { value: RecurEndType; label: string }[]
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onChange({ recurEndType: o.value })}
                  aria-pressed={recurEndType === o.value}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-semibold transition',
                    recurEndType === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {recurEndType === 'ON_DATE' && (
              <Input
                type="date"
                value={recurEndDate}
                onChange={(e) => onChange({ recurEndDate: e.target.value })}
                className="w-40"
                aria-label="Series end date"
              />
            )}
            {recurEndType === 'AFTER_N' && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={2}
                  max={52}
                  value={recurCount}
                  onChange={(e) => onChange({ recurCount: Math.max(2, Math.min(52, Math.floor(Number(e.target.value) || 2))) })}
                  className="w-20"
                  aria-label="Number of occurrences"
                />
                <span className="text-sm text-slate-600">times total</span>
              </div>
            )}
          </div>

          <p className="flex items-center gap-1.5 border-t border-slate-200 pt-2.5 text-xs text-slate-500">
            <Repeat className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
            <span>
              Schedule: <span className="font-semibold text-slate-700">{recurrenceSummary(value)}</span>
            </span>
          </p>
        </div>
      )}
      {!recurring && (
        <p className="mt-1 pl-[26px] text-xs text-slate-400" aria-hidden="true">
          Turn this on to repeat the task on a schedule.
        </p>
      )}
    </div>
  )
}
