'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BellRing } from 'lucide-react'

type Perm = 'checking' | 'default' | 'granted' | 'denied' | 'unsupported'

/**
 * First-login / every-login notification gate.
 * - granted  → nothing shown
 * - default  → mandatory Allow prompt (non-dismissible until granted)
 * - denied   → explains the browser-level block + re-check button
 * - unsupported → caller does not open the gate
 */
export function NotificationGate({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [perm, setPerm] = useState<Perm>('checking')

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (typeof window === 'undefined' || !('Notification' in window)) setPerm('unsupported')
      else setPerm(Notification.permission as Perm)
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  if (!open || perm === 'checking' || perm === 'granted') return null

  async function allow() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPerm(result as Perm)
    if (result === 'granted') onDone()
  }

  function recheck() {
    if (!('Notification' in window)) return
    const cur = Notification.permission
    setPerm(cur as Perm)
    if (cur === 'granted') onDone()
  }

  const titles = {
    default: 'Allow notifications',
    denied: 'Notifications are blocked',
    unsupported: 'Notifications not supported',
  } as const

  const copy = {
    default:
      'Tasknet will send a browser popup the moment a new task is assigned to you. You must allow notifications to keep receiving assignment alerts.',
    denied:
      'Notifications for this site were blocked earlier. Open your browser site settings for Tasknet, allow notifications, then come back and re-check. You can continue for now, but you will be asked again on your next login.',
    unsupported:
      'Your browser does not support notifications. You will still see in-app toasts for new assignments.',
  }[perm]

  const blockClicks = {
    onEscapeKeyDown: (e: { preventDefault: () => void }) => e.preventDefault(),
    onPointerDownOutside: (e: { preventDefault: () => void }) => e.preventDefault(),
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
        {...(perm === 'default' ? blockClicks : {})}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-200">
          <BellRing className="h-7 w-7" />
        </div>
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-lg">{titles[perm]}</DialogTitle>
          <DialogDescription>{copy}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:justify-center">
          {perm === 'default' && (
            <Button className="w-full" onClick={allow}>
              <BellRing className="mr-1.5 h-4 w-4" /> Allow notifications
            </Button>
          )}
          {perm === 'denied' && (
            <>
              <Button className="w-full" onClick={recheck}>
                I&apos;ve enabled it — re-check
              </Button>
              <Button variant="ghost" onClick={onDone}>
                Continue without notifications for now
              </Button>
            </>
          )}
          {perm === 'unsupported' && (
            <Button className="w-full" onClick={onDone}>
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}