'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from './shared'
import { viewerStatus } from './shared'
import type { Me, TaskDTO, TaskStatus } from './types'
import { fmtDate, fmtTime, delayLabel } from '@/lib/dates'
import { recurrenceLabel } from '@/lib/recurring'
import { AlarmClock, ChevronRight, Info, Repeat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type StatKey = 'overdue' | 'dueToday' | 'inProgress' | 'completed'

export interface StatBucket {
  key: StatKey
  label: string
  icon: LucideIcon
  tasks: TaskDTO[]
}

const HEAD_ICON: Record<StatKey, string> = {
  overdue: 'bg-red-100 text-red-600',
  dueToday: 'bg-brand-100 text-brand-600',
  inProgress: 'bg-violet-100 text-violet-600',
  completed: 'bg-emerald-100 text-emerald-600',
}

const BUCKET_DESC: Record<StatKey, string> = {
  overdue: 'Tasks assigned to you that are past their due date and still open.',
  dueToday: 'Tasks assigned to you that are due today and not yet completed.',
  inProgress: 'Tasks assigned to you that are currently in progress.',
  completed: 'Tasks you have completed, newest first.',
}

export function StatListDialog({
  bucket,
  me,
  onClose,
  onOpenTask,
}: {
  bucket: StatBucket | null
  me: Me
  onClose: () => void
  onOpenTask: (id: string) => void
}) {
  const Icon = bucket?.icon
  return (
    <Dialog open={bucket !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {bucket && Icon && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2.5 pr-6">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${HEAD_ICON[bucket.key]}`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>{bucket.label} Tasks</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                  {bucket.tasks.length}
                </span>
              </DialogTitle>
              <DialogDescription>{BUCKET_DESC[bucket.key]}</DialogDescription>
            </DialogHeader>

            {bucket.tasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
                Nothing here right now.
              </p>
            ) : (
              <ul className="-mr-1 max-h-96 space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" aria-label={`${bucket.label} task list`}>
                {bucket.tasks.map((t) => (
                  <li key={t.id}>
                    <StatTaskRow
                      task={t}
                      me={me}
                      bucketKey={bucket.key}
                      onOpen={() => {
                        onClose()
                        onOpenTask(t.id)
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            <p className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-400">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Click any task to view its full details.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatTaskRow({
  task,
  me,
  bucketKey,
  onOpen,
}: {
  task: TaskDTO
  me: Me
  bucketKey: StatKey
  onOpen: () => void
}) {
  const status: TaskStatus = viewerStatus(task, me.id)
  const myA = task.assignments.find((a) => a.userId === me.id)
  const isOverdue =
    task.status !== 'ABORTED' && status !== 'COMPLETED' && new Date(task.dueDate) < new Date()
  const delayed = isOverdue ? delayLabel(task.dueDate) : ''
  const repeats = task.recurring && task.recurFreq ? recurrenceLabel(task) : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {bucketKey === 'completed' ? (
            <span>
              Completed{' '}
              {myA?.completedAt ? (
                <>
                  on <span className="font-medium text-slate-600">{fmtDate(myA.completedAt)}</span>
                </>
              ) : (
                ''
              )}
            </span>
          ) : isOverdue ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 font-medium text-red-600">
              <AlarmClock className="h-3 w-3" aria-hidden="true" />
              Delayed by {delayed || 'some time'}
            </span>
          ) : (
            <span>
              Due{' '}
              <span className="font-medium text-slate-600">
                {fmtDate(task.dueDate)}, {fmtTime(task.dueDate)}
              </span>
            </span>
          )}
          <StatusBadge status={status} />
          {repeats && (
            <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
              <Repeat className="h-3 w-3" aria-hidden="true" />
              {repeats}
            </span>
          )}
          <span className="text-slate-400">By {task.creator.name}</span>
        </div>
      </div>
      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500"
        aria-hidden="true"
      />
    </button>
  )
}
