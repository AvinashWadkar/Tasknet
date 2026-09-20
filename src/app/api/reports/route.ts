import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildReport, getReportScope, loadReportRows, parseFilterParams } from '@/lib/reports'

/**
 * GET /api/reports — manager/admin performance report over the visible downline.
 * Query params (comma-separated, empty = all): months, processes, designations,
 * managers, employees.
 */
export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const scope = await getReportScope(session)
  if (!scope || scope.users.length === 0) {
    return NextResponse.json({ error: 'You do not have any team members reporting to you' }, { status: 403 })
  }

  const filters = parseFilterParams(new URL(req.url).searchParams)
  const allRows = await loadReportRows(scope.users)
  const report = buildReport(scope.users, allRows, filters, session)

  return NextResponse.json({ scope: scope.scope, ...report })
}
