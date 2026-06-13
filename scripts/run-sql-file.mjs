import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, openLawCompendiumDatabase, parseArgs } from './law-compendium-utils.mjs';

const args = parseArgs();
const file = args.file ? path.resolve(ROOT_DIR, args.file) : '';

if (!file) {
  console.error('Uso: node scripts/run-sql-file.mjs --db-client postgres --file migrations/arquivo.sql');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error(`Arquivo SQL nao encontrado: ${path.relative(ROOT_DIR, file)}`);
  process.exit(1);
}

const { db, client } = openLawCompendiumDatabase(args);

try {
  const sql = fs.readFileSync(file, 'utf8');
  db.exec(sql);
  console.log(`SQL aplicado em ${client}: ${path.relative(ROOT_DIR, file)}`);
} finally {
  db.close();
}
