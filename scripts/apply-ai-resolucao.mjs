/**
 * Aplica as resolucoes geradas por IA (workflow resolver-gabarito): grava o
 * gabarito E o comentario (resolucao), marcados como GERADOS por IA.
 *
 * Marcadores dedicados (nao confundir com o comentario do professor):
 *   comments.source_type            = 'ai_generated'   (o texto e resolucao de IA)
 *   comments.extracted_answer_source = 'ai_generated'  (o gabarito e de IA)
 *
 * Uso: node scripts/apply-ai-resolucao.mjs --file tmp/ai-resolucao.json [--apply] [--db-client postgres]
 */
import '../src/load-env.mjs';
import fs from 'node:fs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : []));
const apply = Boolean(args.apply);
const file = args.file || 'tmp/ai-resolucao.json';
const { db, client } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite', databaseUrl: process.env.DATABASE_URL, client: args['db-client'] || '' });

try {
  if (client === 'postgres') db.exec(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS extracted_answer_source TEXT`);
  else db.exec(`ALTER TABLE comments ADD COLUMN extracted_answer_source TEXT`);
} catch { /* ja existe */ }

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (t) => `<p>${esc(t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const accepted = payload.accepted || payload;
console.log(`[apply] modo=${apply ? 'APPLY' : 'dry-run'} candidatos=${accepted.length}`);

const qInfo = db.prepare('SELECT type_question type FROM questions WHERE id_question=?');
const altLetters = db.prepare('SELECT letter FROM alternatives WHERE question_id=?');
// seguranca: so grava se AINDA sem gabarito e SEM comentario
const canWrite = db.prepare(`SELECT 1 FROM questions q
  WHERE q.id_question=? AND COALESCE(q.official_answer,'')=''
    AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id=q.id_question AND COALESCE(nq.answer,'')<>'')
    AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.question_id=q.id_question AND (COALESCE(c.text,c.html,'')<>'' OR COALESCE(c.extracted_answer,'')<>''))`);
const exists = db.prepare('SELECT 1 FROM comments WHERE question_id=?');
const upd = db.prepare(`UPDATE comments SET text=?, html=?, source_type='ai_generated', extracted_answer=?, extracted_answer_source='ai_generated', ai_generated_at=CURRENT_TIMESTAMP, checked_at=CURRENT_TIMESTAMP WHERE question_id=?`);
const ins = db.prepare(`INSERT INTO comments (question_id, text, html, source_type, extracted_answer, extracted_answer_source, ai_generated_at, checked_at) VALUES (?, ?, ?, 'ai_generated', ?, 'ai_generated', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);

let gravadas = 0, invalidas = 0, bloqueadas = 0;
for (const a of accepted) {
  const ans = String(a.answer || '').trim().toUpperCase();
  const expl = String(a.explanation || '').trim();
  const info = qInfo.get(a.id);
  if (!info || !expl) { invalidas++; continue; }
  const T = String(info.type || '').toUpperCase();
  let valid = false;
  if (T === 'CERTO_ERRADO') valid = ans === 'CERTO' || ans === 'ERRADO';
  else if (T === 'MULTIPLA_ESCOLHA' && /^[A-E]$/.test(ans)) {
    const letters = altLetters.all(a.id).map((x) => String(x.letter || '').toUpperCase());
    valid = !letters.length || letters.includes(ans);
  }
  if (!valid) { invalidas++; continue; }
  if (!canWrite.get(a.id)) { bloqueadas++; continue; }
  gravadas++;
  if (apply) {
    if (exists.get(a.id)) upd.run(expl, toHtml(expl), ans, a.id);
    else ins.run(a.id, expl, toHtml(expl), ans);
  }
}

console.log(JSON.stringify({ gravadas, invalidas, bloqueadas_ja_tinha: bloqueadas, modo: apply ? 'APPLY' : 'dry-run' }, null, 2));
if (typeof db.close === 'function') db.close();
