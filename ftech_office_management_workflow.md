# Office Management System — Ftech Computers
## Requirements & Workflow Document

**Version 2** — supersedes the earlier draft.

> This document describes **what the system does and how it behaves**.
> It does not cover technology choices, architecture, or implementation.

---

# 1. Purpose

A single web platform where Ftech Computers manages its staff end to end:
attendance, daily work output, salary, leave, tasks, notices, and internal
queries — split across three levels of access.

The system is **mobile friendly**. Every screen must be usable on a phone,
since most employees will submit their daily work from one.

Every user logs in with a **username and password**. There is no public
signup — accounts are created only by a Super Admin or an authorised Admin.

Every employee has a **unique Employee ID** that stays with them permanently
and is used across attendance, salary, work reports and history.

---

# 2. The Three Panels

| Panel | Who | Access |
|---|---|---|
| **Super Admin** | Owner / top management | Everything. No restrictions. |
| **Admin** | Trusted staff | Same features as Super Admin, but only the parts the Super Admin has switched on — and with the hard limits in Section 7.2. |
| **Employee** | All staff | Own data only. Never sees another employee's information. |

**The core access rule:** an Admin's power is not fixed. The Super Admin
decides, per Admin, which sections they can open and which actions they can
perform. Two Admins can have completely different views of the system.

---

# 3. Departments (Modules)

The company is divided into six modules:

| # | Department | Status |
|---|---|---|
| A | **Technical** | ✅ Active — role-based work forms |
| B | **Listing** | 🕐 Coming Soon |
| C | **Packing & Cleaning** | ✅ Active — full work form |
| D | **Accountant** | 🕐 Coming Soon |
| E | **Managers** | 🕐 Coming Soon |
| F | **Add Department** | Tool for the Super Admin to create a new department |

### Coming Soon behaviour

If an employee is assigned to a department that isn't built yet, they can
still log in and use every universal feature — attendance, salary, leave,
tasks, notices, queries. Only their **work submission** section is blocked.

When they open it they see:

```
Coming Soon
This department module is not created yet.
```

The submit button is disabled. If a submission is somehow attempted, the
system rejects it with: **"Department not created yet."**

### Adding a new department

The Super Admin can create a department and define its own work questions. A
new department behaves exactly like Technical or Packing & Cleaning — same
submission flow, same approval rules, same history, same dashboard totals.
Only the questions differ.

Future departments therefore do not require the system to be rebuilt.

---

# 4. Job Roles Inside a Department

**This is central to how work submission works.**

Not everyone in a department does the same job. In Technical, one person does
assembling, another does cloning, another does packing-ready. Showing all
fourteen questions to all of them is wrong — most would be left at zero every
day, and the totals become meaningless.

So each department is divided into **job roles**, and **each job role has its
own set of questions**.

```
Department  →  Job Role  →  Question set  →  Employee sees only their questions
```

**Rules:**

- The Super Admin creates job roles inside a department
- Each job role gets its own list of work questions
- An employee is assigned one or more job roles when their account is created
- The employee's daily form shows **only the questions for their role(s)**
- If an employee has two roles, they see both sets combined
- Roles and their questions can be edited at any time without rebuilding

**Why it matters:** an assembler's form shows 2 questions, not 14. On a phone,
that is the difference between a system people use daily and one they avoid.

---

# 5. Super Admin — What They Can Do

### 5.1 Accounts and access

- Create Admin accounts (username + password)
- Create Employee accounts (username + password)
- Assign each employee's department and job role(s) at creation
- Set exactly how much access each Admin has
- Change any user's password
- Create or deactivate any account

### 5.2 People and records

- View the full company member list
- Open any single employee and see their complete profile
- Edit any employee's details, salary, attendance, or work records
- Nothing is locked to the Super Admin — they can correct anything

### 5.3 Money

- Set **monthly salary** or **hourly salary** per employee
- Add **incentives**, **bonuses**, and **deductions**
- Apply a fixed incentive or bonus to **everyone at once**, or to **one person**
- Edit any salary figure at any time
- Lock and unlock finished salary months (Section 12.3)

