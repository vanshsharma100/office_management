import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Read-only access to a Microsoft Access (.mdb / .accdb) biometric database,
 * through the ACE OLE DB provider that the biometric software already relies
 * on. See access-query.ps1 for why the reading happens in PowerShell.
 *
 * Same exported shape as db-mssql.js, so index.js neither knows nor cares
 * which kind of database is on the other side.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'access-query.ps1');

const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const psPath = (dir) => path.join(systemRoot, dir, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const PS_64 = psPath('System32');
const PS_32 = psPath('SysWOW64'); // 32-bit, for a PC with 32-bit Office and so 32-bit ACE

/**
 * Access allows spaces and #, $, @ in object names, which SQL Server does not.
 * What matters is that a name can never close its own bracket and start
 * something else — table and column names come from a config file, and this is
 * the only thing standing between a typo there and an injected statement.
 */
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_ #$@.]*$/;

export function bracket(name, label) {
  if (!SAFE_NAME.test(String(name))) {
    throw new Error(`${label} "${name}" is not a valid Access table or column name`);
  }
  return `[${name}]`;
}

/** Jet reads an unquoted ISO date between #…# without any locale guesswork. */
function accessDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return `#${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}#`;
}

function connectionString(cfg) {
  const parts = [
    `Provider=${cfg.sql.provider || 'Microsoft.ACE.OLEDB.12.0'}`,
    `Data Source=${cfg.sql.file}`,
    'Persist Security Info=False',
    'Mode=Read',
  ];
  if (cfg.sql.password) parts.push(`Jet OLEDB:Database Password=${cfg.sql.password}`);
  return `${parts.join(';')};`;
}

