'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from './api'
import { CheckCircle2, Loader2, Wrench, XCircle, ArrowRightLeft } from 'lucide-react'

type PushTestResult = {
  ok: boolean
  reason?: string
  message?: string
  sent?: number
}

const STEPS: Record<string, string[]> = {
  'vapid-not-configured': [
    'This server has no VAPID keys, so native web push is switched off.',
    'Ask the administrator to add these environment variables to the server: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (e.g. mailto:admin@digitide.com).',
    'Rebuild and redeploy the app after adding the keys.',
    'Reload this page and press "Send test notification" again.',
  ],
  'no-subscription': [
    'Your browser has not registered this site for web push yet.',
    'Open the site over HTTPS — push requires a secure connection (localhost is fine).',
    'Click the bell → "Enable browser popups" and press Allow.',
    'If a permission prompt was blocked earlier, open your browser Site settings for Tasknet → Notifications → set to Allow.',
    'Reload the page, which registers this browser automatically.',
    'Press "Send test notification" again.',
  ],
  'send-failed': [
    'The push service rejected this push. Usually the browser still holds an old subscription from a previous VAPID key.',
    'Reload this page — the app re-registers the subscription automatically when the keys changed.',
    'Still failing? Reset the site\u2019s notification permission: browser Site settings → Tasknet → Notifications → Reset, then Allow again.',
    'Reload and press "Send test notification" again.',
  ],
  'request-failed': [
    'We could not reach the push test endpoint.',
    'Check your internet connection and that you are signed in.',
    'If it persists, ask the administrator to check the server logs for /api/push/diagnose.',
  ],
}

export function PushTestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<'checking' | 'done'>('checking')
  const [result, setResult] = useState<PushTestResult | null>(null)
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    if (!open) return
    // Defer state writes so the dialog renders its loading state first.
    const t = setTimeout(() => {
      setPhase('checking')
      setShowSteps(false)
      setResult(null)
      api<PushTestResult>('/api/push/diagnose', { method: 'POST', body: JSON.stringify({}) })
        .then((r) => {
          setResult(r)
          setPhase('done')
        })
        .catch((e) => {
          setResult({
            ok: false,
            reason: 'request-failed',
            message: e instanceof Error ? e.message : 'Could not reach the push service.',
          })
          setPhase('done')
        })
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  const steps = result?.reason ? STEPS[result.reason] ?? STEPS['request-failed'] : []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-lg">Browser push test</DialogTitle>
          <DialogDescription>
            {phase === 'checking'
              ? 'Sending a test push through your browser service…'
              : result?.ok
              ? 'Your browser notification was delivered.'
              : 'The push could not be delivered.'}
          </DialogDescription>
        </DialogHeader>

        <div aria-live="polite">
          {phase === 'checking' ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-10 w-10 animate-spin text-brand-600" aria-hidden="true" />
            </div>
          ) : result?.ok ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-emerald-800">
                Success — the test push was accepted by your browser push service.
              </p>
              <p className="text-xs leading-snug text-emerald-700">
                You should see a popup now. If you still don&apos;t, check that Tasknet&apos;s notifications are allowed
                in your OS and browser settings.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                <XCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
                <p className="text-sm font-medium text-red-800">
                  Issue — {result?.reason?.replace(/-/g, ' ') || 'push failed'}
                </p>
                <p className="text-xs leading-snug text-red-700">{result?.message}</p>
              </div>

              {steps.length > 0 && (
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
        </div>

        <DialogFooter className="sm:justify-center">
          <Button className="w-full" onClick={onClose}>
            {result?.ok || phase === 'checking' ? 'OK' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}