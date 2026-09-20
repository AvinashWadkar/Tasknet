'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from './api'
import { TaskCard } from './task-card'
import { AiPriorityPanel } from './ai-priority-panel'
import { greetingForHour, istHour, istToday, fmtDate, fmtISTClock, fmtWeekdayDate } from '@/lib/dates'
import type { Me, TaskDTO } from './types'
import { CalendarCheck2, CalendarDays, CheckCircle2, Clock3, ListTodo, Plus, AlertTriangle, Loader2, Sunrise, SunMedium, MoonStar } from 'lucide-react'
import { initialsOf } from './shared'
import { Button } from '@/components/ui/button'

export function HomeView({
  me,
  refreshKey,
  onOpenTask,
  onNewTask,
  onQuickStatus,
}: {
  me: Me
  refreshKey: number
  onOpenTask: (id: string) => void
  onNewTask: (date?: string) => void
  onQuickStatus: (task: TaskDTO, status: 'IN_PROGRESS' | 'COMPLETED') => void
}) {
  const [tasks, setTasks] = useState<TaskDTO[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [greeting, setGreeting] = useState('Hello')
  const [today, setToday] = useState(istToday())
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    setGreeting(greetingForHour(istHour()))
    setToday(istToday())
  }, [])

  useEffect(() => {
    const tick = () => setClock(fmtISTClock(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    api<{ tasks: TaskDTO[] }>(`/api/tasks?scope=all&filter=all`)
      .then((r) => alive && setTasks(r.tasks))
      .catch(() => alive && setTasks([]))
    return () => {
      alive = false
    }
  }, [refreshKey])

  const { todayTasks, upcoming, stats } = useMemo(() => {
    const all = tasks || []
    const mine = all.filter((t) => t.assignments.some((a) => a.userId === me.id) || t.creator.id === me.id)
    const istDayOf = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date(iso))
    // "My tasks for today" = due today + every past-dated task still open (overdue work must be closed)
    const todays = mine.filter((t) => {
      const d = istDayOf(t.dueDate)
      if (t.status === 'ABORTED') return d === today // aborted tasks stay listed only on their due day
      if (d === today) return true
      if (d < today) {
        const myA = t.assignments.find((a) => a.userId === me.id)
        if (myA) return myA.status !== 'COMPLETED'
        // I only created it — keep chasing until every assignee completes
        return t.assignments.length > 0 && t.assignments.some((a) => a.status !== 'COMPLETED')
      }
      return false
    })
    // Overdue first (most delayed on top), then today's, aborted tasks sink to the bottom
    const rankOf = (t: typeof mine[number]) => {
      if (t.status === 'ABORTED') return 2
      return istDayOf(t.dueDate) < today ? 0 : 1
    }
    todays.sort((a, b) => {
      const ra = rankOf(a)
      const rb = rankOf(b)
      if (ra !== rb) return ra - rb
      if (ra === 0) return a.dueDate.localeCompare(b.dueDate) // most delayed first
      const sa = a.assignments.find((x) => x.userId === me.id)?.status ?? 'PENDING'
      const sb = b.assignments.find((x) => x.userId === me.id)?.status ?? 'PENDING'
      const order: Record<string, number> = { PENDING: 0, IN_PROGRESS: 1, COMPLETED: 2 }
      if (order[sa] !== order[sb]) return order[sa] - order[sb]
      return a.dueDate.localeCompare(b.dueDate)
    })
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400000)
    const upcoming = mine
      .filter((t) => {
        const due = new Date(t.dueDate)
        return t.status !== 'ABORTED' && due > now && due <= in7 && !todays.includes(t)
      })
      .slice(0, 5)
    const assigned = mine.filter((t) => t.assignments.some((a) => a.userId === me.id))
    // Aborted tasks are cancelled work — excluded from all active stats
    const assignedActive = assigned.filter((t) => t.status !== 'ABORTED')
    const stat = {
      dueToday: todays.filter(
        (t) =>
          t.status !== 'ABORTED' &&
          istDayOf(t.dueDate) === today &&
          (t.assignments.find((a) => a.userId === me.id)?.status ?? 'PENDING') !== 'COMPLETED'
      ).length,
      inProgress: assignedActive.filter((t) => t.assignments.find((a) => a.userId === me.id)?.status === 'IN_PROGRESS').length,
      completed: assignedActive.filter((t) => t.assignments.find((a) => a.userId === me.id)?.status === 'COMPLETED').length,
      overdue: assignedActive.filter(
        (t) => t.assignments.find((a) => a.userId === me.id)?.status !== 'COMPLETED' && new Date(t.dueDate) < now
      ).length,
    }
    return { todayTasks: todays, upcoming, stats: stat }
  }, [tasks, me, today])

  // Today's focus progress: how much of today's list (incl. rolled-forward overdue) is closed
  const focus = useMemo(() => {
    const total = todayTasks.length
    const closed = todayTasks.filter((t) => {
      if (t.status === 'ABORTED') return true
      const myA = t.assignments.find((a) => a.userId === me.id)
      if (myA) return myA.status === 'COMPLETED'
      return t.assignments.length > 0 && t.assignments.every((a) => a.status === 'COMPLETED')
    }).length
    return { total, closed, pct: total ? Math.round((closed / total) * 100) : 0 }
  }, [todayTasks, me.id])

  async function quickStatus(task: TaskDTO, status: 'IN_PROGRESS' | 'COMPLETED') {
    setBusyId(task.id)
    try {
      await api(`/api/tasks/${task.id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      setTasks((prev) =>
        prev
          ? prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    assignments: t.assignments.map((a) =>
                      a.userId === me.id ? { ...a, status } : a
                    ),
                  }
                : t
            )
          : prev
      )
    } catch {
      // silent — detail view shows authoritative state
    } finally {
      setBusyId(null)
    }
  }

  const firstName = me.name.split(' ')[0]
  const hour = istHour()
  const TimeIcon = hour < 12 ? Sunrise : hour < 17 ? SunMedium : MoonStar
  const timeIconCls = hour < 17 ? 'text-amber-300' : 'text-brand-200'

  const statTiles = [
    {
      label: 'Overdue',
      value: stats.overdue,
      icon: AlertTriangle,
      tile:
        stats.overdue > 0
          ? 'bg-red-500/15 ring-red-300/25 hover:bg-red-500/20'
          : 'bg-white/[0.07] ring-white/15 hover:bg-white/[0.12]',
      iconWrap: stats.overdue > 0 ? 'bg-red-400/20 text-red-200' : 'bg-white/10 text-brand-200',
      alert: stats.overdue > 0,
    },
    {
      label: 'Due Today',
      value: stats.dueToday,
      icon: CalendarCheck2,
      tile: 'bg-white/[0.07] ring-white/15 hover:bg-white/[0.12]',
      iconWrap: 'bg-white/10 text-brand-200',
      alert: false,
    },
    {
      label: 'In Progress',
      value: stats.inProgress,
      icon: Clock3,
      tile: 'bg-violet-400/15 ring-violet-300/25 hover:bg-violet-400/20',
      iconWrap: 'bg-violet-400/20 text-violet-200',
      alert: false,
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle2,
      tile: 'bg-white/[0.07] ring-white/15 hover:bg-white/[0.12]',
      iconWrap: 'bg-white/10 text-brand-200',
      alert: false,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Greeting hero — bento glass */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-600 text-white shadow-xl shadow-brand-900/20 ring-1 ring-brand-900/10">
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 animate-glow-slow rounded-full bg-brand-400/25 blur-3xl motion-reduce:animate-none"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -bottom-36 left-1/4 h-72 w-72 rounded-full bg-brand-300/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-16 top-6 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          aria-hidden="true"
        />

        <div className="relative p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/25 via-white/10 to-white/5 text-base font-bold text-white ring-1 ring-white/25 backdrop-blur-sm sm:h-16 sm:w-16 sm:text-lg"
                aria-hidden="true"
              >
                {initialsOf(me.name)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-white/15 backdrop-blur-sm">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {fmtWeekdayDate(new Date())}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-white/15 backdrop-blur-sm">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-300 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-300" />
                    </span>
                    <span className="tabular-nums">{clock ?? '--:--:--'}</span>
                    <span className="text-brand-200/80">IST</span>
                  </span>
                </div>
                <h1 className="mt-3 text-[1.7rem] font-bold leading-tight tracking-tight text-white sm:text-4xl">
                  {greeting},{' '}
                  <span className="bg-gradient-to-r from-brand-100 via-white to-brand-300 bg-clip-text font-serif italic text-transparent">
                    {firstName}
                  </span>
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 align-middle backdrop-blur-sm sm:h-8 sm:w-8"
                  >
                    <TimeIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${timeIconCls}`} />
                  </span>
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-100/85 sm:text-[15px]">
                  {stats.overdue > 0
                    ? `${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''} need${stats.overdue > 1 ? '' : 's'} your attention${stats.dueToday > 0 ? `, plus ${stats.dueToday} due today` : ''}. Let's close them!`
                    : stats.dueToday > 0
                      ? `You have ${stats.dueToday} task${stats.dueToday > 1 ? 's' : ''} to close today. Let's get them done!`
                      : 'All caught up for today — great going!'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => onNewTask()}
              size="lg"
              className="group h-11 w-full bg-white text-brand-800 shadow-xl shadow-brand-950/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-2xl hover:shadow-brand-950/40 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:rotate-90" aria-hidden="true" />
              New Task
            </Button>
          </div>

          <div role="group" aria-label="Task statistics" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statTiles.map((s) => (
              <div
                key={s.label}
                className={`rounded-2xl p-4 ring-1 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 ${s.tile}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.iconWrap}`}>
                    <s.icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  {s.alert && (
                    <span className="relative flex h-2.5 w-2.5" role="img" aria-label="Needs attention">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-300" />
                    </span>
                  )}
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-white">{s.value}</p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-100/70">{s.label}</p>
              </div>
            ))}
          </div>

          {focus.total > 0 && (
            <div className="mt-5 flex items-center gap-3" aria-label="Today's completion progress">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-valuenow={focus.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-300 to-white transition-all duration-500"
                  style={{ width: `${focus.pct}%` }}
                />
              </div>
              <p className="shrink-0 text-xs font-semibold text-brand-100">
                {focus.closed} of {focus.total} closed
                <span className="ml-1.5 text-brand-200/70">{focus.pct}%</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* AI priority plan */}
      <AiPriorityPanel me={me} refreshKey={refreshKey} onOpenTask={onOpenTask} />

      {/* Today's tasks */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ListTodo className="h-5 w-5 text-brand-600" /> My Tasks for Today
          </h2>
          <span className="text-xs text-slate-400">{fmtDate(new Date())}</span>
        </div>

        {tasks === null ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : todayTasks.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white/60">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="text-4xl">🎉</span>
              <p className="font-medium text-slate-700">All caught up!</p>
              <p className="text-sm text-slate-500">No pending or overdue tasks for today — enjoy the clear runway, or create a task for your team.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => onNewTask(today)}>
                <Plus className="mr-2 h-4 w-4" /> Create Task
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {todayTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                me={me}
                busy={busyId === t.id}
                onOpen={() => onOpenTask(t.id)}
                onQuickStatus={(s) => quickStatus(t, s)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Coming up next 7 days</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {upcoming.map((t) => (
              <TaskCard key={t.id} task={t} me={me} onOpen={() => onOpenTask(t.id)} />
            ))}
          </div>
        </section>
      )}

      {busyId && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin" /> Updating task…
          </div>
        </div>
      )}
    </div>
  )
}
