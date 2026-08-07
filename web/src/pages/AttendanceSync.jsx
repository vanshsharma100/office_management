import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Fingerprint,
  Link2,
  Monitor,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { prettyDateTime } from '../lib/format';
import { Badge, Card, Empty, Field, Modal, SectionTitle, Spinner } from '../components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Every rule starts blank. An empty field means the rule simply does not apply. */
const BLANK_POLICY = {
  shiftStart: '',
  shiftEnd: '',
  graceMinutes: '',
  halfDayAfter: '',
  minHoursFullDay: '',
  minHoursHalfDay: '',
  weeklyOffDays: [],
  nightShift: false,
  dayCloseTime: '',
  requestWindowDays: '',
  timezone: 'Asia/Kolkata',
};

export default function AttendanceSyncPage() {
  const { toast } = useUI();
  const [status, setStatus] = useState(null);
  const [policy, setPolicy] = useState(BLANK_POLICY);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newAgent, setNewAgent] = useState(null);
  const [naming, setNaming] = useState(false);
  const [agentName, setAgentName] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p, e] = await Promise.all([
        api.get('/sync/status'),
        api.get('/attendance/policy'),
        api.get('/users?limit=500'),
      ]);
      setStatus(s.data);
      setPolicy(fromApi(p.data.policy));
      setEmployees(e.data.users ?? e.data.items ?? []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const savePolicy = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/attendance/policy', toApi(policy));
      toast('Attendance rules saved. Past days keep their current result until you recalculate.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addAgent = async () => {
    try {
      const { data } = await api.post('/sync/agents', { name: agentName.trim() });
      setNewAgent(data); // the key is in here, and this is the only time we see it
      setNaming(false);
      setAgentName('');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const revoke = async (id, name) => {
    if (!window.confirm(`Revoke "${name}"? That office PC stops syncing immediately.`)) return;
    try {
      await api.delete(`/sync/agents/${id}`);
      toast('Revoked.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const mapUid = async (uid, userId) => {
    if (!userId) return;
    try {
      const { data } = await api.post('/sync/map-uid', { uid, userId });
      toast(`Linked. ${data.linkedPunches} past punches recovered across ${data.recalculatedDays} days.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading) return <Spinner label="Loading attendance sync" />;

  const stale = isStale(status?.lastSyncedAt);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Attendance sync"
        subtitle="Punches come from the biometric machine's database on the office PC."
        icon={Fingerprint}
      />

      {/* ── Health ─────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle title="Status" icon={stale ? AlertTriangle : CheckCircle2} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Last sync"
            value={status?.lastSyncedAt ? prettyDateTime(status.lastSyncedAt) : 'Never'}
            tone={stale ? 'rose' : 'emerald'}
          />
          <Stat label="Last day collected" value={status?.lastSyncedDate ?? '—'} />
          <Stat label="Days collected" value={status?.syncedDayCount ?? 0} />
        </div>
        {stale && (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            No punches have arrived for over a day. Check that the office PC is on and the agent is
            running — until it reports, those days stay <strong>NA</strong> and nobody is marked
            absent for them.
          </p>
        )}
      </Card>

      {/* ── Office PCs ─────────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle
          title="Office PCs"
          subtitle="Each registered PC gets its own key, so one can be revoked without touching the rest."
          icon={Monitor}
          action={
            <button type="button" className="btn-primary" onClick={() => setNaming(true)}>
              Add office PC
            </button>
          }
        />
        {!status?.agents?.length ? (
          <Empty title="No office PC registered yet" hint="Add one, then paste its key into the agent's config.json." icon={Monitor} />
        ) : (
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {status.agents.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-sm text-ink-500">
                    <code>{a.keyPrefix}…</code> · last seen{' '}
                    {a.lastSeenAt ? prettyDateTime(a.lastSeenAt) : 'never'}
                  </p>
                  {a.lastError && (
                    <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{a.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={a.isActive ? 'emerald' : 'neutral'}>
                    {a.isActive ? 'active' : 'revoked'}
                  </Badge>
                  {a.isActive && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => revoke(a.id, a.name)}
                      aria-label={`Revoke ${a.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Unmapped UIDs ──────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle
          title="Unmatched device IDs"
          subtitle="Punches from a UID nobody is linked to. Link one and their past days are recalculated."
          icon={Link2}
        />
        {!status?.unmappedUids?.length ? (
          <Empty title="Every device ID is linked" hint="New joiners will appear here after their first punch." icon={CheckCircle2} />
        ) : (
          <div className="space-y-2">
            {status.unmappedUids.map((u) => (
              <div key={u.uid} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-3 dark:border-ink-800">
                <code className="rounded bg-ink-100 px-2 py-1 font-mono text-sm dark:bg-ink-800">{u.uid}</code>
                <span className="text-sm text-ink-500">last punch {prettyDateTime(u.punchAt)}</span>
                <select
                  className="input ml-auto max-w-xs"
                  defaultValue=""
                  onChange={(ev) => mapUid(u.uid, ev.target.value)}
                  aria-label={`Link device ID ${u.uid} to an employee`}
                >
                  <option value="">Link to employee…</option>
                  {employees
                    .filter((emp) => !emp.biometricId)
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeId} — {emp.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Rules ──────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <SectionTitle
          title="Shift & attendance rules"
          subtitle="Leave anything blank and that rule is not applied."
          icon={Clock}
        />
        <form onSubmit={savePolicy} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Shift starts" hint="e.g. 09:30">
              <input type="time" className="input" value={policy.shiftStart} onChange={set(setPolicy, 'shiftStart')} />
            </Field>
            <Field label="Shift ends">
              <input type="time" className="input" value={policy.shiftEnd} onChange={set(setPolicy, 'shiftEnd')} />
            </Field>
            <Field label="Grace period (minutes)" hint="Arriving within this is still on time">
              <input type="number" min="0" max="240" className="input" value={policy.graceMinutes} onChange={set(setPolicy, 'graceMinutes')} />
            </Field>
            <Field label="Half day after" hint="Arriving later than this is half a day">
              <input type="time" className="input" value={policy.halfDayAfter} onChange={set(setPolicy, 'halfDayAfter')} />
            </Field>
            <Field label="Minimum hours for a full day">
              <input type="number" step="0.5" min="0" max="24" className="input" value={policy.minHoursFullDay} onChange={set(setPolicy, 'minHoursFullDay')} />
            </Field>
            <Field label="Minimum hours to count at all" hint="Below this the day is absent">
              <input type="number" step="0.5" min="0" max="24" className="input" value={policy.minHoursHalfDay} onChange={set(setPolicy, 'minHoursHalfDay')} />
            </Field>
            <Field label="Day closes at" hint="Absence is only decided after this time">
              <input type="time" className="input" value={policy.dayCloseTime} onChange={set(setPolicy, 'dayCloseTime')} />
            </Field>
            <Field label="Presence requests allowed for (days)" hint="How far back staff may claim a missed punch">
              <input type="number" min="0" max="90" className="input" value={policy.requestWindowDays} onChange={set(setPolicy, 'requestWindowDays')} />
            </Field>
            <Field label="Timezone">
              <input className="input" value={policy.timezone} onChange={set(setPolicy, 'timezone')} />
            </Field>
          </div>

          <Field label="Weekly off" hint="These days pay in full and never count as absent">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = policy.weeklyOffDays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPolicy((p) => ({
                        ...p,
                        weeklyOffDays: on
                          ? p.weeklyOffDays.filter((x) => x !== i)
                          : [...p.weeklyOffDays, i].sort(),
                      }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      on
                        ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                        : 'border-ink-200 dark:border-ink-700'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={policy.nightShift}
              onChange={(e) => setPolicy((p) => ({ ...p, nightShift: e.target.checked }))}
            />
            Shifts cross midnight
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save rules'}
            </button>
            <RecalcButton toast={toast} onDone={load} />
          </div>
        </form>
      </Card>

      <Modal open={naming} onClose={() => setNaming(false)} title="Add an office PC" subtitle="Name it so you can tell them apart later.">
        <Field label="Name">
          <input
            className="input"
            autoFocus
            placeholder="e.g. Reception PC"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
          />
        </Field>
        <button type="button" className="btn-primary mt-4" disabled={agentName.trim().length < 2} onClick={addAgent}>
          Create key
        </button>
      </Modal>

      <KeyOnceModal agent={newAgent} onClose={() => setNewAgent(null)} toast={toast} />
    </div>
  );
}

/** The key exists in plaintext exactly once — here. After this only its hash is kept. */
function KeyOnceModal({ agent, onClose, toast }) {
  if (!agent) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title="Copy this key now"
      subtitle="It is shown once and cannot be shown again. If you lose it, revoke this PC and add it back."
    >
      <code className="block break-all rounded-lg bg-ink-100 p-3 font-mono text-sm dark:bg-ink-800">
        {agent.key}
      </code>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            navigator.clipboard?.writeText(agent.key);
            toast('Copied.');
          }}
        >
          <Copy className="mr-2 h-4 w-4" /> Copy
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="mt-3 text-sm text-ink-500">
        Paste it into <code>agent/config.json</code> on that PC as <code>agentKey</code>.
      </p>
    </Modal>
  );
}

function RecalcButton({ toast, onDone }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const month = new Date().toISOString().slice(0, 7);
    if (!window.confirm(`Recalculate every collected day in ${month} using the current rules?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/sync/recalculate', { from: `${month}-01`, to: `${month}-31` });
      toast(`Recalculated ${data.days} days.`);
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn-ghost" onClick={run} disabled={busy}>
      <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
      Recalculate this month
    </button>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  return (
    <div>
      <p className="text-sm text-ink-500">{label}</p>
      <p className={`font-display text-lg font-semibold ${tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {value}
      </p>
    </div>
  );
}

const set = (setter, key) => (e) => setter((p) => ({ ...p, [key]: e.target.value }));

/** Nothing arrived for over a day — salary is being computed on ageing data. */
function isStale(lastSyncedAt) {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() > 36 * 60 * 60 * 1000;
}

function fromApi(p) {
  let off = [];
  try {
    off = JSON.parse(p.weeklyOffDays || '[]');
  } catch {
    off = [];
  }
  return {
    ...BLANK_POLICY,
    ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])),
    weeklyOffDays: Array.isArray(off) ? off : [],
    nightShift: Boolean(p.nightShift),
    timezone: p.timezone || 'Asia/Kolkata',
  };
}

function toApi(p) {
  const num = (v) => (v === '' || v === null ? null : Number(v));
  const str = (v) => (v === '' || v === null ? null : v);
  return {
    shiftStart: str(p.shiftStart),
    shiftEnd: str(p.shiftEnd),
    graceMinutes: num(p.graceMinutes),
    halfDayAfter: str(p.halfDayAfter),
    minHoursFullDay: num(p.minHoursFullDay),
    minHoursHalfDay: num(p.minHoursHalfDay),
    weeklyOffDays: p.weeklyOffDays,
    nightShift: Boolean(p.nightShift),
    dayCloseTime: str(p.dayCloseTime),
    requestWindowDays: num(p.requestWindowDays),
    timezone: p.timezone || 'Asia/Kolkata',
  };
}
