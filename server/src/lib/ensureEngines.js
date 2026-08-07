import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Restore the execute bit on Prisma's engine binaries at startup.
 *
 * The build already does this, but on a managed host the build and the running
 * app can be unpacked separately, so the permission is lost again by the time
 * the server boots. Prisma then hangs on its first query instead of failing —
 * the app answers every route that avoids the database and buffers forever on
 * any route that touches it, which is a miserable thing to diagnose.
 *
 * Imported first in index.js, before Prisma is loaded. On Windows chmod is
 * effectively a no-op, so this costs nothing locally.
 */

const ENGINE = /(schema[-_]engine|migration[-_]engine|query[-_]engine|introspection[-_]engine)/;
const NOT_EXECUTABLE = /\.(js|mjs|cjs|ts|json|map|md|sha256|gz)$/i;

const here = path.dirname(fileURLToPath(import.meta.url));

/** node_modules may sit beside the server or at the repo root, so walk upwards. */
function nodeModulesDirs() {
  const found = [];
  let dir = here;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) found.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

function walk(dir, depth = 0) {
  if (depth > 6) return 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walk(full, depth + 1);
    } else if (ENGINE.test(entry.name) && !NOT_EXECUTABLE.test(entry.name)) {
      try {
        const mode = fs.statSync(full).mode;
        if ((mode & 0o111) !== 0o111) {
          fs.chmodSync(full, 0o755);
          count += 1;
        }
      } catch {
        // Read-only filesystem, or someone else owns it. Nothing we can do
        // here; the startup database check reports the real failure.
      }
    }
  }
  return count;
}

let fixed = 0;
for (const nm of nodeModulesDirs()) {
  for (const sub of ['@prisma/engines', '.prisma/client', 'prisma']) {
    fixed += walk(path.join(nm, sub));
  }
}

if (fixed > 0) console.log(`[startup] restored execute permission on ${fixed} Prisma engine file(s)`);

export default fixed;
