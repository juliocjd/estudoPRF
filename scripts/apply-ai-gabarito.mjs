/**
 * Aplica os gabaritos inferidos por IA (saida do workflow inferir-gabarito),
 * marcando-os com extracted_answer_source='ai_inferred' para o app sinalizar.
 *
 * Uso: node scripts/apply-ai-gabarito.mjs --file tmp/ai-gabarito.json [--apply] [--db-client postgres]
 *   tmp/ai-gabarito.json = { accepted: [{id, answer, confidence, evidence}] }
 */
import '../src/load-env.mjs';
import fs from 'node:fs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : []));
const apply = Boolean(args.apply);
const file = args.file || 'tmp/ai-gabarito.json';
const { db, client } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite', databaseUrl: process.env.DATABASE_URL, client: args['db-client'] || '' });

// garante a coluna marcadora (idempotente, cross-db)
try {
  if (client === 'postgres') db.exec(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS extracted_answer_source TEXT`);
  else db.exec(`ALTER TABLE comments ADD COLUMN extracted_answer_source TEXT`);
  console.log('[schema] coluna extracted_answer_source ok');
} catch (e) { console.log('[schema] coluna ja existe:', String(e.message).slice(0, 60)); }

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const accepted = payload.accepted || payload;
console.log(`[apply] modo=${apply ? 'APPLY' : 'dry-run'} candidatos=${accepted.length}`);

const qInfo = db.prepare('SELECT type_question type FROM questions WHERE id_question=?');
const altLetters = db.prepare('SELECT letter FROM alternatives WHERE question_id=?');
// so grava se ainda estiver SEM gabarito (seguranca: nao sobrescreve)
const stillEmpty = db.prepare(`SELECT 1 FROM comments c JOIN questions q ON q.id_question=c.question_id
  WHERE c.question_id=? AND COALESCE(q.official_answer,'')='' AND COALESCE(c.extracted_answer,'')=''
    AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id=c.question_id AND COALESCE(nq.answer,'')<>'')`);
const update = db.prepare(`UPDATE comments SET extracted_answer=?, extracted_answer_source='ai_inferred', checked_at=CURRENT_TIMESTAMP WHERE question_id=?`);

let gravadas = 0, invalidas = 0, jaTinha = 0;
for (const a of accepted) {
  const ans = String(a.answer || '').trim().toUpperCase();
  const info = qInfo.get(a.id);
  if (!info) { invalidas++; continue; }
  const T = String(info.type || '').toUpperCase();
  let valid = false;
  if (T === 'CERTO_ERRADO') valid = ans === 'CERTO' || ans === 'ERRADO';
  else if (T === 'MULTIPLA_ESCOLHA') {
    if (/^[A-E]$/.test(ans)) {
      const letters = altLetters.all(a.id).map((x) => String(x.letter || '').toUpperCase());
      valid = !letters.length || letters.includes(ans);
    }
  }
  if (!valid) { invalidas++; continue; }
  if (!stillEmpty.get(a.id)) { jaTinha++; continue; }
  gravadas++;
  if (apply) update.run(ans, a.id);
}

console.log(JSON.stringify({ gravadas, invalidas, ja_tinha_gabarito: jaTinha, modo: apply ? 'APPLY' : 'dry-run' }, null, 2));
if (typeof db.close === 'function') db.close();
