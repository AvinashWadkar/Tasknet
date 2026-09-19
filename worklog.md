---
Task ID: 1 (single-agent, full build)
Agent: Z.ai Code (main)
Task: Build "Digitide TaskFlow" — a full-stack Task Manager with admin-only user creation, first-login mandatory password change, greeting home page, today's tasks, MS Teams-style calendar, multi-employee task assignment, shared task history, manager hierarchy views (downline-only), and admin user management.

Work Log:
- Replaced prisma/schema.prisma with User (org-hierarchy via managerName/managerEmail/managerId), Task, TaskAssignment (per-employee status), TaskActivity (audit trail); ran db:push.
- Installed bcryptjs + jose; created src/lib/auth.ts (JWT httpOnly cookie sessions, password policy), src/lib/dates.ts (IST helpers, month grid, greetings), src/lib/hierarchy.ts (descendant computation, task visibility rules).
- API routes: /api/auth/{login,logout,me,change-password}; /api/users (GET directory, POST admin-only create with auto manager linking by email + retroactive linking); /api/tasks (GET scoped list today/date/range/all with assigned/created filters; POST create with multi-assignee); /api/tasks/[id] (GET detail with full history + access check incl. manager read-only; PATCH creator edit/add assignees); /api/tasks/[id]/status (assignee updates own status, reopen detection); /api/tasks/[id]/comment; /api/team (hierarchy tree + per-employee stats, admin=org scope, manager=downline scope).
- Frontend (single route src/app/page.tsx → components/task-manager/*): login-view, force-password-modal (non-dismissable, policy-gated), app shell (sticky header, nav tabs, account menu, sticky footer), home-view (greeting hero + stat cards + today's tasks with quick actions + upcoming), calendar-view (Teams-style month grid with status dots, day agenda, filters), new-task-dialog (multi-select assignees with search/chips), task-detail-dialog (assignee statuses, complete history timeline, comments, add-assignee), team-view (org tree + employee-wise expandable stats table), admin-panel (7-field create form + users table).
- Seeded prisma/seed.ts: ADMIN (Admin@123) + demo org EMP001 Avinash/EMP002 Rahul (Exec, L1 Priya) / EMP003 Priya (TL, L1 Suresh) / EMP004 Amit (AM, L1 Suresh) / EMP005 Suresh (DM) + 5 tasks with history (2 due today IST, 1 overdue, 2 upcoming).
- Fixed 3 bugs found during verification: Prisma orderBy on non-existent TaskAssignment.createdAt (3 routes); isManager missing on login response → Team View tab hidden for managers (now refetch /api/auth/me after login); admin "My Tasks" tab rendered empty view (hidden for ADMIN).
- Fixed a11y: DialogTitle missing in task-detail loading/error states.
- Verified via curl: hierarchy scoping (DM sees 4 downline, TL sees 2, AM sees 1), 403 for unrelated users, duplicate employee-code/email rejection, non-admin creation blocked, password policy enforcement, reopen flow.
- Verified via Agent Browser: login → mandatory password modal → set password → greeting home → task detail status/comment → calendar dots + day agenda → new task with 3 assignees → manager team view tree + employee drill-down + read-only downline task history → admin user creation (Kavita/EMP007 auto-linked to Amit) → mobile responsive (390px) → sticky footer.

Stage Summary:
- App: "Digitide TaskFlow" complete at / route; lint clean; dev server healthy.
- Credentials: ADMIN / Admin@123 (admin panel); demo employees EMP001..EMP006 with default Digitide@123 (first-login flow triggers). Avinash (EMP001) and Suresh (EMP005) had passwords set to Avinash@2026 / Suresh@2026 during browser testing.
- Key decisions: hierarchy auto-links by L1 Manager Email (retroactive when manager created later); task visibility = creator ∪ assignees; managers get read-only view of downline tasks; all date math in IST (Asia/Calcutta).

---
Task ID: 2
Agent: Z.ai Code (main)
Task: New requirement — admin should be able to SEE the password of every user (TaskFlow v1 stored only bcrypt hashes).

Work Log:
- Schema: added `User.passwordPlain` (nullable plaintext mirror) in prisma/schema.prisma; ran `db:push` (regenerated Prisma Client).
- Synced the mirror at every password-write path: prisma/seed.ts (Admin@123 / Digitide@123), POST /api/users create (Digitide@123), POST /api/auth/change-password (user's own new password), POST /api/auth/login (lazy backfill from the just-verified password as a safety net for any null row).
- New scripts/backfill-plain.ts: bcrypt-verified backfill for legacy rows — a candidate password is stored only after bcrypt.compare confirms it matches the stored hash; 8/8 existing users backfilled, 0 left null.
- GET /api/users: ADMIN branch now returns `password` (mapped from passwordPlain); non-admin branch still gets directory basics only — verified zero leakage of `password`/`passwordPlain` fields.
- New endpoint POST /api/users/[id]/reset-password (admin-only): resets to Digitide@123 (default) or a custom password (policy-validated) and re-triggers the mandatory first-login flow (isFirstLogin=true).
- admin-panel.tsx: added PASSWORD column (masked ••••••••, per-row eye reveal + copy-to-clipboard with toast) and ACTIONS column with a reset-password AlertDialog (default/custom password, busy state, e.preventDefault to keep dialog open during async call); ADMIN row intentionally has no reset action; fixed table overflow (overflow-auto + break-all emails + min-w-[34rem]).
- Ops: restarted dev server after db:push (stale Prisma Client in the running process caused a 500 on login until restart).
- Verified via curl: admin sees all 8 passwords; EMP001's GET /api/users returns 0 password fields; employee reset attempt → 403; admin reset EMP006 → TempTest@99 → login with it works → reset back to Digitide@123.
- Verified via Agent Browser: password column renders (desktop + 390px mobile); eye reveals Avinash@2026; reset dialog → custom NehaNew@2026 shown in table; reset to default; logout → EMP006 + Digitide@123 login triggered the non-dismissable "Set your own password" modal → set NehaSafe@2026 → home greeting "Good Morning, Neha"; admin re-login reveals NehaSafe@2026 in the table (self-change sync proven). No console errors; lint clean.

Stage Summary:
- Feature shipped: at Admin → User Management the admin can now view, copy, and reset every user's current password (including passwords employees chose themselves).
- Password lifecycle keeps the plaintext mirror in sync everywhere: create → user change → admin reset, plus bcrypt-verified backfill + lazy login backfill for legacy rows.
- Security posture: bcrypt hash remains the credential store; plaintext mirror is exposed ONLY to ADMIN role clients; employees never receive password fields.
- Current demo state: EMP006 (Neha Gupta) password = NehaSafe@2026 (set via the mandatory modal during E2E); all other users unchanged from Task 1 (ADMIN/Admin@123, EMP001/Avinash@2026, EMP005/Suresh@2026, rest Digitide@123).
