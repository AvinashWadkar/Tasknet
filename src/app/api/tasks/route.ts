import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { istDayBounds, istDueDate } from '@/lib/dates'

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
    where.dueDate = { gte: start, lte: end }
  } else if (scope === 'date' && date) {
    const { start, end } = istDayBounds(date)
    where.dueDate = { gte: start, lte: end }
  } else if (scope === 'range' && from && to) {
    where.dueDate = { gte: istDayBounds(from).start, lte: istDayBounds(to).end }
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

    const task = await db.task.create({
      data: {
        title,
        description,
        dueDate,
        createdById: session.id,
        assignments: {
          create: validUsers.map((u) => ({ userId: u.id })),
        },
        activities: {
          create: [
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
          ],
        },
      },
      include: taskInclude,
    })

    return NextResponse.json({ task })
  } catch (e) {
    console.error('create task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
