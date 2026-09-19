'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { InitialAvatar, StatusBadge, OverdueBadge, AbortedBadge } from './shared'
import { api } from './api'
import type { Me, TeamData, TeamEmployee, TeamTask, TaskStatus } from './types'
import { fmtDate } from '@/lib/dates'
import {
  Users,
  ListTodo,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  Network,
  Ban,
} from 'lucide-react'

function EmployeeRow({
  emp,
  open,
  onToggle,
  onOpenTask,
}: {
  emp: TeamEmployee
  open: boolean
  onToggle: () => void
  onOpenTask: (id: string) => void
}) {
  return (
    <div id={`emp-row-${emp.id}`} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-slate-50/60"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        <InitialAvatar name={emp.name} className="h-9 w-9 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {emp.name} <span className="font-normal text-slate-400">· {emp.employeeCode}</span>
          </p>
          <p className="truncate text-xs text-slate-500">
            {emp.designation} · {emp.process}
          </p>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{emp.stats.total} total</span>
          {emp.stats.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{emp.stats.pending} pending</span>
          )}
          {emp.stats.inProgress > 0 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{emp.stats.inProgress} active</span>
          )}
          {emp.stats.overdue > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{emp.stats.overdue} overdue</span>
          )}
          {emp.stats.completed > 0 && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{emp.stats.completed} done</span>
          )}
          {emp.stats.aborted > 0 && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">{emp.stats.aborted} aborted</span>
          )}
        </div>
        <div className="text-right sm:hidden">
          <p className="text-sm font-bold text-slate-700">{emp.stats.total}</p>
          <p className="text-[10px] text-slate-400">tasks</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          {emp.tasks.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">No tasks assigned to {emp.name.split(' ')[0]} yet.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {emp.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-500">
                      Due {fmtDate(t.dueDate)} · by {t.assignedBy}
                    </p>
                  </div>
                  {t.aborted ? (
                    <AbortedBadge />
                  ) : (
                    <>
                      {t.overdue && <OverdueBadge />}
                      <StatusBadge status={t.status} />
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A task aggregated across all of its assignees in the downline. */
interface FlatTask {
  id: string
  title: string
  description: string | null
  dueDate: string
  assignedBy: string
  assignees: { name: string; status: TaskStatus }[]
  completedCount: number
  status: TaskStatus
  overdue: boolean
  aborted: boolean
}

function flattenTasks(employees: TeamEmployee[]): FlatTask[] {
  const map = new Map<string, FlatTask>()
  for (const emp of employees) {
    for (const t of emp.tasks) {
      let ft = map.get(t.id)
      if (!ft) {
        ft = {
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          dueDate: t.dueDate,
          assignedBy: t.assignedBy,
          assignees: [],
          completedCount: 0,
          status: 'PENDING',
          overdue: false,
          aborted: t.aborted,
        }
        map.set(t.id, ft)
      }
      ft.assignees.push({ name: emp.name, status: t.status })
      if (t.status === 'COMPLETED') ft.completedCount++
    }
  }
  const out = [...map.values()]
  for (const ft of out) {
    // Aggregate status across assignees
    if (ft.completedCount === ft.assignees.length) ft.status = 'COMPLETED'
    else if (ft.completedCount > 0 || ft.assignees.some((a) => a.status === 'IN_PROGRESS')) ft.status = 'IN_PROGRESS'
    else ft.status = 'PENDING'
    // Aggregate overdue: due in the past and not everyone finished (aborted tasks are never overdue)
    ft.overdue = !ft.aborted && new Date(ft.dueDate) < new Date() && ft.completedCount < ft.assignees.length
  }
  // Earliest due first (overdue naturally floats to the top)
  out.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return out
}

function TaskRow({ task, onOpenTask }: { task: FlatTask; onOpenTask: (id: string) => void }) {
  const shown = task.assignees.slice(0, 4)
  const extra = task.assignees.length - shown.length
  return (
    <button
      onClick={() => onOpenTask(task.id)}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow"
      aria-label={`Task: ${task.title}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
        <p className="truncate text-xs text-slate-500">
          Due {fmtDate(task.dueDate)} · assigned by {task.assignedBy}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {shown.map((a) => (
              <InitialAvatar key={a.name} name={a.name} className="h-5 w-5 text-[8px] ring-2 ring-white" />
            ))}
            {extra > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[8px] font-bold text-slate-600 ring-2 ring-white">
                +{extra}
              </span>
            )}
          </div>
          <span className="truncate text-[11px] font-medium text-slate-400">
            {task.assignees.length} assignee{task.assignees.length > 1 ? 's' : ''} · {task.completedCount}/{task.assignees.length} done
          </span>
        </div>
      </div>
      {task.aborted ? (
        <AbortedBadge className="shrink-0" />
      ) : (
        <>
          {task.overdue && <OverdueBadge />}
          <StatusBadge status={task.status} className="shrink-0" />
        </>
      )}
    </button>
  )
}

export function TeamView({
  me,
  refreshKey,
  onOpenTask,
}: {
  me: Me
  refreshKey: number
  onOpenTask: (id: string) => void
}) {
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [empSearch, setEmpSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')

  useEffect(() => {
    let alive = true
    api<TeamData>('/api/team')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load team data'))
    return () => {
      alive = false
    }
  }, [refreshKey, me.id])

  const employees = useMemo(() => data?.employees ?? [], [data])

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q) ||
        e.process.toLowerCase().includes(q)
    )
  }, [employees, empSearch])

  // Every task the downline is working on — deduped across assignees
  const allTasks = useMemo(() => flattenTasks(employees), [employees])

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase()
    if (!q) return allTasks
    return allTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.assignedBy.toLowerCase().includes(q) ||
        (t.aborted && q.length >= 3 && 'aborted'.includes(q)) ||
        t.assignees.some((a) => a.name.toLowerCase().includes(q))
    )
  }, [allTasks, taskSearch])

  const totals = data?.totals
  const statCards = totals
    ? [
        { label: 'Team Members', value: totals.employees, icon: Users, cls: 'bg-slate-100 text-slate-700' },
        { label: 'Total Tasks', value: totals.total, icon: ListTodo, cls: 'bg-teal-50 text-teal-700' },
        { label: 'Pending', value: totals.pending, icon: Clock3, cls: 'bg-amber-50 text-amber-700' },
        { label: 'In Progress', value: totals.inProgress, icon: Clock3, cls: 'bg-violet-50 text-violet-700' },
        { label: 'Completed', value: totals.completed, icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
        { label: 'Overdue', value: totals.overdue, icon: AlertTriangle, cls: 'bg-red-50 text-red-700' },
        { label: 'Aborted', value: totals.aborted, icon: Ban, cls: 'bg-red-100 text-red-700' },
      ]
    : []

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Network className="h-5 w-5 text-emerald-600" />
          {data?.scope === 'org' ? 'Organization View' : 'My Team View'}
        </h2>
        <p className="text-sm text-slate-500">
          Employee-wise status and every task your downline is working on — click any task to see who&apos;s done and who&apos;s pending.
        </p>
      </div>

      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">{error}</CardContent>
        </Card>
      )}

      {!data && !error && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {statCards.map((s) => (
              <Card key={s.label} className="border-slate-200/80 shadow-sm">
                <CardContent className="p-3.5">
                  <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${s.cls}`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-bold leading-none text-slate-900">{s.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Employee-wise Task Status (left) */}
            <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">Employee-wise Task Status</h3>
                  <div className="relative w-full sm:w-52">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search employees…"
                      className="pl-8"
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {filteredEmployees.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No employees match your search.</p>
                  ) : (
                    filteredEmployees.map((emp) => (
                      <EmployeeRow
                        key={emp.id}
                        emp={emp}
                        open={expanded.has(emp.id)}
                        onToggle={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev)
                            if (next.has(emp.id)) next.delete(emp.id)
                            else next.add(emp.id)
                            return next
                          })
                        }
                        onOpenTask={onOpenTask}
                      />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* All downline tasks (right) */}
            <Card className="border-slate-200/80 shadow-sm lg:col-span-3">
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">
                    All Tasks
                    <span className="ml-1.5 text-sm font-normal text-slate-400">({filteredTasks.length})</span>
                  </h3>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search tasks by any keyword…"
                      className="pl-8"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      aria-label="Search tasks"
                    />
                  </div>
                </div>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {filteredTasks.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">
                      {allTasks.length === 0
                        ? 'No tasks in your downline yet.'
                        : 'No tasks match your search.'}
                    </p>
                  ) : (
                    filteredTasks.map((t) => <TaskRow key={t.id} task={t} onOpenTask={onOpenTask} />)
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
