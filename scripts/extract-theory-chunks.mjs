/**
 * Extrai questões de uma matéria (sem card publicado) em arquivos-chunk que os
 * agentes do run multiagente leem para gerar teoria aplicada.
 *
 *   node scripts/extract-theory-chunks.mjs --materia "Legislação de Trânsito e Transportes" \
 *     --limit 500 --per 10 --offset 50 --out tmp/theory_chunks
 *
 * --offset pula as N primeiras (para gerar em lotes sem repetir).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next; i += 1;
  }
  return args;
}

function htmlToText(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2013;/g, '-')
    .replace(/\s+/g, ' ').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const materia = args.materia || 'Legislação de Trânsito e Transportes';
  const limit = Number(args.limit || 50);
  const per = Number(args.per || 10);
  const offset = Number(args.offset || 0);
  const outDir = path.resolve(ROOT_DIR, args.out || 'tmp/theory_chunks');

  const { db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite' });
  const getAlts = db.prepare('SELECT letter, text FROM alternatives WHERE question_id = ? ORDER BY position');
  const rows = db.prepare(`
    SELECT q.id_question, q.assunto, q.type_question, q.statement_text,
           COALESCE(NULLIF(q.official_answer,''), NULLIF(c.extracted_answer,''),'') AS answer,
           COALESCE(c.html_local,c.html,c.text,'') AS comment_html
    FROM questions q
    LEFT JOIN comments c ON c.question_id=q.id_question
    LEFT JOIN question_applied_theory_cards atc ON atc.question_id=q.id_question
      AND COALESCE(atc.publish_status,atc.card_status)='published'
    WHERE q.materia=? AND COALESCE(q.anulada,0)=0
      AND atc.question_id IS NULL AND COALESCE(q.statement_text,'')<>''
    ORDER BY q.id_question LIMIT ? OFFSET ?
  `).all(materia, limit, offset);

  const items = rows.map((r) => ({
    id: r.id_question, assunto: r.assunto || '', tipo: r.type_question || '', gabarito: r.answer || '',
    enunciado: htmlToText(r.statement_text).slice(0, 2000),
    alternativas: getAlts.all(r.id_question).map((a) => ({ letra: a.letter, texto: htmlToText(a.text).slice(0, 280) })),
    comentario: htmlToText(r.comment_html).slice(0, 800)
  }));

  await fsp.mkdir(outDir, { recursive: true });
  // limpa chunks antigos para não misturar lotes
  for (const f of (await fsp.readdir(outDir)).filter((f) => /^chunk_\d+\.json$/.test(f))) {
    await fsp.rm(path.join(outDir, f));
  }
  const names = [];
  let n = 0;
  for (let i = 0; i < items.length; i += per) {
    const name = `chunk_${String(n).padStart(2, '0')}.json`;
    await fsp.writeFile(path.join(outDir, name), JSON.stringify(items.slice(i, i + per), null, 1));
    names.push(name); n += 1;
  }
  console.log(`extraídas ${items.length} questões em ${n} chunks (offset ${offset}) -> ${path.relative(ROOT_DIR, outDir)}`);
  console.log(JSON.stringify(names));
  db.close?.();
}

main().catch((e) => { console.error(e); process.exit(1); });
