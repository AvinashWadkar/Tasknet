import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { delayLabel, fmtDate, fmtTime, istToday } from '@/lib/dates'

/**
 * POST /api/tasks/prioritize
 * AI prioritizes the signed-in user's open tasks ("every assigned task needs to be completed").
 * Configured via ZAI_BASE_URL and ZAI_API_KEY environment variables (baseUrl must include /v1).
 * Falls back to a deadline-based heuristic order if the AI call fails or times out.
 * Result is cached in memory for 60s per user; body { refresh: true } bypasses the cache.
 */

const CACHE_TTL_MS = 60_000
const AI_TIMEOUT_MS = Number(process.env.ZAI_TIMEOUT_MS) || 60_000

type PlanStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | null

interface PlanItem {
  id: string
  title: string
  reason: string
  dueDate: string
  myStatus: PlanStatus
  overdue: boolean
  delayed: string
  role: 'assignee' | 'creator'
  done: number
  total: number
}

interface WorkItem extends PlanItem {
  dueDay: string
}

const cache = new Map<string, { ts: number; source: 'ai' | 'fallback'; plan: PlanItem[]; aiError?: string }>()

function strip(t: WorkItem): PlanItem {
  return {
    id: t.id,
    title: t.title,
    reason: t.reason,
    dueDate: t.dueDate,
    myStatus: t.myStatus,
    overdue: t.overdue,
    delayed: t.delayed,
    role: t.role,
    done: t.done,
    total: t.total,
  }
}

function fallbackReason(t: {
  overdue: boolean
  delayed: string
  dueDate: string | Date
  dueDay: string
  today: string
  myStatus: PlanStatus
}): string {
  if (t.overdue) return `Overdue by ${t.delayed} — close this first`
  if (t.dueDay === t.today) return `Due today at ${fmtTime(t.dueDate)} IST`
  if (t.myStatus === 'IN_PROGRESS') return 'Already in progress — finish before starting new work'
  return `Due ${fmtDate(t.dueDate)} — plan ahead`
}

function fallbackRank(t: WorkItem): number {
  if (t.overdue) return 0
  if (t.dueDay === istToday()) return 1
  if (t.myStatus === 'IN_PROGRESS') return 2
  return 3
}

