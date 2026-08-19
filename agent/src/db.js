/**
 * Picks the database driver for whatever the biometric software happens to
 * store its punches in.
 *
 *   "mssql"  — SQL Server Express (eTimeTrackLite and friends)
 *   "access" — a .mdb / .accdb file (ONtime's usual installer)
 *
 * Everything above this file — the cursor, the backlog drain, closing a day,
 * the retry behaviour — is identical either way. Only the reading differs.
 */

let active = null;

async function driverFor(cfg) {
  const name = String(cfg.sql?.driver || 'mssql').toLowerCase();
  if (name === 'access') return import('./db-access.js');
  if (name === 'mssql' || name === 'sqlserver') return import('./db-mssql.js');
  throw new Error(`Unknown sql.driver "${name}" — use "access" or "mssql"`);
}

export async function connect(cfg) {
  active = await driverFor(cfg);
  return active.connect(cfg);
}

const delegate =
  (method) =>
  (...args) => {
    if (!active) throw new Error('connect() must be called before the database is read');
    return active[method](...args);
  };

export const listTables = delegate('listTables');
export const listColumns = delegate('listColumns');
export const fetchPunches = delegate('fetchPunches');
export const countByDate = delegate('countByDate');

/** Safe before connect, because index.js calls it on the way out of an error. */
export const close = () => (active ? active.close() : Promise.resolve());
