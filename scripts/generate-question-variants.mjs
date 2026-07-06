#!/usr/bin/env node
/**
 * Gerador de VARIANTES de questões via IA (camada src/study/ai-provider.mjs).
 *
 * Pega questões que você ERROU e gera variantes certo/errado que trocam o
 * detalhe crítico (prazo, autoridade, palavra restritiva) — treina o mesmo
 * ponto por outro ângulo. Variantes entram como RASCUNHO (variant_drafts) e
 * só viram questões estudáveis após sua aprovação.
 *
 * Uso:
 *   node scripts/generate-question-variants.mjs                → gera p/ últimos 10 erros
 *   node scripts/generate-question-variants.mjs --limit 5
 *   node scripts/generate-question-variants.mjs --question-id 3040
 *   node scripts/generate-question-variants.mjs --list         → lista rascunhos
 *   node scripts/generate-question-variants.mjs --approve      → publica rascunhos (ids 920M+)
 *   node scripts/generate-question-variants.mjs --discard 12   → descarta rascunho
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { loadEnvFiles } from './lib/env.mjs';
import { generateText, aiAvailable, extractJson } from '../src/study/ai-provider.mjs';

loadEnvFiles();

const VARIANT_ID_START = 920000000;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);

const db = new DatabaseSync(path.resolve(value('db', 'questoes-prf.sqlite')));

db.exec(`
  CREATE TABLE IF NOT EXISTS variant_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_question_id INTEGER NOT NULL,
    statement_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    changed_detail TEXT,
    model TEXT,
    status TEXT DEFAULT 'draft',
    published_question_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

if (flag('list')) {
  const drafts = db.prepare(`SELECT * FROM variant_drafts WHERE status = 'draft' ORDER BY id`).all();
  console.log(`${drafts.length} rascunho(s) pendente(s):\n`);
  for (const draft of drafts) {
    console.log(`#${draft.id} (mãe ${draft.parent_question_id}) → ${draft.answer}`);
    console.log(`  ${draft.statement_text.slice(0, 220)}`);
    console.log(`  detalhe trocado: ${draft.changed_detail}\n`);
  }
  process.exit(0);
}

if (flag('discard')) {
  const id = Number(value('discard'));
  db.prepare(`UPDATE variant_drafts SET status = 'discarded' WHERE id = ?`).run(id);
  console.log(`Rascunho #${id} descartado.`);
  process.exit(0);
}

if (flag('approve')) {
  const drafts = db.prepare(`SELECT * FROM variant_drafts WHERE status = 'draft' ORDER BY id`).all();
  if (!drafts.length) { console.log('Nenhum rascunho para aprovar.'); process.exit(0); }
  const parentStmt = db.prepare('SELECT * FROM questions WHERE id_question = ?');
  const maxRow = db.prepare(`SELECT MAX(id_question) AS max_id FROM questions WHERE id_question >= ${VARIANT_ID_START} AND id_question < 930000000`).get();
  let nextId = Math.max(VARIANT_ID_START, Number(maxRow?.max_id || 0) + 1);
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id_question, url, statement_html, statement_text, type_question, format_question,
      banca, materia_id, materia, assunto_id, assunto, anulada, desatualizada,
      possui_comentario, official_answer, official_answer_source, collected_at, updated_at
    ) VALUES (?, ?, ?, ?, 'CERTO_ERRADO', 'OBJETIVA', 'IA (variante)', ?, ?, ?, ?, 0, 0, 1, ?, 'ai_variant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertAlt = db.prepare(`INSERT INTO alternatives (question_id, position, letter, html, text) VALUES (?, ?, ?, ?, ?)`);
  const insertComment = db.prepare(`
    INSERT INTO comments (question_id, html, text, professor, extracted_answer, source_type)
    VALUES (?, ?, ?, 'IA', ?, 'ai_variant')
  `);
  db.exec('BEGIN');
  try {
    for (const draft of drafts) {
      const parent = parentStmt.get(draft.parent_question_id) || {};
      const id = nextId; nextId += 1;
      const esc = (text) => String(text || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      insertQuestion.run(
        id, parent.url || '', `<p>${esc(draft.statement_text)}</p>`, draft.statement_text,
        parent.materia_id || null, parent.materia || '', parent.assunto_id || null, parent.assunto || '',
        draft.answer
      );
      insertAlt.run(id, 1, 'A', '<p>Certo</p>', 'Certo');
      insertAlt.run(id, 2, 'B', '<p>Errado</p>', 'Errado');
      const note = `Variante gerada por IA a partir da questão #${draft.parent_question_id}. Detalhe alterado: ${draft.changed_detail || '(não informado)'}. Gabarito: ${draft.answer}. Confira o comentário do professor na questão original.`;
      insertComment.run(id, `<p><em>${esc(note)}</em></p>`, note, draft.answer);
      db.prepare(`UPDATE variant_drafts SET status = 'published', published_question_id = ? WHERE id = ?`).run(id, draft.id);
    }
    db.exec('COMMIT');
    console.log(`Publicadas ${drafts.length} variantes (ids ${VARIANT_ID_START}+). Elas aparecem nos modos de estudo, nunca em simulados.`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  process.exit(0);
}

/* ---------- geração ---------- */

