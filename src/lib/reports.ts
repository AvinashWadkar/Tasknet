import { db } from '@/lib/db'
import { getDescendantIds } from '@/lib/hierarchy'

/**
 * Server-side report engine for the manager "Reports" tab.
 * Scope = the viewer's full downline (manager) or the whole org (ADMIN).
 * One ReportRow per task-assignment of a visible employee — the atomic unit
 * every cut (KPI / donut / trend / per-employee / per-process / detail) is
 * aggregated from.
 */

export interface ReportUser {
  id: string
  name: string
  employeeCode: string
  process: string
  designation: string
  managerId: string | null
  managerName: string | null
}

export interface ReportFilters {
  months: string[] // 'YYYY-MM' — IST month of the task due date
  processes: string[]
  designations: string[]
  managerIds: string[] // L1 manager (User.id) within the visible downline
  userIds: string[]
}

export interface ReportRow {
  taskId: string
  title: string
  assignedBy: string
  dueDate: string // ISO
  createdAt: string // ISO
  taskState: 'ACTIVE' | 'ABORTED'
  userId: string
  userName: string
  employeeCode: string
  process: string
  designation: string
  managerId: string | null
  managerName: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  completedAt: string | null
  aborted: boolean
  overdue: boolean
  onTime: boolean // completed at/before due date
  delayDays: number // completed late → days late; open overdue → days past due; else 0
}

export interface EmployeeStat {
  id: string
  name: string
  employeeCode: string
  process: string
  designation: string
  managerName: string | null
  total: number
  completed: number
  onTime: number
  late: number
  pending: number
  inProgress: number
  overdue: number
  aborted: number
  completionRate: number // 0-100, aborted excluded from denominator
  onTimeRate: number // 0-100, of completed
  avgDelayDays: number // mean delay over late-completed + open-overdue rows
}

export interface GroupStat {
  key: string
  total: number
  completed: number
  overdue: number
  open: number
  aborted: number
  completionRate: number
}

export interface MonthPoint {
  key: string // YYYY-MM
  label: string // "Sep 2026"
  due: number
  completed: number
  late: number
}

export interface Kpis {
  employees: number
  total: number
  completed: number
  onTime: number
  late: number
  pending: number
  inProgress: number
  overdue: number
  aborted: number
  completionRate: number
  onTimeRate: number
}

export interface StatusSlice {
  key: string
  label: string
  value: number
  color: string
}

const DAY_MS = 86400000
const IST_OFFSET_MIN = 330
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Special manager-filter value representing employees with no L1 manager (org roots). */
export const UNMANAGED_KEY = '__UNASSIGNED__'

function managerMatches(managerId: string | null, selected: string[]): boolean {
  if (managerId) return selected.includes(managerId)
  return selected.includes(UNMANAGED_KEY)
}

export function istMonthKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 7)
}

export function monthLabelOf(key: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return key
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** Visible employees for reports: full downline (manager) or whole org (ADMIN). */
export async function getReportScope(session: {
  id: string
  role: string
}): Promise<{ users: ReportUser[]; scope: 'team' | 'org' } | null> {
  const allUsers = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      process: true,
      designation: true,
      role: true,
      managerId: true,
    },
  })
  const byId = new Map(allUsers.map((u) => [u.id, u]))

  let visibleIds: string[]
  let scope: 'team' | 'org'
  if (session.role === 'ADMIN') {
    visibleIds = allUsers.filter((u) => u.role !== 'ADMIN').map((u) => u.id)
    scope = 'org'
  } else {
    visibleIds = await getDescendantIds(session.id)
    if (visibleIds.length === 0) return null
    scope = 'team'
  }

  const users: ReportUser[] = visibleIds
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      process: u.process,
      designation: u.designation,
      managerId: u.managerId,
      managerName: u.managerId ? (byId.get(u.managerId)?.name ?? null) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { users, scope }
}

