import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const DEFAULT_PASSWORD = 'Digitide@123'
const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_ROWS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface BulkRowResult {
  row: number // Excel row number for easy debugging in the uploaded file
  employeeCode: string
  name: string
  status: 'created' | 'failed'
  message: string
  managerLinked: boolean
}

/** Lowercase + strip everything non-alphanumeric so "Employee Code *" -> "employeecode". */
function normKey(k: string) {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function pick(row: Record<string, string>, candidates: string[]) {
  for (const c of candidates) {
    const v = row[c]
    if (v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** POST /api/users/bulk — ADMIN only: create many employee IDs from an uploaded Excel/CSV file. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can create user IDs' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Please attach the filled template file' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'The uploaded file is empty' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File is too large (max 2 MB). Split into smaller files.' }, { status: 400 })
    }
    const fileName = file.name || ''
    if (!/\.(xlsx|xls|csv)$/i.test(fileName)) {
      return NextResponse.json({ error: 'Unsupported file type — please upload the .xlsx template' }, { status: 400 })
    }

    // ── Parse workbook ─────────────────────────────────────────────
    let wb: XLSX.WorkBook
    try {
      wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' })
    } catch {
      return NextResponse.json({ error: 'Could not read the file. Please upload the downloaded template (.xlsx).' }, { status: 400 })
    }
    const ws = wb.Sheets['Employees'] ?? wb.Sheets[wb.SheetNames[0]]
    if (!ws) {
      return NextResponse.json({ error: 'The file has no worksheets' }, { status: 400 })
    }

    // blankrows:true keeps index -> Excel-row alignment (data starts at row 2)
    const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
      raw: false,
      defval: '',
      blankrows: true,
    })

    // Normalize header keys and make sure every required column exists
    const rows = rawRows.map((r) => {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(r)) out[normKey(k)] = String(v ?? '')
      return out
    })
    const colKeys = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r)) colKeys.add(k)
    const requiredCols: { key: string; label: string }[] = [
      { key: 'employeecode', label: 'Employee Code' },
      { key: 'employeename', label: 'Employee Name' },
      { key: 'emailid', label: 'Email ID' },
      { key: 'process', label: 'Process' },
      { key: 'designation', label: 'Designation' },
    ]
    const missing = requiredCols.filter((c) => !colKeys.has(c.key)).map((c) => c.label)
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required column(s): ${missing.join(', ')}. Please use the downloaded template without changing the header row.` },
        { status: 400 }
      )
    }

    // Existing users (for uniqueness + manager-by-email resolution)
    const existing = await db.user.findMany({ select: { id: true, employeeCode: true, email: true } })
    const existingCodes = new Set(existing.map((u) => u.employeeCode.toLowerCase()))
    const existingEmails = new Set(existing.map((u) => u.email.toLowerCase()))
    const userIdByEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u.id]))

    // ── Validate every row first ───────────────────────────────────
    type ValidRow = {
      row: number
      employeeCode: string
      name: string
      email: string
      process: string
      designation: string
      managerName: string
      managerEmail: string
    }
    const valid: ValidRow[] = []
    const results: BulkRowResult[] = []
    const seenCodes = new Set<string>()
    const seenEmails = new Set<string>()
    let dataRows = 0

    rows.forEach((r, idx) => {
      const excelRow = idx + 2 // header is row 1
      const employeeCode = pick(r, ['employeecode'])
      const name = pick(r, ['employeename'])
      const email = pick(r, ['emailid', 'email']).toLowerCase()
      const process = pick(r, ['process'])
      const designation = pick(r, ['designation'])
      const managerName = pick(r, ['l1managername', 'managername'])
      const managerEmail = pick(r, ['l1manageremailid', 'l1manageremail', 'manageremail']).toLowerCase()

      // Completely blank row -> silently skip
      if (!employeeCode && !name && !email && !process && !designation) return
      // Template sample row
      if (employeeCode.toLowerCase() === 'example') return

      dataRows++
      const codeKey = employeeCode.toLowerCase()

      const fail = (message: string) =>
        results.push({ row: excelRow, employeeCode, name, status: 'failed', message, managerLinked: false })

      if (!employeeCode || !name || !email || !process || !designation) {
        fail('Missing required detail — Employee Code, Name, Email ID, Process and Designation are all needed')
        return
      }
      if (!EMAIL_RE.test(email)) {
        fail(`Invalid Email ID "${email}"`)
        return
      }
      if (seenCodes.has(codeKey) || existingCodes.has(codeKey)) {
        fail(`Employee Code "${employeeCode}" already ${seenCodes.has(codeKey) ? 'appears twice in this file' : 'exists in the system'}`)
        return
      }
      if (seenEmails.has(email) || existingEmails.has(email)) {
        fail(`Email "${email}" is ${seenEmails.has(email) ? 'used twice in this file' : 'already registered'}`)
        return
      }
      if (managerEmail) {
        if (!EMAIL_RE.test(managerEmail)) {
          fail(`Invalid L1 Manager Email ID "${managerEmail}"`)
          return
        }
        if (managerEmail === email) {
          fail('A user cannot be their own L1 manager')
          return
        }
      }

      seenCodes.add(codeKey)
      seenEmails.add(email)
      valid.push({ row: excelRow, employeeCode, name, email, process, designation, managerName, managerEmail })
    })

    if (dataRows > MAX_ROWS) {
      return NextResponse.json(
        { error: `This file has ${dataRows} employee rows — the limit is ${MAX_ROWS} per upload. Please split it into smaller files.` },
        { status: 400 }
      )
    }
    if (dataRows === 0) {
      return NextResponse.json(
        { error: 'No employee rows found. Fill the Employees sheet (one employee per row) and try again.' },
        { status: 400 }
      )
    }

    // ── Create valid rows ──────────────────────────────────────────
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10) // same default for every row
    const createdEmailToId = new Map<string, string>()
    const createdIds: string[] = []

    for (const v of valid) {
      // manager: existing user, or an employee created earlier from this same file
      const managerId = userIdByEmail.get(v.managerEmail) ?? createdEmailToId.get(v.managerEmail) ?? null
      try {
        const user = await db.user.create({
          data: {
            employeeCode: v.employeeCode,
            name: v.name,
            email: v.email,
            process: v.process,
            designation: v.designation,
            managerName: v.managerName || null,
            managerEmail: v.managerEmail || null,
            managerId,
            password: hash,
            passwordPlain: DEFAULT_PASSWORD,
            isFirstLogin: true,
            role: 'EMPLOYEE',
          },
        })
        createdIds.push(user.id)
        createdEmailToId.set(v.email, user.id)

        let message = 'Created with the default password Digitide@123 (must change at first login)'
        const linked = Boolean(managerId)
        if (v.managerEmail && !linked) {
          message = 'Created, but the L1 Manager email was not found — the hierarchy will auto-link once that manager ID exists'
        }
        results.push({ row: v.row, employeeCode: v.employeeCode, name: v.name, status: 'created', message, managerLinked: linked })
      } catch (err) {
        const msg =
          typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002'
            ? `Duplicate Employee Code or Email — "${v.employeeCode}" could not be created`
            : 'Could not create this user'
        results.push({ row: v.row, employeeCode: v.employeeCode, name: v.name, status: 'failed', message: msg, managerLinked: false })
      }
    }

    // Retroactive link (mirrors single-user creation): users that named one of
    // the freshly created employees as their L1 manager get linked now.
    for (const id of createdIds) {
      const created = await db.user.findUnique({ where: { id }, select: { email: true } })
      if (!created) continue
      await db.user.updateMany({
        where: { managerEmail: created.email, id: { not: id }, managerId: null },
        data: { managerId: id },
      })
    }

    const createdCount = results.filter((r) => r.status === 'created').length
    const failedCount = results.filter((r) => r.status === 'failed').length

    return NextResponse.json({ totalRows: dataRows, createdCount, failedCount, results })
  } catch (e) {
    console.error('bulk create users error', e)
    return NextResponse.json({ error: 'Something went wrong while processing the file. Please try again.' }, { status: 500 })
  }
}
