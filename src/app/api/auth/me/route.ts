import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ user: null })
  const reportCount = await db.user.count({
    where: { managerId: user.id, isActive: true },
  })
  return NextResponse.json({ user: { ...user, isManager: reportCount > 0 } })
}

export async function PATCH(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { teamScope?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { teamScope } = body
  if (teamScope !== 'ALL' && teamScope !== 'DIRECT') {
    return NextResponse.json({ error: 'teamScope must be ALL or DIRECT' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: session.id },
    data: { teamScope },
  })

  const reportCount = await db.user.count({
    where: { managerId: updated.id, isActive: true },
  })

  return NextResponse.json({
    user: {
      id: updated.id,
      employeeCode: updated.employeeCode,
      name: updated.name,
      email: updated.email,
      process: updated.process,
      designation: updated.designation,
      role: updated.role,
      isFirstLogin: updated.isFirstLogin,
      managerName: updated.managerName,
      managerEmail: updated.managerEmail,
      teamScope: updated.teamScope === 'DIRECT' ? 'DIRECT' : 'ALL',
      isManager: reportCount > 0,
    },
  })
}