function fallbackOrder(items: WorkItem[]): PlanItem[] {
  return [...items]
    .sort((a, b) => fallbackRank(a) - fallbackRank(b) || a.dueDate.localeCompare(b.dueDate))
    .map(strip)
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let refresh = false
  try {
    const body = await req.json()
    refresh = Boolean(body?.refresh)
  } catch {
    /* no body — fine */
  }

  if (!refresh) {
    const hit = cache.get(session.id)
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return NextResponse.json({ source: hit.source, plan: hit.plan, cached: true, aiError: hit.aiError })
    }
  }

  const today = istToday()
  const now = new Date()

  // All my active tasks (created by me or assigned to me), soonest due first
  const tasks = await db.task.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ createdById: session.id }, { assignments: { some: { userId: session.id } } }],
    },
    include: {
      creator: { select: { id: true, name: true } },
      assignments: { select: { userId: true, status: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: 100,
  })

  // Open work = my assignment not completed; tasks I only created need follow-up until everyone completes
  const items: WorkItem[] = []
  for (const t of tasks) {
    const mine = t.assignments.find((a) => a.userId === session.id)
    if (mine && mine.status === 'COMPLETED') continue // my part is done — nothing to prioritize
    const done = t.assignments.filter((a) => a.status === 'COMPLETED').length
    const total = t.assignments.length
    if (!mine && done >= total) continue // creator-only task fully closed by assignees

    const due = new Date(t.dueDate)
    const overdue = due < now
    const dueDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(due)
    items.push({
      id: t.id,
      title: t.title,
      reason: '',
      dueDate: due.toISOString(),
      myStatus: (mine?.status as PlanStatus) ?? null,
      overdue,
      delayed: delayLabel(due, now),
      role: mine ? 'assignee' : 'creator',
      done,
      total,
      dueDay,
    })
  }

  if (items.length === 0) {
    cache.set(session.id, { ts: Date.now(), source: 'ai', plan: [] })
    return NextResponse.json({ source: 'ai', plan: [] })
  }

  const llmPayload = items.map((t) => ({
    id: t.id,
    title: t.title,
    due: t.overdue
      ? `overdue by ${t.delayed} (was due ${fmtDate(t.dueDate)}, ${fmtTime(t.dueDate)} IST)`
      : t.dueDay === today
        ? `due TODAY at ${fmtTime(t.dueDate)} IST`
        : `due ${fmtDate(t.dueDate)}, ${fmtTime(t.dueDate)} IST`,
    myStatus: t.myStatus ?? (t.role === 'creator' ? 'creator-follow-up' : 'PENDING'),
    sharedWith: t.total > 1 ? `${t.done}/${t.total} employees completed` : 'only me',
  }))

  let source: 'ai' | 'fallback' = 'fallback'
  let ordered: PlanItem[] = []
  let aiError: string | undefined
  const aiStart = Date.now()

  try {
    const baseUrl = (process.env.ZAI_BASE_URL || '').replace(/\/+$/, '')
    const apiKey = process.env.ZAI_API_KEY || ''
    if (!baseUrl || !apiKey) throw new Error('ZAI_BASE_URL / ZAI_API_KEY not configured')
    const sys =
      "You are a strict work-prioritization assistant inside a task manager. The goal: EVERY assigned task must be completed. " +
      "Rank the user's open tasks by execution priority. Rules: overdue tasks first (most delayed / most critical first), " +
      'then tasks due today, then in-progress work close to done, then upcoming by deadline. ' +
      'Tasks with myStatus "creator-follow-up" were created by the user for others — they still need chasing, rank them sensibly. ' +
      "Each reason must stay consistent with the given due/overdue facts — never invent a different deadline than provided. " +
      'Respond with STRICT JSON only, no markdown fences, no extra text: ' +
      '{"order":[{"id":"<task id>","reason":"<max 90 chars, concrete, mention deadline/delay/momentum>"}]} ' +
      'including EVERY task id exactly once, most important first.'
    const userContent = `Today is ${today} (IST). Prioritize these ${llmPayload.length} open tasks:\n${JSON.stringify(llmPayload)}`

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Z-AI-From': 'Z',
      },
      body: JSON.stringify({
        model: process.env.ZAI_MODEL || 'glm-4.5-flash',
        messages: [
          { role: 'assistant', content: sys },
          { role: 'user', content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      throw new Error(`Z.ai request failed (${res.status}): ${bodyText.slice(0, 200)}`)
    }

    const completion = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = completion?.choices?.[0]?.message?.content || ''
    if (!raw) throw new Error('Z.ai returned an empty response')
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('Z.ai response was not JSON')
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      order?: { id?: string; reason?: string }[]
    }
    if (!Array.isArray(parsed.order) || parsed.order.length === 0) {
      throw new Error(`Z.ai response had no "order" array: ${raw.slice(0, 200)}`)
    }
    const byId = new Map(items.map((t) => [t.id, t]))
    const seen = new Set<string>()
    const out: WorkItem[] = []
    for (const o of parsed.order) {
      const id = String(o?.id || '')
      const t = byId.get(id)
      if (!t || seen.has(id)) continue
      seen.add(id)
      out.push({ ...t, reason: String(o?.reason || fallbackReason({ ...t, today })).slice(0, 140) })
    }
    // Any task the AI skipped is appended in deadline order
    const rest = items
      .filter((t) => !seen.has(t.id))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((t) => ({ ...t, reason: fallbackReason({ ...t, today }) }))
    ordered = [...out, ...rest].map(strip)
    if (out.length === 0) throw new Error(`Z.ai returned no order matching the open task ids: ${raw.slice(0, 200)}`)
    source = 'ai'
  } catch (e) {
    const elapsed = Date.now() - aiStart
    aiError = `${e instanceof Error ? e.message : String(e)} (after ${elapsed}ms)`
    console.warn('[prioritize] AI ordering unavailable, using deadline fallback:', aiError)
  }

  if (ordered.length === 0) {
    ordered = fallbackOrder(items.map((t) => ({ ...t, reason: fallbackReason({ ...t, today }) })))
  }

  cache.set(session.id, { ts: Date.now(), source, plan: ordered, aiError })
  return NextResponse.json({ source, plan: ordered, aiError })
}
