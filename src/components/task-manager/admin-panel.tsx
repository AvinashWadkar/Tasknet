'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
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
import { SendNotificationDialog } from './send-notification-dialog'
import type { DirectoryUser, Me } from './types'
import { fmtDate } from '@/lib/dates'
import {
  Loader2, UserPlus, Search, ShieldCheck, Users2, KeyRound,
  Eye, EyeOff, Copy, FileUp, Pencil, Trash2, Megaphone, FilterX, Filter,
  Check, ChevronDown, X,
} from 'lucide-react'

type FilterState = Record<string, string[]>

/** Searchable multi-select for assigning an employee's managers (all equal). */
function ManagerPicker({
  label,
  people,
  selected,
  onChange,
  exclude,
}: {
  label: string
  people: DirectoryUser[]
  selected: string[]
  onChange: (next: string[]) => void
  exclude?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const byId = new Map(people.map((p) => [p.id, p]))
  const keyword = q.trim().toLowerCase()
  const options = people.filter(
    (p) =>
      p.id !== exclude &&
      (!keyword ||
        p.name.toLowerCase().includes(keyword) ||
        p.employeeCode.toLowerCase().includes(keyword) ||
        p.email.toLowerCase().includes(keyword))
  )
  const selectedPeople = (selected.map((id) => byId.get(id)).filter(Boolean) as DirectoryUser[])

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between gap-1.5 border-slate-200 bg-white px-3 font-normal data-[state=open]:border-brand-300 data-[state=open]:ring-2 data-[state=open]:ring-brand-100"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
              <span className="truncate text-sm text-slate-700">
                {selectedPeople.length
                  ? selectedPeople.map((p) => p.name).join(', ')
                  : '— No manager (top level)'}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-medium text-slate-700">Select manager(s)</p>
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-red-600"
              disabled={selected.length === 0}
            >
              <X className="h-3 w-3" aria-hidden="true" /> Clear
            </button>
          </div>
          {people.length > 8 && (
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people…"
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none placeholder:text-slate-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1.5" role="listbox" aria-multiselectable="true" aria-label={label}>
            {options.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-400">No people match.</p>
            ) : (
              options.map((p) => {
                const checked = selected.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() =>
                      onChange(checked ? selected.filter((id) => id !== p.id) : [...selected, p.id])
                    }
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-brand-50"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                        checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-xs text-slate-400">{p.employeeCode} · {p.email}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Dropdown filter on a table header — multi-selects distinct values of the column. */
function ColumnFilter({
  column,
  label,
  options,
  selected,
  onChange,
}: {
  column: string
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const active = selected.length > 0
  const keyword = q.trim().toLowerCase()
  const visible = keyword
    ? options.filter((o) => o.label.toLowerCase().includes(keyword))
    : options
  const shown = options.filter((o) => selected.includes(o.value))
  const summary = shown.length > 0 ? shown.map((o) => o.label).join(', ') : null

  return (
    <span className="inline-flex items-center gap-1">
      <span className="truncate">{label}</span>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          setQ('')
          setOpen(o)
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Filter by ${label}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'inline-flex h-4 items-center gap-0.5 rounded px-0.5 transition',
              active ? 'text-brand-700' : 'text-slate-400 hover:text-slate-600'
            )}
          >
            {active ? <FilterX className="h-3 w-3" /> : <Filter className="h-3 w-3" />}
            {active && (
              <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-0.5 text-[9px] font-bold text-white">
                {selected.length}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="mt-1 flex max-h-80 w-64 flex-col overflow-hidden">
          <DropdownMenuLabel className="text-xs">
            Filter by {label}
            {summary && <span className="mt-0.5 block text-[11px] font-normal text-brand-700">:{summary}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search filter values…"
                className="h-8 pl-7 text-xs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto p-0.5">
            {visible.length === 0 && (
              <DropdownMenuItem disabled>
                <span className="text-xs text-slate-400">No values match.</span>
              </DropdownMenuItem>
            )}
            {visible.map((o) => (
              <DropdownMenuItem key={o.value} onSelect={(e) => e.preventDefault()}>
                <span className="flex w-full items-center gap-2.5">
                  <Checkbox
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => {
                      const next = selected.includes(o.value)
                        ? selected.filter((v) => v !== o.value)
                        : [...selected, o.value]
                      onChange(next)
                    }}
                  />
                  <span className="truncate" title={o.label}>{o.label}</span>
                </span>
              </DropdownMenuItem>
            ))}
            {visible.length === 0 && active && (
              <DropdownMenuItem onSelect={() => onChange([])}>
                <span className="text-xs font-medium text-red-600">Clear filter</span>
              </DropdownMenuItem>
            )}
          </div>
          {visible.length > 0 && active && (
            <>
              <DropdownMenuSeparator />
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  Clear filter
                </button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

const EMPTY = {
  employeeCode: '',
  name: '',
  email: '',
  process: '',
  designation: '',
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
  const [filters, setFilters] = useState<FilterState>({})
  const [form, setForm] = useState({ ...EMPTY })
  const [managerIds, setManagerIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset-password dialog state
  const [resetTarget, setResetTarget] = useState<DirectoryUser | null>(null)
  const [resetPw, setResetPw] = useState('Digitide@123')
  const [resetBusy, setResetBusy] = useState(false)

  // Edit-user dialog state
  const [editTarget, setEditTarget] = useState<DirectoryUser | null>(null)
  const [editForm, setEditForm] = useState({ ...EDIT_EMPTY })
  const [editManagerIds, setEditManagerIds] = useState<string[]>([])
  const [editError, setEditError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)

  // Delete-user dialog state
  const [deleteTarget, setDeleteTarget] = useState<DirectoryUser | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Bulk-create-via-Excel dialog state
  const [bulkOpen, setBulkOpen] = useState(false)

  // Send-notification dialog state
  const [sendOpen, setSendOpen] = useState(false)

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

  const distinct = (vals: string[]) => [...new Set(vals.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b))

  const filterOptions = useMemo(() => {
    if (!users) return {} as Record<string, { value: string; label: string }[]>
    const emp = distinct(users.map((u) => u.employeeCode)).map((code) => {
      const u = users.find((x) => x.employeeCode === code)!
      return { value: `code:${code}`, label: `${code} — ${u.name}` }
    })
    const password = [
      { value: 'pw:set', label: 'Set' },
      { value: 'pw:unset', label: 'Not set' },
    ]
    const procDesig = distinct([...users.map((u) => u.process), ...users.map((u) => u.designation)]).map((v) => ({
      value: `pd:${v}`,
      label: v,
    }))
    const manager = distinct([
      ...users.flatMap((u) => u.managers?.map((m) => m.name) ?? []),
      ...users.flatMap((u) => u.managers?.map((m) => m.email) ?? []),
      ...users.map((u) => u.managerName || ''),
      ...users.map((u) => u.managerEmail || ''),
    ]).map((v) => ({ value: `mgr:${v}`, label: v }))
    const created = distinct(users.filter((u) => u.createdAt).map((u) => u.createdAt!.slice(0, 7))).map((m) => {
      const d = new Date(`${m}-15T00:00:00`)
      return {
        value: `m:${m}`,
        label: d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }) || m,
      }
    })
    return { code: emp, password, pd: procDesig, mgr: manager, created }
  }, [users])

  const filtered = useMemo(() => {
    if (!users) return []
    const q = search.trim().toLowerCase()
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => (v as string[]).length > 0)
    ) as Record<string, string[]>
    return users.filter((u) => {
      if (q) {
        const hitQ =
          u.name.toLowerCase().includes(q) ||
          u.employeeCode.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.designation || '').toLowerCase().includes(q) ||
          (u.process || '').toLowerCase().includes(q)
        if (!hitQ) return false
      }
      const matches = (col: string, test: (v: string) => boolean) => {
        const sel = activeFilters[col]
        if (!sel) return true
        return sel.some(test)
      }
      return (
        matches('code', (v) => v === `code:${u.employeeCode}`) &&
        matches('password', (v) => (v === 'pw:set' ? Boolean(u.password) : !u.password)) &&
        matches('pd', (v) => v === `pd:${u.process}` || v === `pd:${u.designation}`) &&
        matches('mgr', (v) => {
          const name = v.slice(4)
          return (
            v === `mgr:${u.managerName || ''}` ||
            v === `mgr:${u.managerEmail || ''}` ||
            Boolean(u.managers?.some((m) => m.name === name || m.email === name))
          )
        }) &&
        matches('created', (v) => v === `m:${u.createdAt ? u.createdAt.slice(0, 7) : ''}`)
      )
    })
  }, [users, search, filters])

  function setFilter(col: string, values: string[]) {
    setFilters((prev) => ({ ...prev, [col]: values }))
  }

  const activeFilterCount = Object.values(filters).reduce((n, v) => n + v.length, 0)

  function set(k: keyof typeof EMPTY, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const managerEmails = managerIds
        .map((id) => users?.find((u) => u.id === id)?.email)
        .filter((em): em is string => Boolean(em))
      await api<{ managerLinked: boolean; defaultPassword: string }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, managerEmails }),
      })
      toast({
        title: 'Employee ID created ✅',
        description: `${form.name} (${form.employeeCode}) can log in with the default password. They must set their own password on first login. You can view or copy their password from the All Users table.`,
      })
      setForm({ ...EMPTY })
      setManagerIds([])
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
      role: u.role || 'EMPLOYEE',
    })
    const mapped = u.managers?.map((m) => m.id) ?? []
    if (mapped.length === 0 && u.managerEmail) {
      // Legacy rows that only have the primary snapshot
      const legacy = (users ?? []).filter((x) => x.email === u.managerEmail).map((x) => x.id)
      if (legacy.length) mapped.push(...legacy)
    }
    setEditManagerIds(mapped)
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
      const managerEmails = editManagerIds
        .map((id) => users?.find((u) => u.id === id)?.email)
        .filter((em): em is string => Boolean(em))
      const r = await api<{ user: DirectoryUser }>(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, managerEmails }),
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
  ]

  const editFields: { key: keyof typeof EDIT_EMPTY; label: string; type?: string; required?: boolean }[] = [
    { key: 'employeeCode', label: 'Employee Code', required: true },
    { key: 'name', label: 'Employee Name', required: true },
    { key: 'email', label: 'Email ID', type: 'email', required: true },
    { key: 'process', label: 'Process', required: true },
    { key: 'designation', label: 'Designation', required: true },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ShieldCheck className="h-5 w-5 text-brand-600" /> Admin — User Management
          </h2>
          <p className="text-sm text-slate-500">Only you can create employee IDs. Pick one or more managers (all equal) — employees with no manager are top level.</p>
        </div>
        <Button type="button" onClick={() => setSendOpen(true)} className="shrink-0">
          <Megaphone className="mr-2 h-4 w-4" /> Send Notification
        </Button>
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

              <ManagerPicker
                label="Manager(s)"
                people={users ?? []}
                selected={managerIds}
                onChange={setManagerIds}
              />

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
            <div className="flex w-full items-center gap-2 sm:w-auto">
              {activeFilterCount > 0 && (
                <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => setFilters({})}>
                  <FilterX className="mr-1 h-3.5 w-3.5" /> Clear ({activeFilterCount})
                </Button>
              )}
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
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
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Manager(s)</p>
                          {u.managers && u.managers.length ? (
                            u.managers.map((m) => (
                              <p key={m.id} className="truncate">
                                {m.name} <span className="text-slate-400">· {m.email}</span>
                              </p>
                            ))
                          ) : u.managerName ? (
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
                      No users match your search or filters.
                    </p>
                  )}
                </div>

                {/* Desktop: wide table */}
                <div className="hidden max-h-[34rem] overflow-auto rounded-lg border border-slate-100 [scrollbar-width:thin] md:block">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">
                          <ColumnFilter
                            column="code"
                            label="Employee"
                            options={filterOptions.code ?? []}
                            selected={filters.code ?? []}
                            onChange={(v) => setFilter('code', v)}
                          />
                        </th>
                        <th className="px-3 py-2.5 font-semibold">
                          <ColumnFilter
                            column="password"
                            label="Password"
                            options={filterOptions.password ?? []}
                            selected={filters.password ?? []}
                            onChange={(v) => setFilter('password', v)}
                          />
                        </th>
                        <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">
                          <ColumnFilter
                            column="pd"
                            label="Process / Designation"
                            options={filterOptions.pd ?? []}
                            selected={filters.pd ?? []}
                            onChange={(v) => setFilter('pd', v)}
                          />
                        </th>
                        <th className="hidden px-3 py-2.5 font-semibold md:table-cell">
                          <ColumnFilter
                            column="mgr"
                            label="Manager(s)"
                            options={filterOptions.mgr ?? []}
                            selected={filters.mgr ?? []}
                            onChange={(v) => setFilter('mgr', v)}
                          />
                        </th>
                        <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">
                          <ColumnFilter
                            column="created"
                            label="Created"
                            options={filterOptions.created ?? []}
                            selected={filters.created ?? []}
                            onChange={(v) => setFilter('created', v)}
                          />
                        </th>
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
                            {u.managers && u.managers.length ? (
                              <ul className="space-y-0.5">
                                {u.managers.map((m) => (
                                  <li key={m.id}>
                                    <p className="text-slate-600">{m.name}</p>
                                    <p className="break-all text-xs text-slate-400">{m.email}</p>
                                  </li>
                                ))}
                              </ul>
                            ) : u.managerName ? (
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
                            No users match your search or filters.
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

      {/* Send a custom push / in-app notification */}
      <SendNotificationDialog open={sendOpen} onOpenChange={setSendOpen} users={users ?? []} />

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

            <ManagerPicker
              label="Manager(s)"
              people={users ?? []}
              selected={editManagerIds}
              onChange={setEditManagerIds}
              exclude={editTarget?.id}
            />

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
