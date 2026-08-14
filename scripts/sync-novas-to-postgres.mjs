// Sync incremental sqlite -> Postgres das questões NOVAS desta coleta (por
// collected_at), com gabarito utilizável (comment.extracted_answer preenchido).
// Upsert de questions + comments + alternatives por ID. NÃO toca em tabelas de
// estudo nem em question_current_law_answers. Como são novas, é INSERT puro —
// não sobrescreve edições feitas direto no prod. No dry-run, avisa se alguma
// já existir no prod (risco de sobrescrita).
//   node --experimental-sqlite --env-file=.env scripts/sync-novas-to-postgres.mjs --since-hours 30 --dry-run
//   node --experimental-sqlite --env-file=.env scripts/sync-novas-to-postgres.mjs --since-hours 30 --apply
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const shArg = process.argv.indexOf('--since-hours');
const SINCE_HOURS = shArg >= 0 && process.argv[shArg + 1] ? Number(process.argv[shArg + 1]) : 30;

const TS_COLS = new Set(['collected_at', 'updated_at', 'ai_answer_generated_at', 'checked_at', 'ai_generated_at', 'user_edited_at']);
const Q_COLS = ['id_question','url','statement_html','statement_text','statement_hash','content_hash','type_question','format_question','banca','banca_url','orgao_sigla','orgao_nome','orgao_url','cargo','concurso_id','concurso_ano','concurso_url','materia_id','materia','assunto_id','assunto','assunto_url','capitulo','anulada','desatualizada','possui_comentario','possui_comentario_video','possui_comentario_ia','possui_resolucao_banca','raw_json','collected_at','updated_at','official_answer','official_answer_source','ai_answer','ai_answer_model','ai_answer_generated_at'];
const C_COLS = ['question_id','html','text','professor','date_text','extracted_answer','raw_json','checked_at','html_local','source_type','ai_model','ai_generated_at','ai_confidence','user_edited_at','user_edited_by','extracted_answer_source'];
const A_COLS = ['question_id','position','letter','html','text'];

function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = TS_COLS.has(k) && (v === '' || v == null) ? null : v;
  return out;
}
const setClause = (cols, pk) => cols.filter((c) => !pk.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

const db = new DatabaseSync('questoes-prf.sqlite', { readOnly: true });
const ids = db.prepare(`
  SELECT DISTINCT q.id_question
  FROM questions q
  JOIN comments c ON c.question_id = q.id_question
  WHERE q.collected_at > datetime('now', ?)
    AND COALESCE(NULLIF(c.extracted_answer, ''), '') <> ''
`).all(`-${SINCE_HOURS} hours`).map((r) => r.id_question);

const semGab = db.prepare(`
  SELECT count(*) n FROM questions q
  WHERE q.collected_at > datetime('now', ?)
    AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.question_id = q.id_question AND COALESCE(NULLIF(c.extracted_answer,''),'') <> '')
`).get(`-${SINCE_HOURS} hours`).n;

console.log(`Janela: últimas ${SINCE_HOURS}h`);
console.log(`Novas COM gabarito a sincronizar: ${ids.length}`);
console.log(`Novas SEM gabarito (não sincronizadas): ${semGab}`);

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

try {
  // segurança: quantas dessas já existem no prod? (0 = insert puro, sem sobrescrita)
  let jaNoProd = 0;
  for (const b of chunk(ids, 500)) {
    const r = await sql`SELECT count(*)::int n FROM questions WHERE id_question = ANY(${b})`;
    jaNoProd += r[0].n;
  }
  console.log(`Dessas, JÁ existem no prod: ${jaNoProd} ${jaNoProd === 0 ? '(INSERT puro — nada será sobrescrito ✅)' : '⚠ (seriam ATUALIZADAS — confira antes)'}`);

  if (!apply) { console.log('\nDRY-RUN. Use --apply para enviar ao prod.'); await sql.end(); db.close(); process.exit(0); }

  const qGet = db.prepare(`SELECT ${Q_COLS.join(',')} FROM questions WHERE id_question = ?`);
  const cGet = db.prepare(`SELECT ${C_COLS.join(',')} FROM comments WHERE question_id = ?`);
  const aGet = db.prepare(`SELECT ${A_COLS.join(',')} FROM alternatives WHERE question_id = ? ORDER BY position`);
  let nq = 0, nc = 0, na = 0;
  for (const batch of chunk(ids, 150)) {
    const qRows = batch.map((id) => clean(qGet.get(id))).filter(Boolean);
    if (qRows.length) { await sql`INSERT INTO questions ${sql(qRows, ...Q_COLS)} ON CONFLICT (id_question) DO UPDATE SET ${sql.unsafe(setClause(Q_COLS, ['id_question']))}`; nq += qRows.length; }
    const cRows = batch.map((id) => cGet.get(id)).filter(Boolean).map(clean);
    if (cRows.length) { await sql`INSERT INTO comments ${sql(cRows, ...C_COLS)} ON CONFLICT (question_id) DO UPDATE SET ${sql.unsafe(setClause(C_COLS, ['question_id']))}`; nc += cRows.length; }
    const aRows = batch.flatMap((id) => aGet.all(id)).map(clean);
    if (aRows.length) { await sql`INSERT INTO alternatives ${sql(aRows, ...A_COLS)} ON CONFLICT (question_id, position) DO UPDATE SET ${sql.unsafe(setClause(A_COLS, ['question_id', 'position']))}`; na += aRows.length; }
    console.log(`  ...${nq} questões, ${nc} comentários, ${na} alternativas`);
  }
  console.log(`\nOK: ${nq} questões, ${nc} comentários, ${na} alternativas sincronizadas no prod.`);
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; }
finally { await sql.end(); db.close(); }
