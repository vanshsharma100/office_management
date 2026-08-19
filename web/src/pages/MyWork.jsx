import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudOff,
  Clock,
  History,
  Lock,
  RotateCcw,
  Save,
  Send,
  UserCog,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { addDays, num, prettyDate, prettyDateTime, todayISO } from '../lib/format';
import { Badge, Card, Empty, Field, SectionTitle, Spinner, StatusBadge, Stepper, Tabs } from '../components/ui';
import { WorkTrend } from '../components/charts';

/** Section 16.2 — whatever is typed survives bad warehouse wifi. */
const draftKey = (userId, date) => `ftech_draft_${userId}_${date}`;

export default function MyWork() {
  const { user } = useAuth();
  const { t, toast } = useUI();
  const [date, setDate] = useState(todayISO());
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  // Anything that went wrong today. Reaches the approver with the numbers, so
  // a low count arrives with its reason instead of looking like slack work.
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('today');
  const [history, setHistory] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/work/form', { params: { date } });
      setForm(data);

      // Server values first, then anything kept on the device on top.
      const base = {};
      for (const g of data.groups ?? []) {
        for (const q of g.questions) base[q.id] = { value: 0, failedValue: 0 };
      }
      for (const e of data.submission?.entries ?? []) {
        base[e.questionId] = { value: e.value, failedValue: e.failedValue };
      }

      const draft = localStorage.getItem(draftKey(user.id, date));
      if (draft && data.submission?.status !== 'APPROVED') {
        try {
          const parsed = JSON.parse(draft);
          for (const [k, v] of Object.entries(parsed)) if (base[k]) base[k] = v;
          setDirty(true);
        } catch {
          /* a corrupt draft is not worth blocking the form for */
        }
      }
      setValues(base);
      setNote(data.submission?.note ?? '');
      loadedFor.current = date;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [date, user.id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'history' && !history) {
      api.get('/work/history').then((r) => setHistory(r.data)).catch(() => {});
    }
  }, [tab, history]);

  // Persist to the device on every change — the whole point of 16.2.
  useEffect(() => {
    if (!dirty || loadedFor.current !== date) return;
    localStorage.setItem(draftKey(user.id, date), JSON.stringify(values));
  }, [values, dirty, date, user.id]);

  const setValue = (questionId, field, v) => {
    setDirty(true);
    setValues((prev) => ({ ...prev, [questionId]: { ...prev[questionId], [field]: v } }));
  };

  const total = useMemo(
    () => Object.values(values).reduce((a, v) => a + (Number(v?.value) || 0), 0),
    [values]
  );

  const submit = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(values).map(([questionId, v]) => ({
        questionId,
        value: Number(v.value) || 0,
        failedValue: Number(v.failedValue) || 0,
      }));
      const { data } = await api.post('/work/submit', { date, entries, note: note.trim() || null });
      localStorage.removeItem(draftKey(user.id, date));
      setDirty(false);
      toast(
        data.autopilot
          ? 'Submitted. Autopilot is on, so it counts immediately.'
          : 'Submitted. It will count once an admin approves it.'
      );
      setHistory(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey(user.id, date));
    setDirty(false);
    load();
  };

  if (loading && !form) return <Spinner label="Opening your form" />;

  if (form?.comingSoon) {
    return (
      <Card className="p-8">
        <Empty
          title={t('Coming Soon', 'जल्द आ रहा है')}
          hint="This department module is not created yet. Everything else in your panel works as normal."
          icon={Clock}
        />
      </Card>
    );
  }

  const locked = form?.locked;
  const status = form?.submission?.status;

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { value: 'today', label: t('Submit work', 'काम भरें') },
          { value: 'history', label: t('My history', 'इतिहास') },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'today' ? (
        <>
          {/* Date strip — the form can be filled through the day (16.1) */}
          <Card className="flex items-center justify-between gap-3 p-3">
            <button
              onClick={() => setDate((d) => addDays(d, -1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 dark:border-white/10"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="font-display font-semibold">{prettyDate(date)}</p>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {date === todayISO() ? 'Today' : 'Past day'} · {form?.department?.name}
              </p>
            </div>
            <button
              onClick={() => setDate((d) => addDays(d, 1))}
              disabled={date >= todayISO()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 text-ink-500 disabled:opacity-30 dark:border-white/10"
            >
              <ChevronRight size={18} />
            </button>
          </Card>

          {/* Status banners */}
          {offline && (
            <Banner tone="amber" icon={CloudOff} title="You are offline">
              Keep filling — your numbers are saved on this device and can be submitted when the
              connection returns.
            </Banner>
          )}
          {status === 'REJECTED' && (
            <Banner tone="red" icon={XCircle} title="Sent back for correction">
              {form.submission.rejectionReason || 'Please correct and submit again.'}
            </Banner>
          )}
          {status === 'APPROVED' && (
            <Banner tone="green" icon={CheckCircle2} title="Approved and locked">
              Reviewed by {form.submission.reviewedBy?.name ?? 'an admin'} on{' '}
              {prettyDateTime(form.submission.reviewedAt)}. Only an Admin can change it now.
            </Banner>
          )}
          {status === 'PENDING' && (
            <Banner tone="amber" icon={Clock} title="Waiting for approval">
              You can still edit it until it is approved.
            </Banner>
          )}
          {form?.submission?.isBackfilled && (
            <Banner tone="brand" icon={UserCog} title="Entered by an Admin">
              {form.submission.submittedBy?.name} entered this on your behalf.
            </Banner>
          )}
          {!form?.canSubmit && !locked && (
            <Banner tone="red" icon={AlertTriangle} title="Submission closed">
              {form?.blockedReason}
            </Banner>
          )}
          {form?.autopilot && (
            <Banner tone="violet" icon={CheckCircle2} title="Autopilot is on">
              Your submission counts straight away — no approval needed.
            </Banner>
          )}

          {/* The form: only this person's role questions (Section 4).
              A failed load leaves `form` null — without the `?? []` the map
              below throws and the whole screen goes blank, which reads as the
              app being broken rather than the request having failed. */}
          {(form?.groups ?? []).length === 0 ? (
            <Card>
              {form ? (
                <Empty
                  title="No job role assigned"
                  hint="Ask your Admin to assign your job role so your questions appear here."
                  icon={ClipboardList}
                />
              ) : (
                <Empty
                  title="Could not open your form"
                  hint="Check your connection and pull to refresh, or try again in a moment."
                  icon={CloudOff}
                />
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {(form?.groups ?? []).map((group) => (
                <Card key={group.jobRoleId} className="p-5">
                  <SectionTitle
                    title={t(group.jobRole, group.jobRoleHi)}
                    subtitle={`${group.questions.length} question${group.questions.length === 1 ? '' : 's'} for your role`}
                    icon={ClipboardList}
                  />
                  <div className="space-y-5">
                    {group.questions.map((q) => (
                      <div key={q.id}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <label className="text-sm font-semibold">
                            {t(q.label, q.labelHi)}
                            {q.unit && (
                              <span className="ml-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-500 dark:bg-white/10 dark:text-ink-300">
                                {q.unit}
                              </span>
                            )}
                          </label>
                        </div>

                        <Stepper
                          value={values[q.id]?.value ?? 0}
                          onChange={(v) => setValue(q.id, 'value', v)}
                          disabled={locked || !form.canSubmit}
                          label={q.label}
                        />

                        {/* Section 9.2 — checked and failed, giving a defect rate */}
                        {q.type === 'CHECK_FAIL' && (
                          <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/[.06] p-3">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-rose-500">
                              {t('Failed', 'फेल')} — how many did not pass
                            </p>
                            <Stepper
                              value={values[q.id]?.failedValue ?? 0}
                              onChange={(v) => setValue(q.id, 'failedValue', Math.min(v, values[q.id]?.value ?? 0))}
                              max={values[q.id]?.value ?? 0}
                              disabled={locked || !form.canSubmit}
                              label={`${q.label} failed`}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <HistoryTab history={history} />
      )}

      {/* Last box before submitting: anything that went wrong today. It travels
          with the numbers, so a low count reaches the approver with its reason. */}
      {tab === 'today' && form?.groups?.length > 0 && (
        <Card className="p-5">
          <Field
            label="Any problem with the work today?"
            hint="Optional — machine down, material short, anything the approver should know"
          >
            <textarea
              className="input min-h-20"
              value={note}
              onChange={(e) => {
                setDirty(true);
                setNote(e.target.value);
              }}
              disabled={locked || !form.canSubmit}
              placeholder="e.g. Printer stopped working after lunch, waiting for a part."
            />
          </Field>
        </Card>
      )}

      {/* Sticky submit bar — thumb reach on a phone */}
      {tab === 'today' && form?.groups?.length > 0 && (
        <div className="sticky bottom-20 z-20 lg:bottom-4">
          <Card className="flex items-center gap-3 border-brand-400/30 p-3 shadow-lift backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold tabular-nums">{num(total)} units</p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {dirty ? (
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <Save size={11} /> saved on this device
                  </span>
                ) : status ? (
                  <>Last submitted {prettyDateTime(form.submission.submittedAt)}</>
                ) : (
                  'Nothing submitted yet'
                )}
              </p>
            </div>
            {dirty && (
              <button onClick={clearDraft} className="btn-ghost btn-sm" title="Discard local draft">
                <RotateCcw size={14} />
              </button>
            )}
            <button
              onClick={submit}
              disabled={saving || locked || !form.canSubmit}
              className="btn-primary shrink-0"
            >
              {locked ? <Lock size={16} /> : <Send size={16} />}
              {locked ? 'Locked' : saving ? 'Saving…' : status ? 'Update' : 'Submit'}
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ history }) {
  if (!history) return <Spinner label="Loading your history" />;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle title="Work progress" subtitle="Approved units, last 30 days" icon={History} />
        <WorkTrend data={history.series} />
      </Card>

      <Card className="p-5">
        <SectionTitle title="Totals this month" subtitle="Only approved work counts" icon={CheckCircle2} />
        {history.totals.rows.length === 0 ? (
          <Empty title="No approved work yet this month" icon={ClipboardList} />
        ) : (
          <ul className="space-y-2">
            {history.totals.rows.map((r) => (
              <li key={r.questionId} className="flex items-center justify-between gap-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.label}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">{r.jobRole}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.type === 'CHECK_FAIL' && r.failed > 0 && <Badge tone="red">{r.failed} failed</Badge>}
                  <span className="font-display font-bold tabular-nums">{num(r.value)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle title="Submissions" subtitle="This month, day by day" icon={ClipboardList} />
        {history.submissions.length === 0 ? (
          <Empty title="No submissions this month" icon={ClipboardList} />
        ) : (
          <ul className="space-y-2">
            {history.submissions.map((s) => (
              <li key={s.id} className="rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{prettyDate(s.date)}</p>
                    <StatusBadge status={s.status} />
                    {s.isBackfilled && (
                      <Badge tone="brand">
                        <UserCog size={11} /> by {s.submittedBy?.name?.split(' ')[0] ?? 'admin'}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums">
                    {s.entries.reduce((a, e) => a + e.value, 0)} units
                  </span>
                </div>
                {s.rejectionReason && (
                  <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                    Rejected: {s.rejectionReason}
                  </p>
                )}
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {s.entries.filter((e) => e.value > 0).map((e) => (
                    <li key={e.id} className="flex justify-between gap-3 text-xs">
                      <span className="truncate text-ink-500 dark:text-ink-400">{e.question.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {e.value}
                        {e.question.type === 'CHECK_FAIL' && e.failedValue > 0 && (
                          <span className="text-rose-500"> ({e.failedValue} failed)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const BANNER_TONES = {
  amber: 'border-amber-400/30 bg-amber-500/[.08] text-amber-600 dark:text-amber-300',
  red: 'border-rose-400/30 bg-rose-500/[.08] text-rose-600 dark:text-rose-300',
  green: 'border-emerald-400/30 bg-emerald-500/[.08] text-emerald-600 dark:text-emerald-300',
  brand: 'border-brand-400/30 bg-brand-500/[.08] text-brand-600 dark:text-brand-300',
  violet: 'border-violet-400/30 bg-violet-500/[.08] text-violet-600 dark:text-violet-300',
};

function Banner({ tone, icon: Icon, title, children }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${BANNER_TONES[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">{children}</p>
      </div>
    </div>
  );
}
