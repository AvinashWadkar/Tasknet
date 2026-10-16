import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getDescendantIds } from '@/lib/hierarchy'
import { istDueDate, fmtDate } from '@/lib/dates'
import { recurrenceLabel, parseWeekdays, weekdaysToStr } from '@/lib/recurring'
import { notifyAssignees } from '@/lib/notify'
import { taskInclude } from '@/lib/task-include'
import { publish } from '@/lib/realtime'

/**
 * GET /api/tasks/[id] — full detail incl. all assignees' statuses + complete history.
 * Visible to: creator, any assignee, the chosen validator, or any manager whose
 * downline includes the creator or an assignee. Downline can never view upline.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: taskInclude })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const isAdmin = session.role === 'ADMIN'
  const isParticipant = task.createdById === session.id || task.assignments.some((a) => a.userId === session.id)
  const isCreator = task.createdById === session.id
  const isValidator = task.validatorId === session.id
  // The admin can view and modify any task.
  let canEdit = isCreator || isAdmin
  let canAct = isParticipant
  let isManager = false

  // A manager (someone whose downline includes the creator or an assignee) may
  // view and edit any task in their downline — this mirrors the PATCH gate so
  // the UI and the API always agree, including when the manager is also an
  // assignee themselves.
  const managerOfTask = async () => {
    const downline = await getDescendantIds(session.id)
    return downline.includes(task.createdById) || task.assignments.some((a) => downline.includes(a.userId))
  }

  if (!isParticipant && !isValidator && !isAdmin) {
    if (!(await managerOfTask())) {
      return NextResponse.json({ error: 'You do not have access to this task' }, { status: 403 })
    }
    // Manager viewing a downline task: may edit details and reopen parts.
    isManager = true
    canEdit = true
    canAct = false
  } else if (!canEdit && (await managerOfTask())) {
    // Participant manager (e.g. also an assignee) editing downline work.
    canEdit = true
  }

  const canReopen = task.status !== 'ABORTED' && (isCreator || isManager || isAdmin)
  const canValidate = isValidator && task.status !== 'ABORTED'
  const canDelete = isAdmin
  const canAbort = isCreator || isAdmin

  return NextResponse.json({ task, canEdit, canAct, canReopen, canValidate, canDelete, canAbort })
}

/**
 * PATCH /api/tasks/[id] — the creator (or the admin on any task): edit fields
 * and/or add more assignees.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, include: { assignments: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const isAdmin = session.role === 'ADMIN'
  const isCreator = task.createdById === session.id
  // Creator and admin can always edit. Otherwise the actor must be a manager of
  // the creator or of one of the assignees.
  if (!isCreator && !isAdmin) {
    const downline = await getDescendantIds(session.id)
    const isManagerOf = downline.includes(task.createdById) || task.assignments.some((a) => downline.includes(a.userId))
    if (!isManagerOf) {
      return NextResponse.json({ error: 'Only the task creator, a manager, or the admin can edit this task' }, { status: 403 })
    }
  }
  if (task.status === 'ABORTED' && !isAdmin) {
    return NextResponse.json({ error: 'This task was aborted and can no longer be edited' }, { status: 400 })
  }
  if (task.status === 'ABORTED') {
    return NextResponse.json(
      { error: 'This task has been aborted and can no longer be edited' },
      { status: 400 }
    )
  }

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    const logs: { actorId: string; actorName: string; action: string; detail: string }[] = []
    const actor = `${session.name} (${session.employeeCode})`

    if (typeof body.title === 'string' && body.title.trim() && body.title.trim() !== task.title) {
      data.title = body.title.trim()
      logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: `Title changed to "${data.title}"` })
    }
    if (typeof body.description === 'string' && body.description.trim() !== (task.description || '')) {
      data.description = body.description.trim() || null
      logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: 'Description updated' })
    }
    if (body.dueDate) {
      const nd =
        typeof body.dueDate === 'object' && body.dueDate.date
          ? istDueDate(String(body.dueDate.date), body.dueDate.time)
          : new Date(body.dueDate)
      if (!isNaN(nd.getTime())) {
        data.dueDate = nd
        logs.push({ actorId: session.id, actorName: actor, action: 'TASK_UPDATED', detail: 'Due date changed' })
      }
    }

    // Optional collation validator — set, change or clear.
    let newValidator: { id: string; name: string } | null = null
    if ('validatorId' in body) {
      const raw = body.validatorId
      const nextId = raw == null || raw === '' ? null : String(raw)
      if (nextId !== task.validatorId) {
        if (nextId) {
          const v = await db.user.findFirst({ where: { id: nextId, isActive: true }, select: { id: true, name: true } })
          if (!v) return NextResponse.json({ error: 'The selected validator was not found' }, { status: 400 })
          data.validatorId = v.id
          newValidator = v
          logs.push({ actorId: session.id, actorName: actor, action: 'VALIDATION', detail: `Collation validator set to ${v.name}` })
        } else {
          data.validatorId = null
          logs.push({ actorId: session.id, actorName: actor, action: 'VALIDATION', detail: 'Validator removed' })
        }
      }
    }

    // Recurrence schedule — turn the series on/off or change the cadence.
    let recurChanged = false
    if (
      'recurring' in body ||
      ['recurFreq', 'recurInterval', 'recurEndType', 'recurEndDate', 'recurCount', 'recurWeekdays', 'recurMonthDay'].some(
        (k) => k in body
      )
    ) {
      const targetRecurring = typeof body.recurring === 'boolean' ? body.recurring : !!task.recurring
      if (!targetRecurring) {
        if (task.recurring) {
          data.recurring = false
          data.recurFreq = null
          data.recurInterval = null
          data.recurEndType = null
          data.recurEndDate = null
          data.recurCount = null
          data.recurWeekdays = null
          data.recurMonthDay = null
          recurChanged = true
          logs.push({ actorId: session.id, actorName: actor, action: 'RECURRENCE', detail: 'Recurrence turned off' })
        }
      } else {
        const freq = String(body.recurFreq ?? task.recurFreq ?? '')
        if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
          return NextResponse.json({ error: 'Choose how often the task repeats' }, { status: 400 })
        }
        let interval = Math.min(99, Math.max(1, Math.floor(Number(body.recurInterval ?? task.recurInterval ?? 1) || 1)))
        const endType = ['NEVER', 'ON_DATE', 'AFTER_N'].includes(String(body.recurEndType ?? task.recurEndType))
          ? String(body.recurEndType ?? task.recurEndType)
          : 'NEVER'
        let endDate: Date | null = null
        if (endType === 'ON_DATE') {
          const raw = String(body.recurEndDate ?? '')
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            return NextResponse.json({ error: 'Pick the date the series should end on' }, { status: 400 })
          }
          endDate = istDueDate(raw, '23:59')
        }
        let count: number | null = null
        if (endType === 'AFTER_N') {
          count = Math.floor(Number(body.recurCount))
          if (!Number.isFinite(count) || count < 2) {
            return NextResponse.json({ error: 'Occurrence count must be at least 2' }, { status: 400 })
          }
        }
        let weekdays: string | null = null
        if (freq === 'WEEKLY') {
          weekdays = weekdaysToStr(parseWeekdays(typeof body.recurWeekdays === 'string' ? body.recurWeekdays : ''))
          if (weekdays) interval = 1
        }
        let monthDay: number | null = null
        if (freq === 'MONTHLY' && body.recurMonthDay != null && body.recurMonthDay !== '') {
          const md = Math.floor(Number(body.recurMonthDay))
          if (Number.isFinite(md) && md >= 1 && md <= 31) monthDay = md
        }
        const changed =
          !task.recurring ||
          task.recurFreq !== freq ||
          (task.recurInterval ?? 1) !== interval ||
          (task.recurEndType ?? 'NEVER') !== endType ||
          (task.recurCount ?? null) !== count ||
          (task.recurWeekdays ?? null) !== weekdays ||
          (task.recurMonthDay ?? null) !== monthDay ||
          (task.recurEndDate ? task.recurEndDate.getTime() : null) !== (endDate ? endDate.getTime() : null)
        if (changed) {
          data.recurring = true
          data.recurFreq = freq
          data.recurInterval = interval
          data.recurEndType = endType
          data.recurEndDate = endDate
          data.recurCount = count
          data.recurWeekdays = weekdays
          data.recurMonthDay = monthDay
          recurChanged = true
          const endNote =
            endType === 'ON_DATE' && endDate
              ? ` until ${fmtDate(endDate)}`
              : endType === 'AFTER_N' && count
                ? ` — ${count} times total`
                : ''
          logs.push({
            actorId: session.id,
            actorName: actor,
            action: 'RECURRENCE',
            detail: `Recurrence updated — ${recurrenceLabel({ recurring: true, recurFreq: freq, recurInterval: interval, recurWeekdays: weekdays, recurMonthDay: monthDay })}${endNote}`,
          })
        }
      }
    }

    const addedIds: string[] = []
    if (Array.isArray(body.addAssigneeIds) && body.addAssigneeIds.length > 0) {
      const existing = new Set(task.assignments.map((a) => a.userId))
      const toAdd = [...new Set(body.addAssigneeIds as string[])].filter((uid) => !existing.has(uid))
      if (toAdd.length > 0) {
        const users = await db.user.findMany({ where: { id: { in: toAdd }, isActive: true } })
        for (const u of users) {
          await db.taskAssignment.create({ data: { taskId: task.id, userId: u.id } })
        }
        if (users.length) {
          addedIds.push(...users.map((u) => u.id))
          logs.push({
            actorId: session.id,
            actorName: actor,
            action: 'ASSIGNED',
            detail: `Assigned to ${users.map((u) => u.name).join(', ')}`,
          })
        }
      }
    }

    const removedIds: string[] = []
    if (Array.isArray(body.removeAssigneeIds) && body.removeAssigneeIds.length > 0) {
      const toRemove = [...new Set(body.removeAssigneeIds as string[])].filter((uid) => task.assignments.some((a) => a.userId === uid))
      if (toRemove.length > 0) {
        const remaining = task.assignments.filter((a) => !toRemove.includes(a.userId)).length
        if (remaining + addedIds.length < 1) {
          return NextResponse.json({ error: 'A task must keep at least one assignee.' }, { status: 400 })
        }
        const users = await db.user.findMany({ where: { id: { in: toRemove }, isActive: true }, select: { id: true, name: true } })
        await db.taskAssignment.deleteMany({ where: { taskId: task.id, userId: { in: toRemove } } })
        removedIds.push(...toRemove)
        if (users.length) {
          logs.push({
            actorId: session.id,
            actorName: actor,
            action: 'UNASSIGNED',
            detail: `Unassigned from ${users.map((u) => u.name).join(', ')}`,
          })
        }
      }
    }

    // "This and all future tasks" applies to every occurrence of a recurring series.
    const applyToFuture = body.applyTo === 'future' && task.recurring && !!task.recurFreq
    if (applyToFuture) {
      logs.push({
        actorId: session.id,
        actorName: actor,
        action: 'TASK_UPDATED',
        detail: 'Changes applied to this and all future occurrences',
      })
    }

    await db.task.update({ where: { id: task.id }, data })
    if (logs.length) {
      await db.taskActivity.createMany({ data: logs.map((l) => ({ ...l, taskId: task.id })) })
    }

    // Propagate the edited fields to the later occurrences that already exist in
    // the series. Occurrences created afterwards inherit them automatically,
    // because the spawner copies these fields from the occurrence just completed.
    if (applyToFuture) {
      const seriesKey = task.rootTaskId ?? task.id
      const hasTitle = Object.prototype.hasOwnProperty.call(data, 'title')
      const hasDescription = Object.prototype.hasOwnProperty.call(data, 'description')
      const dueDelta =
        data.dueDate instanceof Date ? data.dueDate.getTime() - task.dueDate.getTime() : 0

      const futureTasks = await db.task.findMany({
        where: {
          id: { not: task.id },
          status: { not: 'ABORTED' },
          recurOccurrence: { gt: task.recurOccurrence ?? 1 },
          OR: [{ rootTaskId: seriesKey }, { id: seriesKey }],
        },
        select: { id: true, dueDate: true },
      })

      for (const ft of futureTasks) {
        const fdata: Record<string, unknown> = {}
        if (hasTitle) fdata.title = data.title
        if (hasDescription) fdata.description = data.description
        if (dueDelta) fdata.dueDate = new Date(ft.dueDate.getTime() + dueDelta)
        if (Object.prototype.hasOwnProperty.call(data, 'validatorId')) fdata.validatorId = data.validatorId
        if (recurChanged) {
          fdata.recurring = data.recurring
          fdata.recurFreq = data.recurFreq
          fdata.recurInterval = data.recurInterval
          fdata.recurEndType = data.recurEndType
          fdata.recurEndDate = data.recurEndDate
          fdata.recurCount = data.recurCount
          fdata.recurWeekdays = data.recurWeekdays
          fdata.recurMonthDay = data.recurMonthDay
        }
        if (Object.keys(fdata).length === 0) continue

        await db.task.update({ where: { id: ft.id }, data: fdata })
        await db.taskActivity.create({
          data: {
            taskId: ft.id,
            actorId: session.id,
            actorName: actor,
            action: 'TASK_UPDATED',
            detail: 'Updated to match an earlier occurrence of this recurring series',
          },
        })
        publish({ type: 'task', taskId: ft.id, action: 'updated' })
      }
    }

    const updated = await db.task.findUnique({ where: { id: task.id }, include: taskInclude })

    if (addedIds.length && updated) {
      await notifyAssignees({
        taskId: task.id,
        recipientIds: addedIds,
        excludeIds: [session.id],
        title: 'You were added to a task',
        message: `${session.name} added you to "${updated.title}" - due ${fmtDate(updated.dueDate)}.`,
      })
    }

    if (newValidator && updated) {
      await notifyAssignees({
        taskId: task.id,
        recipientIds: [newValidator.id],
        excludeIds: [session.id],
        type: 'TASK_VALIDATION',
        title: 'You were set as a validator',
        message: `${session.name} chose you to validate "${updated.title}". You'll be notified when a part is sent to you.`,
      })
    }

    if (logs.length) publish({ type: 'task', taskId: task.id, action: 'updated' })
    return NextResponse.json({ task: updated })
  } catch (e) {
    console.error('update task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/**
 * DELETE /api/tasks/[id] — ADMIN only: permanently delete any task, its
 * assignments, history and notifications.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the administrator can delete a task' }, { status: 403 })
  }

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id }, select: { id: true } })
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  try {
    await db.$transaction([
      db.notification.deleteMany({ where: { taskId: id } }),
      db.task.delete({ where: { id } }),
    ])
    publish({ type: 'task', taskId: id, action: 'deleted' })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('delete task error', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
