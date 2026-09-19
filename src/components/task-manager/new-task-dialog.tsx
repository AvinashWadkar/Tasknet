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
import { InitialAvatar } from './shared'
import { api } from './api'
import type { DirectoryUser } from './types'
import { Loader2, Plus, Search, Users, X } from 'lucide-react'

export function NewTaskDialog({
  open,
  onClose,
  defaultDate,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  defaultDate?: string
  onCreated: () => void
}) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(defaultDate || '')
  const [time, setTime] = useState('18:00')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setDate(defaultDate || '')
    setTime('18:00')
    setSelected(new Set())
    setSearch('')
    setError(null)
    setLoadingUsers(true)
    api<{ users: DirectoryUser[] }>('/api/users')
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [open, defaultDate])

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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Please enter a task title')
    if (!date) return setError('Please pick a due date')
    if (selected.size === 0) return setError('Please select at least one employee to assign')
    setBusy(true)
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          dueDate: { date, time },
          assigneeIds: [...selected],
        }),
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create task')
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
            <Plus className="h-5 w-5 text-emerald-600" /> Create New Task
          </DialogTitle>
          <DialogDescription>Assign a task to one or more employees — everyone assigned can track it together.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1 [scrollbar-width:thin]">
          <div className="space-y-2">
            <Label htmlFor="t-title">Task title *</Label>
            <Input id="t-title" placeholder="e.g. Prepare daily MIS report" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" placeholder="Add details, links or instructions…" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-date">Due date *</Label>
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-time">Due time (IST)</Label>
              <Input id="t-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-emerald-600" /> Assign to employees * <span className="text-slate-400">({selected.size} selected)</span>
              </Label>
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2">
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

            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1.5 [scrollbar-width:thin]">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading employees…
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No employees found</p>
              ) : (
                filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50"
                  >
                    <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                    <InitialAvatar name={u.name} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {u.name} <span className="font-normal text-slate-400">· {u.employeeCode}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.designation}{u.process ? ` · ${u.process}` : ''}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <DialogFooter className="border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create & Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
