import { db } from './db'

/** Trim + collapse inner spaces so "customer  support" and "customer support"
 *  can never become two entries in the controlled Process list. */
export function normalizeProcessName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Adds a process to the controlled list if that name is not already there.
 *  Returns the canonical stored name so callers can store the user-facing value.
 *
 *  Called from the user-create/edit paths as a safety net: the admin dropdown
 *  already saves the name, but Excel bulk import and any future caller would
 *  otherwise create process values that never appear in the list. */
export async function ensureProcessExists(raw: unknown): Promise<string> {
  const name = normalizeProcessName(raw)
  if (!name) return name

  const existing = await db.process.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { name: true },
  })
  if (existing) return existing.name

  await db.process.create({ data: { name } }).catch(() => {
    // Lost a race with a concurrent create — harmless, the row now exists.
  })
  return name
}