import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildSurveyReport } from '@/lib/survey'
import { buildUsageReport, normalizeDays } from '@/lib/usage-report'
import { buildPitchDeck } from '@/lib/pitch-deck'
import { istToday } from '@/lib/dates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/pitch-deck?days=90 - ADMIN only.
 *
 * A ready-to-present PowerPoint deck that pitches Tasknet to management: the
 * business problem, what the tool delivers, live adoption and usage numbers,
 * the employee feedback survey, verbatim quotes, business impact and a
 * prioritised set of next steps.
 *
 * It reuses `buildUsageReport` and `buildSurveyReport`, the same computations
 * behind the admin console and its Excel exports, so the deck always matches
 * what an admin sees on screen.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const days = normalizeDays(req.nextUrl.searchParams.get('days'))
  const [survey, usage] = await Promise.all([buildSurveyReport(), buildUsageReport(days)])

  const buffer = await buildPitchDeck({
    survey,
    usage: usage.report,
    preparedBy: session.name,
    preparedByCode: session.employeeCode,
  })
  const body = new Uint8Array(buffer)
  const filename = `Tasknet-Management-Deck-${istToday()}.pptx`

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}
