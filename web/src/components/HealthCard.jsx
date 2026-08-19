import { useCallback, useEffect, useState } from 'react';
import { Activity, Ban, Info, Save } from 'lucide-react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { Card, Field, SectionTitle, Spinner } from './ui';

/**
 * One employee's health scorecard for a month.
 *
 * The same card serves two people. An admin gets editable fields, an N/A
 * toggle and a Save button; an employee sees their own scores read-only. The
 * three computed qualities show what the app worked out and why, so a typed
 * override is a considered change rather than a blind one.
 */
export default function HealthCard({ userId, month, readOnly = false }) {
  const { toast } = useUI();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [na, setNa] = useState(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const url = readOnly ? '/health-score/mine' : `/health-score/user/${userId}`;
    api
      .get(url, { params: { month } })
      .then((r) => {
        setData(r.data);
        setDraft(Object.fromEntries(r.data.metrics.map((m) => [m.key, m.value ?? ''])));
        setNa(new Set(r.data.metrics.filter((m) => m.na).map((m) => m.key)));
        setNote(r.data.note ?? '');
      })
      .catch((e) => toast(e.message, 'error'));
  }, [userId, month, readOnly, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Spinner label="Loading health scorecard" />;

  const editable = data.canEdit && !readOnly;

  const setScore = (key, raw) => {
    const v = raw === '' ? '' : Math.max(0, Math.min(10, Number(raw)));
    setDraft((d) => ({ ...d, [key]: v }));
  };

  const toggleNa = (key) => {
    setNa((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // The live average of what is on screen, so the total moves as you type.
  const liveTotal = () => {
    const vals = data.metrics
      .filter((m) => !na.has(m.key))
      .map((m) => {
        const raw = draft[m.key];
        if (raw !== '' && raw != null) return Number(raw);
        return m.auto ? m.computed : null; // auto falls back to computed
      })
      .filter((v) => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };

  const save = async () => {
    setBusy(true);
    try {
      const scores = {};
      for (const m of data.metrics) {
        if (na.has(m.key)) continue;
        const raw = draft[m.key];
        if (raw !== '' && raw != null) scores[m.key] = Number(raw);
      }
      const { data: saved } = await api.put(`/health-score/user/${userId}`, {
        month,
        scores,
        naKeys: [...na],
        note: note.trim() || null,
      });
      setData((d) => ({ ...d, ...saved }));
      toast('Health scorecard saved.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const total = editable ? liveTotal() : data.total;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Employee health"
        subtitle="Ten qualities out of ten. N/A ones are left out of the average."
        icon={Activity}
        action={
          <div className="text-right">
            <p className="font-display text-3xl font-bold tabular-nums">
              {total != null ? total.toFixed(1) : '—'}
              <span className="text-base font-medium text-ink-400"> / 10</span>
            </p>
            <p className="text-[11px] text-ink-500">overall</p>
          </div>
        }
      />

      <div className="space-y-2">
        {data.metrics.map((m) => {
          const isNa = na.has(m.key);
          const shown = isNa
            ? null
            : draft[m.key] !== '' && draft[m.key] != null
              ? Number(draft[m.key])
              : m.auto
                ? m.computed
                : null;

          return (
            <div
              key={m.key}
              className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                isNa ? 'border-ink-200/60 opacity-60 dark:border-white/5' : 'border-ink-200/70 dark:border-white/10'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {m.label}
                  {m.auto && (
                    <span className="rounded bg-brand-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                      auto
                    </span>
                  )}
                </p>
                {m.auto && m.detail && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                    <Info size={11} /> {m.detail}
                    {m.computed != null && ` → ${m.computed.toFixed(1)}/10`}
                  </p>
                )}
              </div>

              {editable ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    disabled={isNa}
                    value={isNa ? '' : draft[m.key]}
                    onChange={(e) => setScore(m.key, e.target.value)}
                    placeholder={m.auto && m.computed != null ? m.computed.toFixed(1) : '—'}
                    className="input w-20 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => toggleNa(m.key)}
                    title="Not applicable"
                    className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                      isNa
                        ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                        : 'border-ink-200 text-ink-400 dark:border-white/10'
                    }`}
                  >
                    <Ban size={15} />
                  </button>
                </div>
              ) : (
                <span className="font-display text-lg font-bold tabular-nums">
                  {isNa ? <span className="text-sm font-medium text-ink-400">N/A</span> : shown != null ? shown.toFixed(1) : '—'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <>
          <Field label="Note (optional)" className="mt-4">
            <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button onClick={save} disabled={busy} className="btn-primary mt-4">
            <Save size={16} /> {busy ? 'Saving…' : 'Save scorecard'}
          </button>
        </>
      )}
    </Card>
  );
}
