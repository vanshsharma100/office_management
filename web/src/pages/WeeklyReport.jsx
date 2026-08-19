import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, CheckCircle2, ClipboardList, Clock, TriangleAlert } from 'lucide-react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { prettyDate } from '../lib/format';
import { Badge, Card, Empty, Field, SectionTitle, Spinner } from '../components/ui';

/**
 * The weekly report, as the employee fills it.
 *
 * Name, department and the week are never asked for — they come from the
 * account and the calendar. Only the answers are typed.
 */
export const QUESTIONS = [
  { key: 'tasksAssigned', label: 'What work were you given this week?', required: true },
  { key: 'tasksCompleted', label: 'What did you finish?', required: true },
  { key: 'pendingTasks', label: 'What is still pending, and why?' },
  { key: 'keyAchievement', label: 'Your best work this week' },
  { key: 'challenges', label: 'Anything blocking you?' },
  { key: 'nextWeekPlan', label: 'Plan for next week' },
  { key: 'supportRequired', label: 'Any help you need from your lead or MD?' },
];

const BLANK = Object.fromEntries(QUESTIONS.map((q) => [q.key, '']));

export const WEEK_STATUS = {
  SUBMITTED: { label: 'Submitted', tone: 'green', icon: CheckCircle2 },
  DUE: { label: 'Due now', tone: 'amber', icon: Clock },
  MISSING: { label: 'Missing', tone: 'red', icon: TriangleAlert },
  NOT_YET_OPEN: { label: 'Not open yet', tone: 'neutral', icon: Clock },
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WeeklyReportPage() {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get('/weekly/mine')
      .then((r) => {
        setData(r.data);
        const current = r.data.weeks[0];
        // Re-opening a submitted week shows what was written, so a correction
        // is an edit rather than typing the whole thing again.
        setForm(current?.report ? { ...BLANK, ...pick(current.report) } : BLANK);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/weekly', form);
      toast('Weekly report submitted.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Spinner label="Loading your weekly report" />;

  const [current, ...past] = data.weeks;
  const ready = form.tasksAssigned.trim() && form.tasksCompleted.trim();

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Weekly report"
        subtitle={
          data.config.enabled
            ? `Opens every ${DAYS[data.config.openDay]} and stays open until the week ends.`
            : 'The weekly report is switched off at the moment.'
        }
        icon={ClipboardList}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange size={16} className="text-ink-400" />
          <p className="font-semibold">
            Week of {prettyDate(current.weekStart)} — {prettyDate(current.weekEnd)}
          </p>
          <StatusBadge status={current.status} />
        </div>

        {current.status === 'NOT_YET_OPEN' ? (
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            This week's report opens on {prettyDate(current.opensOn)}. Come back then.
          </p>
        ) : !data.config.enabled ? (
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            Nothing to fill in — your office has the weekly report turned off.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {QUESTIONS.map((q) => (
              <Field key={q.key} label={q.label} hint={q.required ? 'Required' : undefined}>
                <textarea
                  className="input min-h-20"
                  value={form[q.key]}
                  onChange={(e) => setForm({ ...form, [q.key]: e.target.value })}
                  placeholder={q.required ? '' : 'Leave blank if there is nothing to say'}
                />
              </Field>
            ))}
            <button type="submit" className="btn-primary" disabled={busy || !ready}>
              {busy ? 'Saving…' : current.report ? 'Update this week' : 'Submit weekly report'}
            </button>
            {current.report && (
              <p className="text-xs text-ink-500">
                You can keep changing this until the week ends.
              </p>
            )}
          </form>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle title="Previous weeks" icon={CalendarRange} />
        {past.length === 0 ? (
          <Empty title="Nothing yet" hint="Past weeks will show here." icon={CalendarRange} />
        ) : (
          <ul className="space-y-2">
            {past.map((w) => (
              <li
                key={w.weekStart}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-100/60 px-4 py-3 dark:bg-white/5"
              >
                <span className="text-sm font-medium">
                  {prettyDate(w.weekStart)} — {prettyDate(w.weekEnd)}
                </span>
                <StatusBadge status={w.status} className="ml-auto" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function StatusBadge({ status, className }) {
  const s = WEEK_STATUS[status] ?? WEEK_STATUS.NOT_YET_OPEN;
  return (
    <Badge tone={s.tone} className={className}>
      <s.icon size={11} /> {s.label}
    </Badge>
  );
}

const pick = (report) =>
  Object.fromEntries(QUESTIONS.map((q) => [q.key, report[q.key] ?? '']));
