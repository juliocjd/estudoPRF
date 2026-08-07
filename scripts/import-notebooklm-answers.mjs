// Importa o retorno do NotebookLM ({respostas:[...]}) para question_current_law_answers.
// Normaliza CE (A->CERTO / B->ERRADO, conferindo com a explicação) e valida a
// letra em MC. Reversível: faz backup das linhas atuais antes de sobrescrever.
//   node --experimental-sqlite --env-file=.env scripts/import-notebooklm-answers.mjs --file tmp/notebooklm-return/respostas-equipamentos.json
//   ... --apply
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const fi = process.argv.indexOf('--file');
if (fi < 0 || !process.argv[fi + 1]) { console.error('Uso: --file <retorno.json> [--apply]'); process.exit(1); }
const FILE = process.argv[fi + 1];
const STATUS_MAP = { verificada: 'verified', sem_alternativa_valida: 'no_valid_alternative', descartar: 'discard' };
const SOURCE_VERSION = `NotebookLM/${new Date().toISOString().slice(0, 10)}`;

const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
const respostas = Array.isArray(parsed?.respostas) ? parsed.respostas : (Array.isArray(parsed) ? parsed : []);
console.log(`respostas no arquivo: ${respostas.length}`);

const db = new DatabaseSync('questoes-prf.sqlite');
const qGet = db.prepare(`
  SELECT q.type_question, q.desatualizada,
    COALESCE(NULLIF(q.official_answer,''), c.extracted_answer, '') AS hist
  FROM questions q LEFT JOIN comments c ON c.question_id = q.id_question
  WHERE q.id_question = ?`);
const altGet = db.prepare('SELECT UPPER(letter) l FROM alternatives WHERE question_id = ?');

const norm = (s) => String(s || '').trim().toUpperCase();
// Repara mojibake (UTF-8 lido como Latin-1) só quando detectado; texto limpo passa direto.
function fixEnc(s) {
  const str = String(s || '');
  if (!/Ã.|Â./.test(str)) return str;
  try { return Buffer.from(str, 'latin1').toString('utf8'); } catch { return str; }
}
function normalizeAnswer(type, gab, explicacao, validLetters) {
  if (String(type).toUpperCase() === 'CERTO_ERRADO') {
    const up = norm(gab);
    let ans = (up === 'CERTO' || up === 'ERRADO') ? up : up === 'A' ? 'CERTO' : up === 'B' ? 'ERRADO' : '';
    const m = String(explicacao || '').match(/gabarito\s+(CERTO|ERRADO)/i);
    const fromExpl = m ? m[1].toUpperCase() : '';
    const conflict = Boolean(ans && fromExpl && ans !== fromExpl);
    if (!ans && fromExpl) ans = fromExpl;
    return { ans, conflict };
  }
  const up = norm(gab).replace(/[^A-E]/g, '');
  return { ans: validLetters.has(up) ? up : '', conflict: false };
}

