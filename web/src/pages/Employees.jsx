import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plus, Search, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { money, prettyDate } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, Tabs } from '../components/ui';

const ROLE_TONE = { SUPER_ADMIN: 'violet', ADMIN: 'brand', EMPLOYEE: 'neutral' };

export default function Employees() {
  const { can, isSuperAdmin } = useAuth();
  const { toast } = useUI();
  const [users, setUsers] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('active');
  const [dept, setDept] = useState('');
  const [creating, setCreating] = useState(false);
  const [permissionsFor, setPermissionsFor] = useState(null);
  const [resetFor, setResetFor] = useState(null);

  const load = useCallback(() => {
    api
      .get('/users', { params: { status: status === 'all' ? undefined : status, departmentId: dept || undefined } })
      .then((r) => setUsers(r.data.users))
      .catch((e) => toast(e.message, 'error'));
  }, [status, dept, toast]);

  useEffect(() => {
    load();
    api.get('/departments').then((r) => setDepartments(r.data.departments)).catch(() => {});
  }, [load]);

  const filtered = useMemo(() => {
    if (!users) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) =>
      [u.name, u.username, u.employeeId, u.department?.name].join(' ').toLowerCase().includes(needle)
    );
  }, [users, q]);

  const toggleActive = async (user) => {
    try {
      await api.post(`/users/${user.id}/status`, { isActive: !user.isActive });
      toast(user.isActive ? `${user.name} deactivated. All records kept.` : `${user.name} reactivated.`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Company members"
        subtitle="Accounts are never deleted — leavers are deactivated and their records stay."
        icon={Users}
        action={
          can('employees.create') && (
            <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
              <UserPlus size={15} /> New account
            </button>
          )
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Search name, username or employee ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input w-auto min-w-[150px]" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Tabs
          className="w-full sm:w-auto"
          tabs={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
          active={status}
          onChange={setStatus}
        />
      </Card>

      {!filtered ? (
        <Spinner label="Loading members" />
      ) : filtered.length === 0 ? (
        <Card>
          <Empty title="No members match" hint="Try a different search or filter." icon={Users} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <Card key={u.id} className="card-hover p-4">
              <div className="flex items-start gap-3">
                <Avatar name={u.name} size={44} />
                <div className="min-w-0 flex-1">
                  <Link to={`/employees/${u.id}`} className="block truncate font-semibold hover:underline">
                    {u.name}
                  </Link>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {u.employeeId} · @{u.username}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={ROLE_TONE[u.role]}>{u.role.replace('_', ' ').toLowerCase()}</Badge>
                    {u.department && <Badge>{u.department.name}</Badge>}
                    {u.isManager && <Badge tone="amber">manager</Badge>}
                    {!u.isActive && <Badge tone="red">inactive</Badge>}
                  </div>
                </div>
              </div>

              {u.jobRoles?.length > 0 && (
                <p className="mt-3 truncate text-xs text-ink-500 dark:text-ink-400">
                  {u.jobRoles.map((j) => j.name).join(' · ')}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-200/70 pt-3 dark:border-white/10">
                {can('salary.view') && u.salaryAmount !== undefined && (
                  <span className="text-xs font-semibold text-ink-500">
                    {money(u.salaryAmount)}
                    {u.salaryType === 'HOURLY' ? '/hr' : '/mo'}
                  </span>
                )}
                <span className="ml-auto flex gap-1">
                  {isSuperAdmin && u.role === 'ADMIN' && (
                    <button
                      onClick={() => setPermissionsFor(u)}
                      title="Set permissions"
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-brand-500/10 hover:text-brand-500"
                    >
                      <ShieldCheck size={15} />
                    </button>
                  )}
                  {can('employees.resetPassword') && (
                    <button
                      onClick={() => setResetFor(u)}
                      title="Reset password"
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-amber-500/10 hover:text-amber-500"
                    >
                      <KeyRound size={15} />
                    </button>
                  )}
                  {can('employees.deactivate') && (
                    <button
                      onClick={() => toggleActive(u)}
                      title={u.isActive ? 'Deactivate' : 'Reactivate'}
                      className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <UserX size={15} />
                    </button>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateUserModal
          departments={departments}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {permissionsFor && (
        <PermissionsModal
          user={permissionsFor}
          onClose={() => setPermissionsFor(null)}
          onSaved={() => {
            setPermissionsFor(null);
            load();
          }}
        />
      )}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function CreateUserModal({ departments, onClose, onCreated }) {
  const { isSuperAdmin } = useAuth();
  const { toast } = useUI();
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'EMPLOYEE',
    departmentId: '',
    jobRoleIds: [],
    salaryType: 'MONTHLY',
    salaryAmount: 0,
    phone: '',
    isManager: false,
  });
  const [busy, setBusy] = useState(false);

  const department = departments.find((d) => d.id === form.departmentId);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/users', {
        ...form,
        departmentId: form.departmentId || null,
        salaryAmount: Number(form.salaryAmount) || 0,
        phone: form.phone || null,
      });
      toast(`${form.name} can now sign in as @${form.username}.`);
      onCreated();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create an account"
      subtitle="There is no public signup — every account starts here."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="btn-primary">
            <Plus size={16} /> {busy ? 'Creating…' : 'Create account'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Username" hint="Lowercase, no spaces">
          <input
            className="input"
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
          />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <input
            className="input"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
            {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
          </select>
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
                {d.status === 'COMING_SOON' ? ' (coming soon)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>

        {/* Section 4 — role decides which questions this person will see */}
        {department?.jobRoles?.length > 0 && (
          <Field label="Job role(s)" hint="Their daily form shows only these questions" className="sm:col-span-2">
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
                      on
                        ? 'border-brand-400 bg-brand-500/12 text-brand-600 dark:text-brand-300'
                        : 'border-ink-200 text-ink-500 dark:border-white/10'
                    }`}
                  >
                    {r.name}
                    <span className="ml-1.5 text-xs opacity-60">{r.questions?.length ?? 0}q</span>
                  </button>
                );
              })}
            </div>
          </Field>
        )}

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
            min={0}
            className="input"
            value={form.salaryAmount}
            onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={form.isManager}
            onChange={(e) => setForm({ ...form, isManager: e.target.checked })}
          />
          Manager — only the Super Admin may change their salary
        </label>
      </form>
    </Modal>
  );
}

function PermissionsModal({ user, onClose, onSaved }) {
  const { toast } = useUI();
  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(new Set(user.permissions ?? []));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/users/permission-catalog').then((r) => setCatalog(r.data)).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const map = new Map();
    for (const p of catalog.permissions) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group).push(p);
    }
    return [...map.entries()];
  }, [catalog]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/users/${user.id}/permissions`, { permissions: [...selected] });
      toast(`${user.name}'s access updated.`);
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Access for ${user.name}`}
      subtitle="A section that is switched off does not appear in their menu at all."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            Save access
          </button>
        </>
      }
    >
      {!catalog ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set(catalog.permissions.map((p) => p.key)))}
              className="btn-ghost btn-sm"
            >
              Grant everything
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost btn-sm">
              Clear all
            </button>
          </div>

          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{group}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <label
                    key={p.key}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                      selected.has(p.key)
                        ? 'border-brand-400/60 bg-brand-500/10'
                        : 'border-ink-200 dark:border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-500"
                      checked={selected.has(p.key)}
                      onChange={() => toggle(p.key)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Section 7.2 — cannot be granted by anyone, including the Super Admin */}
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/[.07] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
              Hard limits — always on, cannot be granted
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink-600 dark:text-ink-300">
              {catalog.hardLimits.map((h) => (
                <li key={h}>• {h}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const { toast } = useUI();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword: password });
      toast(`Password reset for ${user.name}. Share it with them directly.`);
      onClose();
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
      title={`Reset password — ${user.name}`}
      subtitle="They will be asked to change it after signing in."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || password.length < 6} className="btn-primary">
            <KeyRound size={16} /> Reset
          </button>
        </>
      }
    >
      <Field label="New password" hint="At least 6 characters">
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <p className="mt-3 text-xs text-ink-500">Account created {prettyDate(user.createdAt)}</p>
    </Modal>
  );
}
