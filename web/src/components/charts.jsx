import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { prettyDay } from '../lib/format';

const AXIS = { fontSize: 11, fill: 'currentColor', opacity: 0.55 };

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(14,15,32,.94)',
  color: 'white',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 12px 40px -12px rgba(0,0,0,.6)',
};

/** Daily output over time — the "work progress" graph in Sections 6.3 / 8.1. */
export function WorkTrend({ data = [], height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3563ff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#3563ff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
        <XAxis dataKey="date" tickFormatter={prettyDay} tick={AXIS} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={prettyDay}
          formatter={(v) => [v, 'Units']}
          cursor={{ stroke: '#3563ff', strokeOpacity: 0.3 }}
        />
        <Area type="monotone" dataKey="total" stroke="#3563ff" strokeWidth={2.5} fill="url(#trendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Totals per work item. Laptop and tiny stay separate, never merged (9.1). */
export function WorkBreakdown({ rows = [], height = 300 }) {
  const data = rows.slice(0, 10).map((r) => ({ name: r.label, value: r.value, unit: r.unit }));
  const color = (unit) => (unit === 'laptop' ? '#3563ff' : unit === 'tiny' ? '#a855f7' : '#10b981');

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={150} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(53,99,255,.08)' }} formatter={(v) => [v, 'Completed']} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={color(d.unit)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const ATTENDANCE_COLORS = {
  PRESENT: '#10b981',
  ABSENT: '#f43f5e',
  LEAVE: '#f59e0b',
  HALF_DAY: '#a855f7',
  WFH: '#0ea5e9',
  HOLIDAY: '#3563ff',
  NOT_MARKED: '#64748b',
};

export function AttendanceDonut({ summary = {}, height = 220 }) {
  const data = Object.entries(summary)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (!data.length) {
    return <div className="grid h-[220px] place-items-center text-sm text-ink-500">Nothing marked yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} stroke="none">
          {data.map((d) => (
            <Cell key={d.name} fill={ATTENDANCE_COLORS[d.name] ?? '#64748b'} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v, String(n).replace(/_/g, ' ').toLowerCase()]} />
        <Legend
          verticalAlign="bottom"
          height={30}
          iconType="circle"
          iconSize={8}
          formatter={(v) => (
            <span style={{ fontSize: 11, opacity: 0.7 }}>{String(v).replace(/_/g, ' ').toLowerCase()}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
