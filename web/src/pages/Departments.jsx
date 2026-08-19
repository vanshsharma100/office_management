import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Clock, Plus, Settings2, Target, Users, Zap } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { num } from '../lib/format';
import { Badge, Card, Empty, Field, Modal, SectionTitle, Spinner } from '../components/ui';

export default function Departments() {
  const { isSuperAdmin, can } = useAuth();
  const { toast, t } = useUI();
  const [departments, setDepartments] = useState(null);
  const [blocks, setBlocks] = useState({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => {
    api
      .get('/departments')
      .then((r) => setDepartments(r.data.departments))
      .catch((e) => toast(e.message, 'error'));
    if (can('departments.view')) {
      api
        .get('/departments/summary/blocks')
        .then((r) => setBlocks(Object.fromEntries(r.data.blocks.map((b) => [b.id, b]))))
        .catch(() => {});
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAutopilot = async (d) => {
    try {
      await api.post(`/departments/${d.id}/autopilot`, { autopilot: !d.autopilot });
      toast(
        !d.autopilot
          ? `Autopilot ON for ${d.name} — new submissions count immediately.`
          : `Autopilot OFF for ${d.name} — submissions now need approval.`
      );
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!departments) return <Spinner label="Loading departments" />;

  return (
    <div className="space-y-5">
      <SectionTitle
        title={t('Departments', 'विभाग')}
        subtitle="Each department has job roles, and each job role has its own question set."
        icon={Building2}
        action={
          isSuperAdmin && (
            <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
              <Plus size={15} /> Add department
            </button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {departments.map((d) => {
          const block = blocks[d.id];
          const comingSoon = d.status === 'COMING_SOON';

          return (
            <Card key={d.id} className="card-hover flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/departments/${d.id}`} className="block truncate font-display text-lg font-semibold hover:underline">
                    {t(d.name, d.nameHi)}
                  </Link>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {d._count.members} member{d._count.members === 1 ? '' : 's'} · {d.jobRoles.length} job role
                    {d.jobRoles.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={comingSoon ? 'amber' : 'green'}>{comingSoon ? 'coming soon' : 'active'}</Badge>
                  {d.autopilot && (
                    <Badge tone="violet">
                      <Zap size={11} /> autopilot
                    </Badge>
                  )}
                </div>
              </div>

              {comingSoon ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
                  <Clock size={15} /> Module not created yet
                </p>
              ) : (
                <>
                  {block && (
                    <div className="mt-4 flex gap-4">
                      <div>
                        <p className="font-display text-2xl font-bold tabular-nums">{num(block.yesterdayTotal)}</p>
                        <p className="text-[11px] uppercase text-ink-500">yesterday</p>
                      </div>
                      <div>
                        <p className="font-display text-2xl font-bold tabular-nums">{num(block.monthTotal)}</p>
                        <p className="text-[11px] uppercase text-ink-500">this month</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {d.jobRoles.map((r) => (
                      <Badge key={r.id}>
                        {r.name} · {r.questions.length}q
                      </Badge>
                    ))}
                    {d.jobRoles.length === 0 && <span className="text-xs text-ink-500">No job roles yet</span>}
                  </div>
                </>
              )}

              <div className="mt-auto flex items-center gap-2 border-t border-ink-200/70 pt-3 dark:border-white/10">
                {d.target > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500">
                    <Target size={13} /> {num(d.target)}
                  </span>
                )}
                <span className="ml-auto flex gap-1">
                  {isSuperAdmin && (
                    <>
                      <button
                        onClick={() => toggleAutopilot(d)}
                        title="Toggle Autopilot"
                        className={`rounded-lg p-2 transition ${
                          d.autopilot ? 'text-violet-500' : 'text-ink-400 hover:text-violet-500'
                        }`}
                      >
                        <Zap size={15} />
                      </button>
                      <button
                        onClick={() => setEditing(d)}
                        title="Settings"
                        className="rounded-lg p-2 text-ink-400 transition hover:text-brand-500"
                      >
                        <Settings2 size={15} />
                      </button>
                    </>
                  )}
                  <Link
                    to={`/departments/${d.id}`}
                    title="Open"
                    className="rounded-lg p-2 text-ink-400 transition hover:text-brand-500"
                  >
                    <Users size={15} />
                  </Link>
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {creating && <DepartmentModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing && (
        <DepartmentModal
          department={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Section 3F — the Super Admin creates a department; it behaves like the rest. */
function DepartmentModal({ department, onClose, onSaved }) {
  const { toast } = useUI();
  const [form, setForm] = useState({
    name: department?.name ?? '',
    nameHi: department?.nameHi ?? '',
    status: department?.status ?? 'ACTIVE',
    target: department?.target ?? 0,
    targetPeriod: department?.targetPeriod ?? 'MONTH',
    dailyTarget: department?.dailyTarget ?? 0,
    shiftStart: department?.shiftStart ?? '',
    graceMinutes: department?.graceMinutes ?? '',
    halfDayAfter: department?.halfDayAfter ?? '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      // A blank timing is sent as null, which clears the override and hands
      // the department back to the office-wide rules.
      const blankToNull = (v) => (v === '' || v === null ? null : v);
      const payload = {
        ...form,
        target: Number(form.target) || 0,
        dailyTarget: Number(form.dailyTarget) || 0,
        nameHi: form.nameHi || null,
        shiftStart: blankToNull(form.shiftStart),
        halfDayAfter: blankToNull(form.halfDayAfter),
        graceMinutes: form.graceMinutes === '' ? null : Number(form.graceMinutes),
      };
      if (department) await api.patch(`/departments/${department.id}`, payload);
      else await api.post('/departments', payload);
      toast(department ? 'Department updated.' : 'Department created. Add job roles next.');
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
      title={department ? `Edit ${department.name}` : 'Add a department'}
      subtitle="A new department works exactly like the others — only its questions differ."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !form.name} className="btn-primary">
            {department ? 'Save' : 'Create department'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Hindi label" hint="Shown when Hindi is on">
          <input className="input" value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="COMING_SOON">Coming soon</option>
          </select>
        </Field>
        <Field label="Period target" hint="Units for the period — drives pending-against-target">
          <input
            type="number"
            min={0}
            className="input"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
          />
        </Field>
        <Field label="Daily target" hint="Units per person per day — drives the Progress health score">
          <input
            type="number"
            min={0}
            className="input"
            value={form.dailyTarget}
            onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })}
          />
        </Field>

        {/* Only for departments that do not work the office's normal hours. */}
        <div className="rounded-xl border border-ink-200 p-4 sm:col-span-2 dark:border-white/10">
          <p className="text-sm font-semibold">Office timing for this department</p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Leave blank and this department follows the office-wide rules in Attendance sync. A
            single employee can still be given their own timing, which wins over this.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Shift starts">
              <input
                type="time"
                className="input"
                value={form.shiftStart}
                onChange={(e) => setForm({ ...form, shiftStart: e.target.value })}
              />
            </Field>
            <Field label="Grace (minutes)">
              <input
                type="number"
                min={0}
                max={240}
                className="input"
                value={form.graceMinutes}
                onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
              />
            </Field>
            <Field label="Half day after">
              <input
                type="time"
                className="input"
                value={form.halfDayAfter}
                onChange={(e) => setForm({ ...form, halfDayAfter: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
