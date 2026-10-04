'use client'

import { useSyncExternalStore } from 'react'
import { Download, Smartphone } from 'lucide-react'
import { apkUrl, isNativeApp } from '@/lib/native'
import { cn } from '@/lib/utils'

/** The shell never changes while the page is open, so there is nothing to subscribe to. */
const subscribe = () => () => {}

/**
 * Prompt to install the Android app. Only shown on the website — inside the
 * app itself there is nothing to install, so the button is hidden.
 *
 * useSyncExternalStore keeps this honest: the server snapshot is false (renders
 * nothing), and the browser snapshot decides once hydration finishes.
 */
export function AppDownloadButton({
  variant = 'compact',
  className,
}: {
  variant?: 'compact' | 'block'
  className?: string
}) {
  const onWebsite = useSyncExternalStore(
    subscribe,
    () => !isNativeApp(),
    () => false,
  )

  if (!onWebsite) return null

  if (variant === 'block') {
    return (
      <a
        href={apkUrl()}
        download
        className={cn(
          'flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-4 transition hover:border-brand-300 hover:bg-brand-50',
          className,
        )}
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Smartphone className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">Get the Tasknet app</span>
          <span className="block text-xs text-slate-600">
            Install it on your phone for alerts when a task is assigned to you.
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700">
            <Download className="h-3.5 w-3.5" /> Download for Android
          </span>
        </span>
      </a>
    )
  }

  return (
    <a
      href={apkUrl()}
      download
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-700 transition hover:border-brand-300 hover:bg-brand-50',
        className,
      )}
    >
      <Download className="h-4 w-4" />
      Get the app
    </a>
  )
}
