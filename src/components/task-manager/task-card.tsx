'use client'

import { cn } from '@/lib/utils'
import { fmtTime, fmtDate } from '@/lib/dates'
import { InitialAvatar, StatusBadge, OverdueBadge } from './shared'
import type { Me, TaskDTO } from './types'
import { CalendarClock, UserRound } from 'lucide-react'

export function TaskCard({
  task,
  me,
  onOpen,
  onQuickStatus,
  busy,
}: {
  task: TaskDTO
  me: Me
  onOpen: () => void
  onQuickStatus?: (status: 'IN_PROGRESS' | 'COMPLETED') => void
  busy?: boolean
}) {
  const mine = task.assignments.find((a) => a.userId === me.id)
  const overdue = mine && mine.status !== 'COMPLETED' && new Date(task.dueDate) < new Date()
  const isToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date()) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(new Date(task.dueDate))
  const isCreator = task.creator.id === me.id
  const canQuick = onQuickStatus && mine && mine.status !== 'COMPLETED'

  return (
    <div
      className={cn(
        'group cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md',
        overdue ? 'border-red-200' : 'border-slate-200',
        busy && 'pointer-events-none opacity-60'
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      aria-label={`Task: ${task.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-emerald-700">{task.title}</h3>
          {task.description && <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{task.description}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {mine ? <StatusBadge status={mine.status} /> : <StatusBadge status="PENDING" />}
          {overdue && <OverdueBadge />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {isToday ? `Today, ${fmtTime(task.dueDate)}` : fmtDate(task.dueDate)}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" />
          {isCreator ? 'Created by you' : `By ${task.creator.name}`}
        </span>
        <div className="flex items-center -space-x-1.5" title={task.assignments.map((a) => a.user.name).join(', ')}>
          {task.assignments.slice(0, 4).map((a) => (
            <InitialAvatar key={a.id} name={a.user.name} className="h-6 w-6 border-2 border-white text-[9px]" />
          ))}
          {task.assignments.length > 4 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[9px] font-semibold text-slate-600">
              +{task.assignments.length - 4}
            </div>
          )}
        </div>
        {mine && task.assignments.length > 1 && (
          <span className="text-slate-400">
            {task.assignments.filter((a) => a.status === 'COMPLETED').length}/{task.assignments.length} done
          </span>
        )}
      </div>

      {canQuick && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
          <button
            className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
            onClick={() => onQuickStatus?.('IN_PROGRESS')}
          >
            ▶ Start working
          </button>
          <button
            className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
            onClick={() => onQuickStatus?.('COMPLETED')}
          >
            ✓ Mark done
          </button>
        </div>
      )}
    </div>
  )
}
