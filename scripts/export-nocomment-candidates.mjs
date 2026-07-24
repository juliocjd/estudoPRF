/**
 * Exporta as questoes SEM comentario (e sem gabarito), mapeadas ao perfil, para
 * a IA RESOLVER + COMENTAR do zero. Grava tmp/gabarito-candidates.json (reusa o
 * splitter). Uso: node scripts/export-nocomment-candidates.mjs --db-client postgres
 */
import '../src/load-env.mjs';
import fs from 'node:fs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : []));
const { db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite', databaseUrl: process.env.DATABASE_URL, client: args['db-client'] || '' });

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
  .replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const valid = `COALESCE(q.anulada,0)=0 AND COALESCE(q.desatualizada,0)=0`;
const noAns = `COALESCE(q.official_answer,'')='' AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id=q.id_question AND COALESCE(nq.answer,'')<>'') AND COALESCE((SELECT c.extracted_answer FROM comments c WHERE c.question_id=q.id_question),'')=''`;
const noComment = `NOT EXISTS (SELECT 1 FROM comments c WHERE c.question_id=q.id_question AND COALESCE(c.text,c.html,'')<>'')`;
const rows = db.prepare(`
  SELECT q.id_question id, q.type_question type, q.materia materia, q.assunto assunto, q.statement_text stmt
  FROM questions q
  JOIN question_exam_subjects qes ON qes.question_id=q.id_question AND qes.profile_id='prf_principais'
  WHERE ${valid} AND ${noAns} AND ${noComment} AND COALESCE(q.statement_text,'')<>''
  ORDER BY q.id_question`).all();

const alt = db.prepare('SELECT letter, text FROM alternatives WHERE question_id=? ORDER BY position');
const out = rows.map((r) => ({
  id: r.id,
  type: r.type,
  materia: r.materia,
  assunto: r.assunto || '',
  statement: strip(r.stmt).slice(0, 1600),
  alternatives: alt.all(r.id).map((a) => ({ letter: a.letter, text: strip(a.text).slice(0, 300) }))
}));

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/gabarito-candidates.json', JSON.stringify(out));
console.log(`exportadas ${out.length} -> tmp/gabarito-candidates.json`);
console.log('tipos:', JSON.stringify(out.reduce((m, x) => { m[x.type] = (m[x.type] || 0) + 1; return m; }, {})));
