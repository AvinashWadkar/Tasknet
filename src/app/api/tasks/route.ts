import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { istDayBounds, istDueDate, fmtDate } from '@/lib/dates'
import { notifyAssignees } from '@/lib/notify'
import { recurrenceLabel, parseWeekdays, weekdaysToStr, type RecurFreq, type RecurEndType } from '@/lib/recurring'

const taskInclude = {
  creator: { select: { id: true, name: true, employeeCode: true, designation: true } },
  assignments: {
    select: {
      id: true,
      userId: true,
      status: true,
      completedAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, employeeCode: true, designation: true, process: true } },
    },
  },
}

/**
 * Date-window filter for list scopes (today / date / range).
 * - filter=created → the creator tracks a task under the due date they set.
 * - otherwise → the task matches if it is DUE inside the window OR my own
 *   assignment was COMPLETED inside the window (an employee's calendar
 *   reflects the day the work was actually finished, not the deadline).
 */
function applyTaskWindow(
  where: Record<string, unknown>,
  bounds: { gte: Date; lte: Date },
  filter: string,
  userId: string
) {
  if (filter === 'created') {
    where.dueDate = bounds
  } else {
    where.AND = [
      {
        OR: [{ dueDate: bounds }, { assignments: { some: { userId, completedAt: bounds } } }],
      },
    ]
  }
}

