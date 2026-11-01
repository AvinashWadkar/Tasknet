import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { publish } from '@/lib/realtime'
import { cleanComment, parseRating, SURVEY_QUESTIONS, SURVEY_RATING_KEYS } from '@/lib/survey'

export const dynamic = 'force-dynamic'

/**
 * GET /api/survey — the signed-in user's survey status.
 * ADMIN accounts are exempt from the survey (eligible = false).
 */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json({
    eligible: session.role !== 'ADMIN',
    submitted: session.surveySubmitted,
  })
}

/**
 * POST /api/survey — submit the one-time employee feedback survey.
 * Ratings are mandatory integers 1–5; the three comments are optional.
 * A second submission is rejected with 409 (and `userId` is @unique in the DB,
 * so the one-submission rule also holds under a race).
 */
export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role === 'ADMIN') {
    return NextResponse.json({ error: 'The feedback survey is for employees only' }, { status: 403 })
  }
  if (session.surveySubmitted) {
    return NextResponse.json({ error: 'You have already submitted the feedback survey' }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const ratings: Record<string, number> = {}
  for (const key of SURVEY_RATING_KEYS) {
    const value = parseRating(body[key])
    if (value === null) {
      const label = SURVEY_QUESTIONS.find((q) => q.key === key)?.shortLabel ?? key
      return NextResponse.json({ error: `Please choose a rating from 1 to 5 for “${label}”` }, { status: 400 })
    }
    ratings[key] = value
  }

  try {
    await db.surveyResponse.create({
      data: {
        userId: session.id,
        overall: ratings.overall,
        easeOfUse: ratings.easeOfUse,
        taskClarity: ratings.taskClarity,
        notifications: ratings.notifications,
        recommend: ratings.recommend,
        likedMost: cleanComment(body.likedMost),
        improvements: cleanComment(body.improvements),
        comments: cleanComment(body.comments),
      },
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'You have already submitted the feedback survey' }, { status: 409 })
    }
    console.error('survey submit error', e)
    return NextResponse.json({ error: 'Could not save your feedback. Please try again.' }, { status: 500 })
  }

  // Let the user's other open tabs refresh their profile (surveySubmitted).
  publish({ type: 'users', userId: session.id })
  return NextResponse.json({ ok: true, submitted: true })
}
