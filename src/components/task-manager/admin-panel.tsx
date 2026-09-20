'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import type { DirectoryUser } from './types'
import { fmtDate } from '@/lib/dates'
import {
  Loader2, UserPlus, Search, ShieldCheck, Users2, KeyRound,
  Eye, EyeOff, Copy,
} from 'lucide-react'

const EMPTY = {
  employeeCode: '',
  name: '',
  email: '',
  process: '',
  designation: '',
  managerName: '',
  managerEmail: '',
}

/** Masked password with per-row reveal + copy — visible to the admin only. */
function PasswordCell({ password }: { password?: string | null }) {
  const { toast } = useToast()
  const [show, setShow] = useState(false)

  if (!password) {
    return <span className="text-xs text-slate-300">Not set</span>
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password || '')
      toast({ title: 'Password copied', description: 'The password is now on your clipboard.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Please reveal the password and copy it manually.' })
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <code className="max-w-[8.5rem] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
        {show ? password : '••••••••'}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-700"
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-700"
        aria-label="Copy password"
        title="Copy password"
        onClick={copy}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function AdminPanel({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<DirectoryUser[] | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ ...EMPTY })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset-password dialog state
  const [resetTarget, setResetTarget] = useState<DirectoryUser | null>(null)
  const [resetPw, setResetPw] = useState('Digitide@123')
  const [resetBusy, setResetBusy] = useState(false)

  async function loadUsers() {
    try {
      const r = await api<{ users: DirectoryUser[] }>('/api/users')
      setUsers(r.users)
    } catch {
      setUsers([])
    }
  }

  useEffect(() => {
    loadUsers()
  }, [refreshKey])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.employeeCode.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q) ||
        (u.process || '').toLowerCase().includes(q)
    )
  }, [users, search])

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api<{ managerLinked: boolean; defaultPassword: string }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      toast({
        title: 'Employee ID created ✅',
        description: `${form.name} (${form.employeeCode}) can log in with the default password. They must set their own password on first login. You can view or copy their password from the All Users table.`,
      })
      setForm({ ...EMPTY })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user')
    } finally {
      setBusy(false)
    }
  }

  function openReset(u: DirectoryUser) {
    setResetTarget(u)
    setResetPw('Digitide@123')
  }

  async function doReset() {
    if (!resetTarget) return
    setResetBusy(true)
    try {
      const r = await api<{ password: string; forcedChange: boolean }>(
        `/api/users/${resetTarget.id}/reset-password`,
        { method: 'POST', body: JSON.stringify({ password: resetPw.trim() || undefined }) }
      )
      toast({
        title: `Password reset — ${resetTarget.name}`,
        description: `New password: ${r.password}. They must set their own password at next login.`,
      })
      setResetTarget(null)
      await loadUsers()
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setResetBusy(false)
    }
  }

  const fields: { key: keyof typeof EMPTY; label: string; placeholder: string; type?: string; required?: boolean }[] = [
    { key: 'employeeCode', label: 'Employee Code', placeholder: 'e.g. EMP010', required: true },
    { key: 'name', label: 'Employee Name', placeholder: 'e.g. Avinash Sharma', required: true },
    { key: 'email', label: 'Email ID', placeholder: 'e.g. avinash@digitide.com', type: 'email', required: true },
    { key: 'process', label: 'Process', placeholder: 'e.g. Customer Support', required: true },
    { key: 'designation', label: 'Designation', placeholder: 'e.g. Executive / TL / AM / DM', required: true },
    { key: 'managerName', label: 'L1 Manager Name', placeholder: 'e.g. Priya Nair' },
    { key: 'managerEmail', label: 'L1 Manager Email ID', placeholder: 'e.g. priya@digitide.com', type: 'email' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> Admin — User Management
        </h2>
        <p className="text-sm text-slate-500">Only you can create employee IDs. Hierarchy links automatically by L1 Manager Email.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        {/* Create user */}
        <Card className="border-slate-200/80 shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-brand-600" /> Create Employee ID
            </CardTitle>
            <CardDescription>New users get the default password and must change it at first login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`f-${f.key}`}>
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </Label>
                  <Input
                    id={`f-${f.key}`}
                    type={f.type || 'text'}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    required={f.required}
                  />
                </div>
              ))}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Create User ID
              </Button>

              <p className="flex items-start gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Default password: <code className="font-bold">Digitide@123</code> — mandatory change on first login.
                  You can view or copy every user&apos;s current password from the All Users table.
                </span>
              </p>
            </form>
          </CardContent>
        </Card>

        {/* Users list */}
        <Card className="border-slate-200/80 shadow-sm xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users2 className="h-4 w-4 text-brand-600" /> All Users
                {users && <span className="text-sm font-normal text-slate-400">({users.length})</span>}
              </CardTitle>
              <CardDescription>
                Every employee ID in the system. Passwords are visible to you (admin) only.
              </CardDescription>
            </div>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="max-h-[34rem] overflow-auto rounded-lg border border-slate-100 [scrollbar-width:thin]">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Employee</th>
                      <th className="px-3 py-2.5 font-semibold">Password</th>
                      <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Process / Designation</th>
                      <th className="hidden px-3 py-2.5 font-semibold md:table-cell">L1 Manager</th>
                      <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Created</th>
                      <th className="hidden px-3 py-2.5 text-right font-semibold md:table-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((u) => (
                      <tr key={u.id} className="transition hover:bg-brand-50/40">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800">
                            {u.name} {u.role === 'ADMIN' && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">ADMIN</span>}
                          </p>
                          <p className="break-all text-xs text-slate-500">{u.employeeCode} · {u.email}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <PasswordCell password={u.password} />
                        </td>
                        <td className="hidden px-3 py-2.5 text-slate-600 sm:table-cell">
                          <p>{u.process}</p>
                          <p className="text-xs text-slate-400">{u.designation}</p>
                        </td>
                        <td className="hidden px-3 py-2.5 text-slate-600 md:table-cell">
                          {u.managerName ? (
                            <>
                              <p>{u.managerName}</p>
                              <p className="break-all text-xs text-slate-400">{u.managerEmail}</p>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-slate-500 lg:table-cell">
                          {u.createdAt ? fmtDate(u.createdAt) : '—'}
                        </td>
                        <td className="hidden px-3 py-2.5 text-right md:table-cell">
                          {u.role !== 'ADMIN' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
                              aria-label={`Reset password for ${u.name}`}
                              title="Reset password"
                              onClick={() => openReset(u)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                          No users match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reset password confirmation */}
      <AlertDialog open={resetTarget !== null} onOpenChange={(o) => { if (!o) setResetTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-600" />
              Reset password for {resetTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Set a new password for <strong>{resetTarget?.employeeCode}</strong>. The user will be
                    required to set their own password when they next log in.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-pw">New password</Label>
                  <Input
                    id="reset-pw"
                    value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)}
                    placeholder="Digitide@123"
                    autoComplete="off"
                  />
                  <p className="text-xs text-slate-500">Leave as the default <code>Digitide@123</code> or type a custom one.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetBusy}
              onClick={(e) => {
                // Prevent the dialog from closing before the async reset completes
                e.preventDefault()
                doReset()
              }}
            >
              {resetBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
