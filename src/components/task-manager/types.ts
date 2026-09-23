export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
export type TaskState = 'ACTIVE' | 'ABORTED'

export interface Me {
  id: string
  employeeCode: string
  name: string
  email: string
  process: string
  designation: string
  role: string
  isFirstLogin: boolean
  managerName: string | null
  managerEmail: string | null
  isManager?: boolean
}

export interface AssigneeUser {
  id: string
  name: string
  employeeCode: string
  designation: string
  process?: string
}

export interface TaskAssignmentDTO {
  id: string
  userId: string
  status: TaskStatus
  completedAt: string | null
  updatedAt: string
  user: AssigneeUser
}

export interface TaskDTO {
  id: string
  title: string
  description: string | null
  dueDate: string
  status: TaskState
  abortedAt: string | null
  abortReason: string | null
  createdAt: string
  creator: { id: string; name: string; employeeCode: string; designation: string }
  assignments: TaskAssignmentDTO[]
  // Recurring series (optional — absent on non-recurring tasks)
  recurring?: boolean
  recurFreq?: string | null
  recurInterval?: number | null
  recurEndType?: string | null
  recurEndDate?: string | null
  recurCount?: number | null
  recurOccurrence?: number
  recurWeekdays?: string | null // WEEKLY repeat days "1,3,5" (1=Mon..7=Sun)
  recurMonthDay?: number | null // MONTHLY day-of-month
}

export interface ActivityDTO {
  id: string
  actorName: string
  action: string
  detail: string | null
  createdAt: string
}

export interface TaskDetailDTO extends TaskDTO {
  activities: ActivityDTO[]
}

export interface DirectoryUser {
  id: string
  employeeCode: string
  name: string
  email: string
  process: string
  designation: string
  role?: string
  managerName?: string | null
  managerEmail?: string | null
  isFirstLogin?: boolean
  createdAt?: string
  password?: string | null // ADMIN-only: current password (plaintext mirror)
}

export interface TeamTask {
  id: string
  title: string
  description?: string | null
  dueDate: string
  status: TaskStatus
  assignedBy: string
  overdue: boolean
  aborted: boolean
}

export interface TeamEmployee {
  id: string
  name: string
  employeeCode: string
  designation: string
  process: string
  email: string
  stats: { total: number; pending: number; inProgress: number; completed: number; overdue: number; aborted: number }
  tasks: TeamTask[]
}

export interface TreeNode {
  id: string
  name: string
  employeeCode: string
  designation: string
  process: string
  children: TreeNode[]
}

export interface TeamData {
  tree: TreeNode
  employees: TeamEmployee[]
  totals: { employees: number; total: number; pending: number; inProgress: number; completed: number; overdue: number; aborted: number }
  scope: 'org' | 'team'
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}

export interface PriorityItem {
  id: string
  title: string
  reason: string
  dueDate: string
  myStatus: TaskStatus | null
  overdue: boolean
  delayed: string
  role: 'assignee' | 'creator'
  done: number
  total: number
}

// ── Reports (manager/admin performance view) ───────────────────────

export interface ReportOption {
  value: string
  label: string
}

export interface ReportKpis {
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

export interface ReportStatusSlice {
  key: string
  label: string
  value: number
  color: string
}

export interface ReportMonthPoint {
  key: string
  label: string
  due: number
  completed: number
  late: number
}

export interface ReportEmployeeStat {
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
  completionRate: number
  onTimeRate: number
  avgDelayDays: number
}

export interface ReportGroupStat {
  key: string
  total: number
  completed: number
  overdue: number
  open: number
  aborted: number
  completionRate: number
}

export interface ReportRowDTO {
  taskId: string
  title: string
  assignedBy: string
  dueDate: string
  createdAt: string
  taskState: 'ACTIVE' | 'ABORTED'
  userId: string
  userName: string
  employeeCode: string
  process: string
  designation: string
  managerId: string | null
  managerName: string | null
  status: TaskStatus
  completedAt: string | null
  aborted: boolean
  overdue: boolean
  onTime: boolean
  delayDays: number
}

export interface ReportsResponse {
  scope: 'team' | 'org'
  options: {
    months: ReportOption[]
    processes: string[]
    designations: string[]
    managers: ReportOption[]
    employees: ReportOption[]
  }
  kpis: ReportKpis
  statusMix: ReportStatusSlice[]
  monthly: ReportMonthPoint[]
  byEmployee: ReportEmployeeStat[]
  byProcess: ReportGroupStat[]
  byDesignation: ReportGroupStat[]
  rows: ReportRowDTO[]
}

export interface ReportFilterState {
  months: string[]
  processes: string[]
  designations: string[]
  managers: string[]
  employees: string[]
}
