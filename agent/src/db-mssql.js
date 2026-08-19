import sql from 'mssql';

/**
 * Read-only access to the biometric vendor's SQL Server Express database.
 * Nothing here writes. The login this uses should be db_datareader and
 * nothing more — if this agent is ever compromised, it must not be able to
 * alter the attendance record it is reporting on.
 */

/** Table and column names come from config, so they are checked before use. */
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_$#@]*$/;

export function bracket(name, label) {
  const parts = String(name).split('.');
  for (const part of parts) {
    if (!SAFE_NAME.test(part)) {
      throw new Error(`${label} "${name}" is not a valid SQL identifier`);
    }
  }
  return parts.map((p) => `[${p}]`).join('.');
}

export async function connect(cfg) {
  const options = {
    encrypt: cfg.sql.encrypt !== false,
    trustServerCertificate: cfg.sql.trustServerCertificate !== false,
    enableArithAbort: true,
  };
  // A named instance is resolved by SQL Server Browser; a port is not. Sending
  // both makes the driver ignore the port, so only ever send one.
  if (cfg.sql.instanceName) options.instanceName = cfg.sql.instanceName;

  return sql.connect({
    server: cfg.sql.server,
    ...(cfg.sql.instanceName ? {} : { port: cfg.sql.port ?? 1433 }),
    database: cfg.sql.database,
    user: cfg.sql.user,
    password: cfg.sql.password,
    options,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    requestTimeout: 60_000,
    connectionTimeout: 15_000,
  });
}

/** Every base table, so `npm run discover` can show what the vendor named things. */
export async function listTables(pool) {
  const { recordset } = await pool.request().query(
    `SELECT TABLE_SCHEMA, TABLE_NAME,
            (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
              WHERE c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_SCHEMA = t.TABLE_SCHEMA) AS ColumnCount
       FROM INFORMATION_SCHEMA.TABLES t
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  return recordset;
}

export async function listColumns(pool, table) {
  const { recordset } = await pool
    .request()
    .input('table', sql.NVarChar, table)
    .query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @table
        ORDER BY ORDINAL_POSITION`
    );
  return recordset;
}

/**
 * Pull the next batch of punches after the cursor.
 *
 * cursorMode 'id' walks an always-increasing key and cannot miss a row.
 * 'time' is the fallback for tables without one; it re-reads a small overlap
 * because rows can land with a timestamp slightly behind one already seen,
 * and a duplicate costs nothing — the web app rejects it by sourceKey.
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

  const request = pool.request();
  let where;
  let order;

  if (cfg.query.cursorMode === 'time' || !cId) {
    const from = state.lastPunchAt
      ? new Date(new Date(state.lastPunchAt).getTime() - 60 * 60 * 1000) // 1h overlap
      : new Date(Date.now() - cfg.sync.backfillDays * 86_400_000);
    request.input('from', sql.DateTime2, from);
    where = `${cAt} > @from`;
    order = `${cAt} ASC`;
  } else {
    request.input('lastId', sql.BigInt, state.lastId ?? 0);
    where = `${cId} > @lastId`;
    order = `${cId} ASC`;
  }

  const { recordset } = await request.query(
    `SELECT TOP (${Number(cfg.sync.batchSize) || 500} ) ${select}
       FROM ${t}
      WHERE ${where} AND ${cUid} IS NOT NULL AND ${cAt} IS NOT NULL
      ORDER BY ${order}`
  );
  return recordset;
}

/** How many punches each date holds, used to report a day as collected. */
export async function countByDate(pool, cfg, fromDate, toDate) {
  const t = bracket(cfg.query.table, 'query.table');
  const cAt = bracket(cfg.query.columns.punchAt, 'columns.punchAt');
  const { recordset } = await pool
    .request()
    .input('from', sql.NVarChar, `${fromDate} 00:00:00`)
    .input('to', sql.NVarChar, `${toDate} 23:59:59`)
    .query(
      `SELECT CONVERT(varchar(10), ${cAt}, 23) AS D, COUNT(*) AS N
         FROM ${t}
        WHERE ${cAt} >= @from AND ${cAt} <= @to
        GROUP BY CONVERT(varchar(10), ${cAt}, 23)`
    );
  return new Map(recordset.map((r) => [r.D, r.N]));
}

export const close = () => sql.close();
