#!/usr/bin/env node
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_QBANK_PATH,
  loadManifest,
  loadQbank,
  validateQbankPackage
} from './contran-prf-unpublished-qbank-utils.mjs';

const args = parseArgs(process.argv.slice(2));
const file = args.file || DEFAULT_QBANK_PATH;
const manifestFile = args.manifest || DEFAULT_MANIFEST_PATH;

const items = loadQbank(file);
const manifest = loadManifest(manifestFile);
const report = validateQbankPackage(items, manifest);

console.log(JSON.stringify({
  ok: report.ok,
  file,
  manifest: manifestFile,
  ...report
}, null, 2));

if (!report.ok) process.exit(1);

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
