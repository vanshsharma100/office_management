import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Gift,
  Lock,
  LockOpen,
  Users,
  Wallet,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { currentMonth, money, moneyExact, prettyMonth, shiftMonth } from '../lib/format';
import { Badge, Card, Empty, Field, Modal, SectionTitle, Spinner } from '../components/ui';

export default function Salary() {
  const { can } = useAuth();
  return can('salary.view') ? <Payroll /> : <MySalary />;
}

/** Section 12.2 — a running figure, not only the month-end total. */
function MySalary() {
  const { toast } = useUI();
  const [month, setMonth] = useState(currentMonth());
  const [salary, setSalary] = useState(null);

  useEffect(() => {
    setSalary(null);
    api.get('/salary/me', { params: { month } }).then((r) => setSalary(r.data.salary)).catch((e) => toast(e.message, 'error'));
  }, [month, toast]);

  if (!salary) return <Spinner label="Loading your salary" />;

  return (
    <div className="space-y-5">
      <SectionTitle title="My salary" subtitle="Updated as the month goes, so errors get spotted early." icon={Wallet} />

      <MonthSwitcher month={month} setMonth={setMonth} />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-white shadow-lift">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <p className="relative text-sm text-white/70">Salary so far · {prettyMonth(month)}</p>
        <p className="relative mt-1 font-display text-4xl font-bold tabular-nums sm:text-5xl">{moneyExact(salary.net)}</p>
        <p className="relative mt-2 text-sm text-white/70">
          {salary.paidDays} paid day{salary.paidDays === 1 ? '' : 's'} of {salary.daysInMonth}
          {salary.salaryType === 'HOURLY' ? ` · ${salary.hours} hours` : ''}
        </p>
        {salary.locked && (
          <Badge tone="amber" className="relative mt-3">
            <Lock size={11} /> month locked — paid
          </Badge>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Breakdown" icon={Wallet} />
          <dl className="space-y-3">
            <Row label={`Base (${salary.salaryType.toLowerCase()})`} value={moneyExact(salary.base)} />
            <Row
              label={salary.salaryType === 'MONTHLY' ? 'Per day rate' : 'Hourly rate'}
              value={moneyExact(salary.salaryType === 'MONTHLY' ? salary.perDay : salary.salaryAmount)}
            />
            <Row label="Incentive" value={`+ ${moneyExact(salary.incentive)}`} tone="green" />
            <Row label="Bonus" value={`+ ${moneyExact(salary.bonus)}`} tone="green" />
            <Row label="Deduction" value={`− ${moneyExact(salary.deduction)}`} tone="red" />
            <div className="border-t border-ink-200/70 pt-3 dark:border-white/10">
              <Row label="Net payable" value={moneyExact(salary.net)} big />
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Attendance counted" subtitle="Declared holidays are fully paid" icon={Users} />
          <dl className="space-y-3">
            {Object.entries(salary.counts).map(([k, v]) => (
              <Row key={k} label={k.replace('_', ' ').toLowerCase()} value={v} />
            ))}
          </dl>

          {salary.items.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-500">Extras</p>
              <ul className="space-y-2">
                {salary.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold capitalize">{i.type.toLowerCase()}</p>
                      <p className="truncate text-xs text-ink-500">{i.note || '—'}</p>
                    </div>
                    <span className={`shrink-0 font-bold ${i.type === 'DEDUCTION' ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {i.type === 'DEDUCTION' ? '−' : '+'} {money(i.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Sections 12.3 / 12.4 — payroll sheet, month lock, CSV export. */
function Payroll() {
  const { can, isSuperAdmin } = useAuth();
  const { toast } = useUI();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    api
      .get('/salary/payroll', { params: { month } })
      .then((r) => setData(r.data))
      .catch((e) => toast(e.message, 'error'));
  }, [month, toast]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/salary/payroll/export', { params: { month }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Payroll exported.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const lock = async () => {
    try {
      await api.post('/salary/locks', { month });
      toast(`${prettyMonth(month)} locked. No further edits to its records.`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const unlock = async () => {
    try {
      await api.post(`/salary/locks/${month}/unlock`, { reason });
      toast('Unlocked. The reason is recorded in the history log.');
      setUnlocking(false);
      setReason('');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!data) return <Spinner label="Building the payroll sheet" />;
  const locked = data.lock?.isLocked;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Payroll"
        subtitle="Once a month is paid, lock it. Unlocking is recorded with who did it and why."
        icon={Wallet}
        action={
          <div className="flex flex-wrap gap-2">
            {can('salary.edit') && (
              <button onClick={() => setBulk(true)} className="btn-ghost btn-sm">
                <Gift size={15} /> Apply to everyone
              </button>
            )}
            {can('salary.export') && (
              <button onClick={exportCsv} className="btn-ghost btn-sm">
                <Download size={15} /> Export CSV
              </button>
            )}
            {isSuperAdmin &&
              (locked ? (
                <button onClick={() => setUnlocking(true)} className="btn-ghost btn-sm">
                  <LockOpen size={15} /> Unlock month
                </button>
              ) : (
                <button onClick={lock} className="btn-primary btn-sm">
                  <Lock size={15} /> Lock month
                </button>
              ))}
          </div>
        }
      />

      <MonthSwitcher month={month} setMonth={setMonth} />

      {locked && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/[.08] px-4 py-3">
          <Lock size={18} className="text-amber-500" />
          <p className="text-sm">
            <strong>{prettyMonth(month)} is locked.</strong> Attendance, work records and salary figures for this
            month cannot be edited.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Total label="Base" value={data.totals.base} />
        <Total label="Incentive" value={data.totals.incentive} tone="green" />
        <Total label="Bonus" value={data.totals.bonus} tone="green" />
        <Total label="Deduction" value={data.totals.deduction} tone="red" />
        <Total label="Net payable" value={data.totals.net} big />
      </div>

      <div className="table-wrap">
        <table className="w-full">
          <thead className="border-b border-ink-200/70 dark:border-white/10">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Department</th>
              <th className="th">Type</th>
              <th className="th text-right">Paid days</th>
              <th className="th text-right">Base</th>
              <th className="th text-right">Incentive</th>
              <th className="th text-right">Bonus</th>
              <th className="th text-right">Deduction</th>
              <th className="th text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200/60 dark:divide-white/5">
            {data.rows.map((r) => (
              <tr key={r.userId} className="transition hover:bg-brand-500/[.04]">
                <td className="td">
                  <Link to={`/employees/${r.userId}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <span className="block text-xs text-ink-500">{r.employeeId}</span>
                </td>
                <td className="td">{r.department}</td>
                <td className="td capitalize">{r.salaryType.toLowerCase()}</td>
                <td className="td text-right tabular-nums">{r.paidDays}</td>
                <td className="td text-right tabular-nums">{money(r.base)}</td>
                <td className="td text-right tabular-nums text-emerald-500">{r.incentive ? money(r.incentive) : '—'}</td>
                <td className="td text-right tabular-nums text-emerald-500">{r.bonus ? money(r.bonus) : '—'}</td>
                <td className="td text-right tabular-nums text-rose-500">{r.deduction ? money(r.deduction) : '—'}</td>
                <td className="td text-right font-bold tabular-nums">{money(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.rows.length === 0 && <Empty title="No employees" icon={Users} />}
      </div>

      {bulk && <BulkPayModal month={month} onClose={() => setBulk(false)} onSaved={() => { setBulk(false); load(); }} />}

      <Modal
        open={unlocking}
        onClose={() => setUnlocking(false)}
        size="sm"
        title={`Unlock ${prettyMonth(month)}`}
        subtitle="The unlock is stored in history along with who did it and why."
        footer={
          <>
            <button onClick={() => setUnlocking(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={unlock} disabled={reason.trim().length < 3} className="btn-primary">
              Unlock
            </button>
          </>
        }
      >
        <Field label="Reason">
          <textarea
            className="input min-h-24"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Correcting Sandeep's attendance for the 14th."
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
}

/** Section 5.3 — a fixed incentive or bonus applied to everyone at once. */
function BulkPayModal({ month, onClose, onSaved }) {
  const { toast } = useUI();
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({ type: 'INCENTIVE', amount: '', note: '', departmentId: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.departments)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/salary/pay-items', {
        type: form.type,
        amount: Number(form.amount),
        month,
        note: form.note || null,
        applyToAll: true,
        departmentId: form.departmentId || null,
      });
      toast(
        `Applied to ${data.created} employee(s)` + (data.skipped ? ` · ${data.skipped} skipped (managers / yourself)` : '')
      );
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
      title="Apply to everyone at once"
      subtitle={`${prettyMonth(month)} · managers and your own record are skipped`}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !form.amount} className="btn-primary">
            Apply
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
        <Field label="Amount per person (₹)">
          <input
            type="number"
            min={1}
            className="input"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Limit to a department" hint="Leave empty to apply company wide">
          <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">Everyone</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function MonthSwitcher({ month, setMonth }) {
  return (
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
  );
}

function Row({ label, value, tone, big }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sm capitalize text-ink-500 dark:text-ink-400">{label}</dt>
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

function Total({ label, value, tone, big }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={`mt-2 font-display font-bold tabular-nums ${big ? 'text-2xl' : 'text-xl'} ${
          tone === 'green' ? 'text-emerald-500' : tone === 'red' ? 'text-rose-500' : ''
        }`}
      >
        {money(value)}
      </p>
    </Card>
  );
}
