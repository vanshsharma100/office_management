import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, CheckCircle2, Plus, XCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { prettyDate, timeAgo, todayISO } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';

const TYPES = [
  { value: 'SICK', label: 'Sick', hint: 'Paid' },
  { value: 'URGENT', label: 'Urgent', hint: 'Unpaid' },
  { value: 'CASUAL', label: 'Casual', hint: 'Paid' },
  { value: 'EMERGENCY', label: 'Emergency', hint: 'Unpaid' },
  { value: 'HALF_DAY', label: 'Half day', hint: 'Half pay' },
  { value: 'WFH', label: 'Work from home', hint: 'Submit work until 10 PM' },
  { value: 'OTHER', label: 'Other', hint: 'Type your own reason' },
];

/** Which option the approve dialog pre-selects. The approver can always change it. */
const PAID_BY_DEFAULT = ['SICK', 'PAID', 'WFH', 'CASUAL'];

export default function Leave() {
  const { can, isEmployee } = useAuth();
  const [tab, setTab] = useState(can('leave.approve') ? 'requests' : 'mine');

  const tabs = [
    ...(can('leave.approve') ? [{ value: 'requests', label: 'All requests' }] : []),
    { value: 'mine', label: 'My leave' },
  ];

  return (
    <div className="space-y-5">
      {tabs.length > 1 && <Tabs tabs={tabs} active={tab} onChange={setTab} />}
      {tab === 'requests' ? <AllRequests /> : <MyLeave />}
    </div>
  );
}

