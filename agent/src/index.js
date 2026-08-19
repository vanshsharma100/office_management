import { loadConfig, loadState, saveState, initConfig, statePathFor } from './config.js';
import { Api } from './api.js';

// Loaded on first use. `--init` and every config error must still work on a PC
// where `npm install` has not run yet — otherwise the first thing a new
// install shows you is a missing-driver stack trace instead of what to fix.
let dbModule;
const db = async () => (dbModule ??= await import('./db.js'));

/**
 * The Ftech attendance sync agent.
 *
 * Runs on the office PC beside the biometric software's SQL Server Express,
 * reads new punches, and pushes them to the web app over HTTPS.
 *
 * The recovery behaviour everything else depends on: the cursor only moves
 * after the web app confirms it stored a batch. So if the internet drops, the
 * agent re-reads and re-sends until it lands; and if this PC is off for days,
 * the rows simply wait in SQL Server and get collected when it comes back.
 * The vendor's database is the queue — there is no separate spool to corrupt.
 */

const log = (...a) => console.log(new Date().toISOString(), ...a);
const argv = new Set(process.argv.slice(2));

/** The office-local calendar date for an instant. A punch belongs to the day
 *  it happened in Ftech's office, not the day it was in UTC. */
function localDate(value, timeZone) {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function shiftDate(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function discover(cfg) {
  const { connect, listTables, listColumns, close } = await db();
  const pool = await connect(cfg);
  const tables = await listTables(pool);
  console.log(`\n${tables.length} tables in ${cfg.sql.database || cfg.sql.file}:\n`);
  for (const t of tables) console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}  (${t.ColumnCount} columns)`);

  const guess = tables.find((t) => /devicelog|attendancelog|punch|swipe|inout/i.test(t.TABLE_NAME));
  if (guess) {
    const cols = await listColumns(pool, guess.TABLE_NAME);
    console.log(`\nColumns in ${guess.TABLE_NAME} — this looks like the punch log:\n`);
    for (const c of cols) console.log(`  ${c.COLUMN_NAME}  ${c.DATA_TYPE}${c.IS_NULLABLE === 'YES' ? ' (nullable)' : ''}`);
    console.log('\nPut the matching names into config.json → query.columns.');
  } else {
    console.log('\nNo table name looked obviously like a punch log. Pick the right one and run:');
    console.log('  node src/index.js --columns <TableName>');
  }
  await close();
}

async function showColumns(cfg, table) {
  const { connect, listColumns, close } = await db();
  const pool = await connect(cfg);
  const cols = await listColumns(pool, table);
  if (!cols.length) console.log(`No table named ${table}.`);
  for (const c of cols) console.log(`  ${c.COLUMN_NAME}  ${c.DATA_TYPE}`);
  await close();
}

async function testConnection(cfg) {
  const { connect, fetchPunches, close } = await db();
  log('Testing the web app...');
  const hello = await new Api(cfg).hello();
  log(`  connected as agent "${hello.agent.name}"; office timezone ${hello.timezone}`);

  log(`Testing the attendance database (${cfg.sql.driver || 'mssql'})...`);
  const pool = await connect(cfg);
  const rows = await fetchPunches(pool, cfg, { lastId: 0, lastPunchAt: null });
  log(`  read ${rows.length} punch rows from ${cfg.query.table}`);
  if (rows[0]) {
    log(`  newest sample: uid=${rows[0].Uid} at=${rows[0].PunchAt?.toISOString?.() ?? rows[0].PunchAt}`);
  }
  await close();
  log('Both sides are reachable.');
}

/**
 * What the vendor database actually holds, day by day.
 *
 * Run this before reaching further back with sync.backfillDays. Closing a day
 * is what lets it be judged, and a closed day with no punches is an absence
 * for every employee — so a backfill into a period the biometric software
 * never collected does not import history, it deletes a month of salary.
 * Nothing here writes anywhere; it only reads and reports.
 */
async function showRange(cfg, days) {
  const { connect, countByDate, close } = await db();
  const pool = await connect(cfg);
  const tz = cfg.sync.timezone;
  const today = localDate(new Date(), tz);
  const window = Math.abs(Number(days) || 120);
  const from = shiftDate(today, -window);

  const counts = await countByDate(pool, cfg, from, today);
  await close();

  const withPunches = [...counts.entries()].filter(([, n]) => n > 0).sort();
  const total = withPunches.reduce((sum, [, n]) => sum + n, 0);

  console.log(`\nLooking back ${window} days, from ${from} to ${today}.\n`);
  if (!withPunches.length) {
    console.log('  No punches at all in this window.');
    console.log('  Do NOT raise backfillDays — every day would close empty and');
    console.log('  mark the whole staff absent.\n');
    return;
  }

  console.log(`  ${total} punches, on ${withPunches.length} days`);
  console.log(`  earliest ${withPunches[0][0]}`);
  console.log(`  latest   ${withPunches[withPunches.length - 1][0]}\n`);

  const byMonth = new Map();
  for (const [date, n] of withPunches) {
    const m = date.slice(0, 7);
    const row = byMonth.get(m) ?? { days: 0, punches: 0 };
    row.days += 1;
    row.punches += n;
    byMonth.set(m, row);
  }

  console.log('  month     days with punches   punches');
  for (const [month, row] of [...byMonth.entries()].sort()) {
    console.log(`  ${month}   ${String(row.days).padStart(11)}   ${String(row.punches).padStart(9)}`);
  }

  // The number that decides whether a backfill is safe.
  const earliest = withPunches[0][0];
  const safeDays = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${earliest}T00:00:00Z`)) / 86_400_000));
  console.log(`\n  Safe to set sync.backfillDays no higher than ${safeDays}.`);
  console.log(`  Beyond that there is nothing to import, and each empty day`);
  console.log(`  becomes an absence for everyone.\n`);
}

