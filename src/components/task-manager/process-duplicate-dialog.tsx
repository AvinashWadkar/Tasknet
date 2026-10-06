'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Wand2, X } from 'lucide-react'

/** One AI-suggested cluster of process names that may be the same thing. */
interface DuplicateGroup {
  id: string
  names: { name: string; users: number }[]
  canonical: string
  reason: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
}

const CONFIDENCE_STYLE: Record<DuplicateGroup['confidence'], string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
}

const CONFIDENCE_LABEL: Record<DuplicateGroup['confidence'], string> = {
  HIGH: 'Very likely same',
  MEDIUM: 'Possibly same',
  LOW: 'Judgement call',
}

/**
 * Admin popup: "these process names look like the same process spelled
 * differently — same or different?"
 *
 * Each group is decided independently. Merging rewrites every matching user to
 * the canonical spelling and drops the variant from the list; skipping leaves
 * both alone. Nothing is written until the admin picks.
 */
export function ProcessDuplicateDialog({
  open,
  onOpenChange,
  onMerged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerged: () => void
}) {
  const { toast } = useToast()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<'ai' | 'fallback'>('ai')
  const [checked, setChecked] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  async function run() {
    setLoading(true)
    try {
      const r = await api<{ groups: DuplicateGroup[]; source: 'ai' | 'fallback'; checked: number }>(
        '/api/processes/analyze',
        { method: 'POST', body: JSON.stringify({ refresh: true }) }
      )
      setGroups(r.groups)
      setSource(r.source)
      setChecked(r.checked)
      setDismissed(new Set())
    } catch (err) {
      setGroups([])
      toast({
        title: 'Could not analyse process names',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) run()
  }, [open])

  const pending = groups.filter((g) => !dismissed.has(g.id))

  async function merge(g: DuplicateGroup) {
    setBusyId(g.id)
    try {
      const r = await api<{ canonical: string; updatedUsers: number; removedVariants: number }>(
        '/api/processes/merge',
        {
          method: 'POST',
          body: JSON.stringify({
            canonical: g.canonical,
            drop: g.names.map((n) => n.name),
          }),
        }
      )
      toast({
        title: 'Processes merged',
        description: `Kept “${r.canonical}”. ${r.updatedUsers} employee${r.updatedUsers === 1 ? '' : 's'} relabelled.`,
      })
      setDismissed((prev) => new Set(prev).add(g.id))
      onMerged()
    } catch (err) {
      toast({
        title: 'Merge failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  function skip(g: DuplicateGroup) {
    setDismissed((prev) => new Set(prev).add(g.id))
  }

  function close() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            Review process names
          </DialogTitle>
          <DialogDescription>
            {loading
              ? 'Analysing every process name used in the tool…'
              : groups.length === 0
                ? `Checked ${checked} process names.`
                : `${pending.length} pair${pending.length === 1 ? '' : 's'} below may be the same process spelled differently. Nothing changes until you choose.`}
          </DialogDescription>
        </DialogHeader>

        {source === 'fallback' && !loading && groups.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              AI analysis was unavailable, so these came from exact-spelling matching only. Spelling
              variants that differ in wording were not detected.
            </span>
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-800">No duplicate process names found</p>
            <p className="text-xs text-emerald-700">
              {checked} process name{checked === 1 ? '' : 's'} checked — all distinct.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const decided = dismissed.has(g.id)
              const busy = busyId === g.id
              return (
                <div
                  key={g.id}
                  className={cn(
                    'rounded-xl border p-3 transition',
                    decided ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        CONFIDENCE_STYLE[g.confidence]
                      )}
                    >
                      {CONFIDENCE_LABEL[g.confidence]}
                    </span>
                    <span className="text-xs text-slate-500">{g.reason}</span>
                    {decided && (
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                        <X className="h-3 w-3" /> Kept separate
                      </span>
                    )}
                  </div>

                  <ul className="mb-2 space-y-1">
                    {g.names.map((n) => (
                      <li
                        key={n.name}
                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium text-slate-700">{n.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {n.users} employee{n.users === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={g.canonical}
                      onChange={(e) =>
                        setGroups((prev) =>
                          prev.map((x) => (x.id === g.id ? { ...x, canonical: e.target.value } : x))
                        )
                      }
                      aria-label="Name to keep"
                      className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || decided || !g.canonical.trim()}
                      onClick={() => merge(g)}
                      className="shrink-0"
                    >
                      {busy ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Merge
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || decided}
                      onClick={() => skip(g)}
                      className="shrink-0"
                    >
                      Different
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Merge keeps the name above and rewrites every employee in this group to it.
                  </p>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={run} disabled={loading || busyId !== null}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Re-run analysis
          </Button>
          <Button type="button" onClick={close} disabled={loading || busyId !== null}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}