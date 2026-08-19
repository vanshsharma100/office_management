import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

/**
 * Where the agent's settings live.
 *
 * Deliberately outside the code folder. The office PC will pull updates or be
 * re-cloned at some point, and a config holding the SQL password and the API
 * key must not be something a `git pull` can wipe or a `git add` can capture.
 *
 * Resolution order, first hit wins:
 *   1. --config <file>            explicit, for odd setups
 *   2. FTECH_AGENT_CONFIG         full path to a config file
 *   3. FTECH_AGENT_CONFIG_DIR     a folder holding config.json
 *   4. C:\ProgramData\Ftech\sync-agent\config.json   (the normal answer)
 *      /etc/ftech/sync-agent/config.json             (Linux equivalent)
 *   5. agent/config.json          legacy, still honoured if it exists
 */
export function defaultConfigDir() {
  if (process.env.FTECH_AGENT_CONFIG_DIR) return process.env.FTECH_AGENT_CONFIG_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.ProgramData || 'C:\\ProgramData', 'Ftech', 'sync-agent');
  }
  return '/etc/ftech/sync-agent';
}

export function resolveConfigPath(argv = process.argv) {
  const flag = argv.indexOf('--config');
  if (flag !== -1 && argv[flag + 1]) return path.resolve(argv[flag + 1]);
  if (process.env.FTECH_AGENT_CONFIG) return path.resolve(process.env.FTECH_AGENT_CONFIG);

  const external = path.join(defaultConfigDir(), 'config.json');
  if (fs.existsSync(external)) return external;

  const legacy = path.join(ROOT, 'config.json');
  if (fs.existsSync(legacy)) return legacy;

  return external; // report the intended location in the "not found" message
}

/** State sits beside the config, so both survive a code update together. */
export function statePathFor(configPath) {
  return path.join(path.dirname(configPath), 'state.json');
}

/** Loopback, or one of the RFC1918 ranges a home/office router hands out. */
function isOfficeNetwork(url) {
  const host = String(url).replace(/^https?:\/\//i, '').split(/[:/]/)[0];
  if (/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(host)) return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function loadConfig(argv = process.argv) {
  const configPath = resolveConfigPath(argv);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No config file found.\n\n` +
        `Expected it at:\n  ${configPath}\n\n` +
        `Create it by running:\n  npm run init\n\n` +
        `That makes the folder and puts a template there for you to fill in.`
    );
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  cfg.__configPath = configPath;

  const missing = [];
  if (!cfg.apiUrl) missing.push('apiUrl');
  if (!cfg.agentKey) missing.push('agentKey');

  // An Access database is one file and usually one password; SQL Server needs
  // a host and a login. Asking for the wrong set is the fastest way to make a
  // working setup look broken, so each driver is checked on its own terms.
  const driver = String(cfg.sql?.driver || 'mssql').toLowerCase();
  if (driver === 'access') {
    if (!cfg.sql?.file) missing.push('sql.file');
  } else {
    if (!cfg.sql?.server) missing.push('sql.server');
    if (!cfg.sql?.database) missing.push('sql.database');
    if (!cfg.sql?.user) missing.push('sql.user');
    if (!cfg.sql?.password) missing.push('sql.password');
  }
  if (missing.length) throw new Error(`${configPath} is missing: ${missing.join(', ')}`);

  // A plain-HTTP endpoint on the open internet would put the office key and
  // every employee's movements on the wire in the clear. Inside the office
  // network it is how you test before there is a certificate to talk to, so
  // loopback and private LAN addresses are allowed — loudly.
  if (!/^https:/i.test(cfg.apiUrl)) {
    if (isOfficeNetwork(cfg.apiUrl)) {
      console.warn(
        `\n  WARNING  ${cfg.apiUrl} is plain HTTP. Fine on your own network while\n` +
          `           testing. Move to https:// before this leaves the office.\n`
      );
    } else {
      throw new Error(
        `apiUrl must be https:// (got ${cfg.apiUrl}).\n` +
          `Plain http is only allowed for localhost or a private LAN address ` +
          `such as http://192.168.1.50:4001 while testing.`
      );
    }
  }

  cfg.sync = {
    intervalSeconds: 900,
    backfillDays: 14,
    batchSize: 500,
    timezone: 'Asia/Kolkata',
    ...cfg.sync,
  };
  return cfg;
}

/** Create the external folder and drop the template in, without overwriting. */
export function initConfig(argv = process.argv) {
  const flag = argv.indexOf('--config');
  const target =
    flag !== -1 && argv[flag + 1]
      ? path.resolve(argv[flag + 1])
      : path.join(defaultConfigDir(), 'config.json');

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) return { target, created: false };

  fs.copyFileSync(path.join(ROOT, 'config.example.json'), target);
  return { target, created: true };
}

/**
 * The cursor. Deliberately small: the SQL database is the queue, so all we
 * need to remember is how far we got. Nothing is advanced until the web app
 * has confirmed it stored the batch, which is what makes an outage — on
 * either end — recover by itself.
 */
export function loadState(configPath) {
  const file = statePathFor(configPath);
  if (!fs.existsSync(file)) return { lastId: 0, lastPunchAt: null, completedDates: [] };
  try {
    return { lastId: 0, lastPunchAt: null, completedDates: [], ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { lastId: 0, lastPunchAt: null, completedDates: [] };
  }
}

export function saveState(configPath, state) {
  const file = statePathFor(configPath);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file); // atomic, so a crash mid-write cannot corrupt it
}
