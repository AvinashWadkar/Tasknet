'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from './api'
import { TaskCard } from './task-card'
import { viewerStatus } from './shared'
import { projectOccurrences, recurrenceLabel, type ProjectedSlot } from '@/lib/recurring'
import {
  WEEKDAY_LABELS,
  monthGridDates,
  monthLabel,
  shiftMonth,
  istToday,
  isSameMonth,
  fmtDate,
  fmtTime,
} from '@/lib/dates'
import type { Me, TaskDTO } from './types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Repeat } from 'lucide-react'

const DOT: Record<string, string> = {
  PENDING: 'bg-amber-400',
  IN_PROGRESS: 'bg-violet-500',
  COMPLETED: 'bg-brand-500',
  ABORTED: 'bg-red-400',
}

/** YYYY-MM-DD (IST) of an instant */
const istDayOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date(iso))

/**
 * The day a task sits on MY calendar.
 * - Creator: always under the due date they set (deadline tracking).
 * - Assignee: finished work lands on the day I actually completed it
 *   (e.g. due 18 Sept, completed 20 Sept → shows on 20 Sept, not 18).
 * - Open / aborted tasks: stay on their due date.
 */
function calendarDayOf(t: TaskDTO, meId: string): string {
  if (t.creator.id !== meId && t.status !== 'ABORTED') {
    const mine = t.assignments.find((a) => a.userId === meId)
    if (mine?.status === 'COMPLETED' && mine.completedAt) return istDayOf(mine.completedAt)
  }
  return istDayOf(t.dueDate)
}

/** Dot colour state: my own status, or the aggregate progress for creator-only views. */
function dotStatus(t: TaskDTO, meId: string): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' {
  if (t.status === 'ABORTED') return 'ABORTED'
  return viewerStatus(t, meId)
}

