import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildSurveyReport } from '@/lib/survey'

export const dynamic = 'force-dynamic'

/**
 * GET /api/survey/report — ADMIN only.
 * Company-wide results of the one-time employee feedback survey.
 */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  try {
    const report = await buildSurveyReport()
    return NextResponse.json(report)
  } catch (e) {
    console.error('survey report error', e)
    return NextResponse.json({ error: 'Could not build the feedback report' }, { status: 500 })
  }
}
