/**
 * Exporta as questões SEM gabarito que têm comentário do professor, para
 * inferência assistida por IA. Grava tmp/gabarito-candidates.json.
 * Uso: node scripts/export-gabarito-candidates.mjs --db-client postgres
 */
import '../src/load-env.mjs';
import fs from 'node:fs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, arr) =>
  a.startsWith('--') ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : []));
const { db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite', databaseUrl: process.env.DATABASE_URL, client: args['db-client'] || '' });

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
  .replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

const noAns = `COALESCE(q.official_answer,'')='' AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id=q.id_question AND COALESCE(nq.answer,'')<>'') AND COALESCE(c.extracted_answer,'')=''`;
const valid = `COALESCE(q.anulada,0)=0 AND COALESCE(q.desatualizada,0)=0`;
const rows = db.prepare(`
  SELECT q.id_question id, q.type_question type, q.materia materia, q.statement_text stmt, COALESCE(c.text,c.html,'') comment
  FROM questions q JOIN comments c ON c.question_id=q.id_question AND COALESCE(c.text,c.html,'')<>''
  WHERE ${valid} AND ${noAns}
  ORDER BY q.id_question`).all();

const alt = db.prepare('SELECT letter, text FROM alternatives WHERE question_id=? ORDER BY position');
const out = rows.map((r) => ({
  id: r.id,
  type: r.type,
  materia: r.materia,
  statement: strip(r.stmt).slice(0, 900),
  alternatives: alt.all(r.id).map((a) => ({ letter: a.letter, text: strip(a.text).slice(0, 220) })),
  comment: strip(r.comment).slice(0, 2200)
}));

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/gabarito-candidates.json', JSON.stringify(out));
console.log(`exportadas ${out.length} candidatas -> tmp/gabarito-candidates.json`);
console.log('tipos:', JSON.stringify(out.reduce((m, x) => { m[x.type] = (m[x.type] || 0) + 1; return m; }, {})));
