import { db } from '@/lib/db'

/**
 * Org-hierarchy helpers.
 * Hierarchy is driven by the ManagerMapping join table: an employee can
 * report to multiple managers, and every mapped manager sees + tracks them
 * equally. User.managerId is only kept as the legacy "primary" snapshot.
 */

export async function getAllUsers() {
  return db.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      designation: true,
      role: true,
      process: true,
      managerId: true,
    },
  })
}

/** managerId -> [employeeId, ...] for every active reporting edge. */
export async function getReportingEdges(): Promise<Map<string, string[]>> {
  const rows = await db.managerMapping.findMany({
    select: { employeeId: true, managerId: true },
    where: { employee: { isActive: true }, manager: { isActive: true } },
  })
  const childrenOf = new Map<string, string[]>()
  for (const r of rows) {
    const arr = childrenOf.get(r.managerId) || []
    arr.push(r.employeeId)
    childrenOf.set(r.managerId, arr)
  }
  return childrenOf
}

/** User ids with at least one active manager edge. */
export async function getManagedEmployeeIds(): Promise<Set<string>> {
  const rows = await db.managerMapping.findMany({
    select: { employeeId: true },
    where: { employee: { isActive: true }, manager: { isActive: true } },
  })
  return new Set(rows.map((r) => r.employeeId))
}

/**
 * User ids directly reporting to `managerId` — union over all mapping edges.
 */
export async function getDirectReporteeIds(managerId: string): Promise<string[]> {
  const rows = await db.managerMapping.findMany({
    where: { managerId, manager: { isActive: true }, employee: { isActive: true } },
    select: { employeeId: true },
  })
  return rows.map((r) => r.employeeId)
}

/** Return ids of every user strictly below `userId` (all levels), via mappings. */
export async function getDescendantIds(userId: string): Promise<string[]> {
  const childrenOf = await getReportingEdges()
  const out: string[] = []
  const visited = new Set<string>()
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const child of childrenOf.get(cur) || []) {
      if (visited.has(child)) continue
      visited.add(child)
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

/** Whether the user manages at least one person (i.e. is a manager in the tool). */
export async function isManager(userId: string): Promise<boolean> {
  const count = await db.managerMapping.count({
    where: { managerId: userId, manager: { isActive: true }, employee: { isActive: true } },
  })
  return count > 0
}

/** Resolve manager emails to active user records (deduped, in input order). */
export async function resolveManagersByEmail(
  emails: string[]
): Promise<{ id: string; name: string; email: string }[]> {
  const list = [...new Set(emails.map((e) => (e || '').trim().toLowerCase()).filter(Boolean))]
  if (list.length === 0) return []
  const users = await db.user.findMany({
    where: { email: { in: list }, isActive: true },
    select: { id: true, name: true, email: true },
  })
  const byEmail = new Map(users.map((u) => [u.email, u]))
  return list
    .map((e) => byEmail.get(e))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
}

/** Replace every manager edge of an employee with the given set (empty = top-level). */
export async function replaceManagerMappings(employeeId: string, managerIds: string[]) {
  const ids = [...new Set(managerIds.filter((id): id is string => Boolean(id)))]
  await db.managerMapping.deleteMany({ where: { employeeId } })
  if (ids.length) {
    await db.managerMapping.createMany({
      data: ids.map((managerId) => ({ employeeId, managerId })),
    })
  }
}

/**
 * Visibility rule for a task, given the viewer.
 * - participant: assigned to viewer OR created by viewer
 * - manager: any assignee/creator is in viewer's downline
 */
export async function canViewTask(
  viewerId: string,
  task: { createdById: string; assignments: { userId: string }[] },
  descendantIds?: string[]
): Promise<boolean> {
  if (task.createdById === viewerId) return true
  if (task.assignments.some((a) => a.userId === viewerId)) return true
  const downline = descendantIds ?? (await getDescendantIds(viewerId))
  if (downline.length === 0) return false
  if (downline.includes(task.createdById)) return true
  return task.assignments.some((a) => downline.includes(a.userId))
}