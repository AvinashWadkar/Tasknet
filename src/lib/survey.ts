import { db } from '@/lib/db'
import { SURVEY_QUESTIONS } from '@/lib/survey-questions'
import type {
  SurveyPendingRow,
  SurveyProcessRow,
  SurveyQuestionScore,
  SurveyReport,
  SurveyResponseRow,
} from '@/lib/survey-types'

/**
 * One-time employee feedback survey — aggregation used by both the admin JSON
 * report (/api/survey/report) and the Excel export
 * (/api/survey/report/export), so the two never drift apart.
 *
 * The question metadata and validation helpers live in the client-safe
 * `@/lib/survey-questions` module and are re-exported here for server code.
 *
 * The survey is for EMPLOYEES only: ADMIN accounts are exempt from filling it
 * in, and only ADMIN accounts may read the report.
 */

export {
  SURVEY_RATING_KEYS,
  SURVEY_QUESTIONS,
  SURVEY_COMMENT_KEYS,
  SURVEY_COMMENTS,
  SURVEY_MAX_COMMENT,
  parseRating,
  cleanComment,
} from '@/lib/survey-questions'
export type { SurveyRatingKey, SurveyCommentKey, SurveyQuestionMeta } from '@/lib/survey-questions'

// ── Report shapes (re-exported for server callers) ─────────────────
export type {
  SurveyDistributionBucket,
  SurveyQuestionScore,
  SurveyResponseRow,
  SurveyProcessRow,
  SurveyPendingRow,
  SurveyKpis,
  SurveyReport,
} from '@/lib/survey-types'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return round1(values.reduce((sum, v) => sum + v, 0) / values.length)
}

/**
 * Build the admin feedback report. Only active non-admin employees are
 * eligible; responses from ADMIN accounts are ignored (the submit endpoint
 * rejects them anyway).
 */
export async function buildSurveyReport(): Promise<SurveyReport> {
  const [users, allResponses] = await Promise.all([
    db.user.findMany({
      where: { isActive: true, role: { not: 'ADMIN' } },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        process: true,
        designation: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.surveyResponse.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            process: true,
            designation: true,
            role: true,
            isActive: true,
          },
        },
      },
    }),
  ])

  const eligibleById = new Map(users.map((u) => [u.id, u]))
  const responses = allResponses.filter(
    (r) => r.user.role !== 'ADMIN' && r.user.isActive && eligibleById.has(r.userId)
  )

  const submittedIds = new Set(responses.map((r) => r.userId))
  const eligibleEmployees = users.length
  const submitted = responses.length
  const pending = Math.max(0, eligibleEmployees - submitted)

  const questions: SurveyQuestionScore[] = SURVEY_QUESTIONS.map((q) => {
    const values = responses.map((r) => r[q.key])
    const distribution = [1, 2, 3, 4, 5].map((score) => {
      const count = values.filter((v) => v === score).length
      return { score, count, pct: pct(count, values.length) }
    })
    const positive = values.filter((v) => v >= 4).length
    return {
      key: q.key,
      label: q.label,
      shortLabel: q.shortLabel,
      low: q.low,
      high: q.high,
      average: average(values),
      positive,
      positiveRate: pct(positive, values.length),
      distribution,
    }
  })

  const overallValues = responses.map((r) => r.overall)
  const recommendValues = responses.map((r) => r.recommend)
  const satisfiedEmployees = overallValues.filter((v) => v >= 4).length
  const commentCount = responses.filter(
    (r) => Boolean(r.likedMost?.trim() || r.improvements?.trim() || r.comments?.trim())
  ).length

  const responseRows: SurveyResponseRow[] = responses.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    employeeCode: r.user.employeeCode,
    process: r.user.process,
    designation: r.user.designation,
    overall: r.overall,
    easeOfUse: r.easeOfUse,
    taskClarity: r.taskClarity,
    notifications: r.notifications,
    recommend: r.recommend,
    average: average([r.overall, r.easeOfUse, r.taskClarity, r.notifications, r.recommend]),
    likedMost: r.likedMost,
    improvements: r.improvements,
    comments: r.comments,
    createdAt: r.createdAt.toISOString(),
  }))

  // Group by process (eligible headcount + response quality per process).
  const processMap = new Map<
    string,
    { employees: number; responses: SurveyResponseRow[] }
  >()
  for (const u of users) {
    const key = u.process || '—'
    const entry = processMap.get(key) ?? { employees: 0, responses: [] }
    entry.employees++
    processMap.set(key, entry)
  }
  for (const r of responseRows) {
    const key = r.process || '—'
    const entry = processMap.get(key) ?? { employees: 0, responses: [] }
    entry.responses.push(r)
    processMap.set(key, entry)
  }
  const byProcess: SurveyProcessRow[] = [...processMap.entries()]
    .map(([process, entry]) => {
      const overall = entry.responses.map((r) => r.overall)
      const recommend = entry.responses.map((r) => r.recommend)
      return {
        process,
        employees: entry.employees,
        submitted: entry.responses.length,
        responseRate: pct(entry.responses.length, entry.employees),
        avgOverall: average(overall),
        avgRecommend: average(recommend),
        recommendRate: pct(recommend.filter((v) => v >= 4).length, recommend.length),
      }
    })
    .sort((a, b) => b.employees - a.employees || a.process.localeCompare(b.process))

  const pendingRows: SurveyPendingRow[] = users
    .filter((u) => !submittedIds.has(u.id))
    .map((u) => ({
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      process: u.process,
      designation: u.designation,
    }))

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      eligibleEmployees,
      submitted,
      pending,
      responseRate: pct(submitted, eligibleEmployees),
      avgOverall: average(overallValues),
      avgEaseOfUse: average(responses.map((r) => r.easeOfUse)),
      avgTaskClarity: average(responses.map((r) => r.taskClarity)),
      avgNotifications: average(responses.map((r) => r.notifications)),
      avgRecommend: average(recommendValues),
      recommendRate: pct(recommendValues.filter((v) => v >= 4).length, recommendValues.length),
      satisfiedEmployees,
      satisfiedRate: pct(satisfiedEmployees, overallValues.length),
      commentCount,
    },
    questions,
    byProcess,
    responses: responseRows,
    pending: pendingRows,
  }
}
