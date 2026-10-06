import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { normalizeProcessName } from '@/lib/processes'

/**
 * POST /api/processes/analyze — ADMIN only: AI pass over every process name the
 * org has ever used, looking for names that are the same process spelled
 * differently ("Federal_Agri" vs "Federal Agri", "customer support" vs
 * "Customer Support").
 *
 * The name list is the union of the controlled Process table and every
 * distinct User.process value, so historical free-text is analysed too — that
 * is where the scattered spellings live.
 *
 * The AI only proposes; nothing is written. The admin decides per group in the
 * popup, then calls /api/processes/merge.
 *
 * Falls back to exact-spelling matching when Gemini is unavailable, so the
 * feature still works offline — `source: 'fallback'` is surfaced to the admin.
 */

const AI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 60_000
const CACHE_TTL_MS = 10 * 60_000
const MAX_NAMES = 300

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface NameEntry {
  name: string
  users: number
}

export interface DuplicateGroup {
  id: string
  names: NameEntry[]
  canonical: string
  reason: string
  confidence: Confidence
}

const cache = new Map<string, { ts: number; groups: DuplicateGroup[]; source: 'ai' | 'fallback' }>()

/** Union of controlled list + historical User.process values, with headcounts. */
async function loadEntries(): Promise<NameEntry[]> {
  const [processes, rows] = await Promise.all([
    db.process.findMany({ select: { name: true } }),
    db.user.findMany({ select: { process: true } }),
  ])

  const counts = new Map<string, number>()
  const put = (raw: unknown) => {
    const name = normalizeProcessName(raw)
    if (!name) return
    counts.set(name, counts.get(name) ?? 0)
  }

  for (const r of rows) {
    const name = normalizeProcessName(r.process)
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  for (const p of processes) put(p.name) // zero for entries nobody is using yet

  return [...counts.entries()]
    .map(([name, users]) => ({ name, users }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Best canonical spelling: the one carrying the most users, then the cleanest
 *  form (no underscores), then the shortest. */
function pickCanonical(entries: NameEntry[]): string {
  const ranked = [...entries].sort(
    (a, b) =>
      b.users - a.users ||
      (a.name.includes('_') ? 1 : 0) - (b.name.includes('_') ? 1 : 0) ||
      a.name.length - b.name.length
  )
  return ranked[0]?.name ?? entries[0]?.name ?? ''
}

/** Offline grouping: normalised-spelling and word-order equality. Union-find so
 *  a name matching via two different keys still lands in one group. */
function fallbackGroups(entries: NameEntry[]): DuplicateGroup[] {
  const parent = entries.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const keys = [
    (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .sort()
        .join(''),
  ]

  for (const keyOf of keys) {
    const firstSeen = new Map<string, number>()
    entries.forEach((e, i) => {
      const key = keyOf(e.name)
      if (!key) return
      const first = firstSeen.get(key)
      if (first === undefined) firstSeen.set(key, i)
      else union(first, i)
    })
  }

  const clusters = new Map<number, number[]>()
  entries.forEach((_, i) => {
    const root = find(i)
    const arr = clusters.get(root)
    if (arr) arr.push(i)
    else clusters.set(root, [i])
  })

  const groups: DuplicateGroup[] = []
  for (const idxs of clusters.values()) {
    if (idxs.length < 2) continue
    const members = idxs.map((i) => entries[i])
    groups.push({
      id: `f${groups.length}`,
      names: members,
      canonical: pickCanonical(members),
      reason: 'Spelling differs only by case, punctuation or word order.',
      confidence: 'HIGH',
    })
  }
  return groups
}

async function aiGroups(entries: NameEntry[]): Promise<DuplicateGroup[]> {
  const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
  const apiKey = process.env.GEMINI_API_KEY || ''
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const sys =
    'You are a data-quality assistant inside a task manager. An organisation has a list of "process" names ' +
    'typed by administrators, and the same process has sometimes been entered more than one way ' +
    '(case, spacing, punctuation, underscores, abbreviations, singular/plural, or an obvious synonym). ' +
    'Find clusters of names that refer to the SAME business process.\n' +
    'Rules:\n' +
    '- Only return clusters containing at least 2 names.\n' +
    '- Never group names that are genuinely different processes, even when they share words.\n' +
    '- Do not invent names; every returned name must appear verbatim in the input.\n' +
    '- Suggest one canonical spelling per cluster: Title Case, no underscores, keep official abbreviations intact.\n' +
    '- confidence: HIGH for trivial spelling variants, MEDIUM for clear abbreviations, LOW for judgement calls.\n' +
    'Respond with STRICT JSON only, no markdown fences and no extra text: ' +
    '{"groups":[{"names":["<exact input name>", "..."],' +
    '"canonical":"<best spelling>","reason":"<max 120 chars>","confidence":"HIGH|MEDIUM|LOW"}]} ' +
    'Return {"groups":[]} if nothing is likely the same process.'

  const res = await fetch(`${baseUrl}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ processes: entries }) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            groups: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  names: { type: 'ARRAY', items: { type: 'STRING' } },
                  canonical: { type: 'STRING' },
                  reason: { type: 'STRING' },
                  confidence: { type: 'STRING' },
                },
                required: ['names', 'canonical', 'reason', 'confidence'],
              },
            },
          },
          required: ['groups'],
        },
      },
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(`Gemini request failed (${res.status}): ${bodyText.slice(0, 200)}`)
  }

  const completion = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const raw = completion?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!raw) throw new Error('Gemini returned an empty response')
  const cleaned = raw.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('Gemini response was not JSON')
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
    groups?: { names?: unknown; canonical?: unknown; reason?: unknown; confidence?: unknown }[]
  }

  const byName = new Map(entries.map((e) => [e.name, e]))
  const groups: DuplicateGroup[] = []
  const used = new Set<string>()

  for (const g of Array.isArray(parsed.groups) ? parsed.groups : []) {
    const rawNames = Array.isArray(g.names) ? g.names.map((n) => normalizeProcessName(n)) : []
    const members = [...new Set(rawNames)]
      .filter((n) => byName.has(n) && !used.has(n))
      .map((n) => byName.get(n)!)
    if (members.length < 2) continue
    members.forEach((m) => used.add(m.name))

    const suggested = normalizeProcessName(g.canonical)
    const canonical = byName.has(suggested) && !used.has(suggested) ? suggested : pickCanonical(members)

    const conf = String(g.confidence || '').toUpperCase()
    groups.push({
      id: `g${groups.length}`,
      names: members,
      canonical,
      reason: String(g.reason || '').slice(0, 160) || 'Likely the same process.',
      confidence: (['HIGH', 'MEDIUM', 'LOW'].includes(conf) ? conf : 'MEDIUM') as Confidence,
    })
  }

  return groups
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can analyse process names' }, { status: 403 })
  }

  let refresh = false
  try {
    const body = await req.json()
    refresh = Boolean(body?.refresh)
  } catch {
    /* no body — fine */
  }

  const entries = (await loadEntries()).slice(0, MAX_NAMES)
  if (entries.length < 2) return NextResponse.json({ groups: [], source: 'ai', checked: entries.length })

  // Same name set → same answer; keeps repeat visits from re-spending the AI call.
  const key = entries.map((e) => `${e.name}~${e.users}`).join('|')
  if (!refresh) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json({ groups: hit.groups, source: hit.source, cached: true, checked: entries.length })
    }
  }

  let source: 'ai' | 'fallback' = 'fallback'
  let groups: DuplicateGroup[] = []

  try {
    groups = await aiGroups(entries)
    source = 'ai'
  } catch (e) {
    console.warn('[processes] AI duplicate analysis unavailable, using exact-match fallback:', e)
  }

  if (source === 'fallback') groups = fallbackGroups(entries)

  cache.set(key, { ts: Date.now(), groups, source })
  return NextResponse.json({ groups, source, checked: entries.length })
}