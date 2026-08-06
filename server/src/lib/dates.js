/** Business-day helpers. Everything is stored as YYYY-MM-DD strings so a day
 *  means the same thing regardless of the server's timezone. */

export function todayISO(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function currentMonth(d = new Date()) {
  return todayISO(d).slice(0, 7);
}

export function monthOf(dateISO) {
  return String(dateISO).slice(0, 7);
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** All YYYY-MM-DD dates in a month. */
export function monthDates(month) {
  const total = daysInMonth(month);
  return Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** Month range as inclusive ISO bounds, handy for `gte`/`lte` string filters. */
export function monthRange(month) {
  return { start: `${month}-01`, end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
}

export function addDays(dateISO, n) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function yesterdayISO() {
  return addDays(todayISO(), -1);
}

export function isWeekend(dateISO) {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 0;
}

export function lastNDays(n, endISO = todayISO()) {
  return Array.from({ length: n }, (_, i) => addDays(endISO, -(n - 1 - i)));
}

export function prettyDate(dateISO) {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
