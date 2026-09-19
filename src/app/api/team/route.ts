import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds } from '@/lib/hierarchy'

interface TreeNode {
  id: string
  name: string
  employeeCode: string
  designation: string
  process: string
  children: TreeNode[]
}

/**
 * GET /api/team — manager view: hierarchy tree of the viewer's downline
 * plus employee-wise task status. Admin sees the whole org.
 * Downline can never see upline data (tree only grows downward from viewer).
 */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const allUsers = await db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      designation: true,
      process: true,
      email: true,
      managerId: true,
      role: true,
    },
  })

  const isAdmin = session.role === 'ADMIN'
  let visibleIds: string[]
  let tree: TreeNode

  if (isAdmin) {
    // Admin: virtual org root over all top-level users
    visibleIds = allUsers.filter((u) => u.role !== 'ADMIN').map((u) => u.id)
    const byId = new Map(allUsers.map((u) => [u.id, u]))
    const build = (uid: string): TreeNode => {
      const u = byId.get(uid)!
      return {
        id: u.id,
        name: u.name,
        employeeCode: u.employeeCode,
        designation: u.designation,
        process: u.process,
        children: allUsers
          .filter((c) => c.managerId === uid && visibleIds.includes(c.id))
          .map((c) => build(c.id)),
      }
    }
    const roots = allUsers
      .filter((u) => u.role !== 'ADMIN' && (!u.managerId || !byId.has(u.managerId)))
      .map((u) => build(u.id))
    tree = {
      id: 'ORG',
      name: 'Organization',
      employeeCode: '—',
      designation: 'All Employees',
      process: '',
      children: roots,
    }
  } else {
    const reportCount = allUsers.filter((u) => u.managerId === session.id).length
    if (reportCount === 0) {
      return NextResponse.json(
        { error: 'You do not have any team members reporting to you' },
        { status: 403 }
      )
    }
    visibleIds = await getDescendantIds(session.id)
    const byId = new Map(allUsers.map((u) => [u.id, u]))
    const build = (uid: string): TreeNode => {
      const u = byId.get(uid)!
      return {
        id: u.id,
        name: u.name,
        employeeCode: u.employeeCode,
        designation: u.designation,
        process: u.process,
        children: allUsers.filter((c) => c.managerId === uid && visibleIds.includes(c.id)).map((c) => build(c.id)),
      }
    }
    tree = build(session.id)
  }

  // All assignments of the visible employees (manager's downline / admin's whole org),
  // with their tasks. The viewer's own tasks are not part of the team view.
  const assignments = await db.taskAssignment.findMany({
    where: { userId: { in: visibleIds } },
    include: {
      task: {
        include: { creator: { select: { id: true, name: true, employeeCode: true } } },
      },
    },
  })

  const now = new Date()
  type EmpTask = {
    id: string
    title: string
    description: string | null
    dueDate: string
    status: string
    assignedBy: string
    overdue: boolean
  }
  type EmpStat = {
    id: string
    name: string
    employeeCode: string
    designation: string
    process: string
    email: string
    stats: { total: number; pending: number; inProgress: number; completed: number; overdue: number }
    tasks: EmpTask[]
  }

  const empMap = new Map<string, EmpStat>()
  for (const uid of visibleIds) {
    const u = allUsers.find((x) => x.id === uid)
    if (!u) continue
    empMap.set(uid, {
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      designation: u.designation,
      process: u.process,
      email: u.email,
      stats: { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 },
      tasks: [],
    })
  }

  for (const a of assignments) {
    const emp = empMap.get(a.userId)
    if (!emp) continue
    const overdue = a.status !== 'COMPLETED' && a.task.dueDate < now
    emp.stats.total++
    if (a.status === 'PENDING') emp.stats.pending++
    if (a.status === 'IN_PROGRESS') emp.stats.inProgress++
    if (a.status === 'COMPLETED') emp.stats.completed++
    if (overdue) emp.stats.overdue++
    emp.tasks.push({
      id: a.task.id,
      title: a.task.title,
      description: a.task.description,
      dueDate: a.task.dueDate.toISOString(),
      status: a.status,
      assignedBy: a.task.creator.name,
      overdue,
    })
  }

  for (const emp of empMap.values()) {
    emp.tasks.sort((x, y) => x.dueDate.localeCompare(y.dueDate))
  }

  const employees = [...empMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  const totals = employees.reduce(
    (acc, e) => {
      acc.employees++
      acc.total += e.stats.total
      acc.pending += e.stats.pending
      acc.inProgress += e.stats.inProgress
      acc.completed += e.stats.completed
      acc.overdue += e.stats.overdue
      return acc
    },
    { employees: 0, total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0 }
  )

  return NextResponse.json({ tree, employees, totals, scope: isAdmin ? 'org' : 'team' })
}
