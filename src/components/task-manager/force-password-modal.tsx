'use client'

import { useState } from 'react'
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
import { Loader2, KeyRound, LogOut, ShieldAlert } from 'lucide-react'
import { api } from './api'

/**
 * Mandatory popup on first login — cannot be dismissed until the employee
 * sets their own password. Also allows logging out instead.
 */
export function ForcePasswordModal({
  employeeCode,
  onDone,
  onLogout,
}: {
  employeeCode: string
  onDone: () => void
  onLogout: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('Digitide@123')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const policyOk =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match')
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <DialogTitle>Set your own password</DialogTitle>
          <DialogDescription>
            Hi <span className="font-medium text-slate-700">{employeeCode}</span> — this is your first
            login, so you must set a new password before you can continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="curpw">Current password</Label>
            <Input
              id="curpw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newpw">New password</Label>
            <Input
              id="newpw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
            />
            <ul className="space-y-0.5 text-xs text-slate-500">
              <li className={policyOk ? 'text-brand-600' : ''}>
                Min 8 characters with an uppercase letter, lowercase letter, number and special character
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confpw">Confirm new password</Label>
            <Input
              id="confpw"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={onLogout} className="text-slate-500">
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
            <Button type="submit" disabled={busy || !policyOk}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Set password & continue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