if (!aiAvailable()) {
  console.error('IA não configurada. Defina AI_PROVIDER e a chave no .env.');
  process.exit(1);
}

const limit = Number(value('limit', 10));
const questionIdArg = Number(value('question-id', 0));

const targets = questionIdArg
  ? db.prepare(`SELECT DISTINCT q.* FROM questions q WHERE q.id_question = ?`).all(questionIdArg)
  : db.prepare(`
      SELECT DISTINCT q.*
      FROM study_answers sa
      JOIN questions q ON q.id_question = sa.question_id
      WHERE sa.is_correct = 0 AND q.id_question < ${VARIANT_ID_START}
      ORDER BY sa.answered_at DESC
      LIMIT ${limit}
    `).all();

console.log(`Gerando variantes para ${targets.length} questão(ões) errada(s)...\n`);
let generated = 0;

for (const question of targets) {
  const comment = db.prepare('SELECT text, extracted_answer FROM comments WHERE question_id = ?').get(question.id_question);
  const gabarito = question.official_answer || comment?.extracted_answer || '';
  const alternatives = db.prepare('SELECT letter, text FROM alternatives WHERE question_id = ? ORDER BY position').all(question.id_question);

  const prompt = [
    'Crie 2 variantes CERTO/ERRADO da questão de concurso abaixo, no estilo Cebraspe.',
    'Cada variante deve testar O MESMO conhecimento trocando UM detalhe crítico (prazo, autoridade competente, palavra restritiva como "sempre/somente/apenas", exceção omitida).',
    'Uma variante deve ter gabarito CERTO e a outra ERRADO.',
    'Responda APENAS com JSON: {"variants": [{"statement": "...", "answer": "CERTO|ERRADO", "changed_detail": "o que foi trocado em relação ao original"}]}',
    '',
    `MATÉRIA: ${question.materia} / ${question.assunto}`,
    `QUESTÃO ORIGINAL: ${String(question.statement_text || '').slice(0, 1400)}`,
    alternatives.length ? `ALTERNATIVAS: ${alternatives.map((alt) => `${alt.letter}) ${String(alt.text || '').slice(0, 150)}`).join(' | ')}` : '',
    `GABARITO ORIGINAL: ${gabarito}`,
    comment?.text ? `EXPLICAÇÃO DO PROFESSOR: ${String(comment.text).slice(0, 1000)}` : ''
  ].filter(Boolean).join('\n');

  const result = await generateText({ prompt, maxTokens: 900, temperature: 0.5 });
  if (!result.ok) {
    console.log(`  #${question.id_question}: FALHA — ${result.error}`);
    continue;
  }
  const parsed = extractJson(result.text);
  const variants = Array.isArray(parsed?.variants) ? parsed.variants : [];
  for (const variant of variants) {
    const answer = String(variant.answer || '').toUpperCase();
    const statement = String(variant.statement || '').trim();
    if (!statement || !['CERTO', 'ERRADO'].includes(answer)) continue;
    db.prepare(`
      INSERT INTO variant_drafts (parent_question_id, statement_text, answer, changed_detail, model)
      VALUES (?, ?, ?, ?, ?)
    `).run(question.id_question, statement, answer, String(variant.changed_detail || '').slice(0, 300), result.model || result.provider);
    generated += 1;
  }
  console.log(`  #${question.id_question}: ${variants.length} variante(s)`);
}

console.log(`\n${generated} rascunho(s) criados. Revise com --list e publique com --approve.`);