/** One pass: drain everything new, then confirm which days are fully collected. */
async function runOnce(cfg, api) {
  const { connect, fetchPunches, countByDate, close } = await db();
  const state = loadState(cfg.__configPath);
  const pool = await connect(cfg);
  const tz = cfg.sync.timezone;
  let sent = 0;

  // Drain in batches until SQL has nothing newer than the cursor.
  for (;;) {
    const rows = await fetchPunches(pool, cfg, state);
    if (!rows.length) break;

    const punches = rows.map((r) => ({
      uid: String(r.Uid).trim(),
      punchAt: new Date(r.PunchAt).toISOString(),
      date: localDate(r.PunchAt, tz),
      direction: normaliseDirection(r.Direction),
      deviceId: r.DeviceId == null ? null : String(r.DeviceId),
      // Identity of the vendor's row. Makes re-sending harmless.
      sourceKey: r.RowId != null
        ? `${cfg.query.table}:${r.RowId}`
        : `${cfg.query.table}:${String(r.Uid).trim()}:${new Date(r.PunchAt).toISOString()}`,
    }));

    const result = await api.sendPunches(punches);
    sent += punches.length;
    log(`  pushed ${punches.length} punches (${result.stored} new)`);

    // Only now is it safe to move on. A throw above leaves the cursor where it
    // was, so the same rows are retried next tick.
    const last = rows[rows.length - 1];
    if (last.RowId != null) state.lastId = Number(last.RowId);
    state.lastPunchAt = new Date(last.PunchAt).toISOString();
    saveState(cfg.__configPath, state);

    if (rows.length < (cfg.sync.batchSize || 500)) break;
  }

  // Everything SQL had is now delivered, so every past day in the window is
  // fully collected and can be closed. Until a day is closed the web app
  // treats it as NA and deducts nobody anything.
  const today = localDate(new Date(), tz);
  const from = shiftDate(today, -Math.abs(cfg.sync.backfillDays || 14));
  const yesterday = shiftDate(today, -1);
  const done = new Set(state.completedDates);
  const pending = [];
  for (let d = from; d <= yesterday; d = shiftDate(d, 1)) if (!done.has(d)) pending.push(d);

  if (pending.length) {
    const counts = await countByDate(pool, cfg, from, yesterday);
    for (const date of pending) {
      await api.dayComplete(date, counts.get(date) ?? 0);
      done.add(date);
      log(`  confirmed ${date} collected (${counts.get(date) ?? 0} punches)`);
    }
    // Keep only the window; this list must not grow without bound.
    state.completedDates = [...done].filter((d) => d >= from).sort();
    saveState(cfg.__configPath, state);
  }

  await close();
  return { sent, daysClosed: pending.length };
}

