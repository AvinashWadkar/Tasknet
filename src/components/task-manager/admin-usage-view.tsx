'use client'

import * as React from 'react'
import { useToast } from '@/hooks/use-toast'
import { api } from './api'
import { InitialAvatar } from './shared'
import { cn } from '@/lib/utils'
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
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
  adoptionTrend: { label: string; newUsers: number; activeUsers: number }[]
  onboarding: { employees: number; passwordSet: number; appInstalled: number; active: number }
  featureUsage: { action: string; label: string; count: number }[]
  byProcess: { process: string; employees: number; adopted: number; active: number; tasksCreated: number; activities: number }[]
  topEmployees: { id: string; name: string; employeeCode: string; process: string; activities: number; tasksCreated: number }[]
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  tone?: 'brand' | 'emerald' | 'amber' | 'violet' | 'slate'
  progress?: number
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
          <div className={cn('h-full rounded-full transition-all', bars[tone])} style={{ width: `${Math.min(100, progress)}%` }} />
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
                />
                <KpiTile
                  icon={Activity}
                  label={`Active (${days}d)`}
                  value={data.kpis.activeUsers}
                  tone="emerald"
                  progress={data.kpis.engagementRate}
                  sub={`${data.kpis.engagementRate}% engagement`}
                />
                <KpiTile icon={GraduationCap} label="New employees" value={data.kpis.newThisPeriod} tone="amber" sub={`joined in last ${days} days`} />
                <KpiTile
                  icon={ClipboardList}
                  label="Tasks created"
                  value={data.kpis.tasksCreated}
                  tone="brand"
                  sub={`${data.kpis.tasksCompleted} completed`}
                />
                <KpiTile
                  icon={Smartphone}
                  label="Mobile app users"
                  value={data.kpis.appUsers}
                  tone="violet"
                  progress={data.kpis.appRate}
                  sub={`${data.kpis.appRate}% on the Android app`}
                />
                <KpiTile icon={Bell} label="Web push on" value={data.kpis.pushUsers} tone="slate" sub={`${data.kpis.pushRate}% enabled browser alerts`} />
              </>
            )}
      </div>

      {/* Trend + onboarding */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Adoption & activity trend" subtitle="new sign-ups vs monthly active users" className="lg:col-span-3">
          {data && data.adoptionTrend.some((m) => m.newUsers > 0 || m.activeUsers > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.adoptionTrend} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="newUsers" name="New sign-ups" fill={COLORS.brandMid} radius={[4, 4, 0, 0]} barSize={26} />
                <Line type="monotone" dataKey="activeUsers" name="Active users" stroke={COLORS.emerald} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No activity yet</div>
          )}
        </ChartCard>

        <ChartCard title="Onboarding funnel" subtitle="how far employees get" className="lg:col-span-2">
          {data ? (
            <ul className="space-y-4">
              {[
                { label: 'Employees', value: data.onboarding.employees, tone: 'bg-brand-500' },
                { label: 'Password set (signed in once)', value: data.onboarding.passwordSet, tone: 'bg-violet-500' },
                { label: 'Mobile app installed', value: data.onboarding.appInstalled, tone: 'bg-amber-500' },
                { label: 'Active this period', value: data.onboarding.active, tone: 'bg-emerald-500' },
              ].map((step) => {
                const p = data.onboarding.employees > 0 ? Math.round((step.value / data.onboarding.employees) * 100) : 0
                return (
                  <li key={step.label}>
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
        <ChartCard title="Feature usage" subtitle={`actions logged in the last ${days} days`} className="lg:col-span-3">
          {data && data.featureUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, data.featureUsage.length * 40 + 40)}>
              <BarChart data={data.featureUsage} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="26%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }} formatter={(v) => [`${v}`, 'Actions']} />
                <Bar dataKey="count" name="Actions" fill={BRAND} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-xs text-slate-400">No actions logged in this period</div>
          )}
        </ChartCard>

        <ChartCard title="Most active employees" subtitle={`by actions, last ${days} days`} className="lg:col-span-2">
          {data && data.topEmployees.length > 0 ? (
            <ol className="max-h-[320px] space-y-2.5 overflow-y-auto pr-1.5 [scrollbar-width:thin]">
              {data.topEmployees.map((e, i) => {
                const top = data.topEmployees[0]?.activities || 1
                return (
                  <li key={e.id} className="flex items-center gap-2.5">
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
            last {days} days · {data?.byProcess.length ?? 0} process{data?.byProcess.length === 1 ? '' : 'es'}
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
                  <tr key={p.process} className="border-b border-slate-50 transition hover:bg-brand-50/40">
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
    </div>
  )
}
