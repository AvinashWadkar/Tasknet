import { db } from './db'
import { normalizeProcessName } from './processes'

export const DIFFERENT = 'DIFFERENT'
export const SAME = 'SAME'

/** Compare process names case- and spacing-insensitively. */
export function processKey(raw: unknown): string {
  return normalizeProcessName(raw).toLowerCase()
}

/** Stable key for an unordered pair of already-normalised names. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`
}

export interface DecisionRow {
  nameA: string
  nameB: string
}

/** Pairs the admin has already ruled on (defaults to every remembered answer). */
export async function loadDecisions(decision: string = DIFFERENT): Promise<DecisionRow[]> {
  return db.processDecision.findMany({ where: { decision }, select: { nameA: true, nameB: true } })
}

export function decidedPairSet(rows: DecisionRow[]): Set<string> {
  return new Set(rows.map((r) => pairKey(r.nameA, r.nameB)))
}

/** True when any two names inside the group were already confirmed DIFFERENT. */
export function groupConflicts(keys: string[], decided: Set<string>): boolean {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (decided.has(pairKey(keys[i], keys[j]))) return true
    }
  }
  return false
}

/** Remember that every name in the group is a different process from the rest. */
export async function recordDifferent(names: unknown[]): Promise<number> {
  const keys = [...new Set(names.map(processKey).filter(Boolean))].sort()
  const rows: DecisionRow[] = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) rows.push({ nameA: keys[i], nameB: keys[j] })
  }
  if (rows.length === 0) return 0
  await db.processDecision.createMany({ data: rows, skipDuplicates: true })
  return rows.length
}

export async function countDecisions(decision: string = DIFFERENT): Promise<number> {
  return db.processDecision.count({ where: { decision } })
}

export async function clearDecisions(): Promise<number> {
  const res = await db.processDecision.deleteMany({})
  return res.count
}