### 5.4 Attendance and holidays

- View daily, monthly and full-history attendance
- Edit or correct attendance records
- Declare holidays — **a declared holiday must not reduce anyone's monthly salary**

### 5.5 Work, tasks and communication

- Review daily work reports — daily, monthly, or all-time
- Approve or reject submitted work (Section 10)
- Turn **Autopilot** on or off per department (Section 10.3)
- Assign a task to a whole department, or to one specific employee
- Publish a notice to everyone, or to one specific employee
- See **who has read each notice** (Section 13.2)
- Approve or reject leave requests
- Read and respond to employee questions and issues

---

# 6. Super Admin Dashboard

The dashboard is the landing screen and is **interactive** — nothing on it is
a dead statistic.

### 6.1 Top section

| Panel | Shows |
|---|---|
| **Daily Attendance Report** | Who is present, absent, on leave today |
| **Pending Tasks** | Tasks assigned but not yet submitted |
| **Pending Approvals** | Work submissions waiting for approval |
| **Notices** | Recently published notices |

### 6.2 Department blocks

Below that sits a row of **department blocks** — one per module, laid out in
three columns.

Each block shows **yesterday's combined output for that department** — the
totals for all employees in it added together.

**Every block is clickable.**

> **Note on totals:** these are counts of *tasks completed*, not machines
> processed. One laptop legitimately appears in several rows as it moves
> through assembling → cloning → ready → packing. Because each job role has
> its own questions (Section 4), each person counts only their own step.

### 6.3 Drill-down flow

```
Dashboard
   │
   └─ click a department block
        │
        ├─ list of every employee in that department
        ├─ work graphs for the department
        ├─ task report
        └─ attendance report
             │
             └─ click one employee
                  │
                  └─ that employee's own dashboard:
                       • monthly report
                       • attendance (present / absent / leave)
                       • work progress
                       • task history
                       • salary, incentive, bonus, deduction
                       • their submitted questions and feedback
```

Inside an employee's dashboard the Super Admin can **switch the month**, or
open **any single date**, and see exactly what that day looked like.

### 6.4 Shipment / target view

Because FBA and MFN work runs to shipment deadlines, backward-looking totals
are not enough on their own. Each department block also shows **pending
against target** for the current period, so it is visible at a glance whether
the department is on track — not only what it did yesterday.

Targets are set by the Super Admin and can be changed at any time.

---

# 7. Admin

## 7.1 Granted access

An Admin sees the same system as the Super Admin — but only the parts they
have been granted.

1. Super Admin opens the Admin's account
2. Switches individual permissions on or off
3. The Admin's menu and screens change to match

If a permission is off, the Admin does not see that section at all — it is
not simply greyed out. An Admin with no permissions can log in and see only
their own dashboard.

## 7.2 Hard limits — apply to every Admin, always

These cannot be granted by anyone, including the Super Admin:

| An Admin can never… | Why |
|---|---|
| Edit **their own** salary, incentive, bonus or deduction | Separation of duties |
| Edit **their own** attendance | Separation of duties |
| Approve **their own** leave request | Separation of duties |
| Approve **their own** work submission | Separation of duties |
| Change a **Manager's** salary | Managers sit above Admins on pay |
| See or modify the backup Super Admin account | Section 14.2 |

Anything in this list is handled by the Super Admin only.

---

# 8. Employee — Universal Features

These apply to **every employee, in every department**, including ones whose
work module is still Coming Soon.

### 8.1 Their dashboard

- Today's attendance status
- Monthly attendance summary
- **Salary so far this month** — a running figure, not only the month-end total
- **Work progress shown as a graph**
- Pending tasks
- Pending approvals (work submitted, awaiting approval)
- Latest notices and notifications

### 8.2 History

An employee can look back over their own:

- Attendance history
- Salary history
- Incentive, bonus and deduction history
- Leave history
- Work submission history

### 8.3 Password

An employee can change their own password from their panel.
If they **forget** it, they must ask an Admin, who resets it for them.

### 8.4 Their role

An employee's department and job role(s) are **set by the Admin when the
account is created**. The employee cannot change them.

---

# 9. Department Work Submission