/** One row per task-assignment across the visible users. */
export async function loadReportRows(users: ReportUser[]): Promise<ReportRow[]> {
  if (users.length === 0) return []
  const ids = users.map((u) => u.id)
  const byId = new Map(users.map((u) => [u.id, u]))
  const assignments = await db.taskAssignment.findMany({
    where: { userId: { in: ids } },
    include: {
      task: {
        include: { creator: { select: { name: true } } },
      },
    },
  })

  const now = new Date()
  const rows: ReportRow[] = assignments.map((a) => {
    const u = byId.get(a.userId)!
    const aborted = a.task.status === 'ABORTED'
    const overdue = !aborted && a.status !== 'COMPLETED' && a.task.dueDate < now
    const onTime = a.status === 'COMPLETED' && a.completedAt !== null && a.completedAt <= a.task.dueDate
    const lateDone = a.status === 'COMPLETED' && a.completedAt !== null && a.completedAt > a.task.dueDate
    let delayDays = 0
    if (lateDone && a.completedAt) delayDays = Math.ceil((a.completedAt.getTime() - a.task.dueDate.getTime()) / DAY_MS)
    else if (overdue) delayDays = Math.ceil((now.getTime() - a.task.dueDate.getTime()) / DAY_MS)
    return {
      taskId: a.taskId,
      title: a.task.title,
      assignedBy: a.task.creator.name,
      dueDate: a.task.dueDate.toISOString(),
      createdAt: a.task.createdAt.toISOString(),
      taskState: a.task.status as 'ACTIVE' | 'ABORTED',
      userId: a.userId,
      userName: u.name,
      employeeCode: u.employeeCode,
      process: u.process,
      designation: u.designation,
      managerId: u.managerId,
      managerName: u.managerName,
      status: a.status as ReportRow['status'],
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      aborted,
      overdue,
      onTime,
      delayDays,
    }
  })
  rows.sort((x, y) => y.dueDate.localeCompare(x.dueDate))
  return rows
}

function matches(row: ReportRow, f: ReportFilters): boolean {
  if (f.months.length && !f.months.includes(istMonthKey(new Date(row.dueDate)))) return false
  if (f.processes.length && !f.processes.includes(row.process)) return false
  if (f.designations.length && !f.designations.includes(row.designation)) return false
  if (f.managerIds.length && !managerMatches(row.managerId, f.managerIds)) return false
  if (f.userIds.length && !f.userIds.includes(row.userId)) return false
  return true
}

export function filterRows(rows: ReportRow[], f: ReportFilters): ReportRow[] {
  return rows.filter((r) => matches(r, f))
}

/** Users surviving the employee-dimension filters (process/designation/manager/employee). */
export function filterUsers(users: ReportUser[], f: ReportFilters): ReportUser[] {
  return users.filter(
    (u) =>
      (!f.processes.length || f.processes.includes(u.process)) &&
      (!f.designations.length || f.designations.includes(u.designation)) &&
      (!f.managerIds.length || managerMatches(u.managerId, f.managerIds)) &&
      (!f.userIds.length || f.userIds.includes(u.id))
  )
}

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export function aggregateKpis(rows: ReportRow[], employees: number): Kpis {
  const k: Kpis = {
    employees,
    total: rows.length,
    completed: 0,
    onTime: 0,
    late: 0,
    pending: 0,
    inProgress: 0,
    overdue: 0,
    aborted: 0,
    completionRate: 0,
    onTimeRate: 0,
  }
  for (const r of rows) {
    if (r.aborted) k.aborted++
    else if (r.status === 'COMPLETED') {
      k.completed++
      if (r.onTime) k.onTime++
      else k.late++
    } else if (r.status === 'IN_PROGRESS') k.inProgress++
    else k.pending++
    if (r.overdue) k.overdue++
  }
  const workable = k.total - k.aborted
  k.completionRate = rate(k.completed, workable)
  k.onTimeRate = rate(k.onTime, k.completed)
  return k
}

