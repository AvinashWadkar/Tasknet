'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InitialAvatar, StatusBadge, OverdueBadge, AbortedBadge } from './shared'
import type { TeamEmployee } from './types'
import { fmtDate, delayLabel } from '@/lib/dates'
import {
  Users,
  ListTodo,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Ban,
  ChevronRight,
  Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMemo } from 'react'

export type TeamStatKey = 'members' | 'total' | 'pending' | 'inProgress' | 'completed' | 'overdue' | 'aborted'

export interface TeamStatBucket {
  key: TeamStatKey
  label: string
  value: number
}

const ICON: Record<TeamStatKey, LucideIcon> = {
  members: Users,
  total: ListTodo,
  pending: Clock3,
  inProgress: Clock3,
  completed: CheckCircle2,
  overdue: AlertTriangle,
  aborted: Ban,
}

const HEAD_CLS: Record<TeamStatKey, string> = {
  members: 'bg-slate-100 text-slate-700',
  total: 'bg-brand-50 text-brand-700',
  pending: 'bg-amber-50 text-amber-700',
  inProgress: 'bg-violet-50 text-violet-700',
  completed: 'bg-brand-50 text-brand-700',
  overdue: 'bg-red-50 text-red-700',
  aborted: 'bg-red-100 text-red-700',
}

const DESC: Record<TeamStatKey, string> = {
  members: 'Employees in your team under the current scope.',
  total: 'Every task assignment in your team — a task shared by several people counts once per person.',
  pending: 'Open and not yet started, excluding aborted tasks.',
  inProgress: 'Currently being worked on, excluding aborted tasks.',
  completed: 'Finished tasks in your team.',
  overdue: 'Past due date and still open (never includes aborted tasks).',
  aborted: 'Stopped/withdrawn tasks in your team.',
}

/** One assignment row (task + the employee it belongs to). */
interface AssignmentRow {
  taskId: string
  title: string
  dueDate: string
  assignedBy: string
  status: string
  overdue: boolean
  aborted: boolean
  employeeName: string
  employeeId: string
}

export function TeamStatDialog({
  bucket,
  employees,
  onClose,
  onOpenTask,
}: {
  bucket: TeamStatBucket | null
  employees: TeamEmployee[]
  onClose: () => void
  onOpenTask: (id: string) => void
}) {
  const Icon = bucket ? ICON[bucket.key] : null

  // Every assignment across the downline (employees[].tasks is one row per assignee).
  const allAssignments = useMemo<AssignmentRow[]>(() => {
    const out: AssignmentRow[] = []
    for (const emp of employees) {
      for (const t of emp.tasks) {
        out.push({
          taskId: t.id,
          title: t.title,
          dueDate: t.dueDate,
          assignedBy: t.assignedBy,
          status: t.status,
          overdue: t.overdue,
          aborted: t.aborted,
          employeeName: emp.name,
          employeeId: emp.id,
        })
      }
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [employees])

  const rows = useMemo(() => {
    if (!bucket) return []
    if (bucket.key === 'members') return []
    switch (bucket.key) {
      case 'total':
        return allAssignments
      case 'pending':
        return allAssignments.filter((a) => !a.aborted && a.status === 'PENDING')
      case 'inProgress':
        return allAssignments.filter((a) => !a.aborted && a.status === 'IN_PROGRESS')
      case 'completed':
        return allAssignments.filter((a) => !a.aborted && a.status === 'COMPLETED')
      case 'overdue':
        return allAssignments.filter((a) => a.overdue)
      case 'aborted':
        return allAssignments.filter((a) => a.aborted)
    }
  }, [bucket, allAssignments])

  return (
    <Dialog open={bucket !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {bucket && Icon && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2.5 pr-6">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${HEAD_CLS[bucket.key]}`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>{bucket.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  {bucket.value}
                </span>
              </DialogTitle>
              <DialogDescription>{DESC[bucket.key]}</DialogDescription>
            </DialogHeader>

            {bucket.key === 'members' ? (
              <ul className="-mr-1 max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label="Team members list">
                {employees.length === 0 ? (
                  <Empty />
                ) : (
                  [...employees]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((emp) => (
                      <li key={emp.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <InitialAvatar name={emp.name} className="h-9 w-9 text-xs" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {emp.name} <span className="font-normal text-slate-400">· {emp.employeeCode}</span>
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {emp.designation} · {emp.process}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {emp.stats.total} task{emp.stats.total === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))
                )}
              </ul>
            ) : rows.length === 0 ? (
              <Empty />
            ) : (
              <ul className="-mr-1 max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label={`${bucket.label} task list`}>
                {rows.map((r, i) => (
                  <li key={`${r.taskId}-${r.employeeId}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onOpenTask(r.taskId)
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm"
                    >
                      <InitialAvatar name={r.employeeName} className="h-8 w-8 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.employeeName} · Due {fmtDate(r.dueDate)} · by {r.assignedBy}
                          {r.overdue && (
                            <span className="font-semibold text-red-600"> · Delayed by {delayLabel(r.dueDate)}</span>
                          )}
                        </p>
                      </div>
                      {r.aborted ? (
                        <AbortedBadge />
                      ) : (
                        <>
                          {r.overdue && <OverdueBadge />}
                          <StatusBadge status={r.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'} />
                        </>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {bucket.key !== 'members' && (
              <p className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Each row is one person&apos;s assignment — click to view the task&apos;s full details.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Empty() {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
      Nothing here right now.
    </p>
  )
}