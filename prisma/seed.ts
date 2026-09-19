/**
 * Seed: admin account + demo org (DM → AM → TL → Executives) + demo tasks.
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

function istTodayStr(): string {
  const ist = new Date(Date.now() + 330 * 60000)
  return ist.toISOString().slice(0, 10)
}
function istDateAt(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00+05:30`)
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+05:30`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('Seeding…')
  await db.taskActivity.deleteMany()
  await db.taskAssignment.deleteMany()
  await db.task.deleteMany()
  await db.user.deleteMany()

  const defaultPw = await bcrypt.hash('Digitide@123', 10)
  const adminPw = await bcrypt.hash('Admin@123', 10)
  const today = istTodayStr()

  // Admin (you — the only one who creates user IDs)
  await db.user.create({
    data: {
      employeeCode: 'ADMIN',
      name: 'Administrator',
      email: 'admin@digitide.com',
      process: 'Management',
      designation: 'System Admin',
      password: adminPw,
      passwordPlain: 'Admin@123',
      isFirstLogin: false,
      role: 'ADMIN',
    },
  })

  // Demo org — hierarchy via managerEmail (auto-link by email, same as production flow)
  const suresh = await db.user.create({
    data: {
      employeeCode: 'EMP005', name: 'Suresh Kumar', email: 'suresh.kumar@digitide.com',
      process: 'Operations', designation: 'Delivery Manager',
      password: defaultPw, passwordPlain: 'Digitide@123', isFirstLogin: true, role: 'EMPLOYEE',
    },
  })
  const amit = await db.user.create({
    data: {
      employeeCode: 'EMP004', name: 'Amit Patel', email: 'amit.patel@digitide.com',
      process: 'Operations', designation: 'Assistant Manager',
      managerName: 'Suresh Kumar', managerEmail: 'suresh.kumar@digitide.com', managerId: suresh.id,
      password: defaultPw, passwordPlain: 'Digitide@123', isFirstLogin: true, role: 'EMPLOYEE',
    },
  })
  const priya = await db.user.create({
    data: {
      employeeCode: 'EMP003', name: 'Priya Nair', email: 'priya.nair@digitide.com',
      process: 'Operations', designation: 'Team Lead',
      managerName: 'Suresh Kumar', managerEmail: 'suresh.kumar@digitide.com', managerId: suresh.id,
      password: defaultPw, passwordPlain: 'Digitide@123', isFirstLogin: true, role: 'EMPLOYEE',
    },
  })
  const avinash = await db.user.create({
    data: {
      employeeCode: 'EMP001', name: 'Avinash Sharma', email: 'avinash.sharma@digitide.com',
      process: 'Operations', designation: 'Executive',
      managerName: 'Priya Nair', managerEmail: 'priya.nair@digitide.com', managerId: priya.id,
      password: defaultPw, passwordPlain: 'Digitide@123', isFirstLogin: true, role: 'EMPLOYEE',
    },
  })
  const rahul = await db.user.create({
    data: {
      employeeCode: 'EMP002', name: 'Rahul Verma', email: 'rahul.verma@digitide.com',
      process: 'Operations', designation: 'Executive',
      managerName: 'Priya Nair', managerEmail: 'priya.nair@digitide.com', managerId: priya.id,
      password: defaultPw, passwordPlain: 'Digitide@123', isFirstLogin: true, role: 'EMPLOYEE',
    },
  })

  const who = (u: { name: string; employeeCode: string }) => `${u.name} (${u.employeeCode})`

  // Task 1 — due today, shared by 2 executives
  const t1 = await db.task.create({
    data: {
      title: 'Prepare daily MIS report',
      description: 'Consolidate yesterday\'s volumes, SLA % and exceptions into the daily MIS deck and share on the team channel.',
      dueDate: istDateAt(today, '18:00'),
      createdById: priya.id,
      assignments: { create: [{ userId: avinash.id }, { userId: rahul.id }] },
      activities: {
        create: [
          { actorId: priya.id, actorName: who(priya), action: 'TASK_CREATED', detail: `Task created by ${priya.name}` },
          { actorId: priya.id, actorName: who(priya), action: 'ASSIGNED', detail: `Assigned to ${avinash.name}, ${rahul.name}` },
        ],
      },
    },
  })

  // Task 2 — due today, Avinash already working
  const t2 = await db.task.create({
    data: {
      title: 'Client onboarding call — Acme Corp',
      description: 'Kick-off call with Acme Corp ops team. Share rollout plan and capture action items.',
      dueDate: istDateAt(today, '15:30'),
      createdById: priya.id,
      assignments: { create: [{ userId: avinash.id, status: 'IN_PROGRESS' }] },
      activities: {
        create: [
          { actorId: priya.id, actorName: who(priya), action: 'TASK_CREATED', detail: `Task created by ${priya.name}` },
          { actorId: priya.id, actorName: who(priya), action: 'ASSIGNED', detail: `Assigned to ${avinash.name}` },
          { actorId: avinash.id, actorName: who(avinash), action: 'STATUS_UPDATED', detail: 'Marked their status as In Progress' },
        ],
      },
    },
  })

  // Task 3 — later this week
  await db.task.create({
    data: {
      title: 'Update SOP documentation',
      description: 'Revise the escalation SOP with the new L1/L2 flow and circulate for review.',
      dueDate: istDateAt(addDays(today, 3), '17:00'),
      createdById: suresh.id,
      assignments: { create: [{ userId: avinash.id }, { userId: rahul.id }] },
      activities: {
        create: [
          { actorId: suresh.id, actorName: who(suresh), action: 'TASK_CREATED', detail: `Task created by ${suresh.name}` },
          { actorId: suresh.id, actorName: who(suresh), action: 'ASSIGNED', detail: `Assigned to ${avinash.name}, ${rahul.name}` },
        ],
      },
    },
  })

  // Task 4 — overdue for Rahul
  await db.task.create({
    data: {
      title: 'Q3 process audit checklist',
      description: 'Fill in the audit checklist for your sub-process and attach evidence.',
      dueDate: istDateAt(addDays(today, -1), '16:00'),
      createdById: priya.id,
      assignments: { create: [{ userId: rahul.id }] },
      activities: {
        create: [
          { actorId: priya.id, actorName: who(priya), action: 'TASK_CREATED', detail: `Task created by ${priya.name}` },
          { actorId: priya.id, actorName: who(priya), action: 'ASSIGNED', detail: `Assigned to ${rahul.name}` },
        ],
      },
    },
  })

  // Task 5 — for Amit (AM)
  await db.task.create({
    data: {
      title: 'Weekly sync agenda & minutes',
      description: 'Publish Friday sync agenda; capture minutes and owners after the call.',
      dueDate: istDateAt(addDays(today, 1), '11:00'),
      createdById: suresh.id,
      assignments: { create: [{ userId: amit.id }] },
      activities: {
        create: [
          { actorId: suresh.id, actorName: who(suresh), action: 'TASK_CREATED', detail: `Task created by ${suresh.name}` },
          { actorId: suresh.id, actorName: who(suresh), action: 'ASSIGNED', detail: `Assigned to ${amit.name}` },
        ],
      },
    },
  })

  console.log(`Seeded: 1 admin + 5 employees + 5 tasks (today=${today})`)
  console.log('Admin login  → code: ADMIN   password: Admin@123')
  console.log('Employee login → code: EMP001 (Avinash) password: Digitide@123 (first-login flow)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
