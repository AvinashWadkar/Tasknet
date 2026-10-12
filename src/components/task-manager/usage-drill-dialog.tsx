'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InitialAvatar } from './shared'
import { cn } from '@/lib/utils'
import { BarChart3, Check, Minus } from 'lucide-react'

export interface UsageEmployee {
  id: string
  name: string
  employeeCode: string
  process: string
  isActive: boolean
  adopted: boolean
  active: boolean
  actions: number
  tasksCreated: number
  passwordSet: boolean
  app: boolean
  push: boolean
  createdAt: string
  actionsByAction: Record<string, number>
  activeMonths: string[]
}

export interface DrillRow {
  id: string
  name: string
  employeeCode: string
  process: string
  value: number
  valueLabel: string
  note?: string
  tags?: string[]
}

export interface DrillState {
  title: string
  subtitle?: string
  valueLabel: string
  rows: DrillRow[]
  empty?: string
  icon?: React.ComponentType<{ className?: string }>
}

function fmtJoined(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Generic click-through detail list used by every KPI tile, chart bar, funnel
 * step, process row and feature bar on the Tool Adoption & Usage page.
 */
export function UsageDrillDialog({ state, onClose }: { state: DrillState | null; onClose: () => void }) {
  const Icon = state?.icon ?? BarChart3
  const total = state?.rows.reduce((s, r) => s + r.value, 0) ?? 0
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.subtitle && <DialogDescription>{state.subtitle}</DialogDescription>}
        </DialogHeader>

        <div className={cn('max-h-[58vh] overflow-y-auto pr-1', '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200')}>
          {state && state.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{state.empty ?? 'No employees to show for this selection.'}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {state?.rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <InitialAvatar name={r.name} className="h-8 w-8 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">{r.name}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{r.employeeCode}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-[11px] text-slate-500">{r.process}</span>
                      {r.note && <span className="text-[11px] text-slate-400">· {r.note}</span>}
                      {r.tags?.map((t) => (
                        <span key={t} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{r.value}</p>
                    <p className="text-[10px] text-slate-400">{r.valueLabel}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {state && state.rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              {state.rows.length} employee{state.rows.length === 1 ? '' : 's'}
            </span>
            <span>
              {state.valueLabel}: <span className="font-semibold tabular-nums text-slate-700">{total}</span>
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
      )}
    >
      {on ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {label}
    </span>
  )
}

/** Single-employee activity breakdown, opened by clicking an employee row. */
export function EmployeeUsageDialog({
  employee,
  days,
  labelFor,
  onClose,
}: {
  employee: UsageEmployee | null
  days: number
  labelFor: (action: string) => string
  onClose: () => void
}) {
  const breakdown = employee
    ? Object.entries(employee.actionsByAction).sort((a, b) => b[1] - a[1])
    : []
  const top = breakdown[0]?.[1] || 1
  return (
    <Dialog open={Boolean(employee)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Employee activity</DialogTitle>
          <DialogDescription>Tasknet adoption and usage for this employee.</DialogDescription>
        </DialogHeader>
        {employee && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <InitialAvatar name={employee.name} className="h-11 w-11 text-sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{employee.name}</p>
                <p className="text-xs text-slate-500">
                  {employee.employeeCode} · {employee.process}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat label={`Actions (${days}d)`} value={employee.actions} />
              <Stat label={`Tasks created (${days}d)`} value={employee.tasksCreated} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Flag on={employee.adopted} label="Adopted" />
              <Flag on={employee.active} label={`Active (${days}d)`} />
              <Flag on={employee.passwordSet} label="Password set" />
              <Flag on={employee.app} label="Mobile app" />
              <Flag on={employee.push} label="Web push" />
              <Flag on={employee.isActive} label="Active ID" />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Action breakdown</p>
              {breakdown.length === 0 ? (
                <p className="text-xs text-slate-400">No actions logged in the last {days} days.</p>
              ) : (
                <ul className="space-y-1.5">
                  {breakdown.map(([action, count]) => (
                    <li key={action} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 truncate text-[11px] text-slate-500">{labelFor(action)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((count / top) * 100)}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[11px] text-slate-400">Joined {fmtJoined(employee.createdAt)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
