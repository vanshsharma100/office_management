import { useCallback, useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { prettyDateTime, timeAgo } from '../lib/format';
import { Avatar, Badge, Card, Empty, SectionTitle, Spinner } from '../components/ui';

const ACTION_TONE = (action) => {
  if (action.includes('APPROVED') || action.includes('CREATED')) return 'green';
  if (action.includes('REJECTED') || action.includes('DEACTIVATED') || action.includes('REMOVED')) return 'red';
  if (action.includes('LOCKED')) return 'amber';
  if (action.includes('SALARY') || action.includes('PAY')) return 'violet';
  return 'brand';
};

/** Section 15 — nothing is ever thrown away, and who did it is recorded too. */
export default function HistoryLog() {
  const { toast } = useUI();
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [take, setTake] = useState(100);

  const load = useCallback(() => {
    api
      .get('/audit', {
        params: {
          q: q || undefined,
          entity: entity || undefined,
          from: from || undefined,
          to: to || undefined,
          take,
        },
      })
      .then((r) => {
        setLogs(r.data.logs);
        setTotal(r.data.total);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [q, entity, from, to, take, toast]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="History log"
        subtitle={`${total} recorded action${total === 1 ? '' : 's'}. Every change is stored with the date, time and person.`}
        icon={History}
      />

      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" placeholder="Search actions" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Everything</option>
          <option value="User">Accounts</option>
          <option value="WorkSubmission">Work submissions</option>
          <option value="Attendance">Attendance</option>
          <option value="LeaveRequest">Leave</option>
          <option value="PayItem">Pay items</option>
          <option value="MonthLock">Month locks</option>
          <option value="Department">Departments</option>
          <option value="JobRole">Job roles</option>
          <option value="Notice">Notices</option>
          <option value="Task">Tasks</option>
          <option value="Query">Questions</option>
        </select>
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      {!logs ? (
        <Spinner label="Loading history" />
      ) : logs.length === 0 ? (
        <Card>
          <Empty title="Nothing matches" hint="Try a wider date range or clear the filters." icon={History} />
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-ink-200/60 dark:divide-white/5">
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-3 p-4">
                <Avatar name={l.actorName} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={ACTION_TONE(l.action)}>{l.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <span className="text-xs text-ink-500">{l.entity}</span>
                  </div>
                  <p className="mt-1.5 text-sm">{l.summary}</p>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {l.actorName}
                    {l.actor?.employeeId ? ` (${l.actor.employeeId})` : ''} · {prettyDateTime(l.createdAt)} ·{' '}
                    {timeAgo(l.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </Card>

          {logs.length >= take && (
            <button onClick={() => setTake((t) => t + 100)} className="btn-ghost w-full">
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
