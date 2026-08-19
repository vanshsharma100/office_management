/**
 * The month report, as a document rather than a spreadsheet.
 *
 * A CSV is for feeding another program. This is for a person: it carries the
 * office's own letterhead, states who it is about and who produced it, and
 * prints to a clean A4 page so "download" and "hand it to someone" are the
 * same action. The browser's own Print → Save as PDF does the PDF step, which
 * avoids shipping a rendering engine just to draw a table.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Free text keeps its line breaks; everything else is escaped flat. */
const multiline = (v) => (v ? esc(v).replace(/\n/g, '<br>') : '<span class="muted">—</span>');

const money = (n) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Accepts either a YYYY-MM-DD string or a Date — both turn up on these rows. */
const prettyDate = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** The Sunday that closes a week starting on the given Monday. */
const weekEnd = (weekStart) => {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + 6);
  return d;
};

const prettyMonth = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

const table = (headers, rows, emptyMessage) => {
  if (!rows.length) return `<p class="empty">${esc(emptyMessage)}</p>`;
  return `<table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
};

const WEEKLY_QUESTIONS = [
  ['tasksAssigned', 'Work given'],
  ['tasksCompleted', 'Finished'],
  ['pendingTasks', 'Pending & reason'],
  ['keyAchievement', 'Key achievement'],
  ['challenges', 'Challenges'],
  ['nextWeekPlan', 'Next week plan'],
  ['supportRequired', 'Support required'],
];

export function buildReportHtml({ user, month, logo, weekly, work, attendance, leaves, tasks, salary, health, generatedBy }) {
  const workRows = work.map((s) => [
    prettyDate(s.date),
    `<span class="pill pill-${s.status.toLowerCase()}">${esc(s.status.toLowerCase())}</span>`,
    `<strong>${s.entries.reduce((sum, e) => sum + e.value, 0)}</strong>`,
    s.entries
      .filter((e) => e.value > 0 || e.failedValue > 0)
      .map((e) => `${esc(e.question?.label)}: ${e.value}${e.failedValue ? ` <span class="bad">(${e.failedValue} failed)</span>` : ''}`)
      .join('<br>') || '<span class="muted">nothing recorded</span>',
    multiline(s.note),
    esc(s.reviewedBy?.name ?? '—'),
  ]);

  const attendanceRows = attendance.map((a) => [
    prettyDate(a.date),
    `<span class="pill pill-${a.status.toLowerCase()}">${esc(a.status.replace('_', ' ').toLowerCase())}</span>`,
    a.checkIn ? new Date(a.checkIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
    a.checkOut ? new Date(a.checkOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
    a.hours ? a.hours.toFixed(2) : '—',
    a.lateMinutes ? `<span class="bad">${a.lateMinutes} min</span>` : '—',
  ]);

  const leaveRows = leaves.map((l) => [
    `${prettyDate(l.fromDate)} → ${prettyDate(l.toDate)}`,
    esc(l.type.replace('_', ' ').toLowerCase()),
    `<span class="pill pill-${l.status.toLowerCase()}">${esc(l.status.toLowerCase())}</span>`,
    l.isPaid === null ? '—' : l.isPaid ? 'Paid — a day deducted' : 'Unpaid — no deduction',
    multiline(l.reason),
    esc(l.reviewedBy?.name ?? '—'),
  ]);

  const taskRows = tasks.map((t) => [
    esc(t.task?.title),
    esc(t.response.replace('_', ' ').toLowerCase()),
    t.onTime ? 'On time' : '<span class="bad">Late</span>',
    `<span class="pill pill-${t.status.toLowerCase()}">${esc(t.status.toLowerCase())}</span>`,
    multiline(t.note),
  ]);

  const approved = work.filter((s) => s.status === 'APPROVED');
  const unitsApproved = approved.reduce(
    (sum, s) => sum + s.entries.reduce((a, e) => a + e.value, 0),
    0
  );

  const stats = [
    ['Days present', salary ? salary.counts.PRESENT : '—'],
    ['Days absent', salary ? salary.absentDays : '—'],
    ['Half days', salary ? salary.halfDays : '—'],
    ['Leave taken', salary ? salary.counts.LEAVE : '—'],
    ['Work approved', `${approved.length} of ${work.length} days`],
    ['Units approved', unitsApproved],
    ['Weekly reports', `${weekly.length} submitted`],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(user.name)} — ${esc(prettyMonth(month))}</title>
<style>
  :root { --ink:#111; --muted:#6b7280; --line:#e5e7eb; --accent:#1B4F9C; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px; font:13px/1.55 "Segoe UI",system-ui,sans-serif; color:var(--ink); background:#f3f4f6; }
  .sheet { max-width:900px; margin:0 auto; background:#fff; padding:40px; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  header { display:flex; align-items:center; gap:16px; border-bottom:3px solid var(--accent); padding-bottom:16px; }
  header img { width:56px; height:56px; object-fit:contain; }
  .brand h1 { margin:0; font-size:20px; letter-spacing:-.02em; }
  .brand p { margin:2px 0 0; color:var(--muted); font-size:12px; }
  .doc-title { margin-left:auto; text-align:right; }
  .doc-title strong { display:block; font-size:15px; }
  .doc-title span { color:var(--muted); font-size:12px; }

  .who { display:grid; grid-template-columns:repeat(4,1fr); gap:12px 24px; margin:24px 0; padding:16px;
         background:#f9fafb; border:1px solid var(--line); }
  .who dt { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
  .who dd { margin:2px 0 0; font-weight:600; }

  .stats { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; margin:0 0 28px; }
  .stat { border:1px solid var(--line); padding:10px; text-align:center; }
  .stat b { display:block; font-size:18px; }
  .stat span { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.03em; }

  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent);
       border-bottom:1px solid var(--line); padding-bottom:6px; margin:28px 0 12px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; background:#f9fafb; font-size:10px; text-transform:uppercase; letter-spacing:.04em;
       color:var(--muted); padding:7px 8px; border-bottom:1px solid var(--line); }
  td { padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  .muted { color:var(--muted); }
  .bad { color:#b91c1c; }
  .empty { color:var(--muted); font-style:italic; padding:8px 0; }
  .pill { display:inline-block; padding:1px 7px; border-radius:99px; font-size:10px; text-transform:uppercase;
          letter-spacing:.03em; background:#f3f4f6; }
  .pill-approved,.pill-present { background:#dcfce7; color:#166534; }
  .pill-rejected,.pill-absent { background:#fee2e2; color:#991b1b; }
  .pill-pending,.pill-half_day,.pill-half.day { background:#fef3c7; color:#92400e; }

  .week { border:1px solid var(--line); padding:14px; margin-bottom:12px; }
  .week h3 { margin:0 0 10px; font-size:13px; }
  .week dl { display:grid; grid-template-columns:150px 1fr; gap:6px 14px; margin:0; }
  .week dt { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.03em; }
  .week dd { margin:0; }

  .pay { width:auto; min-width:340px; }
  .pay td:last-child { text-align:right; font-variant-numeric:tabular-nums; }
  .pay tr.total td { font-weight:700; font-size:14px; border-top:2px solid var(--ink); }

  footer { margin-top:32px; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:11px;
           display:flex; justify-content:space-between; }

  .toolbar { max-width:900px; margin:0 auto 16px; display:flex; gap:8px; }
  .toolbar button { font:inherit; padding:8px 16px; border:1px solid var(--line); background:#fff; cursor:pointer; }
  .toolbar button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }

  @media print {
    body { background:#fff; padding:0; }
    .sheet { box-shadow:none; padding:0; max-width:none; }
    .toolbar { display:none; }
    h2 { break-after:avoid; }
    tr, .week { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <button class="primary" onclick="window.print()">Print / Save as PDF</button>
</div>

<div class="sheet">
  <header>
    ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
    <div class="brand">
      <h1>Ftech Computers</h1>
      <p>Office Management System</p>
    </div>
    <div class="doc-title">
      <strong>Monthly Report</strong>
      <span>${esc(prettyMonth(month))}</span>
    </div>
  </header>

  <dl class="who">
    <div><dt>Employee</dt><dd>${esc(user.name)}</dd></div>
    <div><dt>Employee ID</dt><dd>${esc(user.employeeId)}</dd></div>
    <div><dt>Department</dt><dd>${esc(user.department?.name ?? '—')}</dd></div>
    <div><dt>Job role</dt><dd>${esc(user.jobRoles.map((j) => j.jobRole?.name).filter(Boolean).join(', ') || '—')}</dd></div>
    <div><dt>Joined</dt><dd>${esc(prettyDate(user.joinDate))}</dd></div>
    <div><dt>Phone</dt><dd>${esc(user.phone ?? '—')}</dd></div>
    <div><dt>Status</dt><dd>${user.isActive ? 'Active' : 'Inactive'}</dd></div>
    <div><dt>Report period</dt><dd>${esc(prettyMonth(month))}</dd></div>
  </dl>

  <div class="stats">
    ${stats.map(([label, value]) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}
  </div>

  ${
    health && health.metrics.some((m) => m.value != null || m.na)
      ? `<h2>Employee health &mdash; ${health.total != null ? `${health.total.toFixed(1)} / 10` : 'not scored'}</h2>
  <table>
    <thead><tr><th>Quality</th><th>Score</th><th>Basis</th></tr></thead>
    <tbody>
      ${health.metrics
        .map(
          (m) => `<tr>
        <td>${esc(m.label)}</td>
        <td>${m.na ? '<span class="muted">N/A</span>' : m.value != null ? `<strong>${m.value.toFixed(1)}</strong> / 10` : '<span class="muted">&mdash;</span>'}</td>
        <td>${m.auto ? esc(m.detail ?? 'from records') + (m.overridden ? ' (adjusted)' : '') : '<span class="muted">admin</span>'}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>`
      : ''
  }

  <h2>Weekly reports</h2>
  ${
    weekly.length
      ? weekly
          .map(
            (w) => `<div class="week">
      <h3>Week: ${esc(prettyDate(w.weekStart))} &ndash; ${esc(prettyDate(weekEnd(w.weekStart)))}</h3>
      <dl>${WEEKLY_QUESTIONS.map(([key, label]) => `<dt>${esc(label)}</dt><dd>${multiline(w[key])}</dd>`).join('')}</dl>
    </div>`
          )
          .join('')
      : '<p class="empty">No weekly report submitted this month.</p>'
  }

  <h2>Daily work</h2>
  ${table(['Date', 'Status', 'Units', 'What was done', 'Problem reported', 'Approved by'], workRows, 'No work submitted this month.')}

  <h2>Attendance</h2>
  ${table(['Date', 'Status', 'In', 'Out', 'Hours', 'Late'], attendanceRows, 'No attendance recorded this month.')}

  <h2>Leave</h2>
  ${table(['Dates', 'Type', 'Status', 'Effect on pay', 'Reason', 'Decided by'], leaveRows, 'No leave this month.')}

  <h2>Tasks</h2>
  ${table(['Task', 'Response', 'Timing', 'Status', 'Note'], taskRows, 'No task responses this month.')}

  ${
    salary
      ? `<h2>Pay</h2>
  <table class="pay">
    <tbody>
      <tr><td>Gross (${esc(salary.salaryType.toLowerCase())})</td><td>${money(salary.gross)}</td></tr>
      <tr><td>Paid days</td><td>${salary.paidDays} of ${salary.daysInMonth}</td></tr>
      <tr><td>Absence</td><td>− ${money(salary.deductions.absent)}</td></tr>
      <tr><td>Half days</td><td>− ${money(salary.deductions.halfDay)}</td></tr>
      <tr><td>Leave marked paid</td><td>− ${money(salary.deductions.chargedLeave)}</td></tr>
      <tr><td>Late fine (${salary.finedLateDays} of ${salary.lateDays} late days)</td><td>− ${money(salary.deductions.lateFine)}</td></tr>
      <tr><td>Half day fine</td><td>− ${money(salary.deductions.halfDayFine)}</td></tr>
      <tr><td>Other deduction</td><td>− ${money(salary.deductions.manual)}</td></tr>
      <tr><td>Incentive</td><td>+ ${money(salary.incentive)}</td></tr>
      <tr><td>Bonus</td><td>+ ${money(salary.bonus)}</td></tr>
      <tr class="total"><td>Net payable</td><td>${money(salary.net)}</td></tr>
    </tbody>
  </table>
  ${salary.naDays > 0 ? `<p class="empty">${salary.naDays} day(s) not yet collected from the attendance machine — nothing has been deducted for them.</p>` : ''}`
      : ''
  }

  <footer>
    <span>Generated by ${esc(generatedBy)} on ${esc(new Date().toLocaleString('en-GB'))}</span>
    <span>${esc(user.employeeId)} · ${esc(prettyMonth(month))}</span>
  </footer>
</div>
</body>
</html>`;
}
