'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import { LoginView } from './login-view'
import { ForcePasswordModal } from './force-password-modal'
import { HomeView } from './home-view'
import { CalendarView } from './calendar-view'
import { TeamView } from './team-view'
import { AdminPanel } from './admin-panel'
import { NewTaskDialog } from './new-task-dialog'
import { TaskDetailDialog } from './task-detail-dialog'
import { InitialAvatar } from './shared'
import type { Me, TaskDTO } from './types'
import { cn } from '@/lib/utils'
import {
  ClipboardList,
  LayoutDashboard,
  CalendarDays,
  Network,
  ShieldCheck,
  LogOut,
  Plus,
  Loader2,
} from 'lucide-react'

type View = 'home' | 'calendar' | 'team' | 'admin'

export function TaskManagerApp() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [view, setView] = useState<View>('home')
  const [refreshKey, setRefreshKey] = useState(0)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTaskDate, setNewTaskDate] = useState<string | undefined>(undefined)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

  const loadMe = useCallback(async () => {
    try {
      const r = await api<{ user: (Me & { isManager?: boolean }) | null }>('/api/auth/me')
      setMe(r.user)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } finally {
      setMe(null)
      setView('home')
      setDetailTaskId(null)
    }
  }

  function openNewTask(date?: string) {
    setNewTaskDate(date)
    setNewTaskOpen(true)
  }

  function onQuickStatusHome(task: TaskDTO, status: 'IN_PROGRESS' | 'COMPLETED') {
    // optimistic via home view itself; here just refresh counters
    bumpRefresh()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg">
            <ClipboardList className="h-7 w-7" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        </div>
      </div>
    )
  }

  if (!me) {
    return (
      <LoginView
        onLogin={(u) => {
          // Fetch the full profile (incl. isManager) before entering the app
          api<{ user: Me | null }>('/api/auth/me')
            .then((r) => setMe(r.user || u))
            .catch(() => setMe(u))
          bumpRefresh()
        }}
      />
    )
  }

  const navItems: { key: View; label: string; icon: typeof LayoutDashboard; show: boolean }[] = [
    { key: 'home', label: 'Home', icon: LayoutDashboard, show: true },
    { key: 'calendar', label: 'My Tasks', icon: CalendarDays, show: me.role !== 'ADMIN' },
    { key: 'team', label: 'Team View', icon: Network, show: Boolean(me.isManager) },
    { key: 'admin', label: 'Admin', icon: ShieldCheck, show: me.role === 'ADMIN' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-50/70 via-white to-brand-50/70">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-md shadow-brand-200">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight text-slate-900">Digitide TaskFlow</p>
              <p className="text-[11px] text-slate-400">Team Task Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {me.role !== 'ADMIN' && (
              <Button size="sm" onClick={() => openNewTask()} className="hidden sm:inline-flex">
                <Plus className="mr-1.5 h-4 w-4" /> New Task
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 transition hover:border-brand-300 hover:shadow-sm"
                  aria-label="Account menu"
                >
                  <InitialAvatar name={me.name} className="h-8 w-8 text-[11px]" />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-xs font-semibold text-slate-800">{me.name}</span>
                    <span className="block text-[10px] text-slate-400">{me.employeeCode}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="font-semibold">{me.name}</p>
                  <p className="text-xs font-normal text-slate-500">{me.designation} · {me.process}</p>
                  <p className="text-xs font-normal text-slate-400">{me.email}</p>
                  {me.managerName && (
                    <p className="mt-1 text-xs font-normal text-slate-400">L1 Manager: {me.managerName}</p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-700">
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Nav tabs */}
        <nav className="mx-auto max-w-7xl px-4 pb-2" aria-label="Main navigation">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {navItems
              .filter((n) => n.show)
              .map((n) => (
                <button
                  key={n.key}
                  onClick={() => setView(n.key)}
                  aria-current={view === n.key ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition',
                    view === n.key
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                </button>
              ))}
          </div>
        </nav>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {view === 'home' && me.role !== 'ADMIN' && (
          <HomeView
            me={me}
            refreshKey={refreshKey}
            onOpenTask={setDetailTaskId}
            onNewTask={openNewTask}
            onQuickStatus={onQuickStatusHome}
          />
        )}
        {view === 'home' && me.role === 'ADMIN' && <AdminPanel refreshKey={refreshKey} />}
        {view === 'calendar' && me.role !== 'ADMIN' && (
          <CalendarView me={me} refreshKey={refreshKey} onOpenTask={setDetailTaskId} onNewTask={openNewTask} />
        )}
        {view === 'team' && <TeamView me={me} refreshKey={refreshKey} onOpenTask={setDetailTaskId} />}
        {view === 'admin' && me.role === 'ADMIN' && <AdminPanel refreshKey={refreshKey} />}
      </main>

      {/* Footer — sticky to bottom via flex column + mt-auto */}
      <footer className="mt-auto border-t border-slate-200/70 bg-white/70 py-4">
        <p className="text-center text-xs text-slate-400">
          Digitide TaskFlow — one master task manager for every employee · Built with Z.ai
        </p>
      </footer>

      {/* Dialogs */}
      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        defaultDate={newTaskDate}
        onCreated={() => {
          toast({ title: 'Task created & assigned ✅', description: 'Everyone assigned can now see it.' })
          bumpRefresh()
        }}
      />
      {detailTaskId && (
        <TaskDetailDialog
          taskId={detailTaskId}
          me={me}
          onClose={() => setDetailTaskId(null)}
          onChanged={bumpRefresh}
        />
      )}

      {/* Mandatory first-login password modal */}
      {me.isFirstLogin && (
        <ForcePasswordModal
          employeeCode={me.employeeCode}
          onDone={() => {
            setMe({ ...me, isFirstLogin: false })
            toast({ title: 'Password set successfully 🎉', description: 'Welcome to Digitide TaskFlow!' })
            bumpRefresh()
          }}
          onLogout={logout}
        />
      )}
    </div>
  )
}
