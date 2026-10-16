'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { InitialAvatar } from './shared'
import { api } from './api'
import { RecurrenceFields, RECURRENCE_DEFAULT, recurrencePayload, type RecurrenceValue } from './recurrence-fields'
import { parseWeekdays, type RecurFreq, type RecurEndType } from '@/lib/recurring'
import { istDateStr } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { DirectoryUser, Me, TaskDetailDTO } from './types'
import { Loader2, Pencil, Search, Users, X, Repeat, ShieldCheck } from 'lucide-react'

function dueParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Calcutta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return { date, time }
}

function recurrenceFromTask(task: TaskDetailDTO): RecurrenceValue {
  return {
    recurring: !!task.recurring,
    recurFreq: (task.recurFreq as RecurFreq) || 'WEEKLY',
    recurInterval: task.recurInterval ?? 1,
    recurEndType: (task.recurEndType as RecurEndType) || 'NEVER',
    recurEndDate: task.recurEndDate ? istDateStr(new Date(task.recurEndDate)) : '',
    recurCount: task.recurCount ?? 4,
    recurDays: parseWeekdays(task.recurWeekdays),
    recurMonthDay: task.recurMonthDay ? String(task.recurMonthDay) : '',
  }
}

/**
 * Full task editor for the creator / a manager / the admin. Unlike the inline
 * quick-edit, this exposes every detail of a task: title, description, due date
 * & time, assignees, the optional validator and the recurrence schedule.
 */
export function EditTaskDialog({
  open,
  task,
  me,
  onClose,
  onSaved,
}: {
  open: boolean
  task: TaskDetailDTO
  me: Me
  onClose: () => void
  onSaved: (task: TaskDetailDTO) => void
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('18:00')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [validatorId, setValidatorId] = useState('')
  const [recur, setRecur] = useState<RecurrenceValue>(RECURRENCE_DEFAULT)
  const [scope, setScope] = useState<'single' | 'future'>('single')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const isSeries = !!task.recurring && !!task.recurFreq

  useEffect(() => {
    if (!open) return
    const dp = dueParts(task.dueDate)
    setTitle(task.title)
    setDescription(task.description || '')
    setDate(dp.date)
    setTime(dp.time)
    setSelected(new Set(task.assignments.map((a) => a.userId)))
    setValidatorId(task.validator?.id || '')
    setRecur(recurrenceFromTask(task))
    setScope('single')
    setSearch('')
    setError(null)
    setLoadingUsers(true)
    api<{ users: DirectoryUser[] }>('/api/users')
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [open, task])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        u.designation.toLowerCase().includes(q)
    )
  }, [users, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setError(null)
    if (!title.trim()) return setError('Please enter a task title')
    if (!date) return setError('Please pick a due date')
    if (selected.size === 0) return setError('A task must keep at least one assignee')
    if (recur.recurring && recur.recurEndType === 'ON_DATE' && !recur.recurEndDate)
      return setError('Pick the date the series should end on')
    if (recur.recurring && recur.recurEndType === 'AFTER_N' && recur.recurCount < 2)
      return setError('Occurrence count must be at least 2')
    if (recur.recurring && recur.recurFreq === 'WEEKLY' && recur.recurDays.length === 0 && recur.recurInterval > 4)
      return setError('Weekly interval looks too large — pick repeat days or a smaller interval')

    const current = new Set(task.assignments.map((a) => a.userId))
    const addAssigneeIds = [...selected].filter((id) => !current.has(id))
    const removeAssigneeIds = [...current].filter((id) => !selected.has(id))

    setBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          dueDate: { date, time: time || '18:00' },
          addAssigneeIds,
          removeAssigneeIds,
          validatorId,
          ...recurrencePayload(recur),
          ...(isSeries ? { applyTo: scope } : {}),
        }),
      })
      onSaved(res.task)
      onClose()
      toast({
        title: 'Task updated',
        description: isSeries && scope === 'future' ? 'Changes applied to this and all future occurrences.' : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task')
    } finally {
      setBusy(false)
    }
  }

  const selectedUsers = users.filter((u) => selected.has(u.id))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-brand-600" /> Edit task
          </DialogTitle>
          <DialogDescription>Update any detail of this task. Every change is recorded in the task history.</DialogDescription>
        </DialogHeader>

        <form
          id="edit-task-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 [scrollbar-width:thin]"
        >
          <div className="space-y-2">
            <Label htmlFor="e-title">Task title *</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-desc">Description</Label>
            <Textarea id="e-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-date">Due date *</Label>
              <Input id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-time">Due time (IST)</Label>
              <Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <RecurrenceFields value={recur} onChange={(patch) => setRecur((prev) => ({ ...prev, ...patch }))} />

          {isSeries && (
            <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <Repeat className="h-3.5 w-3.5" /> This is a recurring task
              </p>
              <p className="text-xs text-slate-500">Where should these changes apply?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={scope === 'single'}
                  onClick={() => setScope('single')}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition',
                    scope === 'single' ? 'border-brand-500 bg-white ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-brand-300'
                  )}
                >
                  <span className="block text-sm font-medium text-slate-800">This task only</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Just the current occurrence</span>
                </button>
                <button
                  type="button"
                  aria-pressed={scope === 'future'}
                  onClick={() => setScope('future')}
                  className={cn(
                    'rounded-lg border p-2.5 text-left transition',
                    scope === 'future' ? 'border-brand-500 bg-white ring-1 ring-brand-500' : 'border-slate-200 bg-white hover:border-brand-300'
                  )}
                >
                  <span className="block text-sm font-medium text-slate-800">This and all future tasks</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Update every upcoming occurrence</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-brand-600" /> Assigned to <span className="text-slate-400">({selected.size} selected)</span>
              </Label>
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-brand-200 bg-brand-50/60 p-2">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                    {u.name}
                    <button type="button" aria-label={`Remove ${u.name}`} onClick={() => toggle(u.id)} className="text-slate-400 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search by name, code or designation…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5 [scrollbar-width:thin]">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading employees…
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No employees found</p>
              ) : (
                filtered.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50">
                    <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                    <InitialAvatar name={u.name} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {u.name} <span className="font-normal text-slate-400">· {u.employeeCode}</span>
                        {u.id === me.id && <span className="text-brand-600"> (you)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.designation}{u.process ? ` · ${u.process}` : ''}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-validator" className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Validator / collation <span className="text-slate-400">(optional)</span>
            </Label>
            <select
              id="e-validator"
              value={validatorId}
              onChange={(e) => setValidatorId(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">No validator</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employeeCode}){u.process ? ` · ${u.process}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              If you choose a validator, every assignee must send their completed part to this person, who can approve it
              or reopen it with a comment.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
        </form>

        <DialogFooter className="shrink-0 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="edit-task-form" disabled={busy || !title.trim() || !date}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
