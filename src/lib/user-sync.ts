import { db } from '@/lib/db'
import { replaceManagerMappings, resolveManagersByEmail } from '@/lib/hierarchy'

export class UserInputError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'UserInputError'
    this.status = status
  }
}

export type UserChange = { field: string; from: string; to: string }

export type UserDetailInput = {
  employeeCode?: string
  name?: string
  email?: string
  process?: string
  designation?: string
  managerEmails?: string[]
  role?: string
  reactivate?: boolean
}

export type SyncableUser = {
  id: string
  employeeCode: string
  name: string
  email: string
  process: string
  designation: string
  role: string
  managerId: string | null
  managerName: string | null
  managerEmail: string | null
  isActive: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Applies employee-detail changes to an existing user and reports exactly what
 * changed. Used when the admin re-creates an ID that already exists and when a
 * row in the Excel import matches an existing Employee Code.
 */
export async function syncUserDetails(
  user: SyncableUser,
  input: UserDetailInput,
  opts: { actorId?: string } = {}
): Promise<{ user: SyncableUser; changes: UserChange[] }> {
  const data: Record<string, unknown> = {}
  const changes: UserChange[] = []
  const record = (field: string, from: string | null, to: string | null) => {
    if ((from ?? '').trim().toLowerCase() === (to ?? '').trim().toLowerCase()) return
    changes.push({ field, from: (from ?? '').trim() || '—', to: (to ?? '').trim() || '—' })
  }

  if (input.employeeCode !== undefined) {
    const value = input.employeeCode.trim()
    if (!value) throw new UserInputError('Employee Code is required')
    if (value !== user.employeeCode) {
      const dupe = await db.user.findFirst({ where: { employeeCode: value, id: { not: user.id } } })
      if (dupe) throw new UserInputError(`Employee Code "${value}" already exists`, 409)
      data.employeeCode = value
    }
    record('Employee Code', user.employeeCode, value)
  }

  if (input.name !== undefined) {
    const value = input.name.trim()
    if (!value) throw new UserInputError('Name is required')
    if (value !== user.name) data.name = value
    record('Employee Name', user.name, value)
  }

  if (input.email !== undefined) {
    const value = input.email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) throw new UserInputError('Please enter a valid Email ID')
    if (value !== user.email) {
      const dupe = await db.user.findFirst({ where: { email: value, id: { not: user.id } } })
      if (dupe) throw new UserInputError(`Email "${value}" is already registered`, 409)
      data.email = value
    }
    record('Email ID', user.email, value)
  }

  if (input.process !== undefined) {
    const value = input.process.trim()
    if (!value) throw new UserInputError('Process is required')
    if (value !== user.process) data.process = value
    record('Process', user.process, value)
  }

  if (input.designation !== undefined) {
    const value = input.designation.trim()
    if (!value) throw new UserInputError('Designation is required')
    if (value !== user.designation) data.designation = value
    record('Designation', user.designation, value)
  }

  if (input.role !== undefined) {
    const value = input.role.trim().toUpperCase()
    if (value !== 'ADMIN' && value !== 'EMPLOYEE') throw new UserInputError('Role must be ADMIN or EMPLOYEE')
    if (opts.actorId && user.id === opts.actorId && value !== 'ADMIN') {
      throw new UserInputError('You cannot remove your own ADMIN role')
    }
    if (value !== user.role) data.role = value
    record('Role', user.role, value)
  }

  let managerIds: string[] | null = null
  let relinkManagers = false
  if (input.managerEmails !== undefined) {
    const emails = [...new Set(input.managerEmails.map((e) => (e || '').trim().toLowerCase()).filter(Boolean))]
    const targetEmail = (data.email as string | undefined) ?? user.email
    if (emails.includes(targetEmail)) throw new UserInputError('A user cannot be their own manager')

    const currentRows = await db.managerMapping.findMany({
      where: { employeeId: user.id },
      select: { manager: { select: { name: true } } },
    })
    const byName = (a: string, b: string) => a.localeCompare(b)
    const currentNames = currentRows.map((r) => r.manager.name).sort(byName)

    let nextNames: string[] = []
    if (emails.length > 0) {
      const managers = await resolveManagersByEmail(emails)
      if (managers.length !== emails.length) {
        const missing = emails.filter((e) => !managers.some((m) => m.email === e)).join(', ')
        throw new UserInputError(`Manager email${missing.includes(',') ? 's' : ''} not found: ${missing}`)
      }
      managerIds = managers.map((m) => m.id)
      nextNames = managers.map((m) => m.name).sort(byName)
      relinkManagers = true
      data.managerEmail = managers[0]!.email
      data.managerName = managers[0]!.name
      data.managerId = managers[0]!.id
    } else {
      managerIds = []
      data.managerEmail = null
      data.managerName = null
      data.managerId = null
    }
    record('Manager(s)', currentNames.join(', '), nextNames.join(', '))
  }

  if (input.reactivate && !user.isActive) {
    data.isActive = true
    record('Login', 'Disabled', 'Enabled')
  }

  let updated = user
  if (Object.keys(data).length > 0) {
    updated = (await db.user.update({ where: { id: user.id }, data })) as SyncableUser
  }

  if (managerIds !== null) {
    await replaceManagerMappings(user.id, managerIds)
  }

  if (relinkManagers) {
    const finalEmail = updated.email
    await db.user.updateMany({
      where: { managerEmail: finalEmail, id: { not: user.id }, managerId: null },
      data: { managerId: user.id },
    })
    const named = await db.user.findMany({
      where: { managerEmail: finalEmail, id: { not: user.id } },
      select: { id: true },
    })
    await db.managerMapping.createMany({
      data: named.map((e) => ({ employeeId: e.id, managerId: user.id })),
      skipDuplicates: true,
    })
  }

  return { user: updated, changes }
}
