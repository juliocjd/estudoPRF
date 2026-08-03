// Esconde do estudo as questões INÉDITAS (banca='INEDITA') — geradas por IA,
// matéria "Legislacao de Transito". Reversível (question_study_status), com
// backup. Idempotente: não toca questões que já tenham status.
//
//   node scripts/hide-inedita-questions.mjs                # PROD, dry-run
//   node scripts/hide-inedita-questions.mjs --apply        # PROD, aplica
//   node scripts/hide-inedita-questions.mjs --db questoes-prf.sqlite --apply  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const REASON = 'auto: inedita IA (qualidade baixa) - fora do estudo';
const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const apply = Boolean(args.apply);
const backupPath = args.backup || (useLocal ? 'tmp/hide-inedita-local.json' : 'tmp/hide-inedita-prod.json');
const { db } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

try {
  const rows = db.prepare(`
    SELECT q.id_question AS id
    FROM questions q
    WHERE q.banca = 'INEDITA'
      AND NOT EXISTS (SELECT 1 FROM question_study_status s WHERE s.question_id=q.id_question AND COALESCE(s.status,'')<>'')
  `).all();
  console.log(`inéditas a esconder: ${rows.length}`);

  try { mkdirSync('tmp', { recursive: true }); } catch {}
  writeFileSync(backupPath, JSON.stringify({ reason: REASON, ids: rows.map((r) => r.id) }, null, 1));
  console.log(`backup dos ids em ${backupPath}`);

  if (!apply) {
    console.log('\nDRY-RUN (use --apply para aplicar).');
  } else {
    db.exec('BEGIN');
    try {
      const ins = db.prepare(`
        INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at)
        VALUES (?, 'excluded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      let n = 0;
      for (const r of rows) { ins.run(r.id, REASON); n += 1; }
      db.exec('COMMIT');
      console.log(`\nOK: ${n} inéditas marcadas como excluídas do estudo.`);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('ROLLBACK —', error.message);
      throw error;
    }
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
