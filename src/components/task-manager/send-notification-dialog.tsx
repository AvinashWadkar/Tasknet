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
import { api } from './api'
import type { DirectoryUser } from './types'
import type { PushDispatch } from '@/lib/webpush'
import { ArrowRightLeft, CheckCircle2, Loader2, Megaphone, Search, TriangleAlert, Wrench, XCircle } from 'lucide-react'

const AUTH_STEPS = [
  'You must be signed in as an Administrator to send broadcast notifications.',
  'Sign out and sign back in with the admin account, then try again.',
  'Still failing? Ask the administrator to check the server logs for /api/admin/notifications.',
]

const FIELD_STEPS = [
  'The broadcast was rejected because required details are missing or invalid.',
  'Confirm the Title and Message fields have valid content.',
  'If you targeted specific users, confirm at least one user is selected.',
]

const GENERIC_STEPS = [
  'The server could not deliver this broadcast.',
  'Check that you are signed in and have a stable connection.',
  'If the issue persists, ask the administrator to review the server logs for /api/admin/notifications.',
]

const PUSH_STEPS: Record<string, string[]> = {
  'no-config': [
    'Native web push is disabled on this server because the VAPID keys are missing.',
    'Ask the administrator to set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT on the server environment.',
    'Rebuild and redeploy the app, then repeat this broadcast.',
  ],
  'no-subs': [
    'None of the recipients has registered a browser for native popups, so they only got the in-app bell notification.',
    'Recipients: click the bell → "Enable browser popups" → Allow, then reload the page.',
    'Run "Send test notification" from their side to confirm a popup arrives, then repeat this broadcast.',
  ],
  failures: [
    'Some registered browsers rejected the popup — usually the subscription is stale or was made under a different VAPID key (for example localhost vs the live site).',
    'Ask those recipients to reload Tasknet once: the app re-registers the subscription automatically when the keys changed.',
    'If it persists, they should reset the site notification permission (browser Site settings → Notifications → Reset → Allow) and reload.',
  ],
}

function pushIssue(w?: PushDispatch): keyof typeof PUSH_STEPS | null {
  if (!w) return null
  if (!w.configured) return 'no-config'
  if (w.subscriptions === 0) return 'no-subs'
  if (w.failures > 0 || w.dispatched < w.subscriptions) return 'failures'
  return null
}

function fixSteps(err: string): string[] {
  const e = err.toLowerCase()
  if (/(unauthori|permission|forbidden|403|401)/.test(e)) return AUTH_STEPS
  if (/title|message/.test(e)) return FIELD_STEPS
  return GENERIC_STEPS
}

export function SendNotificationDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  users: DirectoryUser[]
}) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'selected'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ sent: number; webPush?: PushDispatch } | null>(null)
  const [showSteps, setShowSteps] = useState(false)

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
    setSendState('idle')
    setResult(null)
    setShowSteps(false)
  }

  function close() {
    if (sendState === 'sending') return
    reset()
    onOpenChange(false)
  }

  async function send() {
    if (audience === 'selected' && selected.length === 0) {
      setSendState('error')
      setError('Select at least one user for a targeted notification.')
      return
    }
    setError(null)
    setShowSteps(false)
    setSendState('sending')
    try {
      const r = await api<{ sent: number; webPush?: PushDispatch }>('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          ...(audience === 'selected' ? { userIds: selected } : {}),
        }),
      })
      setResult(r)
      setSendState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send notification')
      setSendState('error')
    }
  }

  const busy = sendState === 'sending'
  const issue = pushIssue(result?.webPush)
  const steps = sendState === 'error' && error ? fixSteps(error) : []

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent showCloseButton={false} className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className={sendState === 'success' ? 'text-center sm:text-center' : ''}>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-brand-600" /> Send Notification
          </DialogTitle>
          <DialogDescription>
            A custom push + in-app notification. Recipients see it immediately in the bell.
          </DialogDescription>
        </DialogHeader>

        {sendState === 'success' ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center" role="status">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-emerald-800">
                Notification delivered to {result?.sent ?? 0} {result?.sent === 1 ? 'user' : 'users'} in-app.
              </p>
              <p className="text-xs leading-snug text-emerald-700">Recipients see it in their bell right away.</p>
            </div>

            {(() => {
              const w = result?.webPush
              if (!w) return null
              if (issue) {
                return (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <p className="text-xs leading-snug text-amber-800">
                      {!w.configured
                        ? 'Native popups are disabled on this server — VAPID keys are missing. Recipients got the in-app bell only.'
                        : w.subscriptions === 0
                        ? 'No recipient has registered a browser for native popups yet — they got the in-app bell only.'
                        : w.pruned > 0
                        ? `${w.dispatched} of ${w.subscriptions} registered browser${w.subscriptions === 1 ? '' : 's'} received the popup; ${w.pruned} stale registration${w.pruned === 1 ? '' : 's'} were removed and need refreshing.`
                        : `${w.dispatched} of ${w.subscriptions} registered browser${w.subscriptions === 1 ? '' : 's'} received the popup; ${w.failures} were rejected (stale subscription or changed VAPID key).`}
                    </p>
                  </div>
                )
              }
              return (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <p className="text-xs leading-snug text-emerald-800">
                    Native popups fired for all {w.subscriptions} registered browser{w.subscriptions === 1 ? '' : 's'}.
                  </p>
                </div>
              )
            })()}

            {issue && PUSH_STEPS[issue].length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between bg-white"
                  onClick={() => setShowSteps((s) => !s)}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <Wrench className="h-3.5 w-3.5" /> How to fix it
                  </span>
                  <ArrowRightLeft className={showSteps ? 'h-3.5 w-3.5 rotate-180 transition-transform' : 'h-3.5 w-3.5 transition-transform'} />
                </Button>
                {showSteps && (
                  <ol className="list-decimal space-y-1.5 px-4 py-3 pl-8 text-xs leading-relaxed text-slate-600">
                    {PUSH_STEPS[issue].map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        ) : (
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
                disabled={busy}
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
                disabled={busy}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Send to</Label>
              <RadioGroup value={audience} onValueChange={(v) => setAudience(v as 'all' | 'selected')} className="gap-2">
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
                  <RadioGroupItem value="all" id="nt-all" disabled={busy} />
                  <Label htmlFor="nt-all" className="cursor-pointer font-normal">
                    All users ({users.length})
                  </Label>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2">
                  <RadioGroupItem value="selected" id="nt-selected" disabled={busy} />
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
                    disabled={busy}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                  {filtered.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-slate-50"
                    >
                      <Checkbox checked={selected.includes(u.id)} onCheckedChange={() => toggle(u.id)} disabled={busy} />
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

            {(sendState === 'error' || error) && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <p className="flex items-center gap-1.5 font-medium">
                  <XCircle className="h-4 w-4 shrink-0" /> {error}
                </p>
              </div>
            )}

            {sendState === 'error' && steps.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between bg-white"
                  onClick={() => setShowSteps((s) => !s)}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold">
                    <Wrench className="h-3.5 w-3.5" /> How to fix it
                  </span>
                  <ArrowRightLeft className={showSteps ? 'h-3.5 w-3.5 rotate-180 transition-transform' : 'h-3.5 w-3.5 transition-transform'} />
                </Button>
                {showSteps && (
                  <ol className="list-decimal space-y-1.5 px-4 py-3 pl-8 text-xs leading-relaxed text-slate-600">
                    {steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          {sendState === 'success' ? (
            <Button className="w-full sm:w-auto" onClick={close}>
              OK
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={send} disabled={busy || !title.trim() || !message.trim()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
                {busy ? 'Sending…' : 'Send Notification'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}