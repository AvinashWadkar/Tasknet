import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { buildUsageReport } from '@/lib/usage-report'
import type { NextRequest } from 'next/server'

/**
 * GET /api/admin/usage — ADMIN only.
 *
 * Tool adoption & usage report: who has adopted Tasknet, how much it is used,
 * feature usage breakdown, and adoption over time.
 * Query: ?days=30|90|180 (window for the period metrics; default 90)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  try {
    const { report } = await buildUsageReport(req.nextUrl.searchParams.get('days'))
    return NextResponse.json(report)
  } catch (e) {
    console.error('admin usage report error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
