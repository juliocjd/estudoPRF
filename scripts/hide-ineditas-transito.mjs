// Oculta o deck INÉDITO de trânsito (banca "INEDITA", url contran-prf-ineditas://,
// materia "Legislacao de Transito" sem materia_id) — 841 questões de treino que
// se confundem com a matéria oficial "Legislação de Trânsito e Transportes".
// Reversível: apagar as linhas 'excluded' com este reason.
//   node --experimental-sqlite --env-file=.env scripts/hide-ineditas-transito.mjs            # dry-run
//   node --experimental-sqlite --env-file=.env scripts/hide-ineditas-transito.mjs --apply    # local + prod
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const REASON = 'auto: deck inedito CONTRAN (treino, banca INEDITA) - ocultado a pedido';

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  // IDs pela URL sintética (identificador exato do deck inédito).
  const ids = (await sql`SELECT id_question FROM questions WHERE url LIKE 'contran-prf-ineditas://%'`)
    .map((r) => Number(r.id_question));
  console.log('questões inéditas a ocultar:', ids.length);

  try { mkdirSync('tmp', { recursive: true }); } catch {}
  writeFileSync('tmp/hide-ineditas-backup.json', JSON.stringify({ reason: REASON, ids }, null, 1));

  if (!apply) { console.log('DRY-RUN (use --apply). backup em tmp/hide-ineditas-backup.json'); await sql.end(); process.exit(0); }

  // PROD
  const exc = new Set((await sql`SELECT question_id FROM question_study_status WHERE status='excluded' AND question_id = ANY(${ids})`).map((r) => Number(r.question_id)));
  const toHideProd = ids.filter((id) => !exc.has(id));
  if (toHideProd.length) {
    await sql`INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at)
      SELECT unnest(${toHideProd}::bigint[]), 'excluded', ${REASON}, now(), now()`;
  }
  console.log('PROD: ocultadas', toHideProd.length, '(já ocultas antes:', exc.size, ')');

  // LOCAL (best-effort — o deck pode não existir no sqlite local)
  try {
    const local = new DatabaseSync('questoes-prf.sqlite');
    const localIds = new Set(local.prepare("SELECT id_question FROM questions WHERE url LIKE 'contran-prf-ineditas://%'").all().map((r) => r.id_question));
    const already = new Set(local.prepare("SELECT question_id FROM question_study_status WHERE status='excluded'").all().map((r) => r.question_id));
    const toHideLocal = [...localIds].filter((id) => !already.has(id));
    const insL = local.prepare("INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at) VALUES (?, 'excluded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
    local.exec('BEGIN');
    for (const id of toHideLocal) insL.run(id, REASON);
    local.exec('COMMIT');
    console.log('LOCAL: ocultadas', toHideLocal.length, '(de', localIds.size, 'no sqlite local)');
    local.close();
  } catch (e) { console.log('LOCAL: pulado —', e.message); }
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
