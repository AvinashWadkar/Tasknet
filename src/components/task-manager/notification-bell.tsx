'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { ToastAction } from '@/components/ui/toast'
import { api } from './api'
import { cn } from '@/lib/utils'
import { Bell, BellRing, CheckCheck, MessageSquarePlus } from 'lucide-react'

type Notif = {
  id: string
  type: string
  title: string
  message: string
  taskId: string | null
  readAt: string | null
  createdAt: string
}

const POLL_MS = 30_000

export function NotificationBell({ onOpenTask }: { onOpenTask: (taskId: string | null) => void }) {
  const { toast } = useToast()
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const popped = useRef<Set<string>>(new Set())

  const permissionState = () =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'

  const popNotification = useCallback(
    (n: Notif) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const pop = new Notification(n.title, { body: n.message, icon: '/icon.png', tag: n.id })
          pop.onclick = () => {
            window.focus()
            if (n.taskId) onOpenTask(n.taskId)
            pop.close()
          }
          return
        } catch {
          // fall through to toast
        }
      }
      toast({
        title: n.title,
        description: n.message,
        ...(n.taskId
          ? {
              action: (
                <ToastAction altText="Open task" onClick={() => onOpenTask(n.taskId)}>
                  Open task
                </ToastAction>
              ),
            }
          : {}),
      })
    },
    [onOpenTask, toast]
  )

  const load = useCallback(
    async (popNew: boolean) => {
      try {
        const r = await api<{ notifications: Notif[]; unread: number }>('/api/notifications')
        setItems(r.notifications)
        setUnread(r.unread)

        const fresh = r.notifications.filter((n) => !popped.current.has(n.id)).reverse()
        r.notifications.forEach((n) => popped.current.add(n.id))

        if (popNew && fresh.length) {
          fresh.slice(0, 3).forEach(popNotification)
        }
      } catch {
        // ignore transient poll errors
      }
    },
    [popNotification]
  )

  useEffect(() => {
    const initial = setTimeout(() => load(false), 0) // initial load: don't pop old notifications
    const t = setInterval(() => load(true), POLL_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [load])

  async function enableNotifications() {
    if (!('Notification' in window)) {
      toast({ title: 'Notifications not supported', description: 'Your browser does not support notifications.' })
      return
    }
    const result = await Notification.requestPermission()
    if (result === 'granted') {
      toast({ title: 'Notifications enabled 🔔', description: 'You will get a popup when a task is assigned to you.' })
      await load(false)
    } else if (result === 'denied') {
      toast({ title: 'Notifications blocked', description: 'Allow notifications in your browser settings to enable popups.' })
    }
  }

  async function markAllRead() {
    try {
      await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) })
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      )
      setUnread(0)
    } catch {
      // ignore
    }
  }

  async function markOneRead(n: Notif) {
    if (n.readAt) return
    try {
      await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [n.id] }) })
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      setUnread((u) => Math.max(0, u - 1))
    } catch {
      // ignore
    }
  }

  function openItem(n: Notif) {
    setOpen(false)
    if (n.taskId) onOpenTask(n.taskId)
    markOneRead(n)
  }

  const perm = permissionState()

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-brand-300 hover:text-brand-600"
          aria-label="Notifications"
        >
          {unread > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold">
            <Bell className="h-4 w-4 text-brand-600" /> Notifications
            {unread > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{unread} new</span>}
          </span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center">
              <MessageSquarePlus className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm text-slate-400">No notifications yet.</p>
            </div>
          )}
          {items.slice(0, 20).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                'flex-col items-start whitespace-normal py-2.5',
                !n.readAt && 'bg-brand-50/60'
              )}
              onClick={() => openItem(n)}
            >
              <span className={cn('text-sm font-medium text-slate-800', !n.readAt && 'text-brand-800')}>
                {n.title}
              </span>
              <span className="mt-0.5 text-xs leading-snug text-slate-500">{n.message}</span>
            </DropdownMenuItem>
          ))}
        </div>

        {perm !== 'granted' && (
          <>
            <DropdownMenuSeparator />
            {perm === 'default' && (
              <div className="px-3 py-2">
                <Button size="sm" className="w-full" onClick={enableNotifications}>
                  <BellRing className="mr-1.5 h-4 w-4" /> Enable browser popups
                </Button>
                <p className="mt-1.5 text-center text-[11px] text-slate-400">
                  Get a popup as soon as a task is assigned to you.
                </p>
              </div>
            )}
            {perm === 'denied' && (
              <p className="px-3 py-2 text-center text-[11px] text-slate-400">
                Browser notifications are blocked. Allow them in your browser settings for popups on assignment.
              </p>
            )}
            {perm === 'unsupported' && (
              <p className="px-3 py-2 text-center text-[11px] text-slate-400">
                Your browser does not support popup notifications — you will still see in-app toasts.
              </p>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}