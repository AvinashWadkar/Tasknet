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
import { StatusBadge, OverdueBadge, AbortedBadge, InitialAvatar } from './shared'
import { api } from './api'
import { STATUS_LABEL, type Me, type TaskDetailDTO, type TaskStatus } from './types'
import { fmtDateTime, fmtDate, fmtTime } from '@/lib/dates'
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
} from 'lucide-react'

const ACTION_STYLE: Record<string, { icon: typeof Flag; cls: string }> = {
  TASK_CREATED: { icon: Flag, cls: 'bg-emerald-100 text-emerald-700' },
  ASSIGNED: { icon: Users, cls: 'bg-teal-100 text-teal-700' },
  STATUS_UPDATED: { icon: PlayCircle, cls: 'bg-violet-100 text-violet-700' },
  REOPENED: { icon: Rewind, cls: 'bg-amber-100 text-amber-700' },
  COMMENT: { icon: StickyNote, cls: 'bg-slate-100 text-slate-600' },
  TASK_UPDATED: { icon: History, cls: 'bg-sky-100 text-sky-700' },
  TASK_ABORTED: { icon: Ban, cls: 'bg-red-100 text-red-700' },
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
  const [error, setError] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [addUsers, setAddUsers] = useState<{ id: string; name: string }[]>([])
  const [addSel, setAddSel] = useState<string | null>(null)
  const [addingBusy, setAddingBusy] = useState(false)
  const [abortOpen, setAbortOpen] = useState(false)
  const [abortReason, setAbortReason] = useState('')
  const [abortBusy, setAbortBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!taskId) return
    setError(null)
    setTask(null)
    try {
      const res = await api<{ task: TaskDetailDTO; canEdit: boolean; canAct: boolean }>(`/api/tasks/${taskId}`)
      setTask(res.task)
      setCanAct(res.canAct)
      if (res.canEdit) {
        api<{ users: { id: string; name: string; employeeCode: string }[] }>('/api/users')
          .then((r) => {
            setAddUsers(
              r.users
                .filter((u) => !res.task.assignments.some((a) => a.userId === u.id))
                .map((u) => ({ id: u.id, name: `${u.name} (${u.employeeCode})` }))
            )
          })
          .catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load task')
    }
  }, [taskId])

  useEffect(() => {
    if (taskId) load()
  }, [taskId, load])

  async function setStatus(status: TaskStatus) {
    if (!task) return
    setStatusBusy(true)
    try {
      const res = await api<{ task: TaskDetailDTO }>(`/api/tasks/${task.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      })
      setTask((prev) => (prev ? { ...prev, assignments: res.task.assignments } : prev))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status')
    } finally {
      setStatusBusy(false)
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
      setTask((prev) => (prev ? { ...prev, assignments: res.task.assignments } : prev))
      setAddSel(null)
      setAddUsers((prev) => prev.filter((u) => u.id !== addSel))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add assignee')
    } finally {
      setAddingBusy(false)
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
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
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
              <div className="grid gap-5 md:grid-cols-2">
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
                      <CalendarClock className="h-4 w-4 text-emerald-600" />
                      Due: <b className="font-semibold">{fmtDate(task.dueDate)}, {fmtTime(task.dueDate)} IST</b>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-4 w-4 text-emerald-600" />
                      Owner: <b className="font-semibold">{task.creator.id === me.id ? 'You' : task.creator.name}</b>
                    </span>
                  </div>

                  {/* My status actions */}
                  {canAct && myAssignment && !isAborted && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Update my status</p>
                      <div className="flex flex-wrap gap-2">
                        {(['PENDING', 'IN_PROGRESS', 'COMPLETED'] as TaskStatus[]).map((s) => (
                          <button
                            key={s}
                            disabled={statusBusy || myAssignment.status === s}
                            onClick={() => setStatus(s)}
                            className={cn(
                              'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-100',
                              myAssignment.status === s
                                ? s === 'COMPLETED'
                                  ? 'bg-emerald-600 text-white shadow'
                                  : s === 'IN_PROGRESS'
                                    ? 'bg-violet-600 text-white shadow'
                                    : 'bg-amber-500 text-white shadow'
                                : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                            )}
                          >
                            {statusBusy && myAssignment.status !== s ? '…' : STATUS_LABEL[s]}
                          </button>
                        ))}
                        {statusBusy && <Loader2 className="h-4 w-4 animate-spin self-center text-emerald-600" />}
                      </div>
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
                              {a.userId === me.id && <span className="text-emerald-600"> (you)</span>}
                              <span className="ml-1 font-normal text-slate-400">· {a.user.employeeCode}</span>
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {a.user.designation}
                              {a.status === 'COMPLETED' && a.completedAt ? ` · closed ${fmtDateTime(a.completedAt)}` : ''}
                            </p>
                          </div>
                          <StatusBadge status={a.status} />
                        </div>
                      ))}
                    </div>

                    {canAct && isCreator && !isAborted && addUsers.length > 0 && (
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

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {task.assignments.filter((a) => a.status === 'COMPLETED').length} of {task.assignments.length} employees completed
              </span>
              <div className="flex items-center gap-2">
                {isCreator && !isAborted && (
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
    </Dialog>
  )
}
