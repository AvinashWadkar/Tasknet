'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import { MultiSelect } from './multi-select'
import { AbortedBadge, InitialAvatar, OverdueBadge, StatusBadge } from './shared'
import type { ReportFilterState, ReportsResponse } from './types'
import { fmtDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  AlarmClock,
  BadgeCheck,
  Ban,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  ListFilter,
  RotateCcw,
  Target,
  UserCog,
  Users,
} from 'lucide-react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const BRAND = '#2e4566'
const COLORS = {
  emerald: '#059669',
  amber: '#f59e0b',
  red: '#dc2626',
  violet: '#7c3aed',
  brandLight: '#9fb1cb',
  brandMid: '#7189ad',
  gray: '#94a3b8',
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(15, 35, 55, 0.10)',
  fontSize: 12,
  padding: '8px 12px',
} as const

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb:hover]:bg-slate-300'

function queryFor(f: ReportFilterState): string {
  const p = new URLSearchParams()
  // Always send all five params: absent = All (initial load), present-but-empty = none selected.
  p.set('months', f.months.join(','))
  p.set('processes', f.processes.join(','))
  p.set('designations', f.designations.join(','))
  p.set('managers', f.managers.join(','))
  p.set('employees', f.employees.join(','))
  return `?${p.toString()}`
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'brand',
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  tone?: 'brand' | 'emerald' | 'red' | 'amber' | 'slate'
  progress?: number
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-500',
  }
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="presentation">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              tone === 'emerald' ? 'bg-emerald-500' : tone === 'red' ? 'bg-red-500' : 'bg-brand-500'
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
      {sub && <p className="mt-1 truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  className,
  children,
}: {
  title: string
  subtitle?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5',
        className
      )}
      aria-label={title}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function ReportsView({
  refreshKey,
  onOpenTask,
}: {
  refreshKey: number
  onOpenTask: (taskId: string) => void
}) {
  const { toast } = useToast()
  const [data, setData] = React.useState<ReportsResponse | null>(null)
  const [filters, setFilters] = React.useState<ReportFilterState | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const initedRef = React.useRef(false)
  const reqIdRef = React.useRef(0)

  const load = React.useCallback(
    async (qs: string) => {
      const reqId = ++reqIdRef.current
      setLoading(true)
      try {
        const r = await api<ReportsResponse>(`/api/reports${qs}`)
        if (reqId === reqIdRef.current) setData(r)
      } catch (e) {
        if (reqId === reqIdRef.current) {
          toast({ title: 'Could not load report', description: e instanceof Error ? e.message : 'Please try again.' })
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    },
    [toast]
  )

  // Initial load → then initialize filters to "all selected"
  React.useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api<ReportsResponse>('/api/reports')
        if (!alive) return
        setData(r)
        setFilters({
          months: r.options.months.map((m) => m.value),
          processes: r.options.processes,
          designations: r.options.designations,
          managers: r.options.managers.map((m) => m.value),
          employees: r.options.employees.map((e) => e.value),
        })
      } catch (e) {
        if (alive) {
          setLoading(false)
          toast({ title: 'Could not load report', description: e instanceof Error ? e.message : 'Please try again.' })
        }
      } finally {
        if (alive) {
          initedRef.current = true
          setLoading(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Refresh when tasks change elsewhere (task created/updated…)
  React.useEffect(() => {
    if (refreshKey > 0 && initedRef.current && filters) {
      load(queryFor(filters))
    }
  }, [refreshKey])

  // Refetch whenever filters change (after initialization)
  React.useEffect(() => {
    if (initedRef.current && filters) {
      load(queryFor(filters))
    }
  }, [filters])

  const setFilter = (key: keyof ReportFilterState) => (values: string[]) => {
    setFilters((prev) => (prev ? { ...prev, [key]: values } : prev))
  }

  const resetFilters = () => {
    if (!data) return
    setFilters({
      months: data.options.months.map((m) => m.value),
      processes: data.options.processes,
      designations: data.options.designations,
      managers: data.options.managers.map((m) => m.value),
      employees: data.options.employees.map((e) => e.value),
    })
  }

  const exportReport = async () => {
    if (!filters) return
    setExporting(true)
    try {
      const res = await fetch(`/api/reports/export${queryFor(filters)}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TaskFlow-Report-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'Report exported ✅', description: 'Detailed Excel file downloaded.' })
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  const k = data?.kpis
  const hasData = Boolean(data)
  const emptyResult = hasData && k?.total === 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-200">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Team Reports</h2>
            <p className="text-xs text-slate-500">
              Performance of {data?.scope === 'org' ? 'the whole organization' : 'your downline'}
              {k ? ` · ${k.employees} employee${k.employees === 1 ? '' : 's'} in scope` : ''}
            </p>
          </div>
        </div>
        <Button onClick={exportReport} disabled={exporting || !hasData} className="shadow-sm">
          {exporting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm" aria-label="Report filters">
        <div className="mb-3 flex items-center gap-2 text-slate-500">
          <ListFilter className="h-4 w-4" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</h3>
          <span className="text-[11px] text-slate-400">— every filter supports “select all”</span>
        </div>
        {filters && data ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <MultiSelect label="Month" icon={CalendarRange} options={data.options.months} selected={filters.months} onChange={setFilter('months')} />
            <MultiSelect label="Process" icon={Users} options={data.options.processes.map((p) => ({ value: p, label: p }))} selected={filters.processes} onChange={setFilter('processes')} />
            <MultiSelect label="Designation" icon={BadgeCheck} options={data.options.designations.map((d) => ({ value: d, label: d }))} selected={filters.designations} onChange={setFilter('designations')} />
            <MultiSelect label="L1 Manager" icon={UserCog} options={data.options.managers} selected={filters.managers} onChange={setFilter('managers')} />
            <MultiSelect label="Employee" icon={Users} options={data.options.employees} selected={filters.employees} onChange={setFilter('employees')} />
            <Button type="button" variant="ghost" onClick={resetFilters} className="h-10 gap-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-xl" />
            ))}
          </div>
        )}
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Key metrics">
        {loading && !data
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
          : k && (
              <>
                <KpiTile icon={ClipboardList} label="Total assignments" value={k.total} sub={`across ${k.employees} employees`} />
                <KpiTile icon={CheckCircle2} label="Completed" value={k.completed} tone="emerald" sub={`${k.onTime} on time · ${k.late} late`} progress={k.completionRate} />
                <KpiTile icon={Gauge} label="Completion rate" value={`${k.completionRate}%`} tone="emerald" progress={k.completionRate} sub="of active work" />
                <KpiTile icon={Target} label="On-time rate" value={`${k.onTimeRate}%`} tone="amber" progress={k.onTimeRate} sub="of completed tasks" />
                <KpiTile icon={AlarmClock} label="Overdue" value={k.overdue} tone="red" sub="open, past due date" />
                <KpiTile icon={Ban} label="Aborted" value={k.aborted} tone="slate" sub="closed by creators" />
              </>
            )}
      </div>

      {emptyResult ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-600">No assignments match the selected filters</p>
          <p className="mt-1 text-xs text-slate-400">Try widening the month range or clearing some filters.</p>
          <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset filters
          </Button>
        </div>
      ) : (
        <>
          {/* Charts row A: donut + monthly trend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <ChartCard title="Status mix" subtitle="all filtered assignments" className="lg:col-span-2">
              {data && data.statusMix.some((s) => s.value > 0) ? (
                <>
                  <div className="relative mx-auto max-w-[260px]">
                    <ResponsiveContainer width="100%" height={210}>
                      <PieChart>
                        <Pie
                          data={data.statusMix.filter((s) => s.value > 0)}
                          dataKey="value"
                          nameKey="label"
                          innerRadius="62%"
                          outerRadius="88%"
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {data.statusMix
                            .filter((s) => s.value > 0)
                            .map((s) => (
                              <Cell key={s.key} fill={s.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} assignment${Number(v) === 1 ? '' : 's'}`, undefined]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-bold text-slate-900 tabular-nums">{k?.total ?? 0}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">assignments</p>
                    </div>
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {data.statusMix.map((s) => (
                      <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                        <span className="truncate">{s.label}</span>
                        <span className="ml-auto font-semibold text-slate-800 tabular-nums">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No data for this cut</div>
              )}
            </ChartCard>

            <ChartCard title="Monthly trend" subtitle="assignments due vs completions" className="lg:col-span-3">
              {data && data.monthly.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={data.monthly} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="due" name="Assigned (due)" stroke={COLORS.brandMid} fill="#dfe6f1" fillOpacity={0.55} strokeWidth={2} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke={COLORS.emerald} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.emerald }} />
                    <Line type="monotone" dataKey="late" name="Completed late" stroke={COLORS.amber} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: COLORS.amber }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-xs text-slate-400">No data for this cut</div>
              )}
            </ChartCard>
          </div>

          {/* Charts row B: per-employee stacked + leaderboard */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <ChartCard title="Outcome by employee" subtitle="on-time / late / overdue / open" className="lg:col-span-3">
              {data && data.byEmployee.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(260, data.byEmployee.length * 44 + 60)}>
                  <BarChart data={data.byEmployee} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                    <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="onTime" name="On time" stackId="a" fill={COLORS.emerald} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="late" name="Late" stackId="a" fill={COLORS.amber} />
                    <Bar dataKey="overdue" name="Overdue" stackId="a" fill={COLORS.red} />
                    <Bar dataKey="inProgress" name="In progress" stackId="a" fill={COLORS.violet} />
                    <Bar dataKey="pending" name="Pending" stackId="a" fill={COLORS.brandLight} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No data for this cut</div>
              )}
            </ChartCard>

            <ChartCard title="Completion leaderboard" subtitle="by completion rate" className="lg:col-span-2">
              {data && data.byEmployee.length > 0 ? (
                <ol className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1.5 [scrollbar-width:thin]">
                  {[...data.byEmployee]
                    .sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed)
                    .map((e, i) => (
                      <li key={e.id} className="flex items-center gap-2.5">
                        <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                        <InitialAvatar name={e.name} className="h-8 w-8 text-[10px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-slate-800">{e.name}</p>
                            <p className="shrink-0 text-xs font-bold text-brand-700 tabular-nums">{e.completionRate}%</p>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn('h-full rounded-full', e.completionRate >= 75 ? 'bg-emerald-500' : e.completionRate >= 40 ? 'bg-brand-500' : 'bg-amber-500')}
                              style={{ width: `${e.completionRate}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {e.completed}/{e.total - e.aborted} done · {e.overdue > 0 ? `${e.overdue} overdue` : 'nothing overdue'}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-xs text-slate-400">No data for this cut</div>
              )}
            </ChartCard>
          </div>

          {/* Charts row C: process + designation cuts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {(
              [
                { title: 'Performance by process', stat: data?.byProcess, subtitle: 'completed vs open vs overdue' },
                { title: 'Performance by designation', stat: data?.byDesignation, subtitle: 'completed vs open vs overdue' },
              ] as const
            ).map((g) => (
              <ChartCard key={g.title} title={g.title} subtitle={g.subtitle}>
                {g.stat && g.stat.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, g.stat.length * 52 + 50)}>
                    <BarChart data={g.stat} margin={{ top: 4, right: 8, left: -22, bottom: 0 }} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="completed" name="Completed" stackId="s" fill={COLORS.emerald} />
                      <Bar dataKey="overdue" name="Overdue" stackId="s" fill={COLORS.red} />
                      <Bar dataKey="open" name="Open (on track)" stackId="s" fill={COLORS.brandLight} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">No data for this cut</div>
                )}
              </ChartCard>
            ))}
          </div>
        </>
      )}

      {/* Detailed task log */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-label="Detailed task log">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-800">Detailed task log</h3>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 tabular-nums">
            {data?.rows.length ?? 0} record{(data?.rows.length ?? 0) === 1 ? '' : 's'} · included in Excel export
          </span>
        </div>
        {data && data.rows.length > 0 ? (
          <div className={cn('max-h-96 overflow-auto', SCROLLBAR)}>
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Task</th>
                  <th className="px-3 py-2.5 font-semibold">Employee</th>
                  <th className="px-3 py-2.5 font-semibold">Process</th>
                  <th className="px-3 py-2.5 font-semibold">Designation</th>
                  <th className="px-3 py-2.5 font-semibold">L1 Manager</th>
                  <th className="px-3 py-2.5 font-semibold">Assigned By</th>
                  <th className="px-3 py-2.5 font-semibold">Due (IST)</th>
                  <th className="px-3 py-2.5 font-semibold">Completed On</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold sm:px-5">Delay</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.taskId}-${r.userId}`} className="border-b border-slate-50 transition hover:bg-brand-50/40">
                    <td className="max-w-[240px] px-4 py-2.5 sm:px-5">
                      <button
                        type="button"
                        onClick={() => onOpenTask(r.taskId)}
                        className="line-clamp-2 text-left font-medium text-slate-800 underline-offset-2 hover:text-brand-700 hover:underline"
                        title={r.title}
                      >
                        {r.title}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-700">{r.userName}</p>
                      <p className="text-[10px] text-slate-400">{r.employeeCode}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{r.process}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.designation}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.managerName ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.assignedBy}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmtDateTime(r.dueDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.completedAt ? fmtDateTime(r.completedAt) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.aborted ? <AbortedBadge /> : <StatusBadge status={r.status} />}
                        {r.overdue && <OverdueBadge />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 sm:px-5">
                      {r.delayDays > 0 ? (
                        <span className="font-semibold text-red-600 tabular-nums">{r.delayDays}d</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-xs text-slate-400">
            {loading ? 'Loading records…' : 'No records match the selected filters.'}
          </p>
        )}
      </section>
    </div>
  )
}
