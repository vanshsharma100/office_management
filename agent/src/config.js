import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `No config.json found at ${CONFIG_PATH}.\n` +
        'Copy config.example.json to config.json and fill it in.'
    );
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  const missing = [];
  if (!cfg.apiUrl) missing.push('apiUrl');
  if (!cfg.agentKey) missing.push('agentKey');
  if (!cfg.sql?.server) missing.push('sql.server');
  if (!cfg.sql?.database) missing.push('sql.database');
  if (!cfg.sql?.user) missing.push('sql.user');
  if (!cfg.sql?.password) missing.push('sql.password');
  if (missing.length) throw new Error(`config.json is missing: ${missing.join(', ')}`);

  // A plain-HTTP endpoint would put the agent key and every employee's
  // movements on the wire in the clear.
  if (!/^https:/i.test(cfg.apiUrl) && !/^http:\/\/localhost/i.test(cfg.apiUrl)) {
    throw new Error(`apiUrl must be https:// (got ${cfg.apiUrl})`);
  }

  cfg.sync = { intervalSeconds: 900, backfillDays: 14, batchSize: 500, timezone: 'Asia/Kolkata', ...cfg.sync };
  return cfg;
}

/**
 * The cursor. Deliberately small: the SQL database is the queue, so all we
 * need to remember is how far we got. Nothing is advanced until the web app
 * has confirmed it stored the batch, which is what makes an outage — on
 * either end — recover by itself.
 */
export function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { lastId: 0, lastPunchAt: null, completedDates: [] };
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { lastId: 0, lastPunchAt: null, completedDates: [], ...s };
  } catch {
    return { lastId: 0, lastPunchAt: null, completedDates: [] };
  }
}

export function saveState(state) {
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH); // atomic, so a crash mid-write cannot corrupt it
}
