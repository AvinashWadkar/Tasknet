'use client'

import * as React from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { api } from './api'
import { InitialAvatar } from './shared'
import { fmtDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type {
  SurveyPendingRow,
  SurveyProcessRow,
  SurveyQuestionScore,
  SurveyReport,
  SurveyResponseRow,
} from '@/lib/survey-types'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Gauge,
  MessageSquare,
  Smile,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'

const BRAND = '#2e4566'
const DIST_COLORS = ['#dc2626', '#f97316', '#f59e0b', '#34d399', '#059669']
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(15, 35, 55, 0.10)',
  fontSize: 12,
  padding: '8px 12px',
} as const
const SCROLLBAR =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb:hover]:bg-slate-300'

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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:shadow-md">
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

function DistributionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
      {[1, 2, 3, 4, 5].map((score) => (
        <span key={score} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DIST_COLORS[score - 1] }} />
          {score}
        </span>
      ))}
    </div>
  )
}

function QuestionScorecard({ question, submitted }: { question: SurveyQuestionScore; submitted: number }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">{question.shortLabel}</p>
        <p className="shrink-0 text-xs font-semibold text-slate-800 tabular-nums">
          {question.average.toFixed(1)}
          <span className="ml-0.5 text-[10px] font-normal text-slate-400">/5</span>
        </p>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-200/70">
        {question.distribution.map((d, i) => (
          <div
            key={d.score}
            style={{ width: `${d.pct}%`, backgroundColor: DIST_COLORS[i] }}
            title={`${d.score}/5 · ${d.count} response${d.count === 1 ? '' : 's'} (${d.pct}%)`}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        {question.positiveRate}% rated 4–5 · {question.positive} of {submitted} response{submitted === 1 ? '' : 's'}
      </p>
    </li>
  )
}

interface CommentItem {
  id: string
  name: string
  process: string
  createdAt: string
  text: string
}

function CommentColumn({
  title,
  icon: Icon,
  items,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: CommentItem[]
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 tabular-nums">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-center text-xs text-slate-400">No comments yet</p>
      ) : (
        <ul className={cn('mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1.5', SCROLLBAR)}>
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center gap-2">
                <InitialAvatar name={c.name} className="h-6 w-6 text-[9px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate-700">{c.name}</p>
                  <p className="truncate text-[10px] text-slate-400">{c.process}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{fmtDate(c.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RatingCell({ value }: { value: number }) {
  const tone =
    value >= 4 ? 'bg-emerald-50 text-emerald-700' : value === 3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
  return (
    <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums', tone)}>
      {value}
    </span>
  )
}

export function AdminFeedbackView({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast()
  const [data, setData] = React.useState<SurveyReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [showAllResponses, setShowAllResponses] = React.useState(false)
  const [pendingOpen, setPendingOpen] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const r = await api<SurveyReport>('/api/survey/report')
        if (alive) setData(r)
      } catch (e) {
        if (alive) {
          toast({ title: 'Could not load the feedback report', description: e instanceof Error ? e.message : 'Please try again.' })
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [refreshKey, toast])

  const k = data?.kpis
  const chartData = (data?.questions ?? []).map((q) => ({ name: q.shortLabel, average: q.average }))
  const responses = data?.responses ?? []
  const pending: SurveyPendingRow[] = data?.pending ?? []
  const byProcess: SurveyProcessRow[] = data?.byProcess ?? []
  const visibleResponses = showAllResponses ? responses : responses.slice(0, 8)

  const commentItems = (key: 'likedMost' | 'improvements' | 'comments'): CommentItem[] =>
    responses
      .filter((r) => Boolean(r[key]?.trim()))
      .map((r) => ({
        id: `${r.id}-${key}`,
        name: r.name,
        process: r.process,
        createdAt: r.createdAt,
        text: r[key] as string,
      }))

  const exportReport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/survey/report/export', { cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Tasknet-Feedback-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({
        title: (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Feedback report exported
          </span>
        ),
        description: 'The Excel workbook has been downloaded.',
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
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Employee Feedback</h2>
            <p className="text-xs text-slate-500">
              What employees told us after using Tasknet for a month
              {data ? ` · ${data.kpis.submitted} response${data.kpis.submitted === 1 ? '' : 's'}` : ''}
            </p>
          </div>
        </div>
        <Button onClick={exportReport} disabled={exporting || !data} className="shadow-sm">
          {exporting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          Export Excel
        </Button>
      </div>

      {/* Headline insight */}
      {data && (
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-white to-brand-50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {data.kpis.submitted === 0 ? (
                <>
                  <p className="text-sm font-semibold text-slate-800">No responses yet</p>
                  <p className="text-xs text-slate-500">
                    As employees submit the mandatory survey, their feedback and the company-wide results will appear here.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-800">
                    {data.kpis.submitted} of {data.kpis.eligibleEmployees} employees shared feedback ({data.kpis.responseRate}%)
                  </p>
                  <p className="text-xs text-slate-600">
                    Average satisfaction is <span className="font-semibold text-brand-700">{data.kpis.avgOverall}/5</span>, and{' '}
                    <span className="font-semibold text-brand-700">{data.kpis.recommendRate}%</span> would recommend Tasknet to a
                    colleague. {data.kpis.commentCount} response{data.kpis.commentCount === 1 ? '' : 's'} included written comments.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" role="group" aria-label="Feedback metrics">
        {loading && !data
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-slate-100" />)
          : k && (
              <>
                <KpiTile
                  icon={UserCheck}
                  label="Responses"
                  value={`${k.submitted}/${k.eligibleEmployees}`}
                  tone="brand"
                  progress={k.responseRate}
                  sub={`${k.responseRate}% response rate`}
                />
                <KpiTile
                  icon={Star}
                  label="Overall satisfaction"
                  value={`${k.avgOverall}/5`}
                  tone="emerald"
                  progress={(k.avgOverall / 5) * 100}
                  sub={`${k.satisfiedRate}% rated it 4–5`}
                />
                <KpiTile
                  icon={ThumbsUp}
                  label="Would recommend"
                  value={`${k.recommendRate}%`}
                  tone="violet"
                  progress={k.recommendRate}
                  sub={`${k.avgRecommend}/5 average`}
                />
                <KpiTile
                  icon={Gauge}
                  label="Ease of use"
                  value={`${k.avgEaseOfUse}/5`}
                  tone="amber"
                  progress={(k.avgEaseOfUse / 5) * 100}
                  sub="How easy Tasknet feels"
                />
                <KpiTile
                  icon={ClipboardList}
                  label="Staying on top of tasks"
                  value={`${k.avgTaskClarity}/5`}
                  tone="brand"
                  progress={(k.avgTaskClarity / 5) * 100}
                  sub="Task visibility & focus"
                />
                <KpiTile
                  icon={Bell}
                  label="Notifications"
                  value={`${k.avgNotifications}/5`}
                  tone="slate"
                  progress={(k.avgNotifications / 5) * 100}
                  sub="Usefulness of alerts"
                />
              </>
            )}
      </div>

      {/* Score chart + scorecard */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <ChartCard title="Average score by question" subtitle="ratings on a 1–5 scale" className="lg:col-span-3">
          {data && data.kpis.submitted > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(46, 69, 102, 0.04)' }}
                  formatter={(v) => [`${v} / 5`, 'Average']}
                />
                <Bar dataKey="average" name="Average" fill={BRAND} radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No responses yet</div>
          )}
        </ChartCard>

        <ChartCard title="Rating distribution" subtitle="share of each score per question" className="lg:col-span-2">
          {data && data.kpis.submitted > 0 ? (
            <>
              <ul className="space-y-2.5">
                {data.questions.map((q) => (
                  <QuestionScorecard key={q.key} question={q} submitted={data.kpis.submitted} />
                ))}
              </ul>
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <DistributionLegend />
              </div>
            </>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-xs text-slate-400">No responses yet</div>
          )}
        </ChartCard>
      </div>

      {/* By process */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-label="Feedback by process">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-800">Feedback by process</h3>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            {byProcess.length} process{byProcess.length === 1 ? '' : 'es'} · response rate &amp; scores
          </span>
        </div>
        {byProcess.length > 0 ? (
          <div className={cn('max-h-96 overflow-auto', SCROLLBAR)}>
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold sm:px-5">Process</th>
                  <th className="px-3 py-2.5 font-semibold">Employees</th>
                  <th className="px-3 py-2.5 font-semibold">Responses</th>
                  <th className="px-3 py-2.5 font-semibold">Response rate</th>
                  <th className="px-3 py-2.5 font-semibold">Avg overall</th>
                  <th className="px-3 py-2.5 font-semibold">Avg recommendation</th>
                  <th className="px-3 py-2.5 font-semibold sm:px-5">Would recommend</th>
                </tr>
              </thead>
              <tbody>
                {byProcess.map((p) => (
                  <tr key={p.process} className="border-b border-slate-50 transition hover:bg-brand-50/40">
                    <td className="px-4 py-2.5 font-medium text-slate-800 sm:px-5">{p.process}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.employees}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.submitted}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.responseRate}%</td>
                    <td className="px-3 py-2.5 font-semibold text-brand-700 tabular-nums">{p.submitted > 0 ? `${p.avgOverall}/5` : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{p.submitted > 0 ? `${p.avgRecommend}/5` : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums sm:px-5">{p.submitted > 0 ? `${p.recommendRate}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-xs text-slate-400">{loading ? 'Loading…' : 'No processes to report.'}</p>
        )}
      </section>

      {/* Comments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CommentColumn title="What employees like most" icon={Smile} items={commentItems('likedMost')} />
        <CommentColumn title="What to improve" icon={TrendingUp} items={commentItems('improvements')} />
        <CommentColumn title="Anything else" icon={MessageSquare} items={commentItems('comments')} />
      </div>

      {/* Responses */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-label="Survey responses">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-800">All responses</h3>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            {responses.length} submission{responses.length === 1 ? '' : 's'}
          </span>
        </div>
        {responses.length > 0 ? (
          <>
            <div className={cn('max-h-[28rem] overflow-auto', SCROLLBAR)}>
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2.5 font-semibold sm:px-5">Employee</th>
                    <th className="px-3 py-2.5 font-semibold">Process</th>
                    <th className="px-3 py-2.5 font-semibold">Overall</th>
                    <th className="px-3 py-2.5 font-semibold">Ease</th>
                    <th className="px-3 py-2.5 font-semibold">Tasks</th>
                    <th className="px-3 py-2.5 font-semibold">Alerts</th>
                    <th className="px-3 py-2.5 font-semibold">Recommend</th>
                    <th className="px-3 py-2.5 font-semibold">Average</th>
                    <th className="px-3 py-2.5 font-semibold sm:px-5">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleResponses.map((r) => (
                    <ResponseRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
            {responses.length > 8 && (
              <div className="border-t border-slate-100 px-4 py-2.5 text-center sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowAllResponses((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {showAllResponses ? (
                    <>
                      Show fewer <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Show all {responses.length} responses <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="px-5 py-10 text-center text-xs text-slate-400">
            {loading ? 'Loading…' : 'No responses yet — employees will appear here as they submit the survey.'}
          </p>
        )}
      </section>

      {/* Pending */}
      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-label="Pending responses">
        <button
          type="button"
          onClick={() => setPendingOpen((v) => !v)}
          aria-expanded={pendingOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Pending responses</h3>
              <p className="text-[11px] text-slate-400">
                {pending.length === 0 ? 'Everyone has submitted the survey' : `${pending.length} employee${pending.length === 1 ? '' : 's'} still to submit`}
              </p>
            </div>
          </div>
          {pendingOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {pendingOpen && pending.length > 0 && (
          <ul className={cn('max-h-80 overflow-y-auto border-t border-slate-100 px-2 py-2 sm:px-3', SCROLLBAR)}>
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <InitialAvatar name={p.name} className="h-7 w-7 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">{p.name}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    {p.employeeCode} · {p.designation} · {p.process}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
          The survey is mandatory for employees and can be submitted only once. ADMIN accounts are exempt and can review the
          results here.
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <MessageSquare className="h-3.5 w-3.5" /> <Star className="h-3.5 w-3.5" />
          </span>
        </p>
      )}
    </div>
  )
}

function ResponseRow({ row }: { row: SurveyResponseRow }) {
  return (
    <tr className="border-b border-slate-50 transition hover:bg-brand-50/40">
      <td className="px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <InitialAvatar name={row.name} className="h-7 w-7 text-[10px]" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">{row.name}</p>
            <p className="truncate text-[10px] text-slate-400">{row.employeeCode}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-600">{row.process}</td>
      <td className="px-3 py-2.5"><RatingCell value={row.overall} /></td>
      <td className="px-3 py-2.5"><RatingCell value={row.easeOfUse} /></td>
      <td className="px-3 py-2.5"><RatingCell value={row.taskClarity} /></td>
      <td className="px-3 py-2.5"><RatingCell value={row.notifications} /></td>
      <td className="px-3 py-2.5"><RatingCell value={row.recommend} /></td>
      <td className="px-3 py-2.5 font-semibold text-brand-700 tabular-nums">{row.average}/5</td>
      <td className="px-3 py-2.5 text-slate-500 sm:px-5">{fmtDate(row.createdAt)}</td>
    </tr>
  )
}