function normaliseDirection(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (['in', 'i', '0', 'checkin', 'check-in', 'entry'].includes(v)) return 'IN';
  if (['out', 'o', '1', 'checkout', 'check-out', 'exit'].includes(v)) return 'OUT';
  return null; // unknown encoding: let the web app use first/last punch instead
}

/**
 * Put a config template somewhere a code update cannot reach. The settings
 * hold the SQL password and the API key; they must outlive `git pull`.
 */
function runInit() {
  const { target, created } = initConfig();
  const dir = target.replace(/[\\/][^\\/]+$/, '');
  console.log(created ? `\nCreated ${target}` : `\n${target} already exists — left untouched.`);
  console.log(`\nNext:\n  1. Open it and fill in apiUrl, agentKey and the sql block.`);
  if (process.platform === 'win32') {
    console.log(`\n  2. Lock it down so only administrators can read the password:`);
    console.log(`       icacls "${dir}" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"`);
  } else {
    console.log(`\n  2. Lock it down:  chmod 600 ${target}`);
  }
  console.log(`\n  3. Check both ends:  npm run test-connection\n`);
}

async function main() {
  if (argv.has('--init')) return runInit();

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  log(`Using settings from ${cfg.__configPath}`);
  log(`Cursor stored at ${statePathFor(cfg.__configPath)}`);

  if (argv.has('--discover')) return discover(cfg);
  if (argv.has('--columns')) return showColumns(cfg, process.argv[process.argv.indexOf('--columns') + 1]);
  if (argv.has('--test')) return testConnection(cfg);
  if (argv.has('--range')) return showRange(cfg, process.argv[process.argv.indexOf('--range') + 1]);

  const api = new Api(cfg);
  const interval = Math.max(60, Number(cfg.sync.intervalSeconds) || 900) * 1000;
  const source = cfg.sql.driver === 'access' ? cfg.sql.file : cfg.sql.server;
  log(`Ftech sync agent starting — ${source} → ${cfg.apiUrl}, every ${interval / 1000}s`);

  let failures = 0;
  const tick = async () => {
    try {
      const { sent, daysClosed } = await runOnce(cfg, api);
      if (sent || daysClosed) log(`Synced ${sent} punches, closed ${daysClosed} days`);
      failures = 0;
    } catch (err) {
      failures += 1;
      log(`Sync failed (${failures}): ${err.message}`);
      await api.reportError(err.message); // so it shows in the app, not just here
      if (err.fatal) {
        log('The agent key was rejected. Fix config.json and restart — not retrying.');
        process.exit(1);
      }
      await dbModule?.close().catch(() => {});
    }
  };

  await tick();
  if (argv.has('--once')) return;

  // Backoff on repeated failure so a long outage does not hammer either end.
  const schedule = () => {
    const wait = failures ? Math.min(interval * 2 ** Math.min(failures, 4), 3_600_000) : interval;
    setTimeout(async () => {
      await tick();
      schedule();
    }, wait);
  };
  schedule();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    log('Stopping.');
    await dbModule?.close().catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
