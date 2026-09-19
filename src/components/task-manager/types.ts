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
