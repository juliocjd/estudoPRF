// Esconde do estudo as questões ATIVAS que não têm gabarito em NENHUMA fonte
// (official_answer / notebook_questions.answer / comments.extracted_answer).
// São inestudáveis — abrir uma dessas é puro desperdício de tempo. Marca-as em
// question_study_status como 'excluded' com um reason próprio (reversível).
//
// Idempotente: não toca questões que já tenham um status (ex.: exclusão manual).
// Sempre grava backup dos ids afetados.
//
//   node scripts/hide-ungradable-questions.mjs                 # PROD, dry-run
//   node scripts/hide-ungradable-questions.mjs --apply         # PROD, aplica
//   node scripts/hide-ungradable-questions.mjs --db questoes-prf.sqlite --apply  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const apply = Boolean(args.apply);
const REASON = 'auto: sem gabarito (auditoria)';
const backupPath = args.backup || (useLocal ? 'tmp/hide-ungradable-local.json' : 'tmp/hide-ungradable-prod.json');
const { db } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

const BEST = `COALESCE(NULLIF(q.official_answer,''),
  (SELECT nq.answer FROM notebook_questions nq WHERE nq.question_id=q.id_question AND COALESCE(nq.answer,'')<>'' ORDER BY nq.notebook_id, nq.position LIMIT 1),
  (SELECT c.extracted_answer FROM comments c WHERE c.question_id=q.id_question AND COALESCE(c.extracted_answer,'')<>'' LIMIT 1), '')`;

try {
  const rows = db.prepare(`
    SELECT q.id_question AS id, q.materia AS materia
    FROM questions q
    WHERE COALESCE(q.anulada,0)=0 AND COALESCE(q.desatualizada,0)=0
      AND ${BEST}=''
      AND NOT EXISTS (SELECT 1 FROM question_study_status s WHERE s.question_id=q.id_question AND COALESCE(s.status,'')<>'')
  `).all();
  console.log(`inestudáveis a esconder: ${rows.length}`);
  const byMateria = {};
  for (const r of rows) byMateria[r.materia] = (byMateria[r.materia] || 0) + 1;
  for (const [m, n] of Object.entries(byMateria).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${m}`);

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
      console.log(`\nOK: ${n} questões marcadas como excluídas do estudo.`);
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