/**
 * GET /api/tasks?scope=today|date|range|all&date=YYYY-MM-DD&from=...&to=...&filter=assigned|created|all
 * Returns tasks the signed-in user created or is assigned to.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const scope = sp.get('scope') || 'all'
  const filter = sp.get('filter') || 'all'
  const date = sp.get('date')
  const from = sp.get('from')
  const to = sp.get('to')

  // Base visibility: I created it OR I am assigned to it
  const where: Record<string, unknown> = {
    OR: [{ createdById: session.id }, { assignments: { some: { userId: session.id } } }],
  }
  if (filter === 'assigned') where.assignments = { some: { userId: session.id } }
  if (filter === 'created') where.createdById = session.id

  if (scope === 'today' && date) {
    const { start, end } = istDayBounds(date)
    applyTaskWindow(where, { gte: start, lte: end }, filter, session.id)
  } else if (scope === 'date' && date) {
    const { start, end } = istDayBounds(date)
    applyTaskWindow(where, { gte: start, lte: end }, filter, session.id)
  } else if (scope === 'range' && from && to) {
    applyTaskWindow(where, { gte: istDayBounds(from).start, lte: istDayBounds(to).end }, filter, session.id)
  }

  const tasks = await db.task.findMany({
    where,
    include: taskInclude,
    orderBy: { dueDate: 'asc' },
    take: 500,
  })

  return NextResponse.json({ tasks })
}

/** POST /api/tasks — create a task and assign it to one or more employees. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.isFirstLogin) {
    return NextResponse.json({ error: 'Set your password first' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim() || null
    const dueDateRaw = body.dueDate
    const assigneeIds: string[] = Array.isArray(body.assigneeIds) ? [...new Set(body.assigneeIds)] : []

    if (!title) return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
    if (!dueDateRaw) return NextResponse.json({ error: 'Due date is required' }, { status: 400 })
    if (assigneeIds.length === 0) {
      return NextResponse.json({ error: 'Please assign the task to at least one employee' }, { status: 400 })
    }

    // dueDate: either an ISO string or {date: 'YYYY-MM-DD', time: 'HH:mm'} in IST
    let dueDate: Date
    if (typeof dueDateRaw === 'object' && dueDateRaw.date) {
      dueDate = istDueDate(String(dueDateRaw.date), dueDateRaw.time)
    } else {
      dueDate = new Date(dueDateRaw)
    }
    if (isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: 'Invalid due date' }, { status: 400 })
    }

    const validUsers = await db.user.findMany({
      where: { id: { in: assigneeIds }, isActive: true },
      select: { id: true, name: true },
    })
    if (validUsers.length === 0) {
      return NextResponse.json({ error: 'No valid assignees found' }, { status: 400 })
    }

    // ── Recurrence (optional) ──────────────────────────────────────
    const recurring = body.recurring === true
    let recurFreq: RecurFreq | null = null
    let recurInterval: number | null = null
    let recurEndType: RecurEndType | null = null
    let recurEndDate: Date | null = null
    let recurCount: number | null = null
    let recurWeekdays: string | null = null
    let recurMonthDay: number | null = null
    if (recurring) {
      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(body.recurFreq))) {
        return NextResponse.json({ error: 'Choose how often the task repeats' }, { status: 400 })
      }
      recurFreq = body.recurFreq
      recurInterval = Math.min(99, Math.max(1, Math.floor(Number(body.recurInterval) || 1)))
      recurEndType = ['NEVER', 'ON_DATE', 'AFTER_N'].includes(String(body.recurEndType))
        ? body.recurEndType
        : 'NEVER'
      if (recurEndType === 'ON_DATE') {
        const raw = String(body.recurEndDate || '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          return NextResponse.json({ error: 'Pick the date the series should end on' }, { status: 400 })
        }
        recurEndDate = istDueDate(raw, '23:59')
        if (recurEndDate.getTime() < dueDate.getTime()) {
          return NextResponse.json({ error: 'The end date must be on or after the first due date' }, { status: 400 })
        }
      }
      if (recurEndType === 'AFTER_N') {
        recurCount = Math.floor(Number(body.recurCount))
        if (!Number.isFinite(recurCount) || recurCount < 2) {
          return NextResponse.json({ error: 'Occurrence count must be at least 2' }, { status: 400 })
        }
      }
      if (recurFreq === 'WEEKLY') {
        // Selected repeat days (1=Mon..7=Sun): the series then runs every week on
        // those days, so the every-N-weeks interval is clamped to 1
        recurWeekdays = weekdaysToStr(parseWeekdays(typeof body.recurWeekdays === 'string' ? body.recurWeekdays : ''))
        if (recurWeekdays) recurInterval = 1
      }
      if (recurFreq === 'MONTHLY' && body.recurMonthDay != null && body.recurMonthDay !== '') {
        const md = Math.floor(Number(body.recurMonthDay))
        if (Number.isFinite(md) && md >= 1 && md <= 31) recurMonthDay = md
      }
    }

    const activitiesData: { actorId: string; actorName: string; action: string; detail: string }[] = [
      {
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'TASK_CREATED',
        detail: `Task created by ${session.name}`,
      },
      {
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'ASSIGNED',
        detail: `Assigned to ${validUsers.map((u) => u.name).join(', ')}`,
      },
    ]
    if (recurring) {
      const endNote =
        recurEndType === 'ON_DATE' && recurEndDate
          ? ` until ${fmtDate(recurEndDate)}`
          : recurEndType === 'AFTER_N' && recurCount
            ? ` — ${recurCount} times total`
            : ' — no end date'
      activitiesData.push({
        actorId: session.id,
        actorName: `${session.name} (${session.employeeCode})`,
        action: 'RECURRENCE',
        detail: `Recurring series started — ${recurrenceLabel({ recurring: true, recurFreq, recurInterval, recurWeekdays, recurMonthDay })}${endNote}. The next occurrence is created automatically when every assignee completes this task.`,
      })
    }

    const task = await db.task.create({
      data: {
        title,
        description,
        dueDate,
        createdById: session.id,
        recurring,
        recurFreq: recurring ? recurFreq : null,
        recurInterval: recurring ? recurInterval : null,
        recurEndType: recurring ? recurEndType : null,
        recurEndDate,
        recurCount: recurring && recurEndType === 'AFTER_N' ? recurCount : null,
        recurWeekdays: recurring ? recurWeekdays : null,
        recurMonthDay: recurring ? recurMonthDay : null,
        assignments: {
          create: validUsers.map((u) => ({ userId: u.id })),
        },
        activities: {
          create: activitiesData,
        },
      },
      include: taskInclude,
    })

    // Notify every assignee (except the creator, who already knows).
    await notifyAssignees({
      taskId: task.id,
      recipientIds: validUsers.map((u) => u.id),
      excludeIds: [session.id],
      title: 'New task assigned to you',
      message: `${session.name} assigned you "${task.title}" — due ${fmtDate(task.dueDate)}${recurring ? ' (recurring)' : ''}.`,
    })

    return NextResponse.json({ task })
  } catch (e) {
    console.error('create task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
