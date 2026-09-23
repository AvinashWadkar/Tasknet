'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { InitialAvatar } from './shared'
import { api } from './api'
import { RECUR_FREQS, RECUR_UNIT, recurrenceLabel, type RecurFreq, type RecurEndType } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import type { DirectoryUser } from './types'
import { Loader2, Plus, Search, Users, X, Repeat } from 'lucide-react'

const WEEKDAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] // index 0 = ISO 1 (Monday)

export function NewTaskDialog({
  open,
  onClose,
  defaultDate,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  defaultDate?: string
  onCreated: () => void
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(defaultDate || '')
  const [time, setTime] = useState('18:00')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [recurFreq, setRecurFreq] = useState<RecurFreq>('WEEKLY')
  const [recurInterval, setRecurInterval] = useState(1)
  const [recurEndType, setRecurEndType] = useState<RecurEndType>('NEVER')
  const [recurEndDate, setRecurEndDate] = useState('')
  const [recurCount, setRecurCount] = useState(4)
  const [recurDays, setRecurDays] = useState<Set<number>>(new Set())
  const [recurMonthDay, setRecurMonthDay] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setDate(defaultDate || '')
    setTime('18:00')
    setSelected(new Set())
    setSearch('')
    setError(null)
    setRecurring(false)
    setRecurFreq('WEEKLY')
    setRecurInterval(1)
    setRecurEndType('NEVER')
    setRecurEndDate('')
    setRecurCount(4)
    setRecurDays(new Set())
    setRecurMonthDay('')
    setLoadingUsers(true)
    api<{ users: DirectoryUser[] }>('/api/users')
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [open, defaultDate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        u.designation.toLowerCase().includes(q)
    )
  }, [users, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Please enter a task title')
    if (!date) return setError('Please pick a due date')
    if (selected.size === 0) return setError('Please select at least one employee to assign')
    if (recurring && recurEndType === 'ON_DATE' && !recurEndDate)
      return setError('Pick the date the series should end on')
    if (recurring && recurEndType === 'AFTER_N' && recurCount < 2)
      return setError('Occurrence count must be at least 2')
    if (recurring && recurFreq === 'WEEKLY' && recurDays.size === 0 && recurInterval > 4)
      return setError('Weekly interval looks too large — pick repeat days or a smaller interval')
    setBusy(true)
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          dueDate: { date, time },
          assigneeIds: [...selected],
          recurring,
          ...(recurring
            ? {
                recurFreq,
                recurInterval: recurFreq === 'WEEKLY' && recurDays.size > 0 ? 1 : recurInterval,
                recurEndType,
                recurEndDate: recurEndType === 'ON_DATE' ? recurEndDate : undefined,
                recurCount: recurEndType === 'AFTER_N' ? recurCount : undefined,
                recurWeekdays: recurFreq === 'WEEKLY' ? [...recurDays].join(',') : undefined,
                recurMonthDay: recurFreq === 'MONTHLY' && recurMonthDay ? Number(recurMonthDay) : undefined,
              }
            : {}),
        }),
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task')
    } finally {
      setBusy(false)
    }
  }

  const selectedUsers = users.filter((u) => selected.has(u.id))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand-600" /> Create New Task
          </DialogTitle>
          <DialogDescription>Assign a task to one or more employees — everyone assigned can track it together.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 [scrollbar-width:thin]">
          <div className="space-y-2">
            <Label htmlFor="t-title">Task title *</Label>
            <Input id="t-title" placeholder="e.g. Prepare daily MIS report" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" placeholder="Add details, links or instructions…" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-date">Due date *</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-time">Due time (IST)</Label>
              <Input id="t-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Recurring */}
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2.5">
              <Checkbox id="t-recur" checked={recurring} onCheckedChange={(v) => setRecurring(v === true)} />
              <Repeat className="h-4 w-4 text-brand-600" aria-hidden="true" />
              <Label htmlFor="t-recur" className="cursor-pointer text-sm font-medium text-slate-800">
                Recurring
              </Label>
            </div>
            <p className="mt-1 pl-[26px] text-xs text-slate-400">
              A new copy with the same team is created automatically each time this task is completed. Upcoming repeats are previewed on the My Tasks calendar.
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
                        onClick={() => setRecurFreq(f.value)}
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
                        const active = recurDays.has(day)
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() =>
                              setRecurDays((prev) => {
                                const next = new Set(prev)
                                if (next.has(day)) next.delete(day)
                                else next.add(day)
                                return next
                              })
                            }
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

                {!(recurFreq === 'WEEKLY' && recurDays.size > 0) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label htmlFor="t-recur-int" className="w-16 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Every
                    </label>
                    <Input
                      id="t-recur-int"
                      type="number"
                      min={1}
                      max={99}
                      value={recurInterval}
                      onChange={(e) => setRecurInterval(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))}
                      className="w-20"
                    />
                    <span className="text-sm text-slate-600">
                      {RECUR_UNIT[recurFreq]}
                      {recurInterval > 1 ? 's' : ''}
                    </span>
                    {recurFreq === 'WEEKLY' && (
                      <span className="text-xs text-slate-400">— or pick repeat days above</span>
                    )}
                  </div>
                )}
                {recurFreq === 'WEEKLY' && recurDays.size > 0 && (
                  <p className="text-xs text-slate-500">
                    The task will repeat <span className="font-semibold text-slate-700">every week</span> on the selected days.
                  </p>
                )}

                {recurFreq === 'MONTHLY' && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label htmlFor="t-recur-monthday" className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      On day
                    </label>
                    <Input
                      id="t-recur-monthday"
                      type="number"
                      min={1}
                      max={31}
                      placeholder="—"
                      value={recurMonthDay}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '')
                        setRecurMonthDay(v === '' ? '' : String(Math.min(31, Math.max(1, Math.floor(Number(v) || 1)))))
                      }}
                      className="w-20"
                    />
                    <span className="text-xs text-slate-400">
                      of the month — leave empty to reuse the due date's day
                    </span>
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
                        onClick={() => setRecurEndType(o.value)}
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
                      min={date || undefined}
                      onChange={(e) => setRecurEndDate(e.target.value)}
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
                        onChange={(e) => setRecurCount(Math.max(2, Math.min(52, Math.floor(Number(e.target.value) || 2))))}
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
                    Schedule:{' '}
                    <span className="font-semibold text-slate-700">
                      {recurrenceLabel({
                        recurring: true,
                        recurFreq,
                        recurInterval: recurFreq === 'WEEKLY' && recurDays.size > 0 ? 1 : recurInterval,
                        recurWeekdays: recurFreq === 'WEEKLY' ? [...recurDays].join(',') : null,
                        recurMonthDay: recurFreq === 'MONTHLY' && recurMonthDay ? Number(recurMonthDay) : null,
                      }) ?? '—'}
                    </span>
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-brand-600" /> Assign to employees * <span className="text-slate-400">({selected.size} selected)</span>
              </Label>
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-brand-200 bg-brand-50/60 p-2">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                    {u.name}
                    <button type="button" aria-label={`Remove ${u.name}`} onClick={() => toggle(u.id)} className="text-slate-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name, code or designation…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5 [scrollbar-width:thin]">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading employees…
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No employees found</p>
              ) : (
                filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50"
                  >
                    <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                    <InitialAvatar name={u.name} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {u.name} <span className="font-normal text-slate-400">· {u.employeeCode}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.designation}{u.process ? ` · ${u.process}` : ''}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create & Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
