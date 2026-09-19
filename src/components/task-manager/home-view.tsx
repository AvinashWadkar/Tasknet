'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from './api'
import { TaskCard } from './task-card'
import { AiPriorityPanel } from './ai-priority-panel'
import { greetingForHour, istHour, istToday, fmtDate } from '@/lib/dates'
import type { Me, TaskDTO } from './types'
import { CalendarCheck2, CheckCircle2, Clock3, ListTodo, Plus, AlertTriangle, Loader2 } from 'lucide-react'
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

  useEffect(() => {
    setGreeting(greetingForHour(istHour()))
    setToday(istToday())
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
  const emoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌆'

  const statCards = [
    { label: 'Due Today', value: stats.dueToday, icon: CalendarCheck2, cls: 'bg-brand-50 text-brand-700' },
    { label: 'In Progress', value: stats.inProgress, icon: Clock3, cls: 'bg-violet-50 text-violet-700' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, cls: 'bg-brand-50 text-brand-700' },
    { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, cls: 'bg-red-50 text-red-700' },
  ]

  return (
    <div className="space-y-6">
      {/* Greeting hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 p-6 text-white shadow-lg shadow-brand-200 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-32 h-44 w-44 rounded-full bg-brand-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-100">{fmtDate(new Date())}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {greeting}, {firstName} {emoji}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-brand-50/90">
              {stats.overdue > 0
                ? `${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''} need${stats.overdue > 1 ? '' : 's'} your attention${stats.dueToday > 0 ? `, plus ${stats.dueToday} due today` : ''}. Let's close them!`
                : stats.dueToday > 0
                  ? `You have ${stats.dueToday} task${stats.dueToday > 1 ? 's' : ''} to close today. Let's get them done!`
                  : 'All caught up for today — great going!'}
            </p>
          </div>
          <Button
            onClick={() => onNewTask()}
            className="bg-white text-brand-700 hover:bg-brand-50 shadow-md"
            size="lg"
          >
            <Plus className="mr-2 h-4 w-4" /> New Task
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Task statistics">
        {statCards.map((s) => (
          <Card key={s.label} className="border-slate-200/80 shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.cls}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none text-slate-900">{s.value}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
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
          <div className="grid gap-3 lg:grid-cols-2">
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
          <div className="grid gap-3 lg:grid-cols-2">
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
