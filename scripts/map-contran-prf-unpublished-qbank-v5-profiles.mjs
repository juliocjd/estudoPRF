#!/usr/bin/env node
import path from 'node:path';
import {
  openSqliteDatabase,
  seedContranPrfUnpublishedProfileMappings,
  validateImportedQbank
} from './contran-prf-unpublished-qbank-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const db = openSqliteDatabase(dbPath);

try {
  const mapping = seedContranPrfUnpublishedProfileMappings(db);
  const validation = validateImportedQbank(db);
  console.log(JSON.stringify({
    ok: validation.ok,
    db: dbPath,
    mapping,
    validation
  }, null, 2));
  if (!validation.ok) process.exit(1);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    db: dbPath,
    error: error.message
  }, null, 2));
  process.exit(1);
} finally {
  db.close();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    parsed[key] = next && !next.startsWith('--') ? next : true;
    if (parsed[key] === next) index += 1;
  }
  return parsed;
}