function exec(exe, args, env) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      { env, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          // PowerShell writes an error across several lines, and the message
          // that says what actually went wrong is rarely the first of them.
          // Flatten the lot rather than truncate to something undiagnosable.
          const detail = String(stderr || err.message)
            .replace(/\s*\+ (CategoryInfo|FullyQualifiedErrorId)[\s\S]*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
          reject(new Error(detail.slice(0, 500) || 'PowerShell failed'));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

const BASE_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT];

async function run(pool, mode, { sql, table } = {}) {
  const env = { ...process.env, FTECH_ACE_CONN: pool.connectionString };
  if (sql) env.FTECH_ACE_SQL = sql;

  const args = [...BASE_ARGS, '-Mode', mode];
  if (table) args.push('-Table', table);

  const stdout = await exec(pool.psExe, args, env);
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

/**
 * Which PowerShell can actually load the provider.
 *
 * ACE comes in a 32-bit and a 64-bit build and a process can only load its
 * own. An office PC with 32-bit Office has only the 32-bit one, which 64-bit
 * PowerShell cannot touch. Rather than make someone diagnose "provider is not
 * registered", try one and fall back to the other, then remember the answer.
 */
let cachedPsExe = null;

/** The only failure worth retrying in the other bitness. */
const MISSING_PROVIDER = /provider is not registered|class not registered|80040154/i;

async function resolvePowerShell(cfg, connString) {
  if (cachedPsExe) return cachedPsExe;

  const preference = String(cfg.sql.powershell ?? 'auto').toLowerCase();
  const candidates =
    preference === '32' ? [PS_32] : preference === '64' ? [PS_64] : [PS_64, PS_32];

  let lastError;
  for (const exe of candidates) {
    if (!fs.existsSync(exe)) continue;
    try {
      await exec(exe, [...BASE_ARGS, '-Mode', 'tables'], {
        ...process.env,
        FTECH_ACE_CONN: connString,
      });
      cachedPsExe = exe;
      return exe;
    } catch (err) {
      lastError = err;
      // A wrong password or a locked file fails the same way in both bitnesses.
      // Trying the other one would only replace an exact message with the
      // other's "provider is not registered", which sends you fixing the
      // wrong thing entirely.
      if (!MISSING_PROVIDER.test(err.message)) break;
    }
  }

  const message = String(lastError?.message ?? 'no PowerShell found on this PC');
  if (MISSING_PROVIDER.test(message)) {
    throw new Error(
      `The ACE OLE DB provider is not available to PowerShell.\n` +
        `Install the Access Database Engine redistributable on this PC, matching\n` +
        `the bitness of the Office/ONtime install:\n` +
        `  https://www.microsoft.com/download/details.aspx?id=54920\n` +
        `For an older .mdb you can instead set sql.provider to "Microsoft.Jet.OLEDB.4.0"\n` +
        `and sql.powershell to "32".`
    );
  }
  if (/not a valid password|invalid password/i.test(message)) {
    throw new Error(
      `The database password was rejected. Check sql.password in your config` +
        ` — leave it empty if the .mdb opens without one.`
    );
  }
  if (/could not use|already opened exclusively|locked/i.test(message)) {
    throw new Error(
      `The database is open exclusively by another program. Close ONtime's` +
        ` admin/repair tools and try again. Normal ONtime use is fine.`
    );
  }
  throw new Error(message);
}

export async function connect(cfg) {
  if (!cfg.sql.file) throw new Error('sql.file must be the full path to the .mdb');
  if (!fs.existsSync(cfg.sql.file)) {
    throw new Error(`No database at ${cfg.sql.file} — check sql.file`);
  }
  if (process.platform !== 'win32') {
    throw new Error('The Access driver needs Windows; run the agent on the ONtime PC');
  }

  const connString = connectionString(cfg);
  const psExe = await resolvePowerShell(cfg, connString);
  return { connectionString: connString, psExe };
}

export function listTables(pool) {
  return run(pool, 'tables');
}

export function listColumns(pool, table) {
  return run(pool, 'columns', { table });
}

/**
 * The next batch of punches after the cursor. Mirrors db-mssql.js, including
 * the one-hour overlap in 'time' mode — a duplicate costs nothing, because the
 * web app rejects a punch whose sourceKey it already holds.
 */
export async function fetchPunches(pool, cfg, state) {
  const t = bracket(cfg.query.table, 'query.table');
  const cols = cfg.query.columns;
  const cUid = bracket(cols.uid, 'columns.uid');
  const cAt = bracket(cols.punchAt, 'columns.punchAt');
  const cId = cols.id ? bracket(cols.id, 'columns.id') : null;
  const cDir = cols.direction ? bracket(cols.direction, 'columns.direction') : null;
  const cDev = cols.deviceId ? bracket(cols.deviceId, 'columns.deviceId') : null;

  const select = [
    cId ? `${cId} AS RowId` : 'NULL AS RowId',
    `${cUid} AS Uid`,
    `${cAt} AS PunchAt`,
    cDir ? `${cDir} AS Direction` : 'NULL AS Direction',
    cDev ? `${cDev} AS DeviceId` : 'NULL AS DeviceId',
  ].join(', ');

  let where;
  let order;
  if (cfg.query.cursorMode === 'time' || !cId) {
    const from = state.lastPunchAt
      ? new Date(new Date(state.lastPunchAt).getTime() - 60 * 60 * 1000)
      : new Date(Date.now() - cfg.sync.backfillDays * 86_400_000);
    where = `${cAt} > ${accessDate(from)}`;
    order = `${cAt} ASC`;
  } else {
    where = `${cId} > ${Number(state.lastId) || 0}`;
    order = `${cId} ASC`;
  }

  const top = Number(cfg.sync.batchSize) || 500;
  const sql =
    `SELECT TOP ${top} ${select} FROM ${t} ` +
    `WHERE ${where} AND ${cUid} IS NOT NULL AND ${cAt} IS NOT NULL ` +
    `ORDER BY ${order}`;

  return run(pool, 'query', { sql });
}

/**
 * How many punches each date holds.
 *
 * Year/Month/Day are core Jet functions and behave the same on every machine.
 * Format() would be shorter and would quietly follow the PC's locale, which is
 * not something a payroll figure should depend on.
 */
export async function countByDate(pool, cfg, fromDate, toDate) {
  const t = bracket(cfg.query.table, 'query.table');
  const cAt = bracket(cfg.query.columns.punchAt, 'columns.punchAt');
  const isDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isDate.test(fromDate) || !isDate.test(toDate)) {
    throw new Error('countByDate needs YYYY-MM-DD dates');
  }

  const rows = await run(pool, 'query', {
    sql:
      `SELECT Year(${cAt}) AS Y, Month(${cAt}) AS M, Day(${cAt}) AS D, COUNT(*) AS N ` +
      `FROM ${t} ` +
      `WHERE ${cAt} >= #${fromDate} 00:00:00# AND ${cAt} <= #${toDate} 23:59:59# ` +
      `GROUP BY Year(${cAt}), Month(${cAt}), Day(${cAt})`,
  });

  const p = (n) => String(n).padStart(2, '0');
  return new Map(rows.map((r) => [`${r.Y}-${p(r.M)}-${p(r.D)}`, Number(r.N)]));
}

/** Each query opens and closes its own connection, so there is nothing to shut. */
export async function close() {}
