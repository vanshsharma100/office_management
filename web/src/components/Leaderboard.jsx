import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import api from '../lib/api';
import { Card, Empty, SectionTitle, Spinner } from './ui';

/**
 * The health leaderboard. Everyone sees names, totals and rank; the breakdown
 * stays private. The signed-in person's own row is highlighted so they can
 * find themselves without reading every name.
 */
export default function Leaderboard({ month, limit }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    api
      .get('/health-score/leaderboard', { params: { month } })
      .then((r) => setRows(r.data.rows))
      .catch(() => setRows([]));
  }, [month]);

  if (!rows) return <Spinner label="Loading leaderboard" />;

  const ranked = rows.filter((r) => r.total != null);
  const shown = limit ? ranked.slice(0, limit) : ranked;

  const medal = ['🥇', '🥈', '🥉'];

  return (
    <Card className="p-5">
      <SectionTitle title="Health leaderboard" subtitle="This month, by overall score" icon={Trophy} />
      {shown.length === 0 ? (
        <Empty title="No scores yet" hint="Scores appear here once health cards are filled." icon={Trophy} />
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li
              key={r.userId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                r.isMe ? 'bg-brand-500/12 ring-1 ring-brand-400/40' : 'bg-ink-100/60 dark:bg-white/5'
              }`}
            >
              <span className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums">
                {r.rank <= 3 ? medal[r.rank - 1] : r.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {r.name} {r.isMe && <span className="text-xs font-medium text-brand-600 dark:text-brand-300">(you)</span>}
                </p>
                {r.department && <p className="truncate text-[11px] text-ink-500">{r.department}</p>}
              </div>
              <span className="shrink-0 font-display text-lg font-bold tabular-nums">{r.total.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
