import { db } from '@/lib/db'

/**
 * Tool adoption & usage report — shared computation used by both the admin
 * JSON endpoint (/api/admin/usage) and the Excel export
 * (/api/admin/usage/export), so the two never drift apart.
 */

const DAY = 24 * 60 * 60 * 1000
const TREND_MONTHS = 6

export const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED: 'Tasks created',
  ASSIGNED: 'Assignments',
  STATUS_UPDATED: 'Status updates',
  COMMENT: 'Comments',
  TASK_UPDATED: 'Task edits',
  REOPENED: 'Reopens',
  VALIDATION: 'Sent for validation',
  VALIDATION_SENT: 'Validation sent',
  VALIDATED: 'Validated',
  RECURRENCE: 'Recurring rollovers',
}

export interface FeatureUsageRow {
  action: string
  label: string
  count: number
}
export interface AdoptionMonth {
  key: string
  label: string
  newUsers: number
  activeUsers: number
}
export interface ProcessUsageRow {
  process: string
  employees: number
  adopted: number
  active: number
  tasksCreated: number
  activities: number
}
export interface TopEmployeeRow {
  id: string
  name: string
  employeeCode: string
  process: string
  activities: number
  tasksCreated: number
}
export interface EmployeeUsageRow {
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
}
export interface UsageKpis {
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
export interface UsageOnboarding {
  employees: number
  passwordSet: number
  appInstalled: number
  active: number
}
export interface UsageReport {
  days: number
  generatedAt: string
  kpis: UsageKpis
  adoptionTrend: AdoptionMonth[]
  onboarding: UsageOnboarding
  featureUsage: FeatureUsageRow[]
  byProcess: ProcessUsageRow[]
  topEmployees: TopEmployeeRow[]
}
export interface UsageData {
  report: UsageReport
  employees: EmployeeUsageRow[]
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** Clamp the reporting window to 7–365 days (default 90). */
export function normalizeDays(daysParam: string | number | null | undefined): number {
  if (daysParam === null || daysParam === undefined || daysParam === '') return 90
  const n = Number(daysParam)
  if (!Number.isFinite(n)) return 90
  return Math.min(365, Math.max(7, Math.round(n)))
}

export async function buildUsageReport(daysParam?: string | number | null): Promise<UsageData> {
  const days = normalizeDays(daysParam)
  const now = new Date()
  const since = new Date(now.getTime() - days * DAY)
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1))

