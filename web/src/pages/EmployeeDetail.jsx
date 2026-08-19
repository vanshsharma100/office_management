import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  ListTodo,
  MessageCircleQuestion,
  Pencil,
  TrendingUp,
  UserCog,
  Wallet,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { currentMonth, money, num, prettyDate, prettyMonth, shiftMonth } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';
import { WorkTrend } from '../components/charts';
import { QUESTIONS as WEEKLY_QUESTIONS, StatusBadge as WeekStatusBadge } from './WeeklyReport';
import EditSubmission from '../components/EditSubmission';
import HealthCard from '../components/HealthCard';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Section 6.3 — one employee's own dashboard, month switchable, any date openable. */
export default function EmployeeDetail() {
  const { id } = useParams();
  const { can, isSuperAdmin } = useAuth();
  const { toast } = useUI();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editingWork, setEditingWork] = useState(null);
  const [payFor, setPayFor] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/users/${id}/overview`, { params: { month } })
      .then((r) => setData(r.data))
      .catch((e) => toast(e.message, 'error'));
  }, [id, month, toast]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  /**
   * The month as a printable document — weekly reports, daily work,
   * attendance, leave, tasks and pay on the office's letterhead.
   *
   * Opened in a tab rather than saved as a file: it has to be fetched with the
   * session's auth header, which a plain link cannot carry, and a tab gives
   * the reader Print → Save as PDF without downloading anything first.
   */
  const openReport = async () => {
    try {
      const res = await api.get(`/reports/employee/${id}`, {
        params: { month },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/html' }));
      const tab = window.open(url, '_blank');
      if (!tab) toast('Allow pop-ups for this site to open the report', 'error');
      // Long enough for the new tab to have loaded it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  /** The same month as rows, for anyone who wants to work on it in Excel. */
  const downloadCsv = async () => {
    try {
      const res = await api.get(`/reports/employee/${id}`, {
        params: { month, format: 'csv' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.user.employeeId}-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!data) return <Spinner label="Opening employee" />;
  const u = data.user;

  return (
    <div className="space-y-5">
      <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-brand-600">
        <ArrowLeft size={15} /> All members
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={u.name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">{u.name}</h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {u.employeeId} · @{u.username} · joined {prettyDate(u.joinDate)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={u.role === 'ADMIN' ? 'brand' : u.role === 'SUPER_ADMIN' ? 'violet' : 'neutral'}>
                {u.role.replace('_', ' ').toLowerCase()}
              </Badge>
              {u.department && <Badge tone="sky">{u.department.name}</Badge>}
              {u.jobRoles?.map((j) => (
                <Badge key={j.id}>{j.name}</Badge>
              ))}
              {u.isManager && <Badge tone="amber">manager</Badge>}
              {!u.isActive && <Badge tone="red">inactive</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            {can('work.view') && (
              <>
                <button onClick={openReport} className="btn-ghost btn-sm">
                  <FileText size={15} /> {prettyMonth(month)} report
                </button>
                <button onClick={downloadCsv} className="btn-ghost btn-sm" title="Open in Excel">
                  <Download size={15} /> Excel
                </button>
              </>
            )}
            {can('salary.edit') && (
              <button onClick={() => setPayFor(true)} className="btn-ghost btn-sm">
                <Wallet size={15} /> Add pay item
              </button>
            )}
            {can('employees.edit') && (
              <button onClick={() => setEditing(true)} className="btn-primary btn-sm">
                <Pencil size={15} /> Edit
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Month switcher — Section 6.3 */}
      <Card className="flex items-center justify-between gap-3 p-3">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 dark:border-white/10"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="font-display font-semibold">{prettyMonth(month)}</p>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= currentMonth()}
          className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 disabled:opacity-30 dark:border-white/10"
        >
          <ChevronRight size={18} />
        </button>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Work units" value={num(data.work.totalUnits)} hint={`Defect rate ${data.work.defectRate}%`} icon={TrendingUp} />
        <Mini
          label="Present"
          value={data.attendance.filter((a) => a.status === 'PRESENT').length}
          hint={`${data.attendance.filter((a) => a.status === 'ABSENT').length} absent`}
          icon={CalendarCheck}
        />
        {data.salary && (
          <>
            <Mini label="Net payable" value={money(data.salary.net)} hint={`${data.salary.paidDays} paid days`} icon={Wallet} />
            <Mini
              label="Base / extras"
              value={money(data.salary.base)}
              hint={`+${money(data.salary.incentive + data.salary.bonus)} · −${money(data.salary.deduction)}`}
              icon={Wallet}
            />
          </>
        )}
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'work', label: 'Work', count: data.submissions.length },
          { value: 'weekly', label: 'Weekly report' },
          { value: 'health', label: 'Health' },
          { value: 'attendance', label: 'Attendance' },
          { value: 'salary', label: 'Salary' },
          { value: 'other', label: 'Leave & tasks' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <Card className="p-5 xl:col-span-2">
            <SectionTitle title="Work progress" subtitle="Approved units, last 14 days" icon={TrendingUp} />
            <WorkTrend data={data.series} />
          </Card>
          <Card className="p-5">
            <SectionTitle title="Totals" subtitle={prettyMonth(month)} icon={ClipboardList} />
            {data.work.rows.length === 0 ? (
              <Empty title="No approved work" icon={ClipboardList} />
            ) : (
              <ul className="space-y-2">
                {data.work.rows.map((r) => (
                  <li key={r.questionId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-500 dark:text-ink-400">{r.label}</span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {num(r.value)}
                      {r.failed > 0 && <span className="text-rose-500"> ({r.failed} failed)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'weekly' && <WeeklyReports userId={data.user.id} />}

      {tab === 'health' && <HealthCard userId={data.user.id} month={month} />}

      {tab === 'work' && (
        <Card className="p-5">
          <SectionTitle title="Submissions" subtitle="Every day, with who approved it" icon={ClipboardList} />
          {data.submissions.length === 0 ? (
            <Empty title="No submissions this month" icon={ClipboardList} />
          ) : (
            <ul className="space-y-2">
              {data.submissions.map((s) => (
                <li key={s.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{prettyDate(s.date)}</p>
                      <StatusBadge status={s.status} />
                      {s.isBackfilled && (
                        <Badge tone="brand">
                          <UserCog size={11} /> by {s.submittedBy?.name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">
                        {s.entries.reduce((a, e) => a + e.value, 0)} units
                      </span>
                      {/* Approved or not — a wrong number stays wrong until
                          somebody can fix it, and bouncing it back costs a day. */}
                      {can('work.approve') && (
                        <button
                          onClick={() => setEditingWork({ ...s, user: data.user })}
                          className="btn-ghost btn-sm"
                          title="Correct this day"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {s.reviewedBy && (
                    <p className="mt-1 text-xs text-ink-500">
                      {s.status === 'APPROVED' ? 'Approved' : 'Reviewed'} by {s.reviewedBy.name}
                    </p>
                  )}
                  {s.note && (
                    <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[.07] px-3 py-2 text-xs">
                      <span className="font-semibold">Problem reported:</span> {s.note}
                    </p>
                  )}
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {s.entries.filter((e) => e.value > 0).map((e) => (
                      <li key={e.id} className="flex justify-between gap-3 text-xs">
                        <span className="truncate text-ink-500 dark:text-ink-400">{e.question.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{e.value}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'attendance' && (
        <Card className="p-5">
          <SectionTitle title="Attendance" subtitle={prettyMonth(month)} icon={CalendarCheck} />
          {data.attendance.length === 0 ? (
            <Empty title="Nothing marked this month" icon={CalendarCheck} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.attendance.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div>
                    <p className="text-sm font-semibold">{prettyDate(a.date)}</p>
                    {a.hours > 0 && <p className="text-xs text-ink-500">{a.hours} h</p>}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'salary' && data.salary && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle title="Salary breakdown" subtitle={prettyMonth(month)} icon={Wallet} />
            <dl className="space-y-2.5">
              <Row label={`Base (${data.salary.salaryType.toLowerCase()})`} value={money(data.salary.base)} />
              <Row label="Paid days" value={`${data.salary.paidDays} / ${data.salary.daysInMonth}`} />
              {data.salary.salaryType === 'HOURLY' && <Row label="Hours" value={data.salary.hours} />}
              <Row label="Incentive" value={`+ ${money(data.salary.incentive)}`} tone="green" />
              <Row label="Bonus" value={`+ ${money(data.salary.bonus)}`} tone="green" />
              <Row label="Deduction" value={`− ${money(data.salary.deduction)}`} tone="red" />
              <div className="border-t border-ink-200/70 pt-3 dark:border-white/10">
                <Row label="Net payable" value={money(data.salary.net)} big />
              </div>
              {data.salary.locked && <Badge tone="amber">month locked</Badge>}
            </dl>
          </Card>

          <Card className="p-5">
            <SectionTitle title="Incentives, bonuses, deductions" subtitle="Who added each one" icon={Wallet} />
            {data.salary.items.length === 0 ? (
              <Empty title="Nothing added this month" icon={Wallet} />
            ) : (
              <ul className="space-y-2">
                {data.salary.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{i.type.toLowerCase()}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">{i.note || '—'}</p>
                    </div>
                    <span className={`shrink-0 font-bold ${i.type === 'DEDUCTION' ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {i.type === 'DEDUCTION' ? '−' : '+'} {money(i.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'other' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <SectionTitle title="Leave history" icon={CalendarOff} />
            {data.leaves.length === 0 ? (
              <Empty title="No leave requests" icon={CalendarOff} />
            ) : (
              <ul className="space-y-2">
                {data.leaves.map((l) => (
                  <li key={l.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold capitalize">{l.type.replace('_', ' ').toLowerCase()}</p>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                      {prettyDate(l.fromDate)} → {prettyDate(l.toDate)}
                    </p>
                    <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{l.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Task responses" icon={ListTodo} />
            {data.tasks.length === 0 ? (
              <Empty title="No task responses" icon={ListTodo} />
            ) : (
              <ul className="space-y-2">
                {data.tasks.map((t) => (
                  <li key={t.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{t.task.title}</p>
                      <StatusBadge status={t.response} />
                    </div>
                    {!t.onTime && <Badge tone="red" className="mt-1">after deadline</Badge>}
                    {t.note && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Questions raised" icon={MessageCircleQuestion} />
            {data.queries.length === 0 ? (
              <Empty title="No questions" icon={MessageCircleQuestion} />
            ) : (
              <ul className="space-y-2">
                {data.queries.map((q) => (
                  <li key={q.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{q.subject}</p>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{q.replies.length} reply(ies)</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {editing && <EditUserModal user={u} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {editingWork && (
        <EditSubmission
          submission={editingWork}
          onClose={() => setEditingWork(null)}
          onSaved={() => {
            setEditingWork(null);
            load();
          }}
        />
      )}
      {payFor && <PayItemModal user={u} month={month} onClose={() => setPayFor(false)} onSaved={() => { setPayFor(false); load(); }} />}
    </div>
  );
}

/**
 * What this employee actually reported each week, and the weeks they did not.
 * A missing week is the point of the screen, so it reads as loudly as a filled
 * one rather than being an absence you have to notice.
 */
function WeeklyReports({ userId }) {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api
      .get(`/weekly/user/${userId}`, { params: { weeks: 12 } })
      .then((r) => setData(r.data))
      .catch((e) => toast(e.message, 'error'));
  }, [userId, toast]);

  if (!data) return <Spinner label="Loading weekly reports" />;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Weekly reports"
        subtitle={
          data.config.enabled
            ? `Opens every ${DAY_NAMES[data.config.openDay]}, stays open until the week ends`
            : 'The weekly report is switched off'
        }
        icon={CalendarRange}
      />
      <ul className="space-y-2">
        {data.weeks.map((w) => (
          <li key={w.weekStart} className="rounded-xl border border-ink-200/70 dark:border-white/10">
            <button
              onClick={() => setOpen(open === w.weekStart ? null : w.weekStart)}
              disabled={!w.report}
              className="flex w-full flex-wrap items-center gap-3 p-3 text-left disabled:cursor-default"
            >
              <span className="text-sm font-medium">
                {prettyDate(w.weekStart)} — {prettyDate(w.weekEnd)}
              </span>
              <WeekStatusBadge status={w.status} className="ml-auto" />
              {w.report && (
                <span className="text-xs text-ink-500">{open === w.weekStart ? 'Hide' : 'Read'}</span>
              )}
            </button>

            {open === w.weekStart && w.report && (
              <dl className="space-y-3 border-t border-ink-200/70 p-4 dark:border-white/10">
                {WEEKLY_QUESTIONS.map((q) => (
                  <div key={q.key}>
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{q.label}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-sm">
                      {w.report[q.key] || <span className="text-ink-400">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Mini({ label, value, hint, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
        <Icon size={16} className="shrink-0 text-brand-500" />
      </div>
      <p className="mt-2 font-display text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

function Row({ label, value, tone, big }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm text-ink-500 dark:text-ink-400">{label}</dt>
      <dd
        className={`font-semibold tabular-nums ${big ? 'font-display text-xl' : ''} ${
          tone === 'green' ? 'text-emerald-500' : tone === 'red' ? 'text-rose-500' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }) {
  const { can, isSuperAdmin } = useAuth();
  const { toast } = useUI();
  const [departments, setDepartments] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone ?? '',
    departmentId: user.departmentId ?? '',
    jobRoleIds: user.jobRoles?.map((j) => j.id) ?? [],
    salaryType: user.salaryType ?? 'MONTHLY',
    salaryAmount: user.salaryAmount ?? 0,
    isManager: user.isManager,
    shiftStart: user.shiftStart ?? '',
    graceMinutes: user.graceMinutes ?? '',
    halfDayAfter: user.halfDayAfter ?? '',
    weeklyReportDay: user.weeklyReportDay ?? '',
    dailyTarget: user.dailyTarget ?? '',
    autopilot: user.autopilot === true ? 'ON' : user.autopilot === false ? 'OFF' : '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.departments)).catch(() => {});
    api.get('/attendance/policy').then((r) => setPolicy(r.data.policy)).catch(() => {});
  }, []);

  const department = departments.find((d) => d.id === form.departmentId);

  /** What a blank field falls back to, so the hint can say it out loud. */
  const fallback = (field) => {
    // A grace period of 0 is a real setting, so test for null rather than falsy.
    if (department?.[field] != null) return `${department.name} — ${department[field]}`;
    if (policy?.[field] != null) return `office default — ${policy[field]}`;
    return 'not set anywhere';
  };

  const save = async () => {
    setBusy(true);
    try {
      // A blank timing is sent as null, which clears this person's override so
      // they go back to their department's hours.
      const blankToNull = (v) => (v === '' || v === null ? null : v);
      const payload = {
        name: form.name,
        phone: form.phone || null,
        departmentId: form.departmentId || null,
        jobRoleIds: form.jobRoleIds,
        isManager: form.isManager,
        shiftStart: blankToNull(form.shiftStart),
        halfDayAfter: blankToNull(form.halfDayAfter),
        graceMinutes: form.graceMinutes === '' ? null : Number(form.graceMinutes),
        weeklyReportDay: form.weeklyReportDay === '' ? null : Number(form.weeklyReportDay),
        dailyTarget: form.dailyTarget === '' ? null : Number(form.dailyTarget),
        autopilot: form.autopilot === 'ON' ? true : form.autopilot === 'OFF' ? false : null,
      };
      if (can('salary.edit')) {
        payload.salaryType = form.salaryType;
        payload.salaryAmount = Number(form.salaryAmount) || 0;
      }
      await api.patch(`/users/${user.id}`, payload);
      toast('Saved. The change is recorded in the history log.');
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${user.name}`}
      subtitle="Every change is stored with your name and the time."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            Save changes
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Department">
          <select
            className="input"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value, jobRoleIds: [] })}
          >
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Manager">
          <label className="flex h-[46px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-500"
              checked={form.isManager}
              onChange={(e) => setForm({ ...form, isManager: e.target.checked })}
              disabled={!isSuperAdmin}
            />
            Salary changeable only by Super Admin
          </label>
        </Field>

        {department?.jobRoles?.length > 0 && (
          <Field label="Job role(s)" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {department.jobRoles.map((r) => {
                const on = form.jobRoleIds.includes(r.id);
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() =>
                      setForm({
                        ...form,
                        jobRoleIds: on ? form.jobRoleIds.filter((x) => x !== r.id) : [...form.jobRoleIds, r.id],
                      })
                    }
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      on ? 'border-brand-400 bg-brand-500/12 text-brand-600 dark:text-brand-300' : 'border-ink-200 text-ink-500 dark:border-white/10'
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {/* Only for the few people whose hours differ from their department's. */}
        <div className="rounded-xl border border-ink-200 p-4 sm:col-span-2 dark:border-white/10">
          <p className="text-sm font-semibold">Office timing for this employee</p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Leave a box blank and this person follows their department, or the office-wide rules.
            Fill one in only when their hours are genuinely different.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Shift starts" hint={form.shiftStart ? undefined : `Using ${fallback('shiftStart')}`}>
              <input
                type="time"
                className="input"
                value={form.shiftStart}
                onChange={(e) => setForm({ ...form, shiftStart: e.target.value })}
              />
            </Field>
            <Field
              label="Grace (minutes)"
              hint={form.graceMinutes === '' ? `Using ${fallback('graceMinutes')}` : undefined}
            >
              <input
                type="number"
                min={0}
                max={240}
                className="input"
                value={form.graceMinutes}
                onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
              />
            </Field>
            <Field label="Half day after" hint={form.halfDayAfter ? undefined : `Using ${fallback('halfDayAfter')}`}>
              <input
                type="time"
                className="input"
                value={form.halfDayAfter}
                onChange={(e) => setForm({ ...form, halfDayAfter: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Weekly report day" hint="Only if different from everyone else">
              <select
                className="input"
                value={form.weeklyReportDay}
                onChange={(e) => setForm({ ...form, weeklyReportDay: e.target.value })}
              >
                <option value="">Office setting</option>
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Daily target"
              hint={`Units per day.${department?.dailyTarget ? ` Dept: ${department.dailyTarget}` : ''}`}
            >
              <input
                type="number"
                min={0}
                className="input"
                value={form.dailyTarget}
                onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })}
                placeholder={department?.dailyTarget ? `${department.dailyTarget}` : '—'}
              />
            </Field>
            <Field label="Work approval" hint="Autopilot skips approval">
              <select
                className="input"
                value={form.autopilot}
                onChange={(e) => setForm({ ...form, autopilot: e.target.value })}
              >
                <option value="">Follow department</option>
                <option value="ON">Autopilot (auto-approve)</option>
                <option value="OFF">Always needs approval</option>
              </select>
            </Field>
          </div>
        </div>

        {can('salary.edit') && (
          <>
            <Field label="Salary type">
              <select
                className="input"
                value={form.salaryType}
                onChange={(e) => setForm({ ...form, salaryType: e.target.value })}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </Field>
            <Field label={form.salaryType === 'MONTHLY' ? 'Monthly salary (₹)' : 'Hourly rate (₹)'}>
              <input
                type="number"
                className="input"
                value={form.salaryAmount}
                onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })}
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function PayItemModal({ user, month, onClose, onSaved }) {
  const { toast } = useUI();
  const [form, setForm] = useState({ type: 'INCENTIVE', amount: '', note: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/salary/pay-items', {
        userId: user.id,
        month,
        type: form.type,
        amount: Number(form.amount),
        note: form.note || null,
      });
      toast(`${form.type.toLowerCase()} added for ${user.name}.`);
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add incentive, bonus or deduction"
      subtitle={`${user.name} · ${prettyMonth(month)}`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !form.amount} className="btn-primary">
            Add
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="INCENTIVE">Incentive</option>
            <option value="BONUS">Bonus</option>
            <option value="DEDUCTION">Deduction</option>
          </select>
        </Field>
        <Field label="Amount (₹)">
          <input
            type="number"
            min={1}
            className="input"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Note" hint="Shown in their salary history">
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
