/**
 * Give Prisma's engine binaries the execute bit back.
 *
 * `prisma db push` runs the schema engine as a child process. Some managed
 * hosts unpack node_modules in a way that drops the execute permission, and
 * the build then dies with:
 *
 *   EACCES: permission denied,
 *   node_modules/@prisma/engines/schema-engine-debian-openssl-1.1.x
 *
 * A `chmod +x` in the build command would fix it on the host and break every
 * npm script on Windows, where chmod does not exist. Doing it from Node works
 * on both: on Linux it restores the bit, on Windows chmod is effectively a
 * no-op and this quietly does nothing.
 *
 * Safe to run repeatedly, and safe to run before install has finished — a
 * missing folder is not an error, just nothing to do.
 */
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_ROOTS = [
  'node_modules/@prisma/engines',
  'node_modules/.prisma/client',
  'node_modules/prisma',
];

/**
 * The engine files. Prisma is inconsistent about the separator — the schema
 * engine is `schema-engine-debian-openssl-1.1.x` but the query engine ships as
 * `libquery_engine-debian-openssl-1.1.x.so.node` — so match either.
 * Everything else in those folders is JS or type definitions.
 */
const ENGINE = /(schema[-_]engine|migration[-_]engine|query[-_]engine|introspection[-_]engine|prisma[-_]fmt)/;
const NOT_EXECUTABLE = /\.(js|mjs|cjs|ts|json|map|md|sha256|gz)$/i;

let fixed = 0;
let failed = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // not installed yet, or not readable — nothing to do
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!ENGINE.test(entry.name) || NOT_EXECUTABLE.test(entry.name)) continue;

    try {
      fs.chmodSync(full, 0o755);
      fixed += 1;
      console.log(`  +x  ${full}`);
    } catch (err) {
      failed += 1;
      console.warn(`  !!  could not chmod ${full}: ${err.message}`);
    }
  }
}

for (const root of SEARCH_ROOTS) walk(root);

if (fixed === 0 && failed === 0) {
  console.log('prisma engines: none found to mark executable (fine on Windows)');
} else {
  console.log(`prisma engines: ${fixed} marked executable${failed ? `, ${failed} failed` : ''}`);
}