  const [users, devices, subs, periodActivities, trendActivities, adoptedRows, taskGroups, tasksCreated, completedCount] =
    await Promise.all([
      db.user.findMany({
        select: { id: true, name: true, employeeCode: true, process: true, isActive: true, isFirstLogin: true, createdAt: true },
      }),
      db.pushDevice.findMany({ where: { active: true }, select: { userId: true }, distinct: ['userId'] }),
      db.pushSubscription.findMany({ select: { userId: true }, distinct: ['userId'] }),
      db.taskActivity.findMany({ where: { createdAt: { gte: since } }, select: { actorId: true, action: true } }),
      db.taskActivity.findMany({ where: { createdAt: { gte: trendStart } }, select: { actorId: true, createdAt: true } }),
      db.taskActivity.findMany({ select: { actorId: true }, distinct: ['actorId'] }),
      db.task.groupBy({ by: ['createdById'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      db.task.count({ where: { createdAt: { gte: since } } }),
      db.taskAssignment.count({ where: { completedAt: { gte: since } } }),
    ])

  const userById = new Map(users.map((u) => [u.id, u]))
  const totalEmployees = users.length
  const activeEmployees = users.filter((u) => u.isActive).length

  const adoptedIds = new Set(adoptedRows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))
  const activeIds = new Set(periodActivities.map((a) => a.actorId).filter((x): x is string => Boolean(x)))
  const deviceUserIds = new Set(devices.map((d) => d.userId).filter((id) => userById.has(id)))
  const subUserIds = new Set(subs.map((s) => s.userId).filter((id) => userById.has(id)))

  const adoptedCount = users.filter((u) => adoptedIds.has(u.id)).length
  const activeUserCount = users.filter((u) => activeIds.has(u.id)).length
  const passwordSetCount = users.filter((u) => !u.isFirstLogin).length
  const newThisPeriod = users.filter((u) => u.createdAt >= since).length

  // Feature usage (period)
  const actionCounts = new Map<string, number>()
  for (const a of periodActivities) actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1)
  const featureUsage: FeatureUsageRow[] = [...actionCounts.entries()]
    .map(([action, count]) => ({ action, label: ACTION_LABELS[action] ?? action, count }))
    .sort((a, b) => b.count - a.count)

  // Adoption + activity trend (last TREND_MONTHS months)
  const monthIndex = new Map<string, number>()
  const months: AdoptionMonth[] = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + i, 1))
    monthIndex.set(monthKey(d), i)
    return { key: monthKey(d), label: monthLabel(d), newUsers: 0, activeUsers: 0 }
  })
  for (const u of users) {
    const idx = monthIndex.get(monthKey(u.createdAt))
    if (idx !== undefined) months[idx].newUsers++
  }
  const activeByMonth = months.map(() => new Set<string>())
  for (const a of trendActivities) {
    if (!a.actorId) continue
    const idx = monthIndex.get(monthKey(a.createdAt))
    if (idx !== undefined) activeByMonth[idx].add(a.actorId)
  }
  months.forEach((m, i) => (m.activeUsers = activeByMonth[i].size))

  // Usage by process
  const procMap = new Map<string, ProcessUsageRow>()
  const ensureProc = (p: string) => {
    const key = p || '—'
    let e = procMap.get(key)
    if (!e) {
      e = { process: key, employees: 0, adopted: 0, active: 0, tasksCreated: 0, activities: 0 }
      procMap.set(key, e)
    }
    return e
  }
  for (const u of users) {
    const e = ensureProc(u.process)
    e.employees++
    if (adoptedIds.has(u.id)) e.adopted++
    if (activeIds.has(u.id)) e.active++
  }
  for (const g of taskGroups) {
    const p = userById.get(g.createdById)?.process ?? '—'
    ensureProc(p).tasksCreated += g._count._all
  }
  for (const a of periodActivities) {
    const p = a.actorId ? userById.get(a.actorId)?.process ?? '—' : '—'
    ensureProc(p).activities++
  }
  const byProcess = [...procMap.values()].sort((a, b) => b.activities - a.activities || b.employees - a.employees)

  // Most active employees (period)
  const perUser = new Map<string, number>()
  for (const a of periodActivities) if (a.actorId) perUser.set(a.actorId, (perUser.get(a.actorId) ?? 0) + 1)
  const createdByUser = new Map(taskGroups.map((g) => [g.createdById, g._count._all]))
  const topEmployees: TopEmployeeRow[] = [...perUser.entries()]
    .map(([id, activities]) => {
      const u = userById.get(id)
      if (!u) return null
      return { id, name: u.name, employeeCode: u.employeeCode, process: u.process, activities, tasksCreated: createdByUser.get(id) ?? 0 }
    })
    .filter((x): x is TopEmployeeRow => Boolean(x))
    .sort((a, b) => b.activities - a.activities)
    .slice(0, 8)

  // Full per-employee adoption detail (for the export)
  const employees: EmployeeUsageRow[] = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      process: u.process,
      isActive: u.isActive,
      adopted: adoptedIds.has(u.id),
      active: activeIds.has(u.id),
      actions: perUser.get(u.id) ?? 0,
      tasksCreated: createdByUser.get(u.id) ?? 0,
      passwordSet: !u.isFirstLogin,
      app: deviceUserIds.has(u.id),
      push: subUserIds.has(u.id),
    }))
    .sort((a, b) => b.actions - a.actions || a.name.localeCompare(b.name))

  const report: UsageReport = {
    days,
    generatedAt: now.toISOString(),
    kpis: {
      totalEmployees,
      activeEmployees,
      adopted: adoptedCount,
      adoptedRate: pct(adoptedCount, activeEmployees),
      activeUsers: activeUserCount,
      engagementRate: pct(activeUserCount, activeEmployees),
      newThisPeriod,
      tasksCreated,
      tasksCompleted: completedCount,
      passwordSet: passwordSetCount,
      appUsers: deviceUserIds.size,
      appRate: pct(deviceUserIds.size, activeEmployees),
      pushUsers: subUserIds.size,
      pushRate: pct(subUserIds.size, activeEmployees),
    },
    adoptionTrend: months,
    onboarding: {
      employees: totalEmployees,
      passwordSet: passwordSetCount,
      appInstalled: deviceUserIds.size,
      active: activeUserCount,
    },
    featureUsage,
    byProcess,
    topEmployees,
  }

  return { report, employees }
}
