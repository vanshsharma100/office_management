import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  Gauge,
  ListTodo,
  LogIn,
  LogOut,
  Megaphone,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { money, num, prettyDate, prettyTime, timeAgo } from '../lib/format';
import { AttendanceDonut, WorkTrend } from '../components/charts';
import { Badge, Card, Empty, Progress, SectionTitle, SkeletonCard, StatusBadge } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get('/dashboard')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <Card>
        <Empty title="Could not load the dashboard" hint={error} icon={AlertCircle} />
      </Card>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return data.panel === 'ADMIN' ? (
    <AdminDashboard data={data} user={user} />
  ) : (
    <EmployeeDashboard data={data} user={user} reload={load} />
  );
}

/* ══════════════════════════════════════════════════ Super Admin / Admin ══ */

function AdminDashboard({ data, user }) {
  const navigate = useNavigate();
  const { t } = useUI();
  const s = data.stats;

  return (
    <div className="space-y-6">
      <Hero
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${prettyDate(data.today)}${data.holiday ? ` · ${data.holiday.name} (holiday)` : ''}`}
        right={
          <div className="flex flex-wrap gap-2">
            <Link to="/approvals" className="btn-ghost btn-sm">
              <ShieldCheck size={15} /> {s.pendingWork} pending
            </Link>
            <Link to="/employees" className="btn-primary btn-sm">
              <Users size={15} /> Employees
            </Link>
          </div>
        }
      />

      {/* Top row — Section 6.1 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Present today"
          value={`${data.attendanceSummary.PRESENT ?? 0}/${s.activeCount}`}
          hint={`${data.attendanceSummary.ABSENT ?? 0} absent · ${data.attendanceSummary.LEAVE ?? 0} on leave`}
          icon={CalendarCheck}
          tone="green"
          to="/attendance"
        />
        <Stat
          label="Pending approvals"
          value={s.pendingWork}
          hint="Work waiting to be reviewed"
          icon={ShieldCheck}
          tone="amber"
          to="/approvals"
        />
        <Stat
          label="Pending tasks"
          value={s.pendingTasks + data.openTasks.filter((t2) => !t2.responded).length}
          hint={`${s.pendingLeave} leave request${s.pendingLeave === 1 ? '' : 's'}`}
          icon={ListTodo}
          tone="violet"
          to="/tasks"
        />
        <Stat
          label="Output this month"
          value={num(s.monthUnits)}
          hint={`Defect rate ${s.defectRate}%`}
          icon={TrendingUp}
          tone="brand"
          to="/departments"
        />
      </div>

      {/* Department blocks — Section 6.2 / 6.4 */}
      <div>
        <SectionTitle
          title={t('Departments', 'विभाग')}
          subtitle={`Yesterday's combined output · ${prettyDate(data.yesterday)}`}
          icon={Gauge}
          action={
            <Link to="/departments" className="btn-ghost btn-sm">
              Manage <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.blocks.map((b) => (
            <DepartmentBlock key={b.id} block={b} onClick={() => navigate(`/departments/${b.id}`)} />
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Company work trend" subtitle="Approved units, last 14 days" icon={TrendingUp} />
          <WorkTrend data={data.series} />
        </Card>

        <Card className="p-5">
          <SectionTitle title="Today's attendance" subtitle="Across every department" icon={CalendarCheck} />
          <AttendanceDonut summary={data.attendanceSummary} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle
            title="Pending approvals"
            subtitle="Oldest first"
            icon={ShieldCheck}
            action={
              <Link to="/approvals" className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                See all
              </Link>
            }
          />
          {data.approvals.length === 0 ? (
            <Empty title="All clear" hint="Nothing is waiting for review." icon={CheckCircle2} />
          ) : (
            <ul className="space-y-2">
              {data.approvals.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.user.name}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {a.user.department?.name} · {prettyDate(a.date)}
                    </p>
                  </div>
                  <Badge tone="brand">{a.entries.reduce((x, e) => x + e.value, 0)} units</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Open tasks" subtitle="Assigned, not yet submitted" icon={ListTodo} />
          {data.openTasks.length === 0 ? (
            <Empty title="No open tasks" icon={ListTodo} />
          ) : (
            <ul className="space-y-2">
              {data.openTasks.slice(0, 6).map((task) => (
                <li key={task.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{task.title}</p>
                    {task.overdue && <Badge tone="red">overdue</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {task.assignee} · {task.responded} responded
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle
            title="Notices"
            subtitle="Recently published"
            icon={Megaphone}
            action={
              <Link to="/notices" className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                See all
              </Link>
            }
          />
          {data.notices.length === 0 ? (
            <Empty title="No notices yet" icon={Megaphone} />
          ) : (
            <ul className="space-y-2">
              {data.notices.map((n) => (
                <li key={n.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.pinned && <Badge tone="amber">pinned</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {n.createdBy.name} · {timeAgo(n.createdAt)} · {n._count.reads} read
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Every block is clickable and drills into the department (Section 6.2). */
function DepartmentBlock({ block, onClick }) {
  const comingSoon = block.status === 'COMING_SOON';

  return (
    <button
      onClick={onClick}
      className="card card-hover group w-full p-5 text-left"
      disabled={false}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display font-semibold">{block.name}</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {block.members} member{block.members === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {comingSoon ? <Badge tone="amber">coming soon</Badge> : <Badge tone="green">active</Badge>}
          {block.autopilot && <Badge tone="violet">autopilot</Badge>}
        </div>
      </div>

      {comingSoon ? (
        <p className="mt-5 text-sm text-ink-500 dark:text-ink-400">
          This department module is not created yet.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-4">
            <div>
              <p className="font-display text-3xl font-bold tabular-nums">{num(block.yesterdayTotal)}</p>
              <p className="text-[11px] uppercase tracking-wide text-ink-500">yesterday</p>
            </div>
            <div className="ml-auto text-right">
              <p className="font-semibold tabular-nums">{num(block.monthTotal)}</p>
              <p className="text-[11px] uppercase tracking-wide text-ink-500">this month</p>
            </div>
          </div>

          {block.topRows?.length > 0 && (
            <ul className="mt-4 space-y-1">
              {block.topRows.slice(0, 3).map((r) => (
                <li key={r.questionId} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-ink-500 dark:text-ink-400">{r.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Section 6.4 — pending against target, not only what it did yesterday */}
          {block.target > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[11px] font-semibold">
                <span className="text-ink-500">Target {num(block.target)}</span>
                <span className={block.progress >= 100 ? 'text-emerald-500' : 'text-amber-500'}>
                  {block.pending > 0 ? `${num(block.pending)} pending` : 'target met'}
                </span>
              </div>
              <Progress value={block.progress} tone={block.progress >= 100 ? 'green' : 'brand'} />
            </div>
          )}

          {block.defectRate > 0 && (
            <p className="mt-3 text-[11px] font-semibold text-ink-500">
              Defect rate <span className={block.defectRate > 10 ? 'text-rose-500' : 'text-emerald-500'}>{block.defectRate}%</span>
            </p>
          )}
        </>
      )}

      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100 dark:text-brand-300">
        Open department <ArrowRight size={13} />
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════ Employee ══ */

function EmployeeDashboard({ data, user, reload }) {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const att = data.attendanceToday;

  const mark = async (kind) => {
    setBusy(true);
    try {
      await api.post(`/attendance/${kind}`);
      toast(kind === 'check-in' ? 'Checked in. Have a good shift.' : 'Checked out. See you tomorrow.');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const monthDone = data.attendanceSummary.PRESENT ?? 0;

  return (
    <div className="space-y-6">
      <Hero
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${prettyDate(data.today)}${data.holiday ? ` · ${data.holiday.name}` : ''} · ${user.employeeId}`}
        right={
          <div className="flex flex-wrap gap-2">
            {!att?.checkIn ? (
              <button onClick={() => mark('check-in')} disabled={busy} className="btn-primary btn-sm">
                <LogIn size={15} /> Check in
              </button>
            ) : !att?.checkOut ? (
              <button onClick={() => mark('check-out')} disabled={busy} className="btn-ghost btn-sm">
                <LogOut size={15} /> Check out
              </button>
            ) : (
              <Badge tone="green">
                <CheckCircle2 size={13} /> Day complete
              </Badge>
            )}
            {!data.comingSoon && (
              <Link to="/work" className="btn-primary btn-sm">
                <ClipboardList size={15} /> Submit work
              </Link>
            )}
          </div>
        }
      />

      {data.comingSoon && (
        <Card className="border-amber-400/30 bg-amber-500/[.07] p-5">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
              <Clock size={20} />
            </span>
            <div>
              <p className="font-display font-semibold">Coming Soon</p>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                This department module is not created yet. Everything else — attendance, salary, leave,
                tasks, notices and questions — works as normal.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Today"
          value={att ? att.status.replace('_', ' ').toLowerCase() : 'not marked'}
          hint={att?.checkIn ? `In at ${prettyTime(att.checkIn)}` : 'Check in when you arrive'}
          icon={CalendarCheck}
          tone={att?.status === 'PRESENT' ? 'green' : 'amber'}
        />
        <Stat
          label="Salary so far"
          value={money(data.salary?.net ?? 0)}
          hint={`${data.salary?.paidDays ?? 0} paid days this month`}
          icon={Wallet}
          tone="brand"
          to="/salary"
        />
        <Stat
          label="Work this month"
          value={num(data.work.totalUnits)}
          hint={data.pendingApprovals > 0 ? `${data.pendingApprovals} awaiting approval` : 'All approved'}
          icon={TrendingUp}
          tone="violet"
          to="/work"
        />
        <Stat
          label="Present days"
          value={monthDone}
          hint={`${data.attendanceSummary.ABSENT ?? 0} absent · ${data.attendanceSummary.LEAVE ?? 0} leave`}
          icon={Sparkles}
          tone="green"
          to="/attendance"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="My work progress" subtitle="Approved units, last 14 days" icon={TrendingUp} />
          <WorkTrend data={data.series} />
        </Card>

        <Card className="p-5">
          <SectionTitle title="Today's submission" subtitle="One submission per day" icon={ClipboardList} />
          {data.todaySubmission ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <StatusBadge status={data.todaySubmission.status} />
                <span className="text-sm font-semibold tabular-nums">
                  {data.todaySubmission.entries.reduce((a, e) => a + e.value, 0)} units
                </span>
              </div>
              <ul className="space-y-1.5">
                {data.todaySubmission.entries.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 text-sm">
                    <span className="truncate text-ink-500 dark:text-ink-400">{e.question.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{e.value}</span>
                  </li>
                ))}
              </ul>
              {data.todaySubmission.status !== 'APPROVED' && (
                <Link to="/work" className="btn-ghost btn-sm w-full">
                  Edit submission
                </Link>
              )}
            </div>
          ) : (
            <Empty
              title="Nothing submitted yet"
              hint={data.comingSoon ? 'Your department module is not built yet.' : 'Fill your numbers through the day.'}
              icon={ClipboardList}
              action={
                !data.comingSoon && (
                  <Link to="/work" className="btn-primary btn-sm">
                    Open my work form
                  </Link>
                )
              }
            />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="My tasks" subtitle="Respond before or after the deadline" icon={ListTodo} />
          {data.tasks.length === 0 ? (
            <Empty title="No tasks assigned" icon={ListTodo} />
          ) : (
            <ul className="space-y-2">
              {data.tasks.slice(0, 5).map((task) => (
                <li key={task.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{task.title}</p>
                    {task.myResponse ? (
                      <StatusBadge status={task.myResponse.response} />
                    ) : task.overdue ? (
                      <Badge tone="red">overdue</Badge>
                    ) : (
                      <Badge tone="amber">to do</Badge>
                    )}
                  </div>
                  {task.dueDate && (
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Due {prettyDate(task.dueDate)}</p>
                  )}
                </li>
              ))}
              <Link to="/tasks" className="btn-ghost btn-sm w-full">
                Open tasks
              </Link>
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Notices" subtitle="From the office" icon={Megaphone} />
          {data.notices.length === 0 ? (
            <Empty title="No notices" icon={PartyPopper} />
          ) : (
            <ul className="space-y-2">
              {data.notices.slice(0, 5).map((n) => (
                <li key={n.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {!n.readByMe && <Badge tone="brand">new</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{n.body}</p>
                </li>
              ))}
              <Link to="/notices" className="btn-ghost btn-sm w-full">
                Open notices
              </Link>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ Shared bits ══ */

function Hero({ title, subtitle, right }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-6 text-white shadow-lift sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-white/70">{subtitle}</p>
        </div>
        {right}
      </div>
    </div>
  );
}

const TONE_BG = {
  brand: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-300',
};

function Stat({ label, value, hint, icon: Icon, tone = 'brand', to }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_BG[tone]}`}>
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold capitalize tabular-nums">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
    </>
  );

  return to ? (
    <Link to={to} className="card card-hover block p-5">
      {body}
    </Link>
  ) : (
    <Card className="p-5">{body}</Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
