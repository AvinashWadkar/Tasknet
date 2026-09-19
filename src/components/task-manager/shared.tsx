'use client'

import { Badge } from '@/components/ui/badge'
import { Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, type TaskStatus } from './types'

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const styles: Record<TaskStatus, string> = {
    PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
    IN_PROGRESS: 'bg-violet-100 text-violet-800 border-violet-200',
    COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  }
  return (
    <Badge variant="outline" className={cn(styles[status], 'font-medium', className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 font-medium">
      Overdue
    </Badge>
  )
}

export function AbortedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className="gap-1 border-red-300 bg-red-600 font-medium text-white">
      <Ban className="h-3 w-3" aria-hidden="true" />
      Aborted
    </Badge>
  )
}

const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-teal-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
]

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function InitialAvatar({
  name,
  className,
  colorIndex,
}: {
  name: string
  className?: string
  colorIndex?: number
}) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const color = AVATAR_COLORS[(colorIndex ?? hash) % AVATAR_COLORS.length]
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white select-none',
        color,
        className
      )}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </div>
  )
}
