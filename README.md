# Ftech Office — Office Management System

A single web platform where **Ftech Computers** manages its staff end to end:
attendance, daily work output, salary, leave, tasks, notices and internal queries —
across three levels of access.

Built from [`ftech_office_management_workflow.md`](ftech_office_management_workflow.md) (v2).
Mobile first, because most work submissions happen on a phone standing on the floor.

---

## Run it

```bash
npm run setup && npm run dev
```

| | URL |
|---|---|
| **App** | http://localhost:5173 |
| **API** | http://localhost:4000/api |
| **Health check** | http://localhost:4000/api/health |

`npm run setup` installs dependencies, creates the SQLite database and seeds it
with the five departments, their job roles and question sets, plus demo staff and
three weeks of attendance and work history.

> First time only: copy `.env.example` to `.env` (the setup script reads it).
> On Windows, `npm install` may report `allow-scripts` warnings for Prisma and
> esbuild — approve them once with
> `npm install-scripts approve prisma @prisma/client @prisma/engines esbuild`.

### With Docker

```bash
docker compose up --build
```

One container serves both the API and the built frontend at **http://localhost:4000**.
Records live in the `ftech-data` volume so they survive a redeploy.

---

## Sign in

| Panel | Username | Password | What they see |
|---|---|---|---|
| Super Admin | `superadmin` | `Admin@123` | Everything, no restrictions |
| Admin | `manoj` | `Admin@123` | Only the sections switched on for them |
| Employee | `rahul` | `Pass@123` | Technical → Assembly (2 questions) |
| Employee | `sandeep` | `Pass@123` | Technical → Returns / QC (checked + failed) |
| Employee | `vikas` | `Pass@123` | Packing & Cleaning (4 questions) |
| Employee | `mohit` | `Pass@123` | Listing — **Coming Soon** module |

A hidden backup Super Admin also exists (`ftech.backup` / `Backup@123`). It can
sign in but never appears in any list, report, dashboard count or export — see
Section 14.2 of the spec.

**Change every one of these before deploying.**

---

## What is built

| Spec section | Where it lives |
|---|---|
| **§2** Three panels | `server/src/middleware/auth.js`, `web/src/context/AuthContext.jsx` |
| **§3** Six departments + Coming Soon | `server/prisma/seed.js`, `web/src/pages/Departments.jsx` |
| **§4** Job roles with their own question sets | `Question` / `JobRole` / `UserJobRole` models |
| **§5–6** Super Admin powers and interactive dashboard | `server/src/routes/dashboard.js`, `web/src/pages/Dashboard.jsx` |
| **§6.3** Drill-down: department → employee → any date | `DepartmentDetail.jsx`, `EmployeeDetail.jsx` |
| **§6.4** Pending against target | `target` on `Department`, shown on every block |
| **§7.1** Per-admin permission switches | `PERMISSIONS` in `constants.js`, `PUT /users/:id/permissions` |
| **§7.2** Hard limits that nobody can grant | `assertNotSelfAction`, `assertCanTouchPay` |
| **§9.1** Laptop and tiny counted separately | `unit` on each question — never merged |
| **§9.2** Quality check = checked + failed → defect rate | `CHECK_FAIL` question type, `services/work.js` |
| **§9.4** One submission per day, editable until approved | `@@unique([userId, date])` + status gate |
| **§10** Approval flow | `routes/work.js`, `web/src/pages/Approvals.jsx` |
| **§10.3** Autopilot per department | `POST /departments/:id/autopilot` |
| **§11.1–11.3** Absent = zero, WFH until 22:00, admin backfill | `submissionGate()` in `routes/work.js` |
| **§12** Salary, month lock, payroll CSV export | `services/salary.js`, `routes/salary.js` |
| **§13** Notices with read tracking, tasks, leave, queries | `routes/notices.js`, `tasks.js`, `leave.js`, `queries.js` |
| **§14.1** Deactivate, never delete | `POST /users/:id/status` — no delete route exists |
| **§14.2** Hidden backup Super Admin | `isHidden` + `visibleUsersFilter` on every listing |
| **§15** The history rule | `AuditLog` + `lib/audit.js`, browsable at `/history` |
| **§16** Mobile first, steppers, offline drafts, Hindi | `Stepper` in `ui.jsx`, `MyWork.jsx`, `UIContext.jsx` |

---

## Decisions taken on the open questions (§18)

The spec left six questions open. Rather than block, each has a working default
that is easy to change:

| # | Question | What was built |
|---|---|---|
| 1 | How is attendance recorded? | **Both.** Employees check in / out themselves, and an Admin with `attendance.edit` can mark or correct anyone. Every record stores `source` (`SELF` / `ADMIN` / `SYSTEM`) and who marked it. |
| 2 | Deadline for approving leave? | No deadline. Any pending request can still be decided. |
| 3 | Does approved WFH count as a full day? | **Yes** — a fully paid day, and work can be submitted until 22:00. |
| 4 | Does half day pay half? | **Half.** `HALF_DAY` counts as 0.5 paid days. |
| 5 | Are Managers normal employees? | Normal employees with `isManager`, whose salary only the Super Admin may change. |
| 6 | Company name | Ftech Computers, used throughout. |

