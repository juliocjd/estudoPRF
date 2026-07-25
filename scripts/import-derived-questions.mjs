/**
 * Importa ADITIVAMENTE (do SQLite local para o Neon/prod) as questões CE
 * DERIVADAS (id >= 910000000, official_answer_source='derived_from_parent_gabarito'),
 * mapeadas ao perfil prf_principais. NÃO usa --reset: só INSERE o que falta,
 * por id (idempotente), sem tocar em nada existente (histórico, etc.).
 *
 * Copia: questions + alternatives + comment + question_exam_subjects (prf_principais).
 * O selo "derivada" no app é detectado por official_answer_source.
 *
 * Uso: node scripts/import-derived-questions.mjs --db-client postgres [--apply] [--limit N]
 */
import '../src/load-env.mjs';
import { createRequire } from 'node:module';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : []));
const apply = Boolean(args.apply);
const limit = Number(args.limit || 0);
const PROFILE = 'prf_principais';

const local = new DatabaseSync(args.db || 'questoes-prf.sqlite');
const { db: prod } = openStudyDatabase({ databaseUrl: process.env.DATABASE_URL, client: args['db-client'] || 'postgres' });

const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// alvos: derivadas válidas mapeadas ao perfil
let targets = local.prepare(`
  SELECT DISTINCT q.id_question id
  FROM questions q
  JOIN question_exam_subjects qes ON qes.question_id = q.id_question AND qes.profile_id = '${PROFILE}'
  WHERE q.id_question >= 910000000
    AND COALESCE(q.official_answer,'') <> ''
    AND COALESCE(q.official_answer_source,'') = 'derived_from_parent_gabarito'
    AND COALESCE(q.anulada,0)=0 AND COALESCE(q.desatualizada,0)=0
  ORDER BY q.id_question
`).all().map((r) => Number(r.id));
if (limit > 0) targets = targets.slice(0, limit);

const prodIds = new Set(prod.prepare('SELECT id_question id FROM questions').all().map((r) => Number(r.id)));
const toInsert = targets.filter((id) => !prodIds.has(id));
console.log(`[import] alvos=${targets.length} | ja na prod=${targets.length - toInsert.length} | a inserir=${toInsert.length} | modo=${apply ? 'APPLY' : 'dry-run'}`);
if (!toInsert.length) { console.log('nada a inserir.'); process.exit(0); }

// colunas em comum (local ∩ prod) para cada tabela
const prodColsOf = (t) => new Set(prod.prepare(`SELECT column_name FROM information_schema.columns WHERE table_name = ?`).all(t).map((r) => r.column_name));
const localColsOf = (t) => local.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const commonCols = (t) => { const p = prodColsOf(t); return localColsOf(t).filter((c) => p.has(c)); };

// raw_json é não-essencial e pode ser jsonb na prod (evita erro de cast).
const qCols = commonCols('questions').filter((c) => c !== 'raw_json');
const aCols = commonCols('alternatives');
const cCols = commonCols('comments').filter((c) => c !== 'raw_json');
const sCols = commonCols('question_exam_subjects').filter((c) => c !== 'id'); // id é serial na prod

const idList = toInsert.join(',');
const qRows = local.prepare(`SELECT ${qCols.join(',')} FROM questions WHERE id_question IN (${idList})`).all();
const aRows = local.prepare(`SELECT ${aCols.join(',')} FROM alternatives WHERE question_id IN (${idList})`).all();
const cRows = local.prepare(`SELECT ${cCols.join(',')} FROM comments WHERE question_id IN (${idList})`).all();
const sRows = local.prepare(`SELECT ${sCols.join(',')} FROM question_exam_subjects WHERE question_id IN (${idList}) AND profile_id='${PROFILE}'`).all();
console.log(`  linhas: questions=${qRows.length} alternatives=${aRows.length} comments=${cRows.length} mapeamentos=${sRows.length}`);

// SQLite guarda muita coisa como '' onde o Postgres espera integer/boolean/
// timestamp. Coage por tipo real da coluna na prod.
const typeMapOf = (t) => new Map(prod.prepare(
  `SELECT column_name c, data_type d FROM information_schema.columns WHERE table_name = ?`
).all(t).map((r) => [r.c, r.d]));

function coerce(v, dt) {
  if (v === undefined) return null;
  const numeric = /^(integer|bigint|smallint|numeric|double precision|real)$/.test(dt || '');
  const isBool = dt === 'boolean';
  const isTime = /timestamp|date/.test(dt || '');
  if (v === '') return numeric || isBool || isTime ? null : '';
  if (isBool) return v === true || Number(v) === 1 || v === 't' || v === 'true';
  if (numeric && typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return v;
}

function batchInsert(table, cols, rows, batch = 40) {
  if (!rows.length) return 0;
  const types = typeMapOf(table);
  let done = 0;
  for (const part of chunk(rows, batch)) {
    const ph = part.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    const params = [];
    for (const r of part) for (const c of cols) params.push(coerce(r[c], types.get(c)));
    if (apply) prod.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph}`).run(...params);
    done += part.length;
  }
  return done;
}

if (apply) prod.exec('BEGIN');
try {
  const nq = batchInsert('questions', qCols, qRows);
  const na = batchInsert('alternatives', aCols, aRows);
  const nc = batchInsert('comments', cCols, cRows);
  const ns = batchInsert('question_exam_subjects', sCols, sRows);
  if (apply) prod.exec('COMMIT');
  console.log(JSON.stringify({ inseridas_questions: nq, alternatives: na, comments: nc, mapeamentos: ns, modo: apply ? 'APPLY' : 'dry-run' }, null, 2));
} catch (e) {
  if (apply) { try { prod.exec('ROLLBACK'); } catch {} }
  console.error('ERRO (rollback):', e.message);
  process.exit(1);
}
if (typeof prod.close === 'function') prod.close();
