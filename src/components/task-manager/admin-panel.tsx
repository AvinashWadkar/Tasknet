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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import { BulkCreateDialog } from './bulk-create-dialog'
import type { DirectoryUser, Me } from './types'
import { fmtDate } from '@/lib/dates'
import {
  Loader2, UserPlus, Search, ShieldCheck, Users2, KeyRound,
  Eye, EyeOff, Copy, FileUp, Pencil, Trash2,
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

const EDIT_EMPTY = { ...EMPTY, role: 'EMPLOYEE' }

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

/** Edit / Delete / Reset-Password row actions shared by the table (md+) and mobile cards. */
function RowActions({
  user,
  me,
  onEdit,
  onDelete,
  onReset,
}: {
  user: DirectoryUser
  me: Me
  onEdit: (u: DirectoryUser) => void
  onDelete: (u: DirectoryUser) => void
  onReset: (u: DirectoryUser) => void
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
        aria-label={`Edit ${user.name}`}
        title="Edit user"
        onClick={() => onEdit(user)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {user.id !== me.id && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${user.name}`}
          title="Delete user"
          onClick={() => onDelete(user)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      {user.role !== 'ADMIN' && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
          aria-label={`Reset password for ${user.name}`}
          title="Reset password"
          onClick={() => onReset(user)}
        >
          <KeyRound className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  )
}

export function AdminPanel({ me, refreshKey }: { me: Me; refreshKey: number }) {
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

  // Edit-user dialog state
  const [editTarget, setEditTarget] = useState<DirectoryUser | null>(null)
  const [editForm, setEditForm] = useState({ ...EDIT_EMPTY })
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  // Delete-user dialog state
  const [deleteTarget, setDeleteTarget] = useState<DirectoryUser | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Bulk-create-via-Excel dialog state
  const [bulkOpen, setBulkOpen] = useState(false)

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

  function openEdit(u: DirectoryUser) {
    setEditForm({
      employeeCode: u.employeeCode,
      name: u.name,
      email: u.email,
      process: u.process,
      designation: u.designation,
      managerName: u.managerName || '',
      managerEmail: u.managerEmail || '',
      role: u.role || 'EMPLOYEE',
    })
    setEditError(null)
    setEditTarget(u)
  }

  function setEdit(k: keyof typeof EDIT_EMPTY, v: string) {
    setEditForm((f) => ({ ...f, [k]: v }))
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditError(null)
    setEditBusy(true)
    try {
      const r = await api<{ user: DirectoryUser }>(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      })
      toast({
        title: 'User updated ✅',
        description: `${r.user.name} (${r.user.employeeCode}) details saved.`,
      })
      setEditTarget(null)
      await loadUsers()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update user')
    } finally {
      setEditBusy(false)
    }
  }

  function askDelete(u: DirectoryUser) {
    setDeleteTarget(u)
  }

  async function doDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await api(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
      toast({
        title: 'User deleted',
        description: `${deleteTarget.name} (${deleteTarget.employeeCode}) can no longer log in and was removed from the directory.`,
      })
      setDeleteTarget(null)
      await loadUsers()
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeleteBusy(false)
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

  const editFields: { key: keyof typeof EDIT_EMPTY; label: string; type?: string; required?: boolean }[] = [
    { key: 'employeeCode', label: 'Employee Code', required: true },
    { key: 'name', label: 'Employee Name', required: true },
    { key: 'email', label: 'Email ID', type: 'email', required: true },
    { key: 'process', label: 'Process', required: true },
    { key: 'designation', label: 'Designation', required: true },
    { key: 'managerName', label: 'L1 Manager Name' },
    { key: 'managerEmail', label: 'L1 Manager Email ID', type: 'email' },
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
        <Card className="min-w-0 border-slate-200/80 shadow-sm xl:col-span-2">
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

            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <span className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-2 text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-brand-200 text-brand-700 hover:bg-brand-50"
              onClick={() => setBulkOpen(true)}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Bulk Create via Excel
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">
              Download a template, fill in employee details and upload — IDs are created in one go.
            </p>
          </CardContent>
        </Card>

        {/* Users list */}
        <Card className="min-w-0 border-slate-200/80 shadow-sm xl:col-span-3">
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users2 className="h-4 w-4 text-brand-600" /> All Users
                {users && <span className="text-sm font-normal text-slate-400">({users.length})</span>}
              </CardTitle>
              <CardDescription>
                Every employee ID in the system. Passwords are visible to you (admin) only.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-56">
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
              <>
                {/* Mobile / tablet: stacked user cards */}
                <div className="space-y-2 md:hidden">
                  {filtered.map((u) => (
                    <div key={u.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-slate-800">
                            <span className="truncate">{u.name}</span>
                            {u.role === 'ADMIN' && (
                              <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">ADMIN</span>
                            )}
                          </p>
                          <p className="break-all text-xs text-slate-500">{u.employeeCode} · {u.email}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <RowActions user={u} me={me} onEdit={openEdit} onDelete={askDelete} onReset={openReset} />
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Process / Designation</p>
                          <p className="truncate">{u.process}</p>
                          <p className="truncate text-slate-400">{u.designation}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">L1 Manager</p>
                          {u.managerName ? (
                            <>
                              <p className="truncate">{u.managerName}</p>
                              <p className="truncate text-slate-400">{u.managerEmail}</p>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <PasswordCell password={u.password} />
                        <span className="text-[10px] text-slate-400">
                          Created {u.createdAt ? fmtDate(u.createdAt) : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className="rounded-lg border border-slate-100 px-3 py-8 text-center text-sm text-slate-400">
                      No users match your search.
                    </p>
                  )}
                </div>

                {/* Desktop: wide table */}
                <div className="hidden max-h-[34rem] overflow-auto rounded-lg border border-slate-100 [scrollbar-width:thin] md:block">
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
                            <div className="flex items-center justify-end gap-0.5">
                              <RowActions user={u} me={me} onEdit={openEdit} onDelete={askDelete} onReset={openReset} />
                            </div>
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
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk create via Excel */}
      <BulkCreateDialog open={bulkOpen} onOpenChange={setBulkOpen} onCreated={loadUsers} />

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

      {/* Edit user */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) setEditTarget(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-brand-600" />
              Edit {editTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Update employee details. Password changes use the Reset Password action instead.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-3">
            {editFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`e-${f.key}`}>{f.label}</Label>
                <Input
                  id={`e-${f.key}`}
                  type={f.type || 'text'}
                  value={editForm[f.key]}
                  onChange={(e) => setEdit(f.key, e.target.value)}
                  required={f.required}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="e-role">Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEdit('role', v)}>
                <SelectTrigger id="e-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="ADMIN" disabled={editTarget?.id === me.id}>
                    Administrator
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {editError}
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editBusy}>
                Cancel
              </Button>
              <Button type="submit" disabled={editBusy}>
                {editBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete user confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              Delete {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  <strong>{deleteTarget?.employeeCode}</strong> will be permanently blocked from logging in and removed
                  from the directory. Their existing task history stays intact.
                </p>
                {deleteTarget?.role === 'ADMIN' && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    This is an administrator account. Only delete it if you are sure.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                doDelete()
              }}
            >
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
