'use client'

import { useMemo, useState } from 'react'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import type { DirectoryUser } from './types'
import { Loader2, Megaphone, Search } from 'lucide-react'

export function SendNotificationDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  users: DirectoryUser[]
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    )
  }, [users, search])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function reset() {
    setTitle('')
    setMessage('')
    setAudience('all')
    setSelected([])
    setSearch('')
    setError(null)
  }

  function close() {
    if (busy) return
    reset()
    onOpenChange(false)
  }

  async function send() {
    if (audience === 'selected' && selected.length === 0) {
      setError('Select at least one user for a targeted notification.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const r = await api<{ sent: number }>('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          ...(audience === 'selected' ? { userIds: selected } : {}),
        }),
      })
      toast({
        title: 'Notification sent 🔔',
        description: `Delivered to ${r.sent} ${r.sent === 1 ? 'user' : 'users'}.`,
      })
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send notification')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-brand-600" /> Send Notification
          </DialogTitle>
          <DialogDescription>
            A custom push + in-app notification. Recipients see it immediately in the bell.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nt-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nt-title"
              placeholder="e.g. Stand-up moved to 4:30 PM"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nt-msg">
              Message <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="nt-msg"
              rows={3}
              placeholder="e.g. Tomorrow&apos;s stand-up is at 4:30 PM. Be on time!"
              value={message}
              maxLength={400}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Send to</Label>
            <RadioGroup value={audience} onValueChange={(v) => setAudience(v as 'all' | 'selected')} className="gap-2">
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
                <RadioGroupItem value="all" id="nt-all" />
                <Label htmlFor="nt-all" className="cursor-pointer font-normal">
                  All users ({users.length})
                </Label>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
                <RadioGroupItem value="selected" id="nt-selected" />
                <Label htmlFor="nt-selected" className="cursor-pointer font-normal">
                  Select specific users ({selected.length} selected)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {audience === 'selected' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search name, code, email…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-slate-50"
                  >
                    <Checkbox checked={selected.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-800">{u.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {u.employeeCode} · {u.designation}
                      </span>
                    </span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-slate-400">No users match.</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={send} disabled={busy || !title.trim() || !message.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
            Send Notification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}