export function CalendarView({
  me,
  refreshKey,
  onOpenTask,
  onNewTask,
}: {
  me: Me
  refreshKey: number
  onOpenTask: (id: string) => void
  onNewTask: (date?: string) => void
}) {
  const [selected, setSelected] = useState(istToday())
  const [monthCursor, setMonthCursor] = useState(istToday())
  const [tasks, setTasks] = useState<TaskDTO[]>([])
  const [loadedKey, setLoadedKey] = useState('')
  const [filter, setFilter] = useState<'all' | 'assigned' | 'created'>('all')

  const loading = loadedKey !== `${monthCursor}|${filter}|${refreshKey}|${me.id}`

  useEffect(() => {
    let alive = true
    // Fetch over the full 6-week grid (not just the month) so edge-week tasks
    // and cross-month recurring projections are always available
    const g = monthGridDates(monthCursor)
    const from = g[0]
    const to = g[g.length - 1]
    api<{ tasks: TaskDTO[] }>(`/api/tasks?scope=range&from=${from}&to=${to}&filter=${filter}`)
      .then((r) => {
        if (!alive) return
        setTasks(r.tasks)
        setLoadedKey(`${monthCursor}|${filter}|${refreshKey}|${me.id}`)
      })
      .catch(() => {
        if (!alive) return
        setTasks([])
        setLoadedKey(`${monthCursor}|${filter}|${refreshKey}|${me.id}`)
      })
    return () => {
      alive = false
    }
  }, [monthCursor, filter, refreshKey, me.id])

  const grid = useMemo(() => monthGridDates(monthCursor), [monthCursor])
  const today = istToday()

  const byDay = useMemo(() => {
    const map = new Map<string, TaskDTO[]>()
    for (const t of tasks || []) {
      const d = calendarDayOf(t, me.id)
      const arr = map.get(d) || []
      arr.push(t)
      map.set(d, arr)
    }
    return map
  }, [tasks, me.id])

  // Upcoming occurrences of recurring series, projected per calendar day —
  // each copy only materializes once its predecessor is completed, but the
  // calendar previews the whole schedule ahead of time
  const projByDay = useMemo(() => {
    const map = new Map<string, { task: TaskDTO; slot: ProjectedSlot }[]>()
    for (const t of tasks || []) {
      if (!t.recurring || !t.recurFreq) continue
      for (const slot of projectOccurrences(t, grid[0], grid[grid.length - 1], today)) {
        const arr = map.get(slot.day) || []
        arr.push({ task: t, slot })
        map.set(slot.day, arr)
      }
    }
    return map
  }, [tasks, grid, today])

  const selectedTasks = byDay.get(selected) || []
  const selectedProjections = projByDay.get(selected) || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-brand-600" /> My Tasks Calendar
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Filter tasks">
            {(['all', 'assigned', 'created'] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition',
                  filter === f ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                )}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'assigned' ? 'Assigned to me' : 'Created by me'}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => onNewTask(selected)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Task
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Month grid — MS Teams style */}
        <Card className="min-w-0 border-slate-200/80 shadow-sm lg:col-span-3">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{monthLabel(monthCursor)}</h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => setMonthCursor(shiftMonth(monthCursor, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => { setMonthCursor(today); setSelected(today) }}>
                  Today
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => setMonthCursor(shiftMonth(monthCursor, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {w}
                </div>
              ))}
              {grid.map((d) => {
                const dayTasks = byDay.get(d) || []
                const dayProj = projByDay.get(d) || []
                const inMonth = isSameMonth(d, monthCursor)
                const isToday = d === today
                const isSel = d === selected
                const total = dayTasks.length + dayProj.length
                const realShown = dayTasks.slice(0, 3)
                const projShown = dayProj.slice(0, Math.max(0, 3 - realShown.length))
                return (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    aria-label={`${d}, ${dayTasks.length} tasks${dayProj.length ? `, ${dayProj.length} upcoming repeat${dayProj.length === 1 ? '' : 's'}` : ''}`}
                    aria-selected={isSel}
                    role="gridcell"
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition sm:aspect-auto sm:min-h-14',
                      inMonth ? 'text-slate-700' : 'text-slate-300',
                      isSel && 'bg-brand-600 font-semibold text-white shadow',
                      !isSel && 'hover:bg-slate-100',
                      !isSel && isToday && 'font-bold text-brand-700'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full',
                        isToday && !isSel && 'bg-brand-100'
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                    <div className="mt-0.5 flex h-1.5 items-center gap-0.5">
                      {realShown.map((t) => {
                        const st = dotStatus(t, me.id)
                        return <span key={t.id} className={cn('h-1.5 w-1.5 rounded-full', isSel ? 'bg-white/90' : DOT[st])} />
                      })}
                      {projShown.map(({ task, slot }) => (
                        <span
                          key={`${task.id}-${slot.occ}`}
                          className={cn('h-1.5 w-1.5 rounded-full border-[1.5px] bg-transparent', isSel ? 'border-white/90' : 'border-brand-500')}
                        />
                      ))}
                      {total > 3 && (
                        <span className={cn('text-[8px] leading-none', isSel ? 'text-white/90' : 'text-slate-400')}>
                          +{total - 3}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" /> In Progress</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Completed</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" /> Aborted</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-[1.5px] border-brand-500 bg-transparent" /> Upcoming repeat</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Tasks you completed appear on the day you finished them — as the creator, you’ll see them under the due date you set.
              Dashed entries preview when a recurring task will repeat; each copy is created automatically once the current one is completed.
            </p>
          </CardContent>
        </Card>

        {/* Selected day agenda */}
        <Card className="min-w-0 border-slate-200/80 shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{fmtDate(`${selected}T12:00:00+05:30`)}</h3>
                <p className="text-xs text-slate-400">
                  {selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'} scheduled
                  {selectedProjections.length > 0 &&
                    ` · ${selectedProjections.length} upcoming repeat${selectedProjections.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onNewTask(selected)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : selectedTasks.length === 0 && selectedProjections.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <CalendarDays className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">Nothing scheduled</p>
                <p className="text-xs text-slate-400">Select another date or add a task.</p>
              </div>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {selectedTasks.map((t) => (
                  <TaskCard key={t.id} task={t} me={me} onOpen={() => onOpenTask(t.id)} />
                ))}
                {selectedProjections.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <Repeat className="h-3 w-3" aria-hidden="true" /> Upcoming repeats
                    </p>
                    <div className="space-y-2">
                      {selectedProjections.map(({ task, slot }) => (
                        <div
                          key={`${task.id}-${slot.occ}`}
                          title="Auto-created when the current occurrence is completed"
                          className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600"
                              aria-hidden="true"
                            >
                              <Repeat className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-700">{task.title}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {recurrenceLabel(task)} · {fmtTime(slot.at)} IST
                              </p>
                              <p className="mt-1 text-[11px] text-brand-700/70">
                                Occurrence #{slot.occ} — created automatically once the current one is completed
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