Each job role has its own form of numeric inputs. The employee enters numbers
and presses **Submit**.

## 9.1 Technical Department — work items

The full set of Technical work items, split across job roles. These groupings
are the **default** — the Super Admin can move items between roles, add new
ones, or create new roles entirely.

| Job role | Work items |
|---|---|
| **Assembly** | Assembling / dissembling — laptop<br>Assembling / dissembling — tiny |
| **Cloning** | Cloning — laptop<br>Cloning — tiny |
| **Ready** | Laptop ready<br>Tiny ready |
| **Stock** | Stock counting<br>Warranty stock check |
| **Returns / QC** | Return quality check — laptop *(checked + failed)*<br>Return quality check — tiny *(checked + failed)* |
| **Dispatch** | MFN / FBA — laptop<br>MFN / FBA — tiny<br>LOT ready — laptop<br>LOT ready — tiny |

**Laptop and tiny are always counted separately.** They are different
products with different work involved, and their numbers are never merged or
converted into a shared unit.

## 9.2 Quality check — pass and fail

Return quality check is recorded as **two numbers, not one**:

| Field | Meaning |
|---|---|
| **Checked** | How many units were inspected |
| **Failed** | How many did not pass |

From these the system derives a **defect rate** per employee, per job role and
per department, visible on the Super Admin dashboard. Volume alone does not
show whether quality is slipping; this does.

## 9.3 Packing & Cleaning Department

| # | Work item |
|---|---|
| 1 | Cleaning — laptop |
| 2 | Cleaning — tiny |
| 3 | Packing — laptop |
| 4 | Packing — tiny |

## 9.4 Submission rules

- **One submission per employee per day**
- The employee may **edit their submission until it is approved**
- Once approved, it is locked — only an Admin or Super Admin can change it
- All fields default to **0**, so nothing must be typed for work not done
- Negative numbers are rejected

---

# 10. Approval and Autopilot

Submitted work does **not** automatically count. It has to be accepted first.

## 10.1 The flow

```
Employee submits daily work
        │
        ▼
   PENDING APPROVAL
        │
        ├─ Admin / Super Admin APPROVES
        │       └─► added to Work Progress
        │           added to department totals
        │           counts toward salary and incentive
        │
        └─ Admin / Super Admin REJECTS
                └─► returned to the employee with a reason
                    employee corrects and resubmits
```

The same applies to **task submissions** — an employee marks a task complete,
and it only registers as complete once approved.

## 10.2 Why

Once numbers affect pay, numbers drift upward. An approval step keeps the
figures honest without anyone having to accuse anybody of anything.

## 10.3 Autopilot toggle

Approval can be switched off per department:

| Autopilot | Behaviour |
|---|---|
| **ON** | Submissions go straight into Work Progress. No approval needed. |
| **OFF** | Every submission waits for approval before it counts. |

The Super Admin controls this toggle. It can be on for a department that has
proven reliable and off for one that needs watching. Switching it changes only
future submissions — anything already pending stays pending.

Every approval and rejection is recorded with **who did it and when**.

---

# 11. Attendance and Work Rules

## 11.1 If an employee is absent

**Their work for that day is zero.** No submission is possible, and nothing is
counted. The day appears in their history as absent with zero output.

## 11.2 Work From Home

Work From Home is requested as a leave type and must be **approved**.

Once approved:

- The employee **can** submit their work for that day
- The submission window closes at **10:00 PM** on that day
- After 10:00 PM the form is locked and the day is treated as zero output

## 11.3 Backfill by an Admin

If an employee forgets to submit, their phone dies, or work was covered by
someone else, an Admin can enter the submission on their behalf.

**Any backfilled record is visibly marked as entered by an Admin**, with that
Admin's name and the time. It never appears as though the employee submitted
it themselves.

---

# 12. Salary, Incentive and Payroll

## 12.1 Setup

- Monthly salary or hourly salary, per employee
- Incentives, bonuses and deductions, per employee
- A fixed incentive or bonus can be applied to everyone at once
- Declared holidays do not reduce monthly salary

## 12.2 Visibility

