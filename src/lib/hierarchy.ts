import { db } from '@/lib/db'

/**
 * Org-hierarchy helpers.
 * Hierarchy is derived from each user's resolved `managerId`
 * (auto-linked by admin-entered L1 manager email).
 */

export async function getAllUsers() {
  return db.user.findMany({
    where: { isActive: true },
    select: { id: true, managerId: true, name: true, employeeCode: true, designation: true, role: true },
  })
}

/** Return ids of every user strictly below `userId` in the org tree (all levels). */
export async function getDescendantIds(userId: string): Promise<string[]> {
  const users = await getAllUsers()
  const childrenOf = new Map<string, string[]>()
  for (const u of users) {
    if (!u.managerId) continue
    const arr = childrenOf.get(u.managerId) || []
    arr.push(u.id)
    childrenOf.set(u.managerId, arr)
  }
  const out: string[] = []
  const queue = [userId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const child of childrenOf.get(cur) || []) {
      out.push(child)
      queue.push(child)
    }
  }
  return out
}

/** Whether the user has at least one report (i.e. is a manager in the tool). */
export async function isManager(userId: string): Promise<boolean> {
  const count = await db.user.count({ where: { managerId: userId, isActive: true } })
  return count > 0
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
