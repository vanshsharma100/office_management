import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  ListTodo,
  Plus,
  Target,
  TrendingUp,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { currentMonth, num, prettyDate, prettyMonth } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, Progress, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';
import { WorkBreakdown, WorkTrend } from '../components/charts';

/** Section 6.3 — the drill-down: members, graphs, tasks, attendance. */
export default function DepartmentDetail() {
  const { id } = useParams();
  const { isSuperAdmin } = useAuth();
  const { toast, t } = useUI();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [roleModal, setRoleModal] = useState(null);
  const month = currentMonth();

  const load = useCallback(() => {
    api
      .get(`/departments/${id}/overview`, { params: { month } })
      .then((r) => setData(r.data))
      .catch((e) => toast(e.message, 'error'));
  }, [id, month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Spinner label="Opening department" />;
  const d = data.department;
  const comingSoon = d.status === 'COMING_SOON';

  return (
    <div className="space-y-5">
      <Link to="/departments" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-brand-600">
        <ArrowLeft size={15} /> All departments
      </Link>

      <div className="slab relative overflow-hidden p-6 shadow-lift">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/[.06] blur-3xl dark:bg-black/[.06]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tightest sm:text-3xl">{t(d.name, d.nameHi)}</h1>
            <p className="slab-muted mt-1 text-sm">
              {data.members.length} member{data.members.length === 1 ? '' : 's'} · {d.jobRoles.length} job role
              {d.jobRoles.length === 1 ? '' : 's'} · {prettyMonth(month)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={comingSoon ? 'amber' : 'green'}>{comingSoon ? 'coming soon' : 'active'}</Badge>
              {d.autopilot && (
                <Badge tone="violet">
                  <Zap size={11} /> autopilot on
                </Badge>
              )}
              {data.pendingApprovals > 0 && <Badge tone="amber">{data.pendingApprovals} pending approval</Badge>}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold tabular-nums">{num(data.work.totalUnits)}</p>
            <p className="slab-muted text-xs uppercase tracking-wide">units this month</p>
          </div>
        </div>

        {/* Section 6.4 — pending against target */}
        {d.target > 0 && (
          <div className="relative mt-5">
            <div className="mb-1.5 flex justify-between text-xs font-semibold">
              <span className="slab-muted inline-flex items-center gap-1">
                <Target size={13} /> Target {num(d.target)}
              </span>
              <span>
                {data.progress >= 100 ? 'Target met' : `${num(d.target - data.work.totalUnits)} pending`} · {data.progress}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20 dark:bg-black/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500 dark:bg-black"
                style={{ width: `${data.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'members', label: 'Members', count: data.members.length },
          { value: 'roles', label: 'Job roles & questions' },
          { value: 'tasks', label: 'Tasks', count: data.tasks.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <SectionTitle title="Department work trend" subtitle="Approved units, last 30 days" icon={TrendingUp} />
              <WorkTrend data={data.series} height={260} />
            </Card>
            <Card className="p-5">
              <SectionTitle title="Today" subtitle="Attendance right now" icon={CalendarCheck} />
              <ul className="space-y-2">
                {data.members.map((m) => {
                  const rec = data.attendanceToday.find((a) => a.userId === m.id);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm">{m.name}</span>
                      <StatusBadge status={rec?.status ?? 'NOT_MARKED'} />
                    </li>
                  );
                })}
                {data.members.length === 0 && <Empty title="No members" icon={Users} />}
              </ul>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle
              title="Work items"
              subtitle="Laptop and tiny are counted separately, never merged"
              icon={ClipboardList}
            />
            {data.work.rows.length === 0 ? (
              <Empty title="No approved work this month" icon={ClipboardList} />
            ) : (
              <WorkBreakdown rows={data.work.rows} height={Math.max(220, data.work.rows.length * 34)} />
            )}
            {data.work.checked > 0 && (
              <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
                Quality check: <strong>{num(data.work.checked)}</strong> inspected,{' '}
                <strong className="text-rose-500">{num(data.work.failed)}</strong> failed — defect rate{' '}
                <strong className={data.work.defectRate > 10 ? 'text-rose-500' : 'text-emerald-500'}>
                  {data.work.defectRate}%
                </strong>
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === 'members' && (
        <Card className="p-5">
          <SectionTitle title="Members" subtitle="Ranked by output this month — click to open" icon={Users} />
          {data.members.length === 0 ? (
            <Empty title="No members in this department" icon={Users} />
          ) : (
            <ul className="space-y-2">
              {data.members.map((m, i) => (
                <li key={m.id}>
                  <Link
                    to={`/employees/${m.id}`}
                    className="flex items-center gap-3 rounded-xl bg-ink-100/60 p-3 transition hover:bg-brand-500/10 dark:bg-white/5"
                  >
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-ink-400">{i + 1}</span>
                    <Avatar name={m.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        {m.employeeId} · {m.jobRoles.map((j) => j.name).join(', ') || 'no job role'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display font-bold tabular-nums">{num(m.total)}</p>
                      {m.defectRate > 0 && <p className="text-[11px] text-rose-500">{m.defectRate}% defect</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          {isSuperAdmin && (
            <button onClick={() => setRoleModal({ new: true })} className="btn-primary btn-sm">
              <Plus size={15} /> Add job role
            </button>
          )}
          {d.jobRoles.length === 0 ? (
            <Card>
              <Empty
                title="No job roles yet"
                hint="A job role holds its own question set. Employees see only the questions for their role."
                icon={ClipboardList}
              />
            </Card>
          ) : (
            d.jobRoles.map((role) => (
              <Card key={role.id} className="p-5">
                <SectionTitle
                  title={t(role.name, role.nameHi)}
                  subtitle={`${role.questions.filter((q) => q.isActive).length} question(s)`}
                  icon={ClipboardList}
                  action={
                    isSuperAdmin && (
                      <button onClick={() => setRoleModal({ role })} className="btn-ghost btn-sm">
                        Edit questions
                      </button>
                    )
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {role.questions
                    .filter((q) => q.isActive)
                    .map((q) => (
                      <span
                        key={q.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-sm dark:border-white/10"
                      >
                        {q.label}
                        {q.unit && (
                          <span className="rounded bg-ink-100 px-1 text-[10px] font-bold uppercase text-ink-500 dark:bg-white/10">
                            {q.unit}
                          </span>
                        )}
                        {q.type === 'CHECK_FAIL' && <Badge tone="red">checked + failed</Badge>}
                      </span>
                    ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <Card className="p-5">
          <SectionTitle title="Tasks" subtitle="Assigned to this department or its members" icon={ListTodo} />
          {data.tasks.length === 0 ? (
            <Empty title="No tasks" icon={ListTodo} />
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((task) => (
                <li key={task.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{task.title}</p>
                    <div className="flex gap-1.5">
                      <Badge tone={task.priority === 'HIGH' ? 'red' : 'brand'}>{task.priority.toLowerCase()}</Badge>
                      <Badge>{task.responses.length} responded</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {task.assignee?.name ?? 'Whole department'}
                    {task.dueDate ? ` · due ${prettyDate(task.dueDate)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {roleModal && (
        <JobRoleModal
          departmentId={id}
          role={roleModal.role}
          onClose={() => setRoleModal(null)}
          onSaved={() => {
            setRoleModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Section 4 — roles and their questions are edited, never rebuilt. */
function JobRoleModal({ departmentId, role, onClose, onSaved }) {
  const { toast } = useUI();
  const [name, setName] = useState(role?.name ?? '');
  const [nameHi, setNameHi] = useState(role?.nameHi ?? '');
  const [questions, setQuestions] = useState(
    role?.questions?.filter((q) => q.isActive).map((q) => ({
      id: q.id,
      label: q.label,
      labelHi: q.labelHi ?? '',
      type: q.type,
      unit: q.unit ?? '',
    })) ?? []
  );
  const [busy, setBusy] = useState(false);

  const addRow = () => setQuestions((q) => [...q, { label: '', labelHi: '', type: 'NUMBER', unit: '' }]);
  const update = (i, patch) => setQuestions((q) => q.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i) => setQuestions((q) => q.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    try {
      let roleId = role?.id;
      if (!roleId) {
        const { data } = await api.post(`/departments/${departmentId}/job-roles`, {
          name,
          nameHi: nameHi || null,
        });
        roleId = data.jobRole.id;
      } else if (name !== role.name || nameHi !== (role.nameHi ?? '')) {
        await api.patch(`/departments/job-roles/${roleId}`, { name, nameHi: nameHi || null });
      }

      await api.put(`/departments/job-roles/${roleId}/questions`, {
        questions: questions
          .filter((q) => q.label.trim())
          .map((q) => ({
            id: q.id,
            label: q.label.trim(),
            labelHi: q.labelHi?.trim() || null,
            type: q.type,
            unit: q.unit?.trim() || null,
          })),
      });

      toast('Job role saved. Employees will see the new question set immediately.');
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
      size="lg"
      title={role ? `Edit ${role.name}` : 'Add a job role'}
      subtitle="Only these questions appear on the daily form for employees in this role."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary">
            Save job role
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job role name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Hindi label">
            <input className="input" value={nameHi} onChange={(e) => setNameHi(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Questions</p>
            <button onClick={addRow} className="btn-ghost btn-sm">
              <Plus size={14} /> Add question
            </button>
          </div>

          {questions.length === 0 ? (
            <Empty title="No questions yet" hint="Add the work items this role reports every day." icon={ClipboardList} />
          ) : (
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={q.id ?? i} className="rounded-xl border border-ink-200 p-3 dark:border-white/10">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                    <input
                      className="input"
                      placeholder="Question, e.g. Cloning — laptop"
                      value={q.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                    <input
                      className="input"
                      placeholder="Hindi label"
                      value={q.labelHi}
                      onChange={(e) => update(i, { labelHi: e.target.value })}
                    />
                    <select className="input w-auto" value={q.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                      <option value="">no unit</option>
                      <option value="laptop">laptop</option>
                      <option value="tiny">tiny</option>
                    </select>
                    <select className="input w-auto" value={q.type} onChange={(e) => update(i, { type: e.target.value })}>
                      <option value="NUMBER">count</option>
                      <option value="CHECK_FAIL">checked + failed</option>
                    </select>
                    <button
                      onClick={() => remove(i)}
                      className="grid h-[46px] w-11 place-items-center rounded-xl text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Removing a question hides it from new forms — past submissions keep their numbers.
          </p>
        </div>
      </div>
    </Modal>
  );
}