const recs = [];
const warns = [];
const counts = { verified: 0, no_valid_alternative: 0, discard: 0, needs_audit: 0, notfound: 0 };
for (const r of respostas) {
  const id = Number(r?.id);
  const q = id ? qGet.get(id) : null;
  if (!q) { counts.notfound++; warns.push(`Q${r?.id}: não encontrada no banco`); continue; }
  const validLetters = new Set(altGet.all(id).map((a) => a.l));
  let status = STATUS_MAP[String(r?.status || '').trim()] || 'needs_audit';
  const { ans, conflict } = normalizeAnswer(q.type_question, r?.gabaritoAtual, r?.explicacao, validLetters);
  if (conflict) warns.push(`Q${id}: conflito CE (gabaritoAtual vs explicação) — revisar`);
  if (status === 'verified' && !ans) { status = 'needs_audit'; warns.push(`Q${id}: verificada sem gabarito válido -> needs_audit`); }
  const noValid = status === 'no_valid_alternative';
  const discard = status === 'discard';
  const canScore = status === 'verified' && Boolean(ans);
  const currentAnswer = canScore ? ans : '';
  const hist = norm(q.hist);
  recs.push({
    question_id: id,
    historical_answer: q.hist || '',
    current_answer: currentAnswer,
    current_law_status: status,
    can_auto_score_current_law: canScore,
    do_not_use_historical_answer_in_current_law_mode: true,
    answer_changed: Boolean(currentAnswer && hist && norm(currentAnswer) !== hist),
    no_valid_alternative: noValid,
    should_discard_from_current_law_study: discard,
    hide_from_main_study_until_verified: false,
    legal_basis: fixEnc(r?.fundamento).slice(0, 30000),
    article_reference: fixEnc(r?.fundamento).slice(0, 12000),
    article_excerpt: '',
    teacher_explanation: fixEnc(r?.explicacao).slice(0, 30000),
    rule_summary: fixEnc(r?.resumoRegra).slice(0, 30000),
    professor_complement: '',
    study_conclusion: '',
    source_url: '',
    verification_method: 'notebooklm',
    source_version: SOURCE_VERSION,
    teaching_comment_md: '',
    raw_json: JSON.stringify({ source: 'notebooklm', file: FILE, importedAt: new Date().toISOString(), fundamento: r?.fundamento || '' }),
  });
  counts[status] = (counts[status] || 0) + 1;
}

console.log('\n=== resumo ===');
console.log('verified:', counts.verified, '| no_valid_alternative:', counts.no_valid_alternative, '| discard:', counts.discard, '| needs_audit:', counts.needs_audit, '| não encontradas:', counts.notfound);
if (warns.length) { console.log('\navisos:'); for (const w of warns.slice(0, 40)) console.log('  -', w); if (warns.length > 40) console.log(`  ... +${warns.length - 40}`); }

const COLS = Object.keys(recs[0] || {});
const TS = ', imported_at, updated_at';
if (!apply) { console.log(`\nDRY-RUN (${recs.length} a gravar). Use --apply.`); db.close(); process.exit(0); }

// backup das linhas atuais (local + prod) antes de sobrescrever
const ids = recs.map((r) => r.question_id);
try { mkdirSync('tmp', { recursive: true }); } catch {}
const localBackup = db.prepare(`SELECT * FROM question_current_law_answers WHERE question_id IN (${ids.map(() => '?').join(',')})`).all(...ids);

// LOCAL upsert
const ph = COLS.map(() => '?').join(', ');
const setL = COLS.filter((c) => c !== 'question_id').map((c) => `${c}=excluded.${c}`).join(', ');
const insL = db.prepare(`INSERT INTO question_current_law_answers (${COLS.join(', ')}${TS}) VALUES (${ph}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(question_id) DO UPDATE SET ${setL}, updated_at=CURRENT_TIMESTAMP`);
db.exec('BEGIN');
for (const r of recs) insL.run(...COLS.map((c) => (typeof r[c] === 'boolean' ? (r[c] ? 1 : 0) : r[c])));
db.exec('COMMIT');
console.log(`\nLOCAL: ${recs.length} gravadas.`);
db.close();

// PROD upsert
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const prodBackup = await sql`SELECT * FROM question_current_law_answers WHERE question_id = ANY(${ids})`;
  writeFileSync(`tmp/import-notebooklm-backup-${Date.now()}.json`, JSON.stringify({ file: FILE, localBackup, prodBackup }, null, 1));
  const setP = COLS.filter((c) => c !== 'question_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  let nq = 0;
  for (const b of chunk(recs, 100)) {
    await sql`INSERT INTO question_current_law_answers ${sql(b, ...COLS)} ON CONFLICT (question_id) DO UPDATE SET ${sql.unsafe(setP)}, updated_at = now()`;
    nq += b.length;
  }
  console.log(`PROD: ${nq} gravadas.  (backup em tmp/)`);
} catch (e) { console.error('ERRO PROD:', e.message); process.exitCode = 1; } finally { await sql.end(); }
