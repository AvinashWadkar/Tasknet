'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useRealtime } from '@/hooks/use-realtime'
import type { RealtimeEvent } from '@/lib/realtime'
import { StatusBadge, OverdueBadge, AbortedBadge, InitialAvatar, ValidationBadge } from './shared'
import { api } from './api'
import { STATUS_LABEL, type Me, type TaskDetailDTO, type TaskStatus } from './types'
import { fmtDateTime, fmtDate, fmtTime, delayLabel } from '@/lib/dates'
import { recurrenceLabel } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import {
  Loader2,
  MessageSquarePlus,
  CalendarClock,
  UserRound,
  CheckCircle2,
  PlayCircle,
  Rewind,
  Users,
  StickyNote,
  Flag,
  Plus,
  History,
  Ban,
  AlarmClock,
  Forward,
  Repeat,
  ShieldCheck,
  BadgeCheck,
  Send,
  Pencil,
  Trash2,
  UserMinus,
} from 'lucide-react'

const ACTION_STYLE: Record<string, { icon: typeof Flag; cls: string }> = {
  TASK_CREATED: { icon: Flag, cls: 'bg-brand-100 text-brand-700' },
  ASSIGNED: { icon: Users, cls: 'bg-brand-100 text-brand-700' },
  UNASSIGNED: { icon: UserMinus, cls: 'bg-red-100 text-red-700' },
  STATUS_UPDATED: { icon: PlayCircle, cls: 'bg-violet-100 text-violet-700' },
  REOPENED: { icon: Rewind, cls: 'bg-amber-100 text-amber-700' },
  COMMENT: { icon: StickyNote, cls: 'bg-slate-100 text-slate-600' },
  TASK_UPDATED: { icon: History, cls: 'bg-sky-100 text-sky-700' },
  TASK_ABORTED: { icon: Ban, cls: 'bg-red-100 text-red-700' },
  TASK_HANDOFF: { icon: Forward, cls: 'bg-cyan-100 text-cyan-700' },
  RECURRENCE: { icon: Repeat, cls: 'bg-emerald-100 text-emerald-700' },
  VALIDATION: { icon: ShieldCheck, cls: 'bg-emerald-100 text-emerald-700' },
  VALIDATION_SENT: { icon: Send, cls: 'bg-amber-100 text-amber-700' },
  VALIDATED: { icon: BadgeCheck, cls: 'bg-emerald-100 text-emerald-700' },
}

