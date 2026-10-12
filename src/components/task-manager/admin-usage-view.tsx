'use client'

import * as React from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { api } from './api'
import { InitialAvatar } from './shared'
import { UsageDrillDialog, EmployeeUsageDialog, type DrillState, type DrillRow, type UsageEmployee } from './usage-drill-dialog'
import { cn } from '@/lib/utils'
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Download,
  GraduationCap,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const BRAND = '#2e4566'
const COLORS = {
  emerald: '#059669',
  amber: '#f59e0b',
  violet: '#7c3aed',
  brandLight: '#9fb1cb',
  brandMid: '#7189ad',
}

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(15, 35, 55, 0.10)',
  fontSize: 12,
  padding: '8px 12px',
} as const

const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb:hover]:bg-slate-300'

type Period = 30 | 90 | 180

interface UsageResponse {
  days: number
  generatedAt: string
  kpis: {
    totalEmployees: number
    activeEmployees: number
    adopted: number
    adoptedRate: number
    activeUsers: number
    engagementRate: number
    newThisPeriod: number
    tasksCreated: number
    tasksCompleted: number
    passwordSet: number
    appUsers: number
    appRate: number
    pushUsers: number
    pushRate: number
  }
  adoptionTrend: { key: string; label: string; newUsers: number; activeUsers: number }[]
  onboarding: { employees: number; passwordSet: number; appInstalled: number; active: number }
  featureUsage: { action: string; label: string; count: number }[]
  byProcess: { process: string; employees: number; adopted: number; active: number; tasksCreated: number; activities: number }[]
  topEmployees: { id: string; name: string; employeeCode: string; process: string; activities: number; tasksCreated: number }[]
  employees: UsageEmployee[]
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
]

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'brand',
  progress,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  tone?: 'brand' | 'emerald' | 'amber' | 'violet' | 'slate'
  progress?: number
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-500',
  }
  const bars: Record<string, string> = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-400',
  }
  const Comp: React.ElementType = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:shadow-md',
        onClick && 'cursor-pointer hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="presentation">
          <div className={cn('h-full rounded-full transition-all', bars[tone])} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {sub && <p className="mt-1 truncate text-[11px] text-slate-400">{sub}</p>}
    </Comp>
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
    <section className={cn('min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5', className)} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function AdminUsageView({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast()
  const [days, setDays] = React.useState<Period>(90)
  const [data, setData] = React.useState<UsageResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [drill, setDrill] = React.useState<DrillState | null>(null)
  const [empDetail, setEmpDetail] = React.useState<UsageEmployee | null>(null)
  const reqIdRef = React.useRef(0)

  React.useEffect(() => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    ;(async () => {
      try {
        const r = await api<UsageResponse>(`/api/admin/usage?days=${days}`)
        if (reqId === reqIdRef.current) setData(r)
      } catch (e) {
        if (reqId === reqIdRef.current) {
          toast({ title: 'Could not load usage report', description: e instanceof Error ? e.message : 'Please try again.' })
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    })()
  }, [days, refreshKey, toast])

  const k = data?.kpis
  const hasData = Boolean(data)

  const employees = data?.employees ?? []
  const labelFor = (action: string) => data?.featureUsage.find((f) => f.action === action)?.label ?? action
  const sinceMs = data ? new Date(data.generatedAt).getTime() - data.days * 86400000 : 0

  const tagsOf = (e: UsageEmployee): string[] => {
    const t: string[] = []
    if (e.adopted) t.push('Adopted')
    if (e.app) t.push('App')
    if (e.push) t.push('Push')
    return t
  }
  const joinedNote = (e: UsageEmployee) =>
    `Joined ${new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  function openDrill(
    title: string,
    subtitle: string,
    list: UsageEmployee[],
    valueOf: (e: UsageEmployee) => number,
    valueLabel: string,
    noteOf?: (e: UsageEmployee) => string,
    icon?: React.ComponentType<{ className?: string }>,
    empty?: string
  ) {
    const rows: DrillRow[] = list.map((e) => ({
      id: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
      process: e.process,
      value: valueOf(e),
      valueLabel,
      note: noteOf?.(e),
      tags: tagsOf(e),
    }))
    setDrill({ title, subtitle, valueLabel, rows, icon, empty })
  }

  function openTrendMonth(index: number, kind: 'new' | 'active') {
    if (!data) return
    const m = data.adoptionTrend[index]
    if (m) openTrendMonthKey(m.key, kind, m.label)
  }

  function openTrendMonthKey(key: string, kind: 'new' | 'active', label?: string) {
    if (!data) return
    const month = data.adoptionTrend.find((x) => x.key === key)
    const name = label ?? month?.label ?? key
    if (kind === 'new') {
      openDrill(
        `New sign-ups · ${name}`,
        `Employees who joined Tasknet in ${name}`,
        employees.filter((e) => e.createdAt.slice(0, 7) === key),
        (e) => e.actions,
        'actions',
        joinedNote
      )
    } else {
      openDrill(
        `Active users · ${name}`,
        `Employees with at least one action in ${name}`,
        employees.filter((e) => e.activeMonths.includes(key)),
        (e) => e.actions,
        'actions'
      )
    }
  }

  function openAction(index: number) {
    if (!data) return
    const f = data.featureUsage[index]
    if (!f) return
    const list = employees
      .filter((e) => (e.actionsByAction[f.action] ?? 0) > 0)
      .sort((a, b) => (b.actionsByAction[f.action] ?? 0) - (a.actionsByAction[f.action] ?? 0))
    openDrill(
      f.label,
      `Employees who logged this action · last ${data.days} days`,
      list,
      (e) => e.actionsByAction[f.action] ?? 0,
      'actions',
      undefined,
      undefined,
      'No employee is linked to these actions — they were recorded automatically by the system (for example recurring rollovers).'
    )
  }

  const exportUsage = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/usage/export?days=${days}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Tasknet-Usage-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Report exported
          </span>
        ),
        description: 'Adoption & usage Excel file downloaded.',
      })
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Tool Adoption &amp; Usage</h2>
            <p className="text-xs text-slate-500">
              How employees have adopted and are using Tasknet
              {data ? ` · ${data.kpis.activeEmployees} active employee${data.kpis.activeEmployees === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Report period">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setDays(p.value)}
                aria-pressed={days === p.value}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  days === p.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button onClick={exportUsage} disabled={exporting || !hasData} className="shadow-sm">
            {exporting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Adoption metrics">
        {loading && !data
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-slate-100" />)
          : data && (
              <>
                <KpiTile
                  icon={UserCheck}
                  label="Adopted employees"
                  value={data.kpis.adopted}
                  tone="brand"
                  progress={data.kpis.adoptedRate}
                  sub={`${data.kpis.adoptedRate}% of active employees`}
                  onClick={() =>
                    openDrill(
                      'Adopted employees',
                      'Employees who have recorded at least one action in Tasknet',
                      employees.filter((e) => e.adopted),
                      (e) => e.actions,
                      'actions'
                    )
                  }
                />
                <KpiTile
                  icon={Activity}
                  label={`Active (${days}d)`}
                  value={data.kpis.activeUsers}
                  tone="emerald"
                  progress={data.kpis.engagementRate}
                  sub={`${data.kpis.engagementRate}% engagement`}
                  onClick={() =>
                    openDrill(
                      `Active employees · last ${days} days`,
                      'Employees with at least one action in the selected window',
                      employees.filter((e) => e.active),
                      (e) => e.actions,
                      'actions'
                    )
                  }
                />
                <KpiTile
                  icon={GraduationCap}
                  label="New employees"
                  value={data.kpis.newThisPeriod}
                  tone="amber"
                  sub={`joined in last ${days} days`}
                  onClick={() =>
                    openDrill(
                      `New employees · last ${days} days`,
                      'Employee IDs created in the selected window, newest first',
                      employees
                        .filter((e) => new Date(e.createdAt).getTime() >= sinceMs)
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
                      (e) => e.actions,
                      'actions',
                      joinedNote
                    )
                  }
                />
                <KpiTile
                  icon={ClipboardList}
                  label="Tasks created"
                  value={data.kpis.tasksCreated}
                  tone="brand"
                  sub={`${data.kpis.tasksCompleted} completed`}
                  onClick={() =>
                    openDrill(
                      `Tasks created · last ${days} days`,
                      'Employees ranked by how many tasks they created',
                      employees.filter((e) => e.tasksCreated > 0).sort((a, b) => b.tasksCreated - a.tasksCreated),
                      (e) => e.tasksCreated,
                      'tasks'
                    )
                  }
                />
                <KpiTile
                  icon={Smartphone}
                  label="Mobile app users"
                  value={data.kpis.appUsers}
                  tone="violet"
                  progress={data.kpis.appRate}
                  sub={`${data.kpis.appRate}% on the Android app`}
                  onClick={() =>
                    openDrill(
                      'Mobile app users',
                      `Employees with the Tasknet Android app installed · ${data.kpis.appRate}% of active employees`,
                      employees.filter((e) => e.app),
                      (e) => e.actions,
                      'actions'
                    )
                  }
                />
                <KpiTile
                  icon={Bell}
                  label="Web push on"
                  value={data.kpis.pushUsers}
                  tone="slate"
                  sub={`${data.kpis.pushRate}% enabled browser alerts`}
                  onClick={() =>
                    openDrill(
                      'Web push enabled',
                      `Employees with browser push notifications on · ${data.kpis.pushRate}% of active employees`,
                      employees.filter((e) => e.push),
                      (e) => e.actions,
                      'actions'
                    )
                  }
                />
              </>
            )}
      </div>

      {/* Trend + onboarding */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Adoption & activity trend" subtitle="new sign-ups vs monthly active users · click a bar for details" className="lg:col-span-3">
          {data && data.adoptionTrend.length > 0 ? (
            <div className="[&_.recharts-bar-rectangle]:cursor-pointer [&_.recharts-line]:cursor-pointer [&_.recharts-line-dot]:cursor-pointer">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data.adoptionTrend} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} />
                  <Legend />
                  <Bar
                    dataKey="newUsers"
                    name="New sign-ups"
                    fill={COLORS.brandMid}
                    radius={[4, 4, 0, 0]}
                    barSize={26}
                    onClick={(_d: unknown, index: number) => openTrendMonth(index, 'new')}
                  />
                  <Line
                    type="monotone"
                    dataKey="activeUsers"
                    name="Active users"
                    stroke={COLORS.emerald}
                    strokeWidth={2.5}
                    dot={(p: any) => {
                      const { cx, cy, payload } = p as { cx?: number; cy?: number; payload?: { key?: string } }
                      if (cx == null || cy == null) return <g />
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill={COLORS.emerald}
                          className="cursor-pointer"
                          onClick={() => payload?.key && openTrendMonthKey(payload.key, 'active')}
                        />
                      )
                    }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No activity yet</div>
          )}
        </ChartCard>

        <ChartCard title="Onboarding funnel" subtitle="how far employees get" className="lg:col-span-2">
          {data ? (
            <ul className="space-y-4">
              {[
                { label: 'Employees', value: data.onboarding.employees, tone: 'bg-brand-500', metric: 'all' as const },
                { label: 'Password set (signed in once)', value: data.onboarding.passwordSet, tone: 'bg-violet-500', metric: 'password' as const },
                { label: 'Mobile app installed', value: data.onboarding.appInstalled, tone: 'bg-amber-500', metric: 'app' as const },
                { label: 'Active this period', value: data.onboarding.active, tone: 'bg-emerald-500', metric: 'active' as const },
              ].map((step) => {
                const p = data.onboarding.employees > 0 ? Math.round((step.value / data.onboarding.employees) * 100) : 0
                const onClick = () => {
                  if (step.metric === 'all') openDrill('Employees', `All employees on Tasknet · ${employees.length} total`, employees, (e) => e.actions, 'actions')
                  else if (step.metric === 'password')
                    openDrill('Password set', 'Employees who have signed in and set their own password', employees.filter((e) => e.passwordSet), (e) => e.actions, 'actions')
                  else if (step.metric === 'app')
                    openDrill('Mobile app installed', 'Employees with the Tasknet Android app installed', employees.filter((e) => e.app), (e) => e.actions, 'actions')
                  else
                    openDrill(`Active · last ${days} days`, 'Employees with at least one action in the selected window', employees.filter((e) => e.active), (e) => e.actions, 'actions')
                }
                return (
                  <li key={step.label}>
                    <button
                      type="button"
                      onClick={onClick}
                      className="w-full cursor-pointer rounded-lg px-1.5 py-1 text-left transition hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600">{step.label}</span>
                        <span className="text-xs font-semibold text-slate-800 tabular-nums">
                          {step.value}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">{p}%</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={cn('h-full rounded-full', step.tone)} style={{ width: `${p}%` }} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">Loading…</div>
          )}
        </ChartCard>
      </div>

      {/* Feature usage + top employees */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Feature usage" subtitle={`actions logged in the last ${days} days · click a bar for details`} className="lg:col-span-3">
          {data && data.featureUsage.length > 0 ? (
            <div className="[&_.recharts-bar-rectangle]:cursor-pointer">
              <ResponsiveContainer width="100%" height={Math.max(220, data.featureUsage.length * 40 + 40)}>
                <BarChart data={data.featureUsage} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="26%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} formatter={(v) => [`${v}`, 'Actions']} />
                  <Bar
                    dataKey="count"
                    name="Actions"
                    fill={BRAND}
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                    onClick={(_d: unknown, index: number) => openAction(index)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">No actions logged in this period</div>
          )}
        </ChartCard>

        <ChartCard title="Most active employees" subtitle={`by actions, last ${days} days · click a person for details`} className="lg:col-span-2">
          {data && data.topEmployees.length > 0 ? (
            <ol className="max-h-[320px] space-y-2.5 overflow-y-auto pr-1.5 [scrollbar-width:thin]">
              {data.topEmployees.map((e, i) => {
                const top = data.topEmployees[0]?.activities || 1
                const full = employees.find((x) => x.id === e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => full && setEmpDetail(full)}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <span className="w-4 shrink-0 text-right text-[11px] font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                      <InitialAvatar name={e.name} className="h-8 w-8 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-slate-800">{e.name}</p>
                          <p className="shrink-0 text-xs font-bold text-brand-700 tabular-nums">{e.activities}</p>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((e.activities / top) * 100)}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {e.process} · {e.tasksCreated} task{e.tasksCreated === 1 ? '' : 's'} created
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">No active employees in this period</div>
          )}
        </ChartCard>
      </div>

      {/* Usage by process */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-label="Usage by process">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-800">Usage by process</h3>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            last {days} days · {data?.byProcess.length ?? 0} process{data?.byProcess.length === 1 ? '' : 'es'} · click a row
          </span>
        </div>
        {data && data.byProcess.length > 0 ? (
          <div className={cn('max-h-96 overflow-auto', SCROLLBAR)}>
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Process</th>
                  <th className="px-3 py-2.5 font-semibold">Employees</th>
                  <th className="px-3 py-2.5 font-semibold">Adopted</th>
                  <th className="px-3 py-2.5 font-semibold">Active</th>
                  <th className="px-3 py-2.5 font-semibold">Tasks created</th>
                  <th className="px-3 py-2.5 font-semibold sm:px-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.byProcess.map((p) => (
                  <tr
                    key={p.process}
                    onClick={() =>
                      openDrill(
                        p.process,
                        `${p.employees} employee${p.employees === 1 ? '' : 's'} · ${p.adopted} adopted · ${p.active} active · last ${days} days`,
                        employees.filter((e) => e.process === p.process),
                        (e) => e.actions,
                        'actions'
                      )
                    }
                    className="cursor-pointer border-b border-slate-50 transition hover:bg-brand-50/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">{p.process}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.employees}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                      {p.adopted}
                      <span className="ml-1 text-[10px] text-slate-400">{p.employees ? Math.round((p.adopted / p.employees) * 100) : 0}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.active}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.tasksCreated}</td>
                    <td className="px-3 py-2.5 font-semibold text-brand-700 tabular-nums sm:px-5">{p.activities}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-xs text-slate-400">{loading ? 'Loading…' : 'No processes to report.'}</p>
        )}
      </section>

      {data && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          Adoption = employees who have recorded at least one action. &ldquo;Active&rdquo; counts people with any action in the selected window.
          <BarChart3 className="ml-auto hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
          <ShieldCheck className="hidden h-3.5 w-3.5 sm:block" /> <Users className="hidden h-3.5 w-3.5" />
        </p>
      )}

      <UsageDrillDialog state={drill} onClose={() => setDrill(null)} />
      <EmployeeUsageDialog employee={empDetail} days={days} labelFor={labelFor} onClose={() => setEmpDetail(null)} />
    </div>
  )
}
