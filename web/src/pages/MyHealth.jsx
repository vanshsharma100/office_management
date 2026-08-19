import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonth, prettyMonth, shiftMonth } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import HealthCard from '../components/HealthCard';
import Leaderboard from '../components/Leaderboard';

/**
 * What an employee sees of their own health: their full scorecard, and the
 * leaderboard's totals for everyone else. Never anyone else's breakdown.
 */
export default function MyHealth() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tightest">My health</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">How this month is scored.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="btn-ghost btn-sm">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-28 text-center text-sm font-semibold">{prettyMonth(month)}</span>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="btn-ghost btn-sm">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <HealthCard userId={user.id} month={month} readOnly />
        <Leaderboard month={month} />
      </div>
    </div>
  );
}
