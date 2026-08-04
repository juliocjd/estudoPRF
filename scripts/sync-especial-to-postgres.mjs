// Sync incremental sqlite -> Postgres das questões coletadas (legislação especial).
// Upsert de questions + comments + alternatives por ID. NÃO toca em tabelas de
// estudo (study_answers, question_mastery, etc.). Só sobe questões com gabarito
// utilizável (comment.extracted_answer preenchido).
//
//   node --experimental-sqlite --env-file=.env scripts/sync-especial-to-postgres.mjs --dry-run
//   node --experimental-sqlite --env-file=.env scripts/sync-especial-to-postgres.mjs --apply
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const NB = [99926580, 99926560];
const TS_COLS = new Set(['collected_at', 'updated_at', 'ai_answer_generated_at', 'checked_at', 'ai_generated_at', 'user_edited_at']);

const Q_COLS = ['id_question','url','statement_html','statement_text','statement_hash','content_hash','type_question','format_question','banca','banca_url','orgao_sigla','orgao_nome','orgao_url','cargo','concurso_id','concurso_ano','concurso_url','materia_id','materia','assunto_id','assunto','assunto_url','capitulo','anulada','desatualizada','possui_comentario','possui_comentario_video','possui_comentario_ia','possui_resolucao_banca','raw_json','collected_at','updated_at','official_answer','official_answer_source','ai_answer','ai_answer_model','ai_answer_generated_at'];
const C_COLS = ['question_id','html','text','professor','date_text','extracted_answer','raw_json','checked_at','html_local','source_type','ai_model','ai_generated_at','ai_confidence','user_edited_at','user_edited_by','extracted_answer_source'];
const A_COLS = ['question_id','position','letter','html','text'];

function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = TS_COLS.has(k) && (v === '' || v == null) ? null : v;
  }
  return out;
}
function setClause(cols, pk) {
  return cols.filter((c) => !pk.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
}

const db = new DatabaseSync('questoes-prf.sqlite', { readOnly: true });
const ids = db.prepare(`
  SELECT DISTINCT q.id_question
  FROM questions q
  JOIN comments c ON c.question_id = q.id_question
  WHERE q.id_question IN (SELECT DISTINCT question_id FROM notebook_questions WHERE notebook_id IN (${NB.join(',')}))
    AND COALESCE(NULLIF(c.extracted_answer, ''), '') <> ''
`).all().map((r) => r.id_question);
console.log(`Questões com gabarito a sincronizar: ${ids.length}`);
if (!apply) { console.log('DRY-RUN (use --apply). Nada foi enviado ao prod.'); db.close(); process.exit(0); }

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const qGet = db.prepare(`SELECT ${Q_COLS.join(',')} FROM questions WHERE id_question = ?`);
const cGet = db.prepare(`SELECT ${C_COLS.join(',')} FROM comments WHERE question_id = ?`);
const aGet = db.prepare(`SELECT ${A_COLS.join(',')} FROM alternatives WHERE question_id = ? ORDER BY position`);

try {
  let nq = 0, nc = 0, na = 0;
  for (const batch of chunk(ids, 150)) {
    const qRows = batch.map((id) => clean(qGet.get(id))).filter(Boolean);
    if (qRows.length) {
      await sql`INSERT INTO questions ${sql(qRows, ...Q_COLS)} ON CONFLICT (id_question) DO UPDATE SET ${sql.unsafe(setClause(Q_COLS, ['id_question']))}`;
      nq += qRows.length;
    }
    const cRows = batch.map((id) => cGet.get(id)).filter(Boolean).map(clean);
    if (cRows.length) {
      await sql`INSERT INTO comments ${sql(cRows, ...C_COLS)} ON CONFLICT (question_id) DO UPDATE SET ${sql.unsafe(setClause(C_COLS, ['question_id']))}`;
      nc += cRows.length;
    }
    const aRows = batch.flatMap((id) => aGet.all(id)).map(clean);
    if (aRows.length) {
      await sql`INSERT INTO alternatives ${sql(aRows, ...A_COLS)} ON CONFLICT (question_id, position) DO UPDATE SET ${sql.unsafe(setClause(A_COLS, ['question_id', 'position']))}`;
      na += aRows.length;
    }
    console.log(`  ...${nq} questões, ${nc} comentários, ${na} alternativas`);
  }
  console.log(`\nOK: ${nq} questões, ${nc} comentários, ${na} alternativas sincronizadas no prod.`);
} catch (e) {
  console.error('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
  db.close();
}