/** Mutually-exclusive buckets for the donut. */
export function aggregateStatusMix(rows: ReportRow[]): StatusSlice[] {
  const c = { onTime: 0, late: 0, overdue: 0, inProgress: 0, pending: 0, aborted: 0 }
  for (const r of rows) {
    if (r.aborted) c.aborted++
    else if (r.status === 'COMPLETED') {
      if (r.onTime) c.onTime++
      else c.late++
    } else if (r.overdue) c.overdue++
    else if (r.status === 'IN_PROGRESS') c.inProgress++
    else c.pending++
  }
  return [
    { key: 'onTime', label: 'Completed on time', value: c.onTime, color: '#059669' },
    { key: 'late', label: 'Completed late', value: c.late, color: '#f59e0b' },
    { key: 'overdue', label: 'Overdue', value: c.overdue, color: '#dc2626' },
    { key: 'inProgress', label: 'In progress', value: c.inProgress, color: '#7c3aed' },
    { key: 'pending', label: 'Pending', value: c.pending, color: '#9fb1cb' },
    { key: 'aborted', label: 'Aborted', value: c.aborted, color: '#94a3b8' },
  ]
}

/** Monthly trend: due (by due month) vs completed (by completion month), last ≤12 months. */
export function aggregateMonthly(rows: ReportRow[]): MonthPoint[] {
  const keys = new Set<string>()
  for (const r of rows) {
    keys.add(istMonthKey(new Date(r.dueDate)))
    if (r.completedAt) keys.add(istMonthKey(new Date(r.completedAt)))
  }
  const sorted = [...keys].sort().slice(-12)
  const map = new Map<string, MonthPoint>(
    sorted.map((k) => [k, { key: k, label: monthLabelOf(k), due: 0, completed: 0, late: 0 }])
  )
  for (const r of rows) {
    const duePoint = map.get(istMonthKey(new Date(r.dueDate)))
    if (duePoint && !r.aborted) duePoint.due++
    if (r.completedAt && r.status === 'COMPLETED') {
      const compPoint = map.get(istMonthKey(new Date(r.completedAt)))
      if (compPoint) {
        compPoint.completed++
        if (!r.onTime) compPoint.late++
      }
    }
  }
  return sorted.map((k) => map.get(k)!)
}

