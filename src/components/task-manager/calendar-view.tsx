'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from './api'
import { TaskCard } from './task-card'
import {
  WEEKDAY_LABELS,
  monthGridDates,
  monthLabel,
  shiftMonth,
  istToday,
  isSameMonth,
  istMonthBounds,
  fmtDate,
} from '@/lib/dates'
import type { Me, TaskDTO } from './types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react'

const DOT: Record<string, string> = {
  PENDING: 'bg-amber-400',
  IN_PROGRESS: 'bg-violet-500',
  COMPLETED: 'bg-emerald-500',
  ABORTED: 'bg-red-400',
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
    const { from, to } = istMonthBounds(monthCursor)
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
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date(t.dueDate))
      const arr = map.get(d) || []
      arr.push(t)
      map.set(d, arr)
    }
    return map
  }, [tasks])

  const selectedTasks = byDay.get(selected) || []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-emerald-600" /> My Tasks Calendar
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
                  filter === f ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
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

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Month grid — MS Teams style */}
        <Card className="border-slate-200/80 shadow-sm lg:col-span-3">
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
                const inMonth = isSameMonth(d, monthCursor)
                const isToday = d === today
                const isSel = d === selected
                return (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    aria-label={`${d}, ${dayTasks.length} tasks`}
                    aria-selected={isSel}
                    role="gridcell"
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition sm:aspect-auto sm:min-h-14',
                      inMonth ? 'text-slate-700' : 'text-slate-300',
                      isSel && 'bg-emerald-600 font-semibold text-white shadow',
                      !isSel && 'hover:bg-slate-100',
                      !isSel && isToday && 'font-bold text-emerald-700'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full',
                        isToday && !isSel && 'bg-emerald-100'
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                    <div className="mt-0.5 flex h-1.5 items-center gap-0.5">
                      {dayTasks.slice(0, 3).map((t) => {
                        const st =
                          t.status === 'ABORTED'
                            ? 'ABORTED'
                            : t.assignments.find((a) => a.userId === me.id)?.status ?? 'PENDING'
                        return <span key={t.id} className={cn('h-1.5 w-1.5 rounded-full', isSel ? 'bg-white/90' : DOT[st])} />
                      })}
                      {dayTasks.length > 3 && (
                        <span className={cn('text-[8px] leading-none', isSel ? 'text-white/90' : 'text-slate-400')}>
                          +{dayTasks.length - 3}
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
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completed</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" /> Aborted</span>
            </div>
          </CardContent>
        </Card>

        {/* Selected day agenda */}
        <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{fmtDate(`${selected}T12:00:00+05:30`)}</h3>
                <p className="text-xs text-slate-400">
                  {selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'} due
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
            ) : selectedTasks.length === 0 ? (
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
