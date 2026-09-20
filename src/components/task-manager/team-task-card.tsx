'use client'

import { cn } from '@/lib/utils'
import { fmtTime, fmtDate, delayLabel } from '@/lib/dates'
import { recurrenceLabel } from '@/lib/recurring'
import { InitialAvatar, StatusBadge, OverdueBadge, AbortedBadge, viewerStatus } from './shared'
import { STATUS_LABEL, type TaskDTO } from './types'
import { CalendarClock, UserRound, AlarmClock, CheckCircle2, Repeat } from 'lucide-react'

/**
 * Card for a TEAM task on a manager's home page. The viewer has no
 * assignment on it, so it shows the aggregate status of all assignees,
 * who created it, and how many parts are already done.
 */
export function TeamTaskCard({
  task,
  onOpen,
}: {
  task: TaskDTO
  onOpen: () => void
}) {
  const aborted = task.status === 'ABORTED'
  const total = task.assignments.length
  const done = task.assignments.filter((a) => a.status === 'COMPLETED').length
  const open = done < total
  const overdue = !aborted && open && new Date(task.dueDate) < new Date()
  const overall = viewerStatus(task, '')
  const isToday =
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date()) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date(task.dueDate))

  return (
    <div
      className={cn(
        'group min-w-0 cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md',
        overdue ? 'border-red-200' : 'border-slate-200',
        aborted && 'bg-slate-50/80 hover:border-slate-200 hover:shadow-sm'
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      aria-label={`Team task: ${task.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              'truncate font-semibold',
              aborted ? 'text-slate-500' : 'text-slate-900 group-hover:text-brand-700'
            )}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{task.description}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {aborted ? (
            <AbortedBadge />
          ) : (
            <>
              <StatusBadge status={overall} />
              {overdue && <OverdueBadge />}
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {isToday && !overdue
            ? `Today, ${fmtTime(task.dueDate)}`
            : `${fmtDate(task.dueDate)}, ${fmtTime(task.dueDate)}`}
        </span>
        {overdue && (
          <span className="inline-flex items-center gap-1 font-semibold text-red-600">
            <AlarmClock className="h-3.5 w-3.5" />
            Delayed by {delayLabel(task.dueDate)}
          </span>
        )}
        {!aborted && total > 0 && done === total && (
          <span className="inline-flex items-center gap-1 font-medium text-brand-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All {total} completed
          </span>
        )}
        {task.recurring && recurrenceLabel(task) && (
          <span className="inline-flex items-center gap-1 font-medium text-brand-600">
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            {recurrenceLabel(task)}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" />
          By {task.creator.name}
        </span>
        <div
          className="flex items-center -space-x-1.5"
          title={task.assignments.map((a) => `${a.user.name} — ${STATUS_LABEL[a.status]}`).join(', ')}
        >
          {task.assignments.slice(0, 4).map((a) => (
            <InitialAvatar
              key={a.id}
              name={a.user.name}
              className={cn('h-6 w-6 border-2 border-white text-[9px]', a.status === 'COMPLETED' && 'opacity-55')}
            />
          ))}
          {task.assignments.length > 4 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-semibold text-slate-600">
              +{task.assignments.length - 4}
            </div>
          )}
        </div>
        {total > 1 && !aborted && (
          <span className="text-slate-400">
            {done}/{total} done
          </span>
        )}
      </div>
    </div>
  )
}
