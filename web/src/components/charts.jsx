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

/** Charts follow the theme: black ink on white, white ink on black. */
const isDark = () => document.documentElement.classList.contains('dark');
const ink = () => (isDark() ? '#ffffff' : '#000000');
const silver = () => (isDark() ? '#75757f' : '#9c9ca6');

const tooltipStyle = () => ({
  borderRadius: 12,
  border: isDark() ? '1px solid rgba(255,255,255,.2)' : '1px solid #000',
  background: isDark() ? '#ffffff' : '#000000',
  color: isDark() ? '#000000' : '#ffffff',
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 12px 40px -16px rgba(0,0,0,.5)',
});

/** Daily output over time — the "work progress" graph in Sections 6.3 / 8.1. */
export function WorkTrend({ data = [], height = 240 }) {
  const line = ink();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={line} stopOpacity={0.28} />
            <stop offset="100%" stopColor={line} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
        <XAxis dataKey="date" tickFormatter={prettyDay} tick={AXIS} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle()}
          labelFormatter={prettyDay}
          formatter={(v) => [v, 'Units']}
          cursor={{ stroke: line, strokeOpacity: 0.35 }}
        />
        <Area type="monotone" dataKey="total" stroke={line} strokeWidth={2.5} fill="url(#trendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Totals per work item. Laptop and tiny stay separate, never merged (9.1). */
export function WorkBreakdown({ rows = [], height = 300 }) {
  const data = rows.slice(0, 10).map((r) => ({ name: r.label, value: r.value, unit: r.unit }));
  // Laptop and tiny stay visually distinct — solid ink vs silver — without
  // leaving the black / silver / white palette.
  const color = (unit) => (unit === 'tiny' ? silver() : ink());

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={150} />
        <Tooltip contentStyle={tooltipStyle()} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} formatter={(v) => [v, 'Completed']} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={color(d.unit)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Present and absent keep a colour cue; the rest are shades of the ink scale. */
const attendanceColor = (status) =>
  ({
    PRESENT: '#10b981',
    ABSENT: '#f43f5e',
    LEAVE: '#f59e0b',
    HALF_DAY: isDark() ? '#d0d0d6' : '#4a4a52',
    WFH: isDark() ? '#9c9ca6' : '#75757f',
    HOLIDAY: ink(),
    NOT_MARKED: isDark() ? '#4a4a52' : '#d0d0d6',
  })[status] ?? silver();

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
            <Cell key={d.name} fill={attendanceColor(d.name)} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle()} formatter={(v, n) => [v, String(n).replace(/_/g, ' ').toLowerCase()]} />
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