The employee sees their **salary so far this month** on their dashboard, not
just the final figure at month end. Errors get spotted while they are still
easy to fix, instead of on payday.

## 12.3 Month lock

Once a month's salary is paid, that month is **locked**. No further edits to
its attendance, work records or salary figures.

The Super Admin can unlock a month to make a correction, and the unlock is
recorded in history along with who did it and why.

## 12.4 Payroll export

Monthly salary figures can be **exported to a file** for whoever handles
payroll. This is needed from day one — it does not wait for the Accountant
module to be built.

---

# 13. Notices, Tasks and Queries

## 13.1 Notices

- Published to everyone, or to one specific employee
- Appear on the employee's dashboard and notifications

## 13.2 Notice read tracking

The system records **who has opened each notice, and when**. An Admin can open
any notice and see the list of who has read it and who has not.

This settles the "I never saw that notice" problem before it starts.

## 13.3 Tasks

An employee receives tasks with a **time period** attached.

They can respond **before or after** the deadline with one of:

- **Complete**
- **Not complete**
- **Add a note** — describe an issue or explain what happened

The response is recorded either way, along with whether it was on time. As
with work submissions, a completed task counts only once approved — unless
Autopilot is on.

## 13.4 Leave requests

| Type | |
|---|---|
| Sick | Paid |
| Urgent | Unpaid |
| Casual | Half Day |
| Emergency | Work From Home |
| **Other** — employee types their own reason | |

The request goes to the Super Admin / Admin, who approves or rejects it. The
employee sees the result in their leave history. Approved Work From Home
unlocks work submission until 10:00 PM (Section 11.2).

## 13.5 Employee questions

Any employee can send a question, problem or issue directly to the Super Admin
and Admin. It is stored with date and time and kept permanently.

---

# 14. Account and Security Rules

## 14.1 Deactivate, never delete

An employee account is **never deleted**. When someone leaves, their account is
**deactivated**:

- They can no longer log in
- Every past record stays — attendance, salary, work, tasks, history
- The account can be reactivated if they return

Deleting would destroy years of records that may be needed later.

## 14.2 Backup Super Admin account

A **second Super Admin account** exists as a safeguard against being locked
out of the company's own data — if the main account holder is unavailable, has
forgotten the password, or leaves.

**This account is hidden.** It does not appear in the user list, the member
list, any report, any dashboard count, or any export. Admins cannot see it,
modify it, or reset its password. Only the person who holds its credentials
knows it exists.

## 14.3 Admin restrictions

See Section 7.2. An Admin can never edit their own pay or attendance, approve
their own leave or work, or change a Manager's salary.

---

# 15. The History Rule

> **Nothing is ever thrown away.**

Every action is stored permanently with its **date, time, and the person who
did it**:

- Work submissions, and every approval or rejection
- Attendance records and any corrections
- Salary, incentive, bonus and deduction changes
- Month locks and unlocks
- Leave requests and their outcomes
- Tasks and task responses
- Notices published, and who read them
- Employee questions and feedback
- Account creation, deactivation, password changes, permission changes
- Autopilot being switched on or off

**Recording who made each change matters as much as recording the change.** If
two Admins can both edit salary, you need to know which one did.

The Super Admin can look up any of it, for any employee, for any date range.

---

# 16. Usability

## 16.1 Mobile first

Most work submissions will be made on a phone, standing on the floor.

- **Every question for the employee's role is shown** — nothing is hidden or
  dropped to save space
- All fields default to **0**
- Numbers are entered with **plus / minus steppers**, not by opening a keyboard
- The form can be filled **through the day and updated**, not only in one go
  at the end of the shift
- Large tap targets, single-column layout

## 16.2 Draft saving

If the connection drops mid-entry, the numbers already typed are **kept on the
device** and can be submitted once the connection returns. Nothing typed is
ever lost to bad warehouse wifi — otherwise people stop trusting the system
after the first time it happens.

## 16.3 Language

The interface supports **Hindi labels alongside English**, so floor staff who
are not comfortable in English can use it without guessing.

---

# 17. Access Summary