export function TaskDetailDialog({
  taskId,
  me,
  onClose,
  onChanged,
}: {
  taskId: string | null
  me: Me
  onClose: () => void
  onChanged: () => void
}) {
  const [task, setTask] = useState<TaskDetailDTO | null>(null)
  const [canAct, setCanAct] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canReopen, setCanReopen] = useState(false)
  const [canValidate, setCanValidate] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [canAbort, setCanAbort] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendNote, setSendNote] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null)
  const [reviewReopenOpen, setReviewReopenOpen] = useState(false)
  const [reviewUser, setReviewUser] = useState<{ userId: string; name: string } | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [addUsers, setAddUsers] = useState<{ id: string; name: string }[]>([])
  const [addSel, setAddSel] = useState<string | null>(null)
  const [addingBusy, setAddingBusy] = useState(false)
  const [removeBusyId, setRemoveBusyId] = useState<string | null>(null)
  const [abortOpen, setAbortOpen] = useState(false)
  const [abortReason, setAbortReason] = useState('')
  const [abortBusy, setAbortBusy] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [handoffUsers, setHandoffUsers] = useState<{ id: string; name: string }[]>([])
  const [handoffSel, setHandoffSel] = useState<string | null>(null)
  const [handoffNote, setHandoffNote] = useState('')
  const [handoffBusy, setHandoffBusy] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenComment, setReopenComment] = useState('')
  const [reopenSel, setReopenSel] = useState<string[]>([])
  const [reopenBusy, setReopenBusy] = useState(false)
  const { toast } = useToast()

  const loadAddUsers = useCallback(async (current: TaskDetailDTO) => {
    try {
      const r = await api<{ users: { id: string; name: string; employeeCode: string }[] }>('/api/users')
      setAddUsers(
        r.users
          .filter((u) => !current.assignments.some((a) => a.userId === u.id))
          .map((u) => ({ id: u.id, name: `${u.name} (${u.employeeCode})` }))
      )
    } catch {
      // ignore
    }
  }, [])

  const load = useCallback(async () => {
    if (!taskId) return
    setError(null)
    setTask(null)
    try {
      const res = await api<{ task: TaskDetailDTO; canEdit: boolean; canAct: boolean; canReopen: boolean; canValidate: boolean; canDelete: boolean; canAbort: boolean }>(`/api/tasks/${taskId}`)
      setTask(res.task)
      setCanAct(res.canAct)
      setCanEdit(res.canEdit)
      setCanReopen(res.canReopen)
      setCanValidate(res.canValidate)
      setCanDelete(res.canDelete)
      setCanAbort(res.canAbort)
      if (res.canEdit) void loadAddUsers(res.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load task')
    }
  }, [taskId, loadAddUsers])

  useEffect(() => {
    if (taskId) load()
  }, [taskId, load])

  const refresh = useCallback(async () => {
    if (!taskId) return
    try {
      const res = await api<{ task: TaskDetailDTO; canEdit: boolean; canAct: boolean; canReopen: boolean; canValidate: boolean; canDelete: boolean; canAbort: boolean }>(`/api/tasks/${taskId}`)
      setTask(res.task)
      setCanAct(res.canAct)
      setCanEdit(res.canEdit)
      setCanReopen(res.canReopen)
      setCanValidate(res.canValidate)
      setCanDelete(res.canDelete)
      setCanAbort(res.canAbort)
      if (res.canEdit) void loadAddUsers(res.task)
    } catch {
      // ignore
    }
  }, [taskId, loadAddUsers])

  useRealtime(
    useCallback(
      (event: RealtimeEvent) => {
        if (event.type === 'task' && event.taskId === taskId) void refresh()
      },
      [taskId, refresh]
    )
  )

  async function setStatus(status: TaskStatus) {
    if (!task) return
    setStatusBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      setTask(res.task)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status')
    } finally {
      setStatusBusy(false)
    }
  }

  function openSend() {
    setSendNote('')
    setSendOpen(true)
  }

  function chooseStatus(status: TaskStatus) {
    if (!task) return
    // A task with a validator can only be completed by sending it for validation.
    if (status === 'COMPLETED' && task.validator) {
      setSendNote('')
      setSendOpen(true)
      return
    }
    setStatus(status)
  }

  async function doSend() {
    if (!task) return
    setSendBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/validate`, {
        method: 'POST',
        body: JSON.stringify({ note: sendNote.trim() || undefined }),
      })
      setTask(res.task)
      setSendOpen(false)
      setSendNote('')
      onChanged()
      toast({
        title: 'Sent for validation',
        description: task.validator ? `${task.validator.name} can now approve or reopen your part.` : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send for validation')
    } finally {
      setSendBusy(false)
    }
  }

  async function review(userId: string, action: 'APPROVE' | 'REOPEN', comment?: string) {
    if (!task) return
    const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/validate/review`, {
      method: 'POST',
      body: JSON.stringify({ userId, action, comment }),
    })
    setTask(res.task)
    onChanged()
    return res
  }

  async function approvePart(userId: string) {
    setReviewBusyId(userId)
    try {
      await review(userId, 'APPROVE')
      toast({ title: 'Part validated' })
    } catch (err) {
      toast({ title: 'Could not validate', description: err instanceof Error ? err.message : 'Please try again.' })
    } finally {
      setReviewBusyId(null)
    }
  }

  function openReviewReopen(userId: string, name: string) {
    setReviewUser({ userId, name })
    setReviewComment('')
    setReviewReopenOpen(true)
  }

  async function doReviewReopen() {
    if (!task || !reviewUser || !reviewComment.trim()) return
    setReviewBusy(true)
    try {
      await review(reviewUser.userId, 'REOPEN', reviewComment.trim())
      setReviewReopenOpen(false)
      setReviewComment('')
      onChanged()
      toast({ title: 'Part reopened', description: `${reviewUser.name} is back to Pending.` })
    } catch (err) {
      toast({ title: 'Could not reopen', description: err instanceof Error ? err.message : 'Please try again.' })
    } finally {
      setReviewBusy(false)
    }
  }

  async function postComment() {
    if (!task || !comment.trim()) return
    setCommentBusy(true)
    try {
      const res = await api<{ activity: { id: string; actorName: string; action: string; detail: string; createdAt: string } }>(
        `/api/tasks/${task.id}/comment`,
        { method: 'POST', body: JSON.stringify({ text: comment.trim() }) }
      )
      setTask((prev) => (prev ? { ...prev, activities: [res.activity, ...prev.activities] } : prev))
      setComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add comment')
    } finally {
      setCommentBusy(false)
    }
  }

  async function addAssignee() {
    if (!task || !addSel) return
    setAddingBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ addAssigneeIds: [addSel] }),
      })
      setTask(res.task)
      setAddSel(null)
      setAddUsers((prev) => prev.filter((u) => u.id !== addSel))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add assignee')
    } finally {
      setAddingBusy(false)
    }
  }

  async function removeAssignee(userId: string) {
    if (!task) return
    setRemoveBusyId(userId)
    setError(null)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ removeAssigneeIds: [userId] }),
      })
      setTask(res.task)
      void loadAddUsers(res.task)
      onChanged()
      toast({ title: 'Employee removed', description: 'They are no longer assigned to this task.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove assignee')
    } finally {
      setRemoveBusyId(null)
    }
  }

  async function abortTask() {
    if (!task) return
    setAbortBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/abort`, {
        method: 'POST',
        body: JSON.stringify({ reason: abortReason.trim() || undefined }),
      })
      setTask(res.task)
      setAbortOpen(false)
      setAbortReason('')
      onChanged()
      toast({ title: 'Task aborted', description: 'Assignees can no longer update their status.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not abort task')
    } finally {
      setAbortBusy(false)
    }
  }

  function openHandoff() {
    setHandoffSel(null)
    setHandoffNote('')
    setHandoffUsers([])
    api<{ users: { id: string; name: string; employeeCode: string }[] }>('/api/users')
      .then((r) =>
        setHandoffUsers(
          r.users
            .filter((u) => u.id !== me.id && !task?.assignments.some((a) => a.userId === u.id))
            .map((u) => ({ id: u.id, name: `${u.name} (${u.employeeCode})` }))
        )
      )
      .catch(() => {})
    setHandoffOpen(true)
  }

  async function doHandoff() {
    if (!task || !handoffSel) return
    setHandoffBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO; handedTo: { id: string; name: string } }>(
        `/api/tasks/${task.id}/handoff`,
        { method: 'POST', body: JSON.stringify({ toUserId: handoffSel, note: handoffNote.trim() || undefined }) }
      )
      setTask(res.task)
      setHandoffOpen(false)
      onChanged()
      toast({
        title: 'Part handed off',
        description: `Your part of this task was transferred to ${res.handedTo.name} as Pending.`,
      })
    } catch (err) {
      toast({
        title: 'Could not hand off',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setHandoffBusy(false)
    }
  }

  function openReopen() {
    setReopenComment('')
    setReopenSel((task?.assignments.filter((a) => a.status === 'COMPLETED').map((a) => a.userId)) || [])
    setReopenOpen(true)
  }

  function toggleReopen(userId: string) {
    setReopenSel((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  async function doReopen() {
    if (!task || reopenSel.length === 0) return
    setReopenBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ userIds: reopenSel, comment: reopenComment.trim() || undefined }),
      })
      setTask(res.task)
      setReopenOpen(false)
      setReopenComment('')
      onChanged()
      toast({ title: 'Task reopened', description: 'The selected employees are back to Pending.' })
    } catch (err) {
      toast({
        title: 'Could not reopen',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setReopenBusy(false)
    }
  }

  function openEdit() {
    if (!task) return
    const d = new Date(task.dueDate)
    const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Calcutta' }).format(d)
    const istTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Calcutta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setEditDate(istDate)
    setEditTime(istTime)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!task || !editTitle.trim() || !editDate) return
    setEditBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          dueDate: { date: editDate, time: editTime || '18:00' },
        }),
      })
      setTask(res.task)
      setEditOpen(false)
      onChanged()
      toast({ title: 'Task updated' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task')
    } finally {
      setEditBusy(false)
    }
  }

  async function deleteTask() {
    if (!task) return
    setDeleteBusy(true)
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' })
      setDeleteOpen(false)
      onChanged()
      onClose()
      toast({ title: 'Task deleted', description: 'The task and its history were removed.' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete task')
      setDeleteOpen(false)
    } finally {
      setDeleteBusy(false)
    }
  }

  const completedAssignments = task?.assignments.filter((a) => a.status === 'COMPLETED') ?? []
  const awaitingValidation = task?.assignments.filter((a) => a.validationStatus === 'PENDING') ?? []
  const validatedCount = task?.assignments.filter((a) => a.validationStatus === 'VALIDATED').length ?? 0

  const myAssignment = task?.assignments.find((a) => a.userId === me.id)
  const isOverdue =
    task && myAssignment && myAssignment.status !== 'COMPLETED' && new Date(task.dueDate) < new Date()
  const isCreator = task?.creator.id === me.id
  const isAborted = task?.status === 'ABORTED'

  return (
    <Dialog open={Boolean(taskId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        {task === null && !error && (
          <div className="flex items-center justify-center py-16">
            <DialogTitle className="sr-only">Task details</DialogTitle>
            <DialogDescription className="sr-only">Loading task details</DialogDescription>
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        )}
        {error && (
          <div className="py-10 text-center">
            <DialogTitle className="sr-only">Task details</DialogTitle>
            <p className="text-red-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {task && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-2 pr-6">
                <div>
                  <DialogTitle className="text-left leading-snug">{task.title}</DialogTitle>
                  <DialogDescription className="mt-1 text-left">
                    Created by <span className="font-medium text-slate-600">{task.creator.id === me.id ? 'you' : task.creator.name}</span> on {fmtDateTime(task.createdAt)}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  {isAborted ? (
                    <AbortedBadge />
                  ) : (
                    <>
                      {isOverdue && <OverdueBadge />}
                      {myAssignment && <StatusBadge status={myAssignment.status} />}
                    </>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
              {isAborted && task.abortedAt && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3" role="status">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-red-800">
                      This task was aborted by {isCreator ? 'you' : task.creator.name} on{' '}
                      {fmtDateTime(task.abortedAt)}
                    </p>
                    {task.abortReason && <p className="mt-0.5 break-words text-red-700">Reason: {task.abortReason}</p>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Left column: details */}
                <div className="space-y-4">
                  {task.description && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Description</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4 text-brand-600" />
                      Due: <b className="font-semibold">{fmtDate(task.dueDate)}, {fmtTime(task.dueDate)} IST</b>
                    </span>
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
                        <AlarmClock className="h-4 w-4" />
                        Delayed by {delayLabel(task.dueDate)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-4 w-4 text-brand-600" />
                      Owner: <b className="font-semibold">{task.creator.id === me.id ? 'You' : task.creator.name}</b>
                    </span>
                    {task.validator && (
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        Validator:{' '}
                        <b className="font-semibold">{task.validator.id === me.id ? 'You' : task.validator.name}</b>
                      </span>
                    )}
                    {task.recurring && recurrenceLabel(task) && (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <Repeat className="h-4 w-4 text-brand-600" aria-hidden="true" />
                        <b className="font-semibold">{recurrenceLabel(task)}</b>
                        {task.recurEndType === 'AFTER_N' && task.recurCount ? (
                          <span className="text-slate-400">· occurrence {task.recurOccurrence ?? 1} of {task.recurCount}</span>
                        ) : task.recurEndType === 'ON_DATE' && task.recurEndDate ? (
                          <span className="text-slate-400">· until {fmtDate(task.recurEndDate)}</span>
                        ) : (
                          <span className="text-slate-400">· no end date</span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Validator queue — only for the chosen validator */}
                  {canValidate && !isAborted && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Validation queue
                        {awaitingValidation.length > 0 && (
                          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {awaitingValidation.length}
                          </span>
                        )}
                      </p>
                      {awaitingValidation.length === 0 ? (
                        <p className="text-sm text-emerald-800/80">
                          No parts awaiting your validation{validatedCount > 0 ? ` — ${validatedCount} already validated.` : '.'}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {awaitingValidation.map((a) => (
                            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                              <InitialAvatar name={a.user.name} className="h-8 w-8 text-[10px]" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {a.user.name} <span className="font-normal text-slate-400">· {a.user.employeeCode}</span>
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  Sent{a.sentForValidationAt ? ` ${fmtDateTime(a.sentForValidationAt)}` : ''} for validation
                                </p>
                              </div>
                              <Button
                                size="sm"
                                className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                                disabled={reviewBusyId === a.userId}
                                onClick={() => approvePart(a.userId)}
                              >
                                {reviewBusyId === a.userId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 border-amber-200 text-amber-700 hover:bg-amber-50"
                                disabled={reviewBusyId === a.userId}
                                onClick={() => openReviewReopen(a.userId, a.user.name)}
                              >
                                <Rewind className="mr-1.5 h-3.5 w-3.5" />
                                Reopen
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* My status actions */}
                  {canAct && myAssignment && !isAborted && (
                    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">Update my status</p>
                      <div className="flex flex-wrap gap-2">
                        {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as TaskStatus[]).map((s) => (
                          <button
                            key={s}
                            disabled={statusBusy || myAssignment.status === s || (s === 'COMPLETED' && myAssignment.validationStatus === 'PENDING')}
                            onClick={() => chooseStatus(s)}
                            className={cn(
                              'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-100',
                              myAssignment.status === s
                                ? s === 'COMPLETED'
                                  ? 'bg-brand-600 text-white shadow'
                                  : s === 'IN_PROGRESS'
                                    ? 'bg-violet-600 text-white shadow'
                                    : 'bg-amber-500 text-white shadow'
                                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700'
                            )}
                          >
                            {statusBusy && myAssignment.status !== s
                              ? '…'
                              : task.validator && s === 'COMPLETED'
                                ? 'Send for validation'
                                : STATUS_LABEL[s]}
                          </button>
                        ))}
                        {statusBusy && <Loader2 className="h-4 w-4 animate-spin self-center text-brand-600" />}
                      </div>
                      {myAssignment.status !== 'COMPLETED' && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-brand-200/70 pt-2.5">
                          <p className="text-[11px] leading-snug text-brand-700/70">
                            Pass your part to a colleague for further completion.
                          </p>
                          <Button variant="outline" size="sm" className="shrink-0" disabled={statusBusy} onClick={openHandoff}>
                            <Forward className="mr-1.5 h-3.5 w-3.5" />
                            Hand off
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status closed because the task was aborted */}
                  {canAct && myAssignment && isAborted && (
                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">Status updates closed</p>
                      <p className="text-sm text-red-600/90">This task was aborted by the creator, so statuses are closed.</p>
                    </div>
                  )}

                  {/* Assignees */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Assigned to ({task.assignments.length})
                    </p>
                    <div className="space-y-2">
                      {task.assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                          <InitialAvatar name={a.user.name} className="h-8 w-8 text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {a.user.name}
                              {a.userId === me.id && <span className="text-brand-600"> (you)</span>}
                              <span className="ml-1 font-normal text-slate-400">· {a.user.employeeCode}</span>
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {a.user.designation}
                              {a.status === 'COMPLETED' && a.completedAt ? ` · closed ${fmtDateTime(a.completedAt)}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge status={a.status} />
                            <ValidationBadge status={a.validationStatus} />
                          </div>
                          {canEdit && !isAborted && task.assignments.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 shrink-0 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              disabled={removeBusyId === a.userId}
                              onClick={() => removeAssignee(a.userId)}
                              aria-label={`Remove ${a.user.name}`}
                              title="Remove from task"
                            >
                              {removeBusyId === a.userId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {canEdit && !isAborted && addUsers.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={addSel || ''}
                          onChange={(e) => setAddSel(e.target.value || null)}
                          className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm"
                          aria-label="Add assignee"
                        >
                          <option value="">Add another employee…</option>
                          {addUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" disabled={!addSel || addingBusy} onClick={addAssignee}>
                          {addingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right column: history timeline */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Complete history ({task.activities.length})
                  </p>
                  {task.activities.length === 0 ? (
                    <p className="text-sm text-slate-400">No activity yet.</p>
                  ) : (
                    <ol className="relative space-y-0 border-l border-slate-200 pl-4">
                      {task.activities.map((act) => {
                        const style = ACTION_STYLE[act.action] || ACTION_STYLE['TASK_UPDATED']!
                        const Icon = style.icon
                        return (
                          <li key={act.id} className="relative pb-4">
                            <span
                              className={cn(
                                'absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white',
                                style.cls
                              )}
                            >
                              <Icon className="h-3 w-3" />
                            </span>
                            <p className="text-sm text-slate-700">
                              <span className="font-semibold">{act.actorName}</span>{' '}
                              {act.action === 'COMMENT' ? (
                                <span className="mt-1 block rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                                  “{act.detail}”
                                </span>
                              ) : (
                                act.detail
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(act.createdAt)}</p>
                          </li>
                        )
                      })}
                    </ol>
                  )}

                  {canAct && (
                    <div className="mt-2 border-t border-slate-100 pt-3">
                      <Label htmlFor="cmt" className="sr-only">Add comment</Label>
                      <div className="flex gap-2">
                        <Input
                          id="cmt"
                          placeholder="Add a comment to the history…"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && postComment()}
                        />
                        <Button size="icon" aria-label="Post comment" onClick={postComment} disabled={commentBusy || !comment.trim()}>
                          {commentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {task.assignments.filter((a) => a.status === 'COMPLETED').length} of {task.assignments.length} employees completed
              </span>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {canReopen && !isAborted && completedAssignments.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    onClick={openReopen}
                  >
                    <Rewind className="mr-1.5 h-3.5 w-3.5" />
                    Reopen
                  </Button>
                )}
                {canEdit && !isAborted && (
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
                {canAbort && !isAborted && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setAbortOpen(true)}
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                    Abort Task
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>

      {/* Abort confirmation (creator only) */}
      {task && (
        <AlertDialog open={abortOpen} onOpenChange={setAbortOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Abort this task?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{task.title}&rdquo; will be marked as aborted. Assignees will no longer be able to
                update their status, and the task is excluded from active counts. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="abort-reason">Reason (optional)</Label>
              <Textarea
                id="abort-reason"
                placeholder="e.g. Requirement changed / created by mistake"
                value={abortReason}
                onChange={(e) => setAbortReason(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={abortBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={abortBusy}
                onClick={(e) => {
                  e.preventDefault()
                  abortTask()
                }}
              >
                {abortBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="mr-1.5 h-4 w-4" />
                )}
                {abortBusy ? 'Aborting…' : 'Abort Task'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reopen confirmation (creator or manager of the assignees) */}
      {task && (
        <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reopen this task?</AlertDialogTitle>
              <AlertDialogDescription>
                Reopened employees move back to Pending and are notified. This is recorded in the task history.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {completedAssignments.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Choose who to reopen</p>
                <div className="space-y-1.5">
                  {completedAssignments.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2"
                    >
                      <Checkbox
                        checked={reopenSel.includes(a.userId)}
                        onCheckedChange={() => toggleReopen(a.userId)}
                      />
                      <InitialAvatar name={a.user.name} className="h-7 w-7 text-[10px]" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {a.user.name} <span className="text-slate-400">· {a.user.employeeCode}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{completedAssignments[0]?.user.name}</span> will
                move back to Pending.
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reopen-comment">Comment (optional)</Label>
              <Textarea
                id="reopen-comment"
                placeholder="e.g. Please redo with the updated format"
                value={reopenComment}
                onChange={(e) => setReopenComment(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={reopenBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={reopenBusy || reopenSel.length === 0}
                onClick={(e) => {
                  e.preventDefault()
                  doReopen()
                }}
              >
                {reopenBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Rewind className="mr-1.5 h-4 w-4" />
                )}
                {reopenBusy ? 'Reopening…' : 'Reopen'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Hand off confirmation (assignee with an open part) */}
      {task && (
        <AlertDialog open={handoffOpen} onOpenChange={setHandoffOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hand off your part?</AlertDialogTitle>
              <AlertDialogDescription>
                Your part of &ldquo;{task.title}&rdquo; will be transferred to the selected colleague as
                Pending. It will move out of your task list, and the handoff is recorded in the task
                history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="handoff-user">Hand off to</Label>
              <select
                id="handoff-user"
                value={handoffSel || ''}
                onChange={(e) => setHandoffSel(e.target.value || null)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                <option value="">Choose a colleague…</option>
                {handoffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="handoff-note">Note for them (optional)</Label>
              <Textarea
                id="handoff-note"
                placeholder="e.g. Draft prepared — please review and submit"
                value={handoffNote}
                onChange={(e) => setHandoffNote(e.target.value)}
                rows={3}
                maxLength={300}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={handoffBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-brand-600 text-white hover:bg-brand-700"
                disabled={handoffBusy || !handoffSel}
                onClick={(e) => {
                  e.preventDefault()
                  doHandoff()
                }}
              >
                {handoffBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Forward className="mr-1.5 h-4 w-4" />
                )}
                {handoffBusy ? 'Handing off…' : 'Hand off'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Send my part to the validator (assignee, task has a validator) */}
      {task && task.validator && (
        <AlertDialog open={sendOpen} onOpenChange={setSendOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send your part for validation?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium text-slate-700">{task.validator.name}</span> will review your part of
                &ldquo;{task.title}&rdquo;. They can approve it or reopen it with a comment. You can only complete this task
                by sending it for validation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="send-note">Note for the validator (optional)</Label>
              <Textarea
                id="send-note"
                placeholder="e.g. Includes the revised sheet — please verify the totals"
                value={sendNote}
                onChange={(e) => setSendNote(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-brand-600 text-white hover:bg-brand-700"
                disabled={sendBusy}
                onClick={(e) => {
                  e.preventDefault()
                  doSend()
                }}
              >
                {sendBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-4 w-4" />
                )}
                {sendBusy ? 'Sending…' : 'Send for validation'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Validator reopens a part (comment required) */}
      {task && (
        <AlertDialog open={reviewReopenOpen} onOpenChange={setReviewReopenOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reopen this part?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium text-slate-700">{reviewUser?.name}</span> will move back to Pending and be
                notified with your comment.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="review-comment">Comment (required)</Label>
              <Textarea
                id="review-comment"
                placeholder="e.g. The reconciliation is off — please recheck the entries"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reviewBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={reviewBusy || !reviewComment.trim()}
                onClick={(e) => {
                  e.preventDefault()
                  doReviewReopen()
                }}
              >
                {reviewBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Rewind className="mr-1.5 h-4 w-4" />
                )}
                {reviewBusy ? 'Reopening…' : 'Reopen part'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Edit task fields (creator or admin) */}
      {task && (
        <AlertDialog open={editOpen} onOpenChange={setEditOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit task</AlertDialogTitle>
              <AlertDialogDescription>Update the title, description and due date.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea id="edit-desc" rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-date">Due date</Label>
                  <Input id="edit-date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-time">Due time (IST)</Label>
                  <Input id="edit-time" type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                </div>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={editBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-brand-600 text-white hover:bg-brand-700"
                disabled={editBusy || !editTitle.trim() || !editDate}
                onClick={(e) => {
                  e.preventDefault()
                  saveEdit()
                }}
              >
                {editBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Pencil className="mr-1.5 h-4 w-4" />}
                {editBusy ? 'Saving…' : 'Save'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete task (admin only) */}
      {task && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{task.title}&rdquo; and all its history will be permanently deleted for everyone. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={deleteBusy}
                onClick={(e) => {
                  e.preventDefault()
                  deleteTask()
                }}
              >
                {deleteBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                {deleteBusy ? 'Deleting…' : 'Delete task'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  )
}
