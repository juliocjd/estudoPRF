// Restaura questões (e todas as linhas-filho) a partir de um backup JSON gerado
// por dedup-near-duplicate-questions.mjs. Uso para desfazer deleções indevidas.
//
//   node scripts/restore-questions-from-backup.mjs --backup tmp/dedup-backup-prod.json --ids 562129,833060
//   node scripts/restore-questions-from-backup.mjs --backup tmp/dedup-backup-local.json --db questoes-prf.sqlite --ids 111,222
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { readFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const backup = JSON.parse(readFileSync(args.backup, 'utf8'));
const ids = String(args.ids || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
if (!ids.length) throw new Error('Informe --ids id1,id2,...');
const { db } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

const idSet = new Set(ids);
const coerce = (v) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;

function insertRows(table, rows, idField) {
  let n = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const ph = cols.map(() => '?').join(', ');
    try {
      db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph})`).run(...cols.map((c) => coerce(row[c])));
      n += 1;
    } catch (error) {
      console.warn(`  ! ${table} ${row[idField]}: ${error.message}`);
    }
  }
  return n;
}

try {
  const qRows = backup.questions.filter((q) => idSet.has(Number(q.id_question)));
  if (qRows.length !== ids.length) {
    console.warn(`aviso: pedidos ${ids.length}, encontrados no backup ${qRows.length}`);
  }
  db.exec('BEGIN');
  try {
    // parent primeiro
    const qIns = insertRows('questions', qRows, 'id_question');
    // filhos
    let childIns = 0;
    for (const [table, rows] of Object.entries(backup.children || {})) {
      const mine = rows.filter((r) => idSet.has(Number(r.question_id)));
      if (mine.length) childIns += insertRows(table, mine, 'question_id');
    }
    db.exec('COMMIT');
    console.log(`OK: questões restauradas: ${qIns} | linhas-filho restauradas: ${childIns}`);
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('ROLLBACK —', error.message);
    throw error;
  }
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
    if (!next || next.startsWith('--')) { parsed[key] = true; continue; }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
