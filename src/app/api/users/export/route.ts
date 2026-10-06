import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { fmtDateTime, istToday } from '@/lib/dates'

/**
 * GET /api/users/export — ADMIN only: full user dump for everyone ever created,
 * as an .xlsx attachment.
 *
 * Unlike /api/users this deliberately does NOT filter on isActive, so
 * deactivated IDs are in the file too. Secrets are included only because this
 * route is admin-gated; the plaintext password mirror is otherwise admin-only
 * anyway.
 */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can download the user dump' }, { status: 403 })
  }

  const [users, mappings] = await Promise.all([
    db.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        process: true,
        designation: true,
        role: true,
        teamScope: true,
        managerName: true,
        managerEmail: true,
        isActive: true,
        isFirstLogin: true,
        passwordPlain: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.managerMapping.findMany({
      select: {
        employeeId: true,
        manager: { select: { name: true, email: true, employeeCode: true } },
      },
    }),
  ])

  const managersByEmployee = new Map<string, string[]>()
  for (const m of mappings) {
    const label = `${m.manager.name} (${m.manager.employeeCode} — ${m.manager.email})`
    const arr = managersByEmployee.get(m.employeeId) ?? []
    if (!arr.includes(label)) arr.push(label)
    managersByEmployee.set(m.employeeId, arr)
  }

  const header = [
    'Employee Code',
    'Name',
    'Email',
    'Process',
    'Designation',
    'Role',
    'Manager(s) — mapped',
    'Manager Name (snapshot)',
    'Manager Email (snapshot)',
    'Status',
    'Password Reset Pending',
    'Current Password',
    'Team Scope',
    'Created On',
    'Last Updated',
  ]

  const rows = users.map((u) => [
    u.employeeCode,
    u.name,
    u.email,
    u.process,
    u.designation,
    u.role,
    (managersByEmployee.get(u.id) ?? []).join('; '),
    u.managerName ?? '',
    u.managerEmail ?? '',
    u.isActive ? 'Active' : 'Inactive',
    u.isFirstLogin ? 'Yes' : 'No',
    u.passwordPlain ?? '',
    u.teamScope,
    u.createdAt ? fmtDateTime(u.createdAt) : '',
    u.updatedAt ? fmtDateTime(u.updatedAt) : '',
  ])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  ws['!cols'] = [16, 24, 30, 28, 24, 12, 46, 24, 30, 10, 14, 18, 11, 18, 18].map((wch) => ({ wch }))
  if (rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }),
    }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 } as never
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Users')

  // Second sheet: the controlled Process list, so a dump is self-describing
  // about which process names are canonical versus historical free-text.
  const processes = await db.process.findMany({ orderBy: { name: 'asc' }, select: { name: true, createdAt: true } })
  const procHeader = ['Process Name', 'Added On']
  const procRows = processes.map((p) => [p.name, p.createdAt ? fmtDateTime(p.createdAt) : ''])
  const wsProc = XLSX.utils.aoa_to_sheet([procHeader, ...procRows])
  wsProc['!cols'] = [32, 18].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(wb, wsProc, 'Process List')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const filename = `Tasknet-Users-${istToday()}.xlsx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}