| Capability | Super Admin | Admin | Employee |
|---|:---:|:---:|:---:|
| Create / deactivate accounts | ✅ | ⚙️ | ❌ |
| Set Admin permissions | ✅ | ❌ | ❌ |
| View all employees | ✅ | ⚙️ | ❌ |
| View own data | ✅ | ✅ | ✅ |
| Edit salary / incentive / bonus | ✅ | ⚙️ ¹ | ❌ |
| Change a Manager's salary | ✅ | ❌ | ❌ |
| Edit attendance | ✅ | ⚙️ ¹ | ❌ |
| Approve / reject leave | ✅ | ⚙️ ¹ | ❌ |
| Apply for leave | — | — | ✅ |
| Assign tasks | ✅ | ⚙️ | ❌ |
| Submit task response | — | — | ✅ |
| Approve work / task submissions | ✅ | ⚙️ ¹ | ❌ |
| Switch Autopilot on/off | ✅ | ❌ | ❌ |
| Publish notices | ✅ | ⚙️ | ❌ |
| See who read a notice | ✅ | ⚙️ | ❌ |
| Declare holidays | ✅ | ⚙️ | ❌ |
| Submit daily work | — | — | ✅ |
| Backfill someone's work | ✅ | ⚙️ | ❌ |
| View department totals & targets | ✅ | ⚙️ | ❌ |
| Raise a question | — | — | ✅ |
| Answer questions | ✅ | ⚙️ | ❌ |
| Lock / unlock a salary month | ✅ | ❌ | ❌ |
| Export payroll | ✅ | ⚙️ | ❌ |
| Change own password | ✅ | ✅ | ✅ |
| Reset someone else's password | ✅ | ⚙️ | ❌ |
| Create a department or job role | ✅ | ❌ | ❌ |
| See the backup Super Admin account | ✅ ² | ❌ | ❌ |

✅ always &nbsp;&nbsp; ⚙️ only if the Super Admin grants it &nbsp;&nbsp; ❌ never

¹ Never for their own record — see Section 7.2
² Only the holder of its credentials; it is hidden from all listings

---

# 18. Still to Confirm

| # | Question | Status |
|---|---|---|
| 1 | **How is attendance actually recorded?** Marked manually by an Admin, or does the employee check in? Everything about salary depends on this and it is still unanswered. | ⚠️ Blocking |
| 2 | Is there a **deadline after which leave can no longer be approved**? | Open |
| 3 | Does approved **Work From Home** count as a full present day for salary, or is it treated differently? | Open |
| 4 | Does **Half Day** leave pay half, or full? | Open |
| 5 | Are **Managers** normal employees in a Managers department, or do they get their own powers? So far: normal employees whose salary only the Super Admin may change. | Open |
| 6 | Company name confirmed as **Ftech Computers**? | Open |

Question 1 needs answering before building starts. The others can be decided
as their sections are built.

---

# 19. What Changed From Version 1

| Area | Change |
|---|---|
| Job roles | **New.** Departments now split into job roles, each with its own question set |
| QC | Return quality check split into **checked + failed**, giving a defect rate |
| Approval | **New.** Work and task submissions need approval before counting |
| Autopilot | **New.** Per-department toggle to skip approval |
| Absence | Absent = zero work. Approved WFH may submit until **10:00 PM** |
| Backfill | Admin can enter work for an employee, **visibly marked** as admin-entered |
| Admin limits | Cannot edit own pay/attendance, approve own leave/work, or change a Manager's salary |
| Backup account | **New.** Hidden second Super Admin account |
| Accounts | Deactivate instead of delete |
| Notices | Read tracking — who opened it and when |
| Salary | Running total mid-month; month lock after payment; payroll export |
| Dashboard | Pending approvals panel; shipment target view |
| Mobile | Steppers, 0 defaults, all-day editing, offline drafts |
| Language | Hindi labels alongside English |
| History | Now records **who** made each change, not just what changed |
| Rejected | Point weighting between laptop and tiny — they stay separate, unmerged |
| Rejected | Output-per-hour metric |
| Rejected | Manager-approval layer as a fixed structure (replaced by the Autopilot toggle) |

---

*End of document.*
