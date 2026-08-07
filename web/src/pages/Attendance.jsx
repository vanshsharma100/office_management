import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarPlus,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  PartyPopper,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { addDays, currentMonth, prettyDate, prettyMonth, prettyTime, shiftMonth, todayISO } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';
import { AttendanceDonut } from '../components/charts';

const STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'WFH', 'HOLIDAY'];

export default function Attendance() {
  const { can, isEmployee } = useAuth();
  const [tab, setTab] = useState(can('attendance.view') ? 'board' : 'mine');

  const tabs = [
    ...(can('attendance.view') ? [{ value: 'board', label: 'Daily board' }] : []),
    { value: 'mine', label: 'My attendance' },
    ...(can('holidays.manage') || !isEmployee ? [{ value: 'holidays', label: 'Holidays' }] : []),
  ];

  return (
    <div className="space-y-5">
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'board' && <DailyBoard />}
      {tab === 'mine' && <MyAttendance />}
      {tab === 'holidays' && <Holidays />}
    </div>
  );
}

/** Section 6.1 — who is present, absent, on leave today. */
function DailyBoard() {
  const { can } = useAuth();
  const { toast } = useUI();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [marking, setMarking] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(() => {
    api
      .get('/attendance/day', { params: { date } })
      .then((r) => {
        setData(r.data);
        setSelected(new Set());
      })
      .catch((e) => toast(e.message, 'error'));
  }, [date, toast]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const mark = async (userId, status) => {
    try {
      await api.post('/attendance/mark', { userId, date, status });
      toast('Attendance saved — the correction is in the history log.');
      setMarking(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const bulkMark = async (status) => {
    if (!selected.size) return;
    try {
      const { data: res } = await api.post('/attendance/bulk-mark', {
        date,
        status,
        userIds: [...selected],
      });
      toast(`Marked ${res.updated} as ${status.toLowerCase()}.`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!data) return <Spinner label="Loading attendance" />;

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-between gap-3 p-3">
        <button
          onClick={() => setDate((d) => addDays(d, -1))}
          className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 dark:border-white/10"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-display font-semibold">{prettyDate(date)}</p>
          {data.holiday && (
            <Badge tone="brand">
              <PartyPopper size={11} /> {data.holiday.name}
            </Badge>
          )}
        </div>
        <button
          onClick={() => setDate((d) => addDays(d, 1))}
          disabled={date >= todayISO()}
          className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 disabled:opacity-30 dark:border-white/10"
        >
          <ChevronRight size={18} />
        </button>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="Summary" subtitle={prettyDate(date)} icon={CalendarCheck} />
          <AttendanceDonut summary={data.summary} />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            title="Everyone"
            subtitle={`${data.rows.length} active members`}
            icon={CalendarCheck}
            action={
              can('attendance.edit') &&
              selected.size > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => bulkMark('PRESENT')} className="btn-success btn-sm">
                    <CheckCheck size={14} /> Present ({selected.size})
                  </button>
                  <button onClick={() => bulkMark('ABSENT')} className="btn-ghost btn-sm">
                    Absent
                  </button>
                </div>
              )
            }
          />
          <ul className="space-y-2">
            {data.rows.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                {can('attendance.edit') && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-brand-500"
                    checked={selected.has(r.userId)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.userId)) next.delete(r.userId);
                        else next.add(r.userId);
                        return next;
                      })
                    }
                  />
                )}
                <Avatar name={r.name} size={36} />
                <div className="min-w-0 flex-1">
                  <Link to={`/employees/${r.userId}`} className="block truncate text-sm font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {r.department}
                    {r.record?.checkIn ? ` · in ${prettyTime(r.record.checkIn)}` : ''}
                    {r.record?.checkOut ? ` · out ${prettyTime(r.record.checkOut)}` : ''}
                    {r.record?.markedBy ? ` · by ${r.record.markedBy.name}` : ''}
                  </p>
                </div>
                <button
                  disabled={!can('attendance.edit')}
                  onClick={() => setMarking(r)}
                  className="shrink-0 disabled:cursor-default"
                >
                  <StatusBadge status={r.status} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal
        open={Boolean(marking)}
        onClose={() => setMarking(null)}
        size="sm"
        title={`Mark ${marking?.name}`}
        subtitle={prettyDate(date)}
      >
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => mark(marking.userId, s)}
              className="rounded-xl border border-ink-200 px-3 py-3 text-sm font-semibold capitalize transition hover:border-brand-400 hover:bg-brand-500/10 dark:border-white/10"
            >
              {s.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** Section 8.2 — an employee's own attendance history. */
function MyAttendance() {
  const { toast } = useUI();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [today, setToday] = useState(null);

  const load = useCallback(() => {
    api.get('/attendance/month', { params: { month } }).then((r) => setData(r.data)).catch((e) => toast(e.message, 'error'));
    api.get('/attendance/today').then((r) => setToday(r.data)).catch(() => {});
  }, [month, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const punch = async (kind) => {
    try {
      await api.post(`/attendance/${kind}`);
      toast(kind === 'check-in' ? 'Checked in.' : 'Checked out.');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!data) return <Spinner label="Loading your attendance" />;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-display font-semibold">Today · {prettyDate(todayISO())}</p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {today?.record
              ? `${today.record.status.toLowerCase()} · in ${prettyTime(today.record.checkIn)}${
                  today.record.checkOut ? ` · out ${prettyTime(today.record.checkOut)}` : ''
                }`
              : 'Not marked yet'}
          </p>
        </div>
        <div className="flex gap-2">
          {!today?.record?.checkIn ? (
            <button onClick={() => punch('check-in')} className="btn-primary btn-sm">
              <LogIn size={15} /> Check in
            </button>
          ) : !today?.record?.checkOut ? (
            <button onClick={() => punch('check-out')} className="btn-ghost btn-sm">
              <LogOut size={15} /> Check out
            </button>
          ) : (
            <Badge tone="green">Day complete</Badge>
          )}
        </div>
      </Card>

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

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle title="This month" icon={CalendarCheck} />
          <AttendanceDonut summary={data.summary} />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Day by day" subtitle={prettyMonth(month)} icon={CalendarCheck} />
          {data.records.length === 0 ? (
            <Empty title="Nothing marked this month" icon={CalendarCheck} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.records.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{prettyDate(r.date)}</p>
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {r.hours > 0 ? `${r.hours} h` : ''}
                      {r.markedBy ? ` · marked by ${r.markedBy.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Section 5.4 — declared holidays never reduce anyone's monthly salary. */
function Holidays() {
  const { can } = useAuth();
  const { toast } = useUI();
  const [holidays, setHolidays] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: todayISO(), name: '', nameHi: '', type: 'HOLIDAY' });

  const load = () =>
    api
      .get('/attendance/holidays', { params: { year: new Date().getFullYear() } })
      .then((r) => setHolidays(r.data.holidays))
      .catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      await api.post('/attendance/holidays', { ...form, nameHi: form.nameHi || null });
      toast(
        form.type === 'UNIVERSAL_OFF'
          ? 'Universal off declared. Nobody is marked absent and no salary is deducted.'
          : 'Holiday declared. It will not reduce anyone’s monthly salary.'
      );
      setAdding(false);
      setForm({ date: todayISO(), name: '', nameHi: '', type: 'HOLIDAY' });
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/attendance/holidays/${id}`);
      toast('Holiday removed.');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!holidays) return <Spinner label="Loading holidays" />;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Declared holidays"
        subtitle="A declared holiday is a fully paid day for monthly salaries."
        icon={PartyPopper}
        action={
          can('holidays.manage') && (
            <button onClick={() => setAdding(true)} className="btn-primary btn-sm">
              <CalendarPlus size={15} /> Declare holiday
            </button>
          )
        }
      />

      {holidays.length === 0 ? (
        <Empty title="No holidays declared this year" icon={PartyPopper} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
              <div className="min-w-0">
                <p className="truncate font-semibold">{h.name}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {prettyDate(h.date)}
                  {h.type === 'UNIVERSAL_OFF' ? ' · universal off' : ''}
                </p>
              </div>
              {can('holidays.manage') && (
                <button
                  onClick={() => remove(h.id)}
                  className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title="Declare a holiday"
        footer={
          <>
            <button onClick={() => setAdding(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} disabled={!form.name} className="btn-primary">
              Declare
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type" hint="Both are fully paid and never counted as absent">
            <div className="flex gap-2">
              {[
                { value: 'HOLIDAY', label: 'Holiday', hint: 'A festival or declared holiday' },
                { value: 'UNIVERSAL_OFF', label: 'Universal off', hint: 'Office closed for everyone' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={form.type === opt.value}
                  onClick={() => setForm({ ...form, type: opt.value })}
                  className={`flex-1 rounded-lg border p-3 text-left transition ${
                    form.type === opt.value
                      ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs opacity-70">{opt.hint}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Name">
            <input className="input" placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Hindi label">
            <input className="input" value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
