'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { InitialAvatar, StatusBadge, OverdueBadge } from './shared'
import { api } from './api'
import type { Me, TeamData, TeamEmployee, TreeNode } from './types'
import { fmtDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'

function TreeNodeView({
  node,
  isMe,
  depth,
  onOpenEmployee,
}: {
  node: TreeNode
  isMe: boolean
  depth: number
  onOpenEmployee?: (id: string) => void
}) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children.length > 0

  return (
    <div className={cn(depth > 0 && 'ml-4 border-l-2 border-slate-100 pl-4')}>
      <div
        className={cn(
          'mb-1.5 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm transition hover:shadow',
          isMe ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200' : 'border-slate-200'
        )}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <InitialAvatar name={node.name} className="h-8 w-8 text-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {node.name}
            {isMe && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">YOU</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {node.designation} · {node.employeeCode}
          </p>
        </div>
        {hasChildren && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {node.children.length} report{node.children.length > 1 ? 's' : ''}
          </span>
        )}
        {onOpenEmployee && !isMe && node.id !== 'ORG' && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-700" onClick={() => onOpenEmployee(node.id)}>
            View
          </Button>
        )}
      </div>
      {hasChildren && open && (
        <div className="mb-2">
          {node.children.map((c) => (
            <TreeNodeView key={c.id} node={c} isMe={false} depth={depth + 1} onOpenEmployee={onOpenEmployee} />
          ))}
        </div>
      )}
    </div>
  )
}

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
                  {t.overdue && <OverdueBadge />}
                  <StatusBadge status={t.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
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
  const [search, setSearch] = useState('')

  /** From the hierarchy tree: expand + scroll to that employee's status row. */
  function openEmployeeFromTree(id: string) {
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    requestAnimationFrame(() => {
      document
        .getElementById(`emp-row-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  useEffect(() => {
    let alive = true
    api<TeamData>('/api/team')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Could not load team data'))
    return () => {
      alive = false
    }
  }, [refreshKey, me.id])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.employees
    return data.employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.designation.toLowerCase().includes(q) ||
        e.process.toLowerCase().includes(q)
    )
  }, [data, search])

  const totals = data?.totals
  const statCards = totals
    ? [
        { label: 'Team Members', value: totals.employees, icon: Users, cls: 'bg-slate-100 text-slate-700' },
        { label: 'Total Tasks', value: totals.total, icon: ListTodo, cls: 'bg-teal-50 text-teal-700' },
        { label: 'Pending', value: totals.pending, icon: Clock3, cls: 'bg-amber-50 text-amber-700' },
        { label: 'In Progress', value: totals.inProgress, icon: Clock3, cls: 'bg-violet-50 text-violet-700' },
        { label: 'Completed', value: totals.completed, icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
        { label: 'Overdue', value: totals.overdue, icon: AlertTriangle, cls: 'bg-red-50 text-red-700' },
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
          Employee-wise task status for everyone in your reporting chain — downline only.
        </p>
      </div>

      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">{error}</CardContent>
        </Card>
      )}

      {!data && !error && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
            <Card className="border-slate-200/80 shadow-sm lg:col-span-2">
              <CardContent className="p-4">
                <h3 className="mb-3 font-semibold text-slate-900">Reporting Hierarchy</h3>
                <div className="max-h-[32rem] overflow-y-auto pr-1 [scrollbar-width:thin]">
                  <TreeNodeView node={data.tree} isMe={data.scope === 'team'} depth={0} onOpenEmployee={openEmployeeFromTree} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm lg:col-span-3">
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">Employee-wise Task Status</h3>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input placeholder="Search employees…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
                <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
                  {filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No employees match your search.</p>
                  ) : (
                    filtered.map((emp) => (
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
          </div>
        </>
      )}
    </div>
  )
}
