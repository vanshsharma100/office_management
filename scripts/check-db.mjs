/**
 * Check a DATABASE_URL before deploying with it.
 *
 * A bad connection string costs a five minute deploy cycle to discover and
 * reports the same "authentication failed" whether the password is wrong, the
 * username is missing its project id, or the placeholder brackets were left
 * in. This tells you which, in seconds, on your own machine.
 *
 *   npm run db:check
 *   npm run db:check -- "postgresql://user:pass@host:5432/postgres"
 *
 * The password is never printed — only its length, which is enough to see that
 * a placeholder is still there.
 */
import { PrismaClient } from '@prisma/client';

const url = process.argv[2] || process.env.DATABASE_URL;

if (!url) {
  console.error('\nNo DATABASE_URL. Set it in .env, or pass it:\n  npm run db:check -- "postgresql://..."\n');
  process.exit(1);
}

const problems = [];
const notes = [];

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error('\nThat is not a valid URL at all. It should start with postgresql://\n');
  process.exit(1);
}

const password = decodeURIComponent(parsed.password || '');
const host = parsed.hostname;
const user = decodeURIComponent(parsed.username || '');
const port = parsed.port || '5432';

console.log('\nConnection string');
console.log('─'.repeat(60));
console.log(`  protocol   ${parsed.protocol.replace(':', '')}`);
console.log(`  username   ${user}`);
console.log(`  password   ${password ? `${password.length} characters` : 'MISSING'}`);
console.log(`  host       ${host}`);
console.log(`  port       ${port}`);
console.log(`  database   ${parsed.pathname.replace('/', '') || 'MISSING'}`);
console.log('─'.repeat(60));

// ── the mistakes that actually happen ───────────────────────────────────────
if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
  problems.push(`Protocol is "${parsed.protocol.replace(':', '')}". It must be postgresql://`);
}
if (/[[\]<>]/.test(password) || /YOUR.?PASSWORD/i.test(password)) {
  problems.push('The password is still the placeholder. Replace [YOUR-PASSWORD] — brackets included — with the real one.');
}
if (!password) {
  problems.push('No password in the string. It goes between the ":" and the "@".');
}
if (/[@/?#]/.test(password)) {
  problems.push('The password contains @ / ? or #, which break a URL. Reset it to letters and numbers only.');
}
if (host.includes('pooler.supabase.com') && !user.includes('.')) {
  problems.push(`Pooler host but username is "${user}". It must be postgres.<your-project-ref> — with the dot.`);
}
if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
  notes.push('This is the Direct connection host, which is IPv6-only on new Supabase projects and often unreachable from shared hosting. Prefer the Session pooler (host contains pooler.supabase.com, port 5432).');
}
if (port === '6543' && !url.includes('pgbouncer=true')) {
  problems.push('Port 6543 is the transaction pooler. Either add ?pgbouncer=true, or better, use port 5432 — `prisma db push` needs it to create tables.');
}

if (problems.length) {
  console.log('\nProblems found:');
  for (const p of problems) console.log(`  ✗ ${p}`);
}
if (notes.length) {
  console.log('\nWorth knowing:');
  for (const n of notes) console.log(`  • ${n}`);
}

// ── actually try it ─────────────────────────────────────────────────────────
console.log('\nConnecting...');
const prisma = new PrismaClient({ datasourceUrl: url });

try {
  await Promise.race([
    prisma.$queryRaw`SELECT 1`,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 20_000)),
  ]);
  console.log('\n  ✓ Connected. This string works — paste it into Hostinger as DATABASE_URL.\n');
  await prisma.$disconnect();
  process.exit(0);
} catch (err) {
  const code = err.errorCode || err.code || '';
  console.log(`\n  ✗ Could not connect${code ? ` (${code})` : ''}`);

  // Two different failures wear similar words. Separating them matters:
  // one means the project was not found, the other means it was.
  if (/tenant.*not found|ENOTFOUND/i.test(err.message)) {
    console.log('\n  Supabase could not find that project on this pooler.');
    console.log(`  → The project ref in the username ("${user}") or the region in the host`);
    console.log(`    ("${host}") is wrong. Copy the string from Supabase's copy button rather`);
    console.log('    than typing it — the region must be your own project\'s.');
  } else if (code === 'P1000') {
    console.log('\n  Supabase found your project and rejected the password.');
    console.log('  So the host, region and username are all correct — only the password is wrong.');
    console.log('\n  → Reset it: Supabase → Settings → Database → Reset database password.');
    console.log('  → Note this is the DATABASE password, not the password you log in to');
    console.log('    Supabase with. They are different, and mixing them up is the usual cause.');
    console.log('  → Use letters and numbers only, so nothing needs URL-encoding.');
  } else if (code === 'P1001' || err.message === 'TIMEOUT') {
    console.log('\n  The server could not be reached at all — so this is not a password problem.');
    console.log('  → If the host is db.<ref>.supabase.co, switch to the Session pooler host.');
    console.log('  → Check the project is not paused in Supabase.');
  } else if (code === 'P1003') {
    console.log('\n  Connected, but that database name does not exist. It is usually /postgres.');
  } else {
    console.log(`\n  ${String(err.message).slice(0, 300)}`);
  }
  console.log('');
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
