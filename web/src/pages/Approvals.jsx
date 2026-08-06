import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, CheckCircle2, ShieldCheck, UserCog, XCircle } from 'lucide-react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { num, prettyDate, prettyDateTime } from '../lib/format';
import { Avatar, Badge, Card, Empty, Modal, SectionTitle, Spinner } from '../components/ui';

/** Section 10 — submitted work does not count until it is accepted. */
export default function Approvals() {
  const { toast } = useUI();
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get('/work/pending')
      .then((r) => {
        setRows(r.data.submissions);
        setSelected(new Set());
      })
      .catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of rows ?? []) {
      const key = s.user.department?.name ?? 'No department';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return [...map.entries()];
  }, [rows]);

  const review = async (id, decision, why) => {
    setBusy(true);
    try {
      await api.post(`/work/${id}/review`, { decision, reason: why });
      toast(decision === 'APPROVE' ? 'Approved — it now counts.' : 'Sent back to the employee.');
      setReject(null);
      setReason('');
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (decision) => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const { data } = await api.post('/work/bulk-review', {
        ids: [...selected],
        decision,
        reason: decision === 'REJECT' ? 'Bulk rejected — please check and resubmit' : null,
      });
      toast(
        `${decision === 'APPROVE' ? 'Approved' : 'Rejected'} ${data.updated}` +
          (data.skipped ? ` · ${data.skipped} skipped (your own)` : '')
      );
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!rows) return <Spinner label="Loading the approval queue" />;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Pending approvals"
        subtitle={`${rows.length} submission${rows.length === 1 ? '' : 's'} waiting. Nothing counts until it is approved.`}
        icon={ShieldCheck}
        action={
          selected.size > 0 && (
            <div className="flex gap-2">
              <button onClick={() => bulk('APPROVE')} disabled={busy} className="btn-success btn-sm">
                <CheckCheck size={15} /> Approve {selected.size}
              </button>
              <button onClick={() => bulk('REJECT')} disabled={busy} className="btn-ghost btn-sm">
                <XCircle size={15} /> Reject
              </button>
            </div>
          )
        }
      />

      {rows.length === 0 ? (
        <Card>
          <Empty
            title="All clear"
            hint="Every submission has been reviewed. Autopilot departments skip this queue entirely."
            icon={CheckCircle2}
          />
        </Card>
      ) : (
        grouped.map(([dept, items]) => (
          <div key={dept}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">{dept}</h3>
              <Badge tone="amber">{items.length}</Badge>
              <button
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    const allIn = items.every((i) => next.has(i.id));
                    items.forEach((i) => (allIn ? next.delete(i.id) : next.add(i.id)));
                    return next;
                  })
                }
                className="ml-auto text-xs font-semibold text-brand-600 dark:text-brand-300"
              >
                Select all
              </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((s) => {
                const total = s.entries.reduce((a, e) => a + e.value, 0);
                const failed = s.entries.reduce((a, e) => a + e.failedValue, 0);

                return (
                  <Card key={s.id} className="overflow-hidden">
                    <label className="flex cursor-pointer items-start gap-3 border-b border-ink-200/70 p-4 dark:border-white/10">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <Avatar name={s.user.name} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{s.user.name}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          {s.user.employeeId} · {s.user.jobRoles.map((j) => j.jobRole?.name).join(', ') || '—'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-xl font-bold tabular-nums">{num(total)}</p>
                        <p className="text-[11px] text-ink-500">{prettyDate(s.date)}</p>
                      </div>
                    </label>

                    <div className="space-y-1.5 p-4">
                      {s.isBackfilled && (
                        <Badge tone="brand" className="mb-2">
                          <UserCog size={11} /> entered by {s.submittedBy?.name ?? 'an admin'}
                        </Badge>
                      )}
                      {s.entries
                        .filter((e) => e.value > 0 || e.failedValue > 0)
                        .map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-ink-500 dark:text-ink-400">{e.question.label}</span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {e.value}
                              {e.question.type === 'CHECK_FAIL' && (
                                <span className={e.failedValue > 0 ? 'text-rose-500' : 'text-emerald-500'}>
                                  {' '}
                                  ({e.failedValue} failed)
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      {total === 0 && <p className="text-sm text-ink-500">All zero — nothing done that day.</p>}
                      {failed > 0 && (
                        <p className="pt-1 text-xs font-semibold text-rose-500">
                          Defect rate {Math.round((failed / Math.max(1, total)) * 1000) / 10}%
                        </p>
                      )}
                      <p className="pt-2 text-[11px] text-ink-500">
                        Submitted {prettyDateTime(s.submittedAt)}
                      </p>
                    </div>

                    <div className="flex gap-2 border-t border-ink-200/70 p-3 dark:border-white/10">
                      <button
                        onClick={() => review(s.id, 'APPROVE')}
                        disabled={busy}
                        className="btn-success btn-sm flex-1"
                      >
                        <CheckCircle2 size={15} /> Approve
                      </button>
                      <button
                        onClick={() => setReject(s)}
                        disabled={busy}
                        className="btn-ghost btn-sm flex-1"
                      >
                        <XCircle size={15} /> Reject
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Modal
        open={Boolean(reject)}
        onClose={() => setReject(null)}
        title="Send back for correction"
        subtitle={`${reject?.user.name} · ${prettyDate(reject?.date)}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setReject(null)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => review(reject.id, 'REJECT', reason)}
              disabled={busy || reason.trim().length < 3}
              className="btn-danger"
            >
              Reject
            </button>
          </>
        }
      >
        <label className="label">Reason — the employee will see this</label>
        <textarea
          className="input min-h-28"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Cloning count looks higher than the machines available yesterday."
          autoFocus
        />
      </Modal>
    </div>
  );
}
