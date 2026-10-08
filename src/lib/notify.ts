import { db } from '@/lib/db'
import { publish } from '@/lib/realtime'
import { sendPushToUsers } from '@/lib/webpush'

/**
 * Create a TASK_ASSIGNED-style notification for each recipient AND deliver a
 * native browser push via their web-push subscriptions.
 * - dedupes ids, drops empty set, skips excluded users (e.g. the acting user)
 * - fires inside the caller's transaction where possible via bulk createMany
 */
export async function notifyAssignees(input: {
  taskId: string
  recipientIds: string[]
  excludeIds?: string[]
  type?: string
  title: string
  message: string
}) {
  const recipients = [...new Set(input.recipientIds)].filter(
    (id) => !(input.excludeIds ?? []).includes(id)
  )
  if (recipients.length === 0) return

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      taskId: input.taskId,
      type: input.type ?? 'TASK_ASSIGNED',
      title: input.title,
      message: input.message.slice(0, 400),
    })),
  })

  for (const userId of recipients) {
    publish({ type: 'notification', userId })
  }

  // Best-effort native OS push — never blocks the caller
  await sendPushToUsers(recipients, {
    title: input.title,
    body: input.message.slice(0, 400),
    taskId: input.taskId,
  })
}