To change any of these, edit `PAID_ATTENDANCE` / `PAID_LEAVE_TYPES` /
`WFH_CUTOFF_HOUR` in [`server/src/lib/constants.js`](server/src/lib/constants.js).

**Salary formula** (§12): a monthly salary is divided across the calendar days
of the month, and every paid day — present, approved WFH, declared holiday, paid
leave — earns a full share; half days earn half. So a declared holiday never
reduces anyone's salary. Hourly staff are paid on hours actually recorded.
Incentives and bonuses add, deductions subtract.

---

## Stack

| | |
|---|---|
| **Backend** | Node 22, Express 4, Prisma 6, Zod, JWT, bcrypt, helmet |
| **Database** | SQLite by default — zero setup. One line switches it to Postgres. |
| **Frontend** | React 18, Vite 6, Tailwind 3, Recharts, React Router 6 |
| **Deploy** | Multi-stage Dockerfile, docker compose, GitHub Actions CI |

### Switching to Postgres

1. In [`server/prisma/schema.prisma`](server/prisma/schema.prisma), change
   `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL=postgresql://user:pass@host:5432/ftech`.
3. `npm run db:push -w server && npm run db:seed -w server`.

The schema avoids Prisma enums and `Json` columns specifically so it runs on
either engine unchanged.

---

## Project layout

```
.
├── server/                     Express API
│   ├── prisma/
│   │   ├── schema.prisma       Data model — 18 tables
│   │   └── seed.js             Departments, job roles, questions, demo staff
│   └── src/
│       ├── lib/                constants, dates, prisma client, audit writer
│       ├── middleware/         auth + permissions + hard limits, error handling
│       ├── services/           salary calculation, work aggregation, serializers
│       └── routes/             auth, users, departments, work, attendance,
│                               leave, tasks, notices, queries, salary,
│                               dashboard, audit
├── web/                        React frontend
│   └── src/
│       ├── components/         Layout, UI primitives, charts
│       ├── context/            auth, theme + Hindi toggle + toasts
│       └── pages/              one file per screen
├── Dockerfile                  builds the frontend, runs both from one image
├── docker-compose.yml
└── .github/workflows/ci.yml    install → migrate → seed → API smoke test → build
```

---

## Commands

```bash
npm run dev            # API on :4000 and web on :5173, together
npm run dev:server     # API only
npm run dev:web        # frontend only
npm run build          # production frontend build
npm run start          # production API (also serves web/dist if present)
npm run db:push        # apply the schema
npm run db:seed        # seed departments, roles, questions and demo data
npm run db:studio      # browse the database
npm run docker:up      # build and run the whole thing in Docker
```

---

## Before deploying

1. Set a real `JWT_SECRET` — a long random string.
2. Change `SUPER_ADMIN_PASSWORD` and `BACKUP_ADMIN_PASSWORD`.
3. Set `SEED_DEMO_DATA=false` so no demo staff are created.
4. Set `CORS_ORIGIN` to your real domain.
5. Put it behind HTTPS — the auth cookie sets `secure` when `NODE_ENV=production`.
6. Back up the database volume. Section 15 says nothing is ever thrown away, and
   that only holds if the volume survives.

---

## API at a glance

All routes are under `/api` and need `Authorization: Bearer <token>` except
`POST /auth/login` and `GET /health`.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Sign in |
| `GET` | `/dashboard` | Landing screen, shaped per panel |
| `GET` | `/work/form` | The caller's own question set for a date |
| `POST` | `/work/submit` | Create or update a day's submission |
| `GET` | `/work/pending` | Approval queue |
| `POST` | `/work/:id/review` | Approve or reject |
| `POST` | `/work/bulk-review` | Approve or reject many |
| `GET` | `/departments/summary/blocks` | Yesterday's totals and targets |
| `POST` | `/departments/:id/autopilot` | Toggle Autopilot |
| `PUT` | `/departments/job-roles/:id/questions` | Replace a role's question set |
| `POST` | `/attendance/check-in` · `/check-out` | Self attendance |
| `POST` | `/attendance/mark` · `/bulk-mark` | Admin marks or corrects |
| `POST` | `/leave/:id/review` | Approve leave — writes attendance too |
| `GET` | `/salary/payroll` · `/payroll/export` | Payroll sheet and CSV |
| `POST` | `/salary/locks` · `/locks/:month/unlock` | Month lock |
| `GET` | `/notices/:id/reads` | Who has read a notice, and who has not |
| `GET` | `/audit` | The history log, filterable by entity, person and date |

---

*Ftech Computers — internal use.*
