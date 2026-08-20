// Importa questões Certo/Errado de "teses fixadas STF/STJ" (geradas por IA num
// Google Doc, exportadas como JSON) para o banco de produção. UPSERT por ID
// deterministico: rodar de novo ADICIONA as novas e ATUALIZA as que mudaram,
// sem duplicar. As questões viram questoes normais -> herdam adaptativo,
// filtros, "Revisar hoje" e repeticao espacada automaticamente.
//
// Uso:
//   node --env-file=.env scripts/importar-teses.mjs data/teses.json            (dry-run)
//   node --env-file=.env scripts/importar-teses.mjs data/teses.json --apply
//
// Schema esperado (ver README no chat): { materia, questoes:[{id,assunto,ano,enunciado,gabarito,tese}] }
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('Uso: node --env-file=.env scripts/importar-teses.mjs <arquivo.json> [--apply]'); process.exit(1); }

const raw = readFileSync(file, 'utf8');
let doc;
try { doc = JSON.parse(raw); } catch (e) { console.error('JSON invalido:', e.message); process.exit(1); }
const MATERIA = String(doc.materia || 'Teses fixadas do STJ e STF').trim();
const questoes = Array.isArray(doc.questoes) ? doc.questoes : [];
if (!questoes.length) { console.error('Nenhuma questao no arquivo.'); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// tese -> HTML (paragrafos por linha em branco; **negrito**, - listas)
function teseToHtml(t) {
  const txt = String(t || '').trim();
  if (!txt) return '';
  const blocks = txt.replace(/\r/g, '').split(/\n\s*\n/);
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const normGab = (g) => { const s = String(g || '').trim().toUpperCase(); return /^(C|CERTO|CORRETO|VERDADEIRO|V)$/.test(s) ? 'CERTO' : /^(E|ERRADO|INCORRETO|FALSO|F)$/.test(s) ? 'ERRADO' : ''; };
const stableId = (q) => {
  const key = String(q.id || q.enunciado || '').trim();
  const h = parseInt(createHash('sha1').update(MATERIA + '|' + key).digest('hex').slice(0, 10), 16);
  return 950000000 + (h % 40000000); // faixa reservada 950M-990M
};
const sha = (s) => createHash('sha1').update(String(s || '')).digest('hex');

const rows = [];
const problemas = [];
const idsVistos = new Set();
for (const q of questoes) {
  const enun = String(q.enunciado || '').trim();
  const gab = normGab(q.gabarito);
  if (!enun) { problemas.push('questao sem enunciado'); continue; }
  if (!gab) { problemas.push(`gabarito invalido em "${enun.slice(0, 40)}..." (use CERTO/ERRADO)`); continue; }
  const id = stableId(q);
  if (idsVistos.has(id)) { problemas.push(`ID colidiu/duplicado: "${enun.slice(0, 40)}..." (de um 'id' repetido?)`); continue; }
  idsVistos.add(id);
  rows.push({
    id, enun, gab,
    assunto: String(q.assunto || 'Teses fixadas').trim(),
    ano: Number(q.ano) || null,
    tese_html: teseToHtml(q.tese),
  });
}
console.log(`Materia: ${MATERIA}`);
console.log(`Questoes validas: ${rows.length} | com problema: ${problemas.length}`);
problemas.slice(0, 10).forEach((p) => console.log('  ! ' + p));

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const ids = rows.map((r) => r.id);
  const existentes = new Set((ids.length ? await sql`SELECT id_question FROM questions WHERE id_question = ANY(${ids})` : []).map((r) => Number(r.id_question)));
  const novas = rows.filter((r) => !existentes.has(r.id)).length;
  console.log(`\nJa no banco (serao ATUALIZADAS): ${existentes.size} | NOVAS: ${novas}`);
  if (!apply) { console.log('\nDRY-RUN. Use --apply para gravar.'); await sql.end(); process.exit(0); }

  let n = 0;
  for (const r of rows) {
    await sql`
      INSERT INTO questions (id_question, statement_text, statement_html, statement_hash, content_hash, type_question, format_question, banca, materia, assunto, concurso_ano, anulada, desatualizada, collected_at, updated_at)
      VALUES (${r.id}, ${r.enun}, ${`<p>${esc(r.enun)}</p>`}, ${sha(r.enun)}, ${sha(r.enun + '|' + r.gab)}, 'CERTO_ERRADO', 'CERTO_ERRADO', 'Tese fixada (STF/STJ)', ${MATERIA}, ${r.assunto}, ${r.ano}, 0, 0, NOW(), NOW())
      ON CONFLICT (id_question) DO UPDATE SET
        statement_text = EXCLUDED.statement_text, statement_html = EXCLUDED.statement_html,
        statement_hash = EXCLUDED.statement_hash, content_hash = EXCLUDED.content_hash,
        materia = EXCLUDED.materia, assunto = EXCLUDED.assunto, concurso_ano = EXCLUDED.concurso_ano,
        desatualizada = 0, anulada = 0, updated_at = NOW()`;
    await sql`
      INSERT INTO comments (question_id, extracted_answer, extracted_answer_source, html_local, text, source_type, user_edited_at, user_edited_by, checked_at)
      VALUES (${r.id}, ${r.gab}, 'tese_fixada', ${r.tese_html}, ${r.tese_html.replace(/<[^>]+>/g, ' ').trim()}, 'tese_fixada', NOW(), 'import', NOW())
      ON CONFLICT (question_id) DO UPDATE SET
        extracted_answer = EXCLUDED.extracted_answer, extracted_answer_source = 'tese_fixada',
        html_local = EXCLUDED.html_local, text = EXCLUDED.text, source_type = 'tese_fixada', checked_at = NOW()`;
    // alternativas Certo/Errado (padrao das CE do banco)
    await sql`INSERT INTO alternatives (question_id, position, letter, text) VALUES (${r.id},1,'A','Certo'),(${r.id},2,'B','Errado')
      ON CONFLICT (question_id, position) DO UPDATE SET letter = EXCLUDED.letter, text = EXCLUDED.text`;
    n++;
  }
  console.log(`\nOK: ${n} teses importadas/atualizadas na materia "${MATERIA}".`);
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; }
finally { await sql.end(); }
