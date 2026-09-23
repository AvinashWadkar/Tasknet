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
