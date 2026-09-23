'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { api } from './api'
import type { Me, PriorityItem } from './types'
import { fmtDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Sparkles, RefreshCw, AlarmClock, Users, Flag } from 'lucide-react'

/**
 * Smart Priority — ranks every open task assigned to / created by the user
 * and suggests the order to work on them ("every assigned task must be completed").
 */
export function SmartPriorityPanel({
  me,
  refreshKey,
  onOpenTask,
}: {
  me: Me
  refreshKey: number
  onOpenTask: (id: string) => void
}) {
  const [plan, setPlan] = useState<PriorityItem[] | null>(null)
  const [source, setSource] = useState<'ai' | 'fallback'>('ai')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Initial + parent-triggered load (silent refresh); Refresh sets its own loading state
  useEffect(() => {
    let alive = true
    api<{ source: 'ai' | 'fallback'; plan: PriorityItem[] }>('/api/tasks/prioritize', {
      method: 'POST',
      body: JSON.stringify({ refresh: reloadKey > 0 }),
    })
      .then((r) => {
        if (!alive) return
        setPlan(r.plan)
        setSource(r.source)
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Could not build priority plan')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refreshKey, me.id, reloadKey])

  function refresh() {
    setLoading(true)
    setError(null)
    setReloadKey((k) => k + 1)
  }

  return (
    <Card className="border-brand-200/80 bg-gradient-to-br from-brand-50/80 to-white shadow-sm">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-brand-600" />
Task Priority
            <span className="text-sm font-normal text-slate-400">— what to work on first</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-brand-700 hover:bg-brand-100/60 hover:text-brand-800"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            {loading ? 'Updating…' : 'Refresh'}
          </Button>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {loading && !plan && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {plan && plan.length === 0 && !loading && (
          <p className="py-4 text-center text-sm text-slate-500">
            🎉 Nothing open right now — every assigned task is completed.
          </p>
        )}

        {plan && plan.length > 0 && (
          <>
            {source === 'fallback' && (
              <p className="mb-2 text-[11px] font-medium text-amber-700">
                Live ordering is unavailable right now — showing deadline-based order.
              </p>
            )}
            <ol className="space-y-1.5">
              {plan.map((t, i) => (
                <li key={t.id}>
                  <button
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-start gap-3 rounded-lg border border-transparent bg-white/70 px-3 py-2 text-left transition hover:border-brand-200 hover:bg-white"
                    aria-label={`Priority ${i + 1}: ${t.title}`}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        i === 0 ? 'bg-brand-600 text-white shadow' : 'bg-brand-100 text-brand-700'
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-semibold text-slate-800">{t.title}</span>
                        {t.overdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            <AlarmClock className="h-3 w-3" />
                            Delayed by {t.delayed}
                          </span>
                        )}
                        {t.role === 'creator' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            <Flag className="h-3 w-3" /> follow up
                          </span>
                        )}
                        {t.total > 1 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <Users className="h-3 w-3" />
                            {t.done}/{t.total} done
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {t.reason} · due {fmtDate(t.dueDate)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  )
}
