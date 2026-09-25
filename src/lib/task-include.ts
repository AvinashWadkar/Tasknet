import { Prisma } from '@prisma/client'

/** Shape shared by every route that returns a full task (detail GET, PATCH, status, abort, handoff). */
export const taskInclude = {
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
  activities: {
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, actorName: true, action: true, detail: true, createdAt: true },
  },
} satisfies Prisma.TaskInclude