function AllRequests() {
  const { toast } = useUI();
  const [requests, setRequests] = useState(null);
  const [filter, setFilter] = useState('PENDING');
  const [reviewing, setReviewing] = useState(null);
  const [approving, setApproving] = useState(null);
  const [note, setNote] = useState('');
  // Whether the leave pays is the approver's call, not the leave type's. The
  // type only decides which option is pre-selected.
  const [isPaid, setIsPaid] = useState(true);

  const load = useCallback(() => {
    api
      .get('/leave', { params: { scope: 'all', status: filter === 'ALL' ? undefined : filter } })
      .then((r) => setRequests(r.data.requests))
      .catch((e) => toast(e.message, 'error'));
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id, decision) => {
    try {
      await api.post(`/leave/${id}/review`, {
        decision,
        note: note || null,
        ...(decision === 'APPROVE' ? { isPaid } : {}),
      });
      toast(
        decision === 'APPROVE'
          ? `Approved as ${isPaid ? 'paid' : 'unpaid'} — attendance and salary updated for those days.`
          : 'Rejected. The employee will see it in their leave history.'
      );
      setReviewing(null);
      setApproving(null);
      setNote('');
      setIsPaid(true);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Leave requests"
        subtitle="Approved work-from-home unlocks work submission until 10 PM that day."
        icon={CalendarOff}
      />
      <Tabs
        tabs={[
          { value: 'PENDING', label: 'Pending' },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'ALL', label: 'All' },
        ]}
        active={filter}
        onChange={setFilter}
      />

      {!requests ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <Card>
          <Empty title="Nothing here" hint="No leave requests match this filter." icon={CalendarOff} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={r.user.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{r.user.name}</p>
                    <Badge tone="sky">{r.type.replace('_', ' ').toLowerCase()}</Badge>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {r.user.employeeId} · {prettyDate(r.fromDate)} → {prettyDate(r.toDate)} · asked {timeAgo(r.createdAt)}
                  </p>
                  <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{r.reason}</p>
                  {r.reviewedBy && (
                    <p className="mt-2 text-xs text-ink-500">
                      {r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {r.reviewedBy.name}
                      {r.reviewNote ? ` — ${r.reviewNote}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {r.status === 'PENDING' && (
                <div className="mt-3 flex gap-2 border-t border-ink-200/70 pt-3 dark:border-white/10">
                  <button
                    onClick={() => {
                      setIsPaid(PAID_BY_DEFAULT.includes(r.type));
                      setApproving(r);
                    }}
                    className="btn-success btn-sm flex-1"
                  >
                    <CheckCircle2 size={15} /> Approve
                  </button>
                  <button onClick={() => setReviewing(r)} className="btn-ghost btn-sm flex-1">
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        size="sm"
        title="Reject leave request"
        subtitle={reviewing?.user.name}
        footer={
          <>
            <button onClick={() => setReviewing(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={() => review(reviewing.id, 'REJECT')} className="btn-danger">
              Reject
            </button>
          </>
        }
      >
        <Field label="Note for the employee (optional)">
          <textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      {/* Approving asks the one question salary depends on: does this pay? */}
      <Modal
        open={Boolean(approving)}
        onClose={() => setApproving(null)}
        size="sm"
        title="Approve leave request"
        subtitle={approving ? `${approving.user.name} · ${approving.fromDate} → ${approving.toDate}` : ''}
        footer={
          <>
            <button onClick={() => setApproving(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={() => review(approving.id, 'APPROVE')} className="btn-success">
              Approve as {isPaid ? 'paid' : 'unpaid'}
            </button>
          </>
        }
      >
        <Field label="Does this leave pay?">
          <div className="flex gap-2">
            {[
              { paid: true, label: 'Paid', hint: 'Salary is unaffected' },
              { paid: false, label: 'Unpaid', hint: 'One day of salary is deducted per day' },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={isPaid === opt.paid}
                onClick={() => setIsPaid(opt.paid)}
                className={`flex-1 rounded-lg border p-3 text-left transition ${
                  isPaid === opt.paid
                    ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                    : 'border-ink-200 dark:border-ink-700'
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs opacity-70">{opt.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Note for the employee (optional)" className="mt-4">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function MyLeave() {
  const { toast } = useUI();
  const [requests, setRequests] = useState(null);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ type: 'SICK', fromDate: todayISO(), toDate: todayISO(), reason: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/leave').then((r) => setRequests(r.data.requests)).catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/leave', form);
      toast('Request sent. You will see the decision here.');
      setAsking(false);
      setForm({ type: 'SICK', fromDate: todayISO(), toDate: todayISO(), reason: '' });
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="My leave"
        subtitle="Every request is kept, with the decision and who made it."
        icon={CalendarOff}
        action={
          <button onClick={() => setAsking(true)} className="btn-primary btn-sm">
            <Plus size={15} /> Apply for leave
          </button>
        }
      />

      {!requests ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <Card>
          <Empty
            title="No leave requests yet"
            hint="Apply when you need a day off, work from home, or a half day."
            icon={CalendarOff}
            action={
              <button onClick={() => setAsking(true)} className="btn-primary btn-sm">
                Apply for leave
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {requests.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="sky">{r.type.replace('_', ' ').toLowerCase()}</Badge>
                <StatusBadge status={r.status} />
                <span className="ml-auto text-xs text-ink-500">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm font-semibold">
                {prettyDate(r.fromDate)} → {prettyDate(r.toDate)}
              </p>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{r.reason}</p>
              {r.reviewedBy && (
                <p className="mt-2 rounded-lg bg-ink-100/60 px-3 py-2 text-xs dark:bg-white/5">
                  {r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {r.reviewedBy.name}
                  {r.reviewNote ? ` — ${r.reviewNote}` : ''}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Apply for leave"
        subtitle="Approved work-from-home lets you submit work until 10 PM that day."
        footer={
          <>
            <button onClick={() => setAsking(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={submit} disabled={busy || form.reason.trim().length < 3} className="btn-primary">
              Send request
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Type">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setForm({ ...form, type: t.value })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    form.type === t.value
                      ? 'border-brand-400 bg-brand-500/12'
                      : 'border-ink-200 dark:border-white/10'
                  }`}
                >
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block text-[11px] text-ink-500">{t.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <input
                type="date"
                className="input"
                value={form.fromDate}
                onChange={(e) => setForm({ ...form, fromDate: e.target.value, toDate: e.target.value > form.toDate ? e.target.value : form.toDate })}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className="input"
                min={form.fromDate}
                value={form.toDate}
                onChange={(e) => setForm({ ...form, toDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Reason" hint="A clear reason gets approved faster">
            <textarea
              className="input min-h-24"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g. Fever since last night, will see the doctor in the morning."
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