export function aggregateEmployees(rows: ReportRow[], users: ReportUser[]): EmployeeStat[] {
  const stats = new Map<string, EmployeeStat>()
  for (const u of users) {
    stats.set(u.id, {
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      process: u.process,
      designation: u.designation,
      managerName: u.managerName,
      total: 0,
      completed: 0,
      onTime: 0,
      late: 0,
      pending: 0,
      inProgress: 0,
      overdue: 0,
      aborted: 0,
      completionRate: 0,
      onTimeRate: 0,
      avgDelayDays: 0,
    })
  }
  const delaySum = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    const s = stats.get(r.userId)
    if (!s) continue
    s.total++
    if (r.aborted) s.aborted++
    else if (r.status === 'COMPLETED') {
      s.completed++
      if (r.onTime) s.onTime++
      else s.late++
    } else if (r.status === 'IN_PROGRESS') s.inProgress++
    else s.pending++
    if (r.overdue) s.overdue++
    if (r.delayDays > 0 && (r.status === 'COMPLETED' ? !r.onTime : r.overdue)) {
      const d = delaySum.get(r.userId) || { sum: 0, n: 0 }
      d.sum += r.delayDays
      d.n++
      delaySum.set(r.userId, d)
    }
  }
  for (const s of stats.values()) {
    const workable = s.total - s.aborted
    s.completionRate = rate(s.completed, workable)
    s.onTimeRate = rate(s.onTime, s.completed)
    const d = delaySum.get(s.id)
    s.avgDelayDays = d && d.n > 0 ? Math.round((d.sum / d.n) * 10) / 10 : 0
  }
  return [...stats.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function aggregateGroup(rows: ReportRow[], keyOf: (r: ReportRow) => string, keys: string[]): GroupStat[] {
  const map = new Map<string, { total: number; completed: number; overdue: number; open: number; aborted: number }>(
    keys.map((k) => [k, { total: 0, completed: 0, overdue: 0, open: 0, aborted: 0 }])
  )
  for (const r of rows) {
    const g = map.get(keyOf(r))
    if (!g) continue
    g.total++
    if (r.aborted) g.aborted++
    else if (r.status === 'COMPLETED') g.completed++
    else if (r.overdue) g.overdue++
    else g.open++
  }
  return [...map.entries()]
    .map(([key, g]) => ({ key, ...g, completionRate: rate(g.completed, g.total) }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

/** Filter dropdown options derived from the viewer's unfiltered scope. */
export function buildOptions(
  users: ReportUser[],
  allRows: ReportRow[],
  viewer?: { id: string; name: string; employeeCode: string }
) {
  const monthKeys = new Set<string>()
  for (const r of allRows) {
    monthKeys.add(istMonthKey(new Date(r.dueDate)))
    if (r.completedAt) monthKeys.add(istMonthKey(new Date(r.completedAt)))
  }
  // L1 managers within the downline — plus the viewer themselves when they
  // directly manage visible people (their direct reports carry the viewer's id).
  const managerIds = new Set(users.map((u) => u.managerId).filter((id): id is string => Boolean(id)))
  if (viewer && users.some((u) => u.managerId === viewer.id)) managerIds.add(viewer.id)
  const managerById = new Map(users.map((u) => [u.id, u]))
  if (viewer) managerById.set(viewer.id, { ...viewer, process: '', designation: '', managerId: null, managerName: null })
  const managerLabel = (id: string) => {
    if (id === UNMANAGED_KEY) return 'No manager (top level)'
    const m = managerById.get(id)
    return m ? `${m.name} (${m.employeeCode})${viewer && id === viewer.id ? ' — you' : ''}` : null
  }
  const managerOptionValues = [...managerIds]
  if (users.some((u) => !u.managerId)) managerOptionValues.push(UNMANAGED_KEY)
  return {
    months: [...monthKeys]
      .sort()
      .reverse()
      .map((k) => ({ value: k, label: monthLabelOf(k) })),
    processes: [...new Set(users.map((u) => u.process))].sort(),
    designations: [...new Set(users.map((u) => u.designation))].sort(),
    managers: managerOptionValues
      .map((id) => {
        const label = managerLabel(id)
        return label ? { value: id, label } : null
      })
      .filter((x): x is { value: string; label: string } => x !== null)
      .sort((a, b) => a.label.localeCompare(b.label)),
    employees: users.map((u) => ({ value: u.id, label: `${u.name} (${u.employeeCode})` })),
  }
}

export type ReportOptions = ReturnType<typeof buildOptions>

/** Full report payload for the API route. */
export function buildReport(
  users: ReportUser[],
  allRows: ReportRow[],
  f: ReportFilters,
  viewer?: { id: string; name: string; employeeCode: string }
) {
  const filtered = filterRows(allRows, f)
  const scopeUsers = filterUsers(users, f)
  return {
    options: buildOptions(users, allRows, viewer),
    kpis: aggregateKpis(filtered, scopeUsers.length),
    statusMix: aggregateStatusMix(filtered),
    monthly: aggregateMonthly(filtered),
    byEmployee: aggregateEmployees(filtered, scopeUsers),
    byProcess: aggregateGroup(filtered, (r) => r.process, scopeUsers.map((u) => u.process)),
    byDesignation: aggregateGroup(filtered, (r) => r.designation, scopeUsers.map((u) => u.designation)),
    rows: filtered,
  }
}

/** Parse `?a=1,2&b=x` style repeated-value query params.
 * Absent param = dimension not filtered (All).
 * Present-but-empty param = explicitly nothing selected (matches no rows). */
export function parseFilterParams(searchParams: URLSearchParams): ReportFilters {
  const list = (key: string): string[] => {
    if (!searchParams.has(key)) return []
    const values = (searchParams.get(key) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return values.length ? values : ['__NONE__']
  }
  return {
    months: list('months'),
    processes: list('processes'),
    designations: list('designations'),
    managerIds: list('managers'),
    userIds: list('employees'),
  }
}
