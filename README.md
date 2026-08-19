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

The system starts with two accounts and no data — no attendance, work,
tasks, notices or salary figures. The first real numbers are your own.

| Panel | Username | Password | What they see |
|---|---|---|---|
| Super Admin | `superadmin` | `Admin@123` | Everything, no restrictions |
| Employee | `rahul` | `Pass@123` | Technical → Assembly (2 questions) |

A hidden backup Super Admin also exists (`ftech.backup` / `Backup@123`). It can
sign in but never appears in any list, report, dashboard count or export — see
Section 14.2 of the spec.

The five departments, their job roles and question sets **are** created, since
they are configuration rather than data. Add your staff from **Employees → New
account**.

Want the sample company back to explore the features? Set `SEED_DEMO_DATA=true`
in `.env` and reseed — that adds an Admin with partial permissions, seven more
employees, three weeks of work history, tasks and notices.

**Change every password before deploying.**

---

## The interface

White page, black text, silver for anything secondary. Dark mode flips to a
black page with white text; silver stays silver. The toggle sits in the header
and is remembered per device.

Only three colours survive that rule, and only where meaning depends on them:
green for approved, amber for pending or coming soon, red for rejected. A
monochrome approval queue is genuinely harder to read.

Type is **Space Grotesk** for headings and **Inter** for everything else.

> **Note for anyone editing the theme:** colours are written as ordinary
> Tailwind `dark:` variants with literal values, and `UIContext` forces a style
> recalculation when the theme changes. Both matter — driving surface colours
> from CSS custom properties left Chrome painting stale colours on any element
> with a `transition` on `background-color` until the page was reloaded. The
> reasoning is recorded in `web/src/index.css` and `web/src/context/UIContext.jsx`.

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

To change any of these, edit `PAID_ATTENDANCE` / `DEDUCTING_LEAVE_TYPES` /
`WFH_CUTOFF_HOUR` in [`server/src/lib/constants.js`](server/src/lib/constants.js).

**Leave: paid or unpaid** (§13.4): the approver tags every approved leave, and
in this office those words describe who carries the day. **Paid** means the
company paid for the day off, so it comes out of the employee's salary at the
day rate. **Unpaid** costs nothing and leaves salary untouched. That is the
reverse of the usual payroll convention, so every label in the approve dialog
states the money instead of relying on the word. The leave *type* only decides
which option is pre-selected — the approver's choice is what pays.

**Salary formula** (§12): a monthly salary is divided across the calendar days
of the month, and every paid day — present, approved WFH, declared holiday,
leave approved as unpaid — earns a full share; half days earn half. So a
declared holiday never reduces anyone's salary. Hourly staff are paid on hours
actually recorded. Incentives and bonuses add, deductions subtract.

**Company logo** (Settings → *Company logo*, Super Admin only): upload a PNG,
JPG or WebP and it appears on the sign-in screen, in the sidebar and in the
browser tab for everyone. The browser shrinks it and it is stored as a data URL
in the `Setting` table — no file volume to lose on a redeploy. With no logo
uploaded the plain monogram is used.

**Office timing** is set at three levels, and the most specific one wins,
field by field: an **employee's** own timing beats their **department's**,
which beats the **office-wide** policy. Anything left blank falls through to
the next level, so a department can move its start time without repeating the
grace period. Set them in Attendance sync (office), Departments → edit
(department) and an employee's page → Edit (one person). Changing a rule never
rewrites days already decided — run *Recalculate* for that.

**Late & half day fines** (Attendance sync → *Shift & attendance rules*): the
office may forgive a number of late arrivals each month and charge a flat
amount for every late day after that, plus a flat amount per half day. Both
amounts start blank, meaning no one is ever fined. A day counted as a half day
is charged the half day fine only, never the late fine as well.

---

## Stack

| | |
|---|---|
| **Backend** | Node 22, Express 4, Prisma 6, Zod, JWT, bcrypt, helmet |
| **Database** | Postgres. `docker compose` brings one up; Supabase works too. |
| **Frontend** | React 18, Vite 6, Tailwind 3, Recharts, React Router 6 |
| **Deploy** | Multi-stage Dockerfile, docker compose, GitHub Actions CI |

### A database to develop against

`docker compose up -d db` gives you one, or run it directly:

```bash
docker run -d --name ftech-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=ftech -e POSTGRES_DB=ftech -p 5432:5432 postgres:16-alpine
```

Then `DATABASE_URL="postgresql://ftech:dev@localhost:5432/ftech"` in `.env` and
`npm run db:push && npm run db:seed`. A free Supabase project works just as
well if you would rather not run one locally.

> SQLite was the original default and has been dropped. On managed hosting the
> file lands on network storage where a lock can block forever — the symptom is
> an app that answers every page except the ones that read data — and the file
> is wiped on each redeploy, taking the attendance and salary history with it.

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

## Deploying

**[DEPLOY.md](DEPLOY.md) is the step-by-step guide** — a Hostinger VPS, copy-paste
commands, about 30 minutes. `docker compose up -d --build` brings up the app and
a Caddy reverse proxy that gets HTTPS certificates on its own.

The short version of what a deployment needs:

1. A real `JWT_SECRET` — a long random string. Compose refuses to start without one.
2. Real `SUPER_ADMIN_PASSWORD` and `BACKUP_ADMIN_PASSWORD`; the defaults are public.
3. `SEED_DEMO_DATA=false` so no demo staff are created.
4. `CORS_ORIGIN` set to your real domain.
5. HTTPS — the auth cookie sets `secure` when `NODE_ENV=production`, so login
   silently fails over plain HTTP. Caddy handles this.
6. Backups of the database volume (`scripts/backup.sh`). Section 15 says nothing
   is ever thrown away, and that only holds if the volume survives.

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
