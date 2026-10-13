/**
 * Access-rights model.
 *
 * The tool only ever had two roles (ADMIN / EMPLOYEE) plus a manager flag
 * derived from the org hierarchy, so an admin could not fine-tune what an
 * individual may do. Here we define the capabilities an admin can grant or
 * revoke per user. `null` (no overrides) keeps the historical behaviour:
 * everyone can create/assign tasks, managers + admins see the team view and
 * reports, and only admins manage user IDs.
 *
 * Administrators always get every right (an admin can never lock themselves
 * out by switching their own toggles off).
 */

export type PermissionKey =
  | 'createTasks'
  | 'assignOthers'
  | 'viewTeam'
  | 'viewReports'
  | 'exportData'
  | 'manageUsers'

export type PermissionMap = Record<PermissionKey, boolean>

export interface PermissionMeta {
  key: PermissionKey
  label: string
  description: string
}

/** Ordered list driving the admin "Manage rights" popup. */
export const PERMISSION_META: PermissionMeta[] = [
  {
    key: 'createTasks',
    label: 'Create tasks',
    description: 'Create new tasks.',
  },
  {
    key: 'assignOthers',
    label: 'Assign tasks to others',
    description: 'Assign a task to employees other than themselves.',
  },
  {
    key: 'viewTeam',
    label: 'View team',
    description: 'Open the Team View tab and see their reporting line.',
  },
  {
    key: 'viewReports',
    label: 'View reports',
    description: 'Open the Reports tab and analytics.',
  },
  {
    key: 'exportData',
    label: 'Export data',
    description: 'Download Excel exports (reports, usage, users).',
  },
  {
    key: 'manageUsers',
    label: 'Manage user IDs',
    description: 'Create, edit and disable employee IDs (Admin panel).',
  },
]

export const PERMISSION_KEYS: PermissionKey[] = PERMISSION_META.map((m) => m.key)

/** Rights a user has when the admin has set no explicit overrides. */
export function defaultPermissions(role: string, isManager: boolean): PermissionMap {
  const admin = role === 'ADMIN'
  const leadsTeam = isManager || admin
  return {
    createTasks: true,
    assignOthers: true,
    viewTeam: leadsTeam,
    viewReports: leadsTeam,
    exportData: leadsTeam,
    manageUsers: admin,
  }
}

/**
 * Merge an admin's stored overrides onto the role/manager defaults. Admins
 * always resolve to the full set. Unknown keys are ignored so the JSON column
 * can survive future schema changes.
 */
export function resolvePermissions(role: string, isManager: boolean, raw: unknown): PermissionMap {
  const base = defaultPermissions(role, isManager)
  if (role === 'ADMIN') return base
  if (!raw || typeof raw !== 'object') return base
  const out = { ...base }
  for (const key of PERMISSION_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

/**
 * Keep only the known boolean overrides from an incoming payload so nothing
 * unexpected is persisted. Returns `null` when the payload is not an object
 * (used to clear the overrides back to defaults).
 */
export function sanitizePermissions(raw: unknown): Partial<PermissionMap> | null {
  if (raw === null) return null
  if (typeof raw !== 'object') return null
  const out: Partial<PermissionMap> = {}
  for (const key of PERMISSION_KEYS) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}
