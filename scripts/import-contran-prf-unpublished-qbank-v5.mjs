#!/usr/bin/env node
import path from 'node:path';
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_QBANK_PATH,
  importQbankToSqlite,
  loadManifest,
  loadQbank,
  openSqliteDatabase,
  validateImportedQbank,
  validateQbankPackage
} from './contran-prf-unpublished-qbank-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const file = args.file || DEFAULT_QBANK_PATH;
const manifestFile = args.manifest || DEFAULT_MANIFEST_PATH;
const dryRun = Boolean(args['dry-run']);
const validateOnly = Boolean(args['validate-only']);

const items = loadQbank(file);
const manifest = loadManifest(manifestFile);
const packageValidation = validateQbankPackage(items, manifest);
if (!packageValidation.ok) {
  console.error(JSON.stringify({
    ok: false,
    stage: 'package_validation',
    file,
    errors: packageValidation.errors,
    warnings: packageValidation.warnings
  }, null, 2));
  process.exit(1);
}

const db = openSqliteDatabase(dbPath);
try {
  if (validateOnly) {
    const imported = validateImportedQbank(db);
    console.log(JSON.stringify({ ok: imported.ok, db: dbPath, imported }, null, 2));
    if (!imported.ok) process.exit(1);
  } else {
    const report = importQbankToSqlite(db, items, { dryRun, sourceFile: file });
    console.log(JSON.stringify({
      ok: true,
      db: dbPath,
      packageValidation,
      import: report
    }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    db: dbPath,
    error: error.message,
    report: error.report || null
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
