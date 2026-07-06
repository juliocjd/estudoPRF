#!/usr/bin/env node
/**
 * Gerador de itens CERTO/ERRADO derivados de questões de múltipla escolha.
 *
 * Conversão DETERMINÍSTICA (sem IA): o gabarito da questão-mãe define o
 * gabarito de cada afirmação. Filtros conservadores descartam alternativas
 * que não são proposições autocontidas (combos "I e II", "todas as anteriores",
 * questões de associação/lacuna/sequência etc).
 *
 * Proveniência: cada item guarda parent_question_id + letra de origem na
 * tabela derived_ce_items, e herda o comentário do professor da questão-mãe.
 *
 * Uso:
 *   node scripts/generate-derived-ce-items.mjs                 → dry-run (relatório + amostras)
 *   node scripts/generate-derived-ce-items.mjs --apply         → grava no banco
 *   node scripts/generate-derived-ce-items.mjs --db caminho.sqlite
 *   node scripts/generate-derived-ce-items.mjs --limit 50      → limita questões-mãe processadas
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const GENERATOR_VERSION = 'derived-ce-v1';
export const DERIVED_CE_ID_START = 910000000;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dbPathArg = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'questoes-prf.sqlite';
const limitArg = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;

const db = new DatabaseSync(path.resolve(dbPathArg));

/* ---------- filtros ---------- */

const STEM_SKIP = [
  /respectivamente/i,
  /complete|preench|lacuna/i,
  /coluna|correlacione|associe|relacione/i,
  /sequ[êe]ncia|ordem (correta|crescente|decrescente)|numere/i,
  /assinale a (op[çc][ãa]o|alternativa) que (apresenta|cont[ée]m|indica|lista|traz|melhor)/i,
  /quantos|qual (o|a) (n[úu]mero|valor|percentual|prazo)/i
];

const STEM_NEGATIVE = /assinale.{0,60}(incorreta|errada|falsa)|exceto|marque.{0,40}(incorreta|errada|falsa)|n[ãa]o (é correto|está correta|constitui|se inclui|representa)/i;
const STEM_POSITIVE = /assinale|marque|indique|aponte|é correto afirmar|está[ão]? correta|correta[s]? (é|está|são)|julgue|pode-se afirmar/i;
const STEM_COMMAND_SENTENCE = /assinale|marque|indique|aponte|julgue|é correto afirmar|pode-se afirmar|est[áã]o? correta/i;

const ALT_SKIP = [
  /^(apenas|somente|todas?|nenhuma?|ambas|n\.?\s?d\.?\s?a)/i,
  /\b(alternativa|op[çc][ãa]o|letra [a-e])\b/i,
  /\bitens?\s+[ivx]+\b/i,
  /^[ivx\d\s,.e()-]+$/i,
  /(anteriores|acima|abaixo) (est[ãa]o|s[ãa]o)/i
];

function isEligibleAlternative(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.length < 50) return false;
  if (trimmed.split(/\s+/).length < 8) return false;
  return !ALT_SKIP.some((pattern) => pattern.test(trimmed));
}

function classifyStem(stemText) {
  const stem = String(stemText || '').trim();
  if (!stem) return { mode: 'skip', reason: 'sem_enunciado' };
  if (STEM_SKIP.some((pattern) => pattern.test(stem))) return { mode: 'skip', reason: 'formato_incompativel' };
  if (/esquerda/i.test(stem) && /direita/i.test(stem)) return { mode: 'skip', reason: 'associacao' };
  if (stem.trimEnd().endsWith(':') && !STEM_POSITIVE.test(stem)) return { mode: 'skip', reason: 'completar_frase' };
  if (stem.trimEnd().endsWith('?')) return { mode: 'skip', reason: 'pergunta_direta' };
  if (STEM_NEGATIVE.test(stem)) return { mode: 'negative', reason: '' };
  if (STEM_POSITIVE.test(stem)) return { mode: 'positive', reason: '' };
  return { mode: 'skip', reason: 'comando_nao_reconhecido' };
}

/** Remove a frase de comando ("Assinale a alternativa correta.") do contexto. */
function extractContext(stemText) {
  const sentences = String(stemText || '')
    .split(/(?<=[.:;!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const kept = sentences.filter((sentence) => !STEM_COMMAND_SENTENCE.test(sentence));
  const context = kept.join(' ').trim();
  return context.length >= 30 ? context : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/* ---------- carga ---------- */

const parents = db.prepare(`
  SELECT q.id_question, q.url, q.statement_text, q.statement_html, q.banca, q.banca_url,
    q.orgao_sigla, q.orgao_nome, q.orgao_url, q.cargo, q.concurso_id, q.concurso_ano, q.concurso_url,
    q.materia_id, q.materia, q.assunto_id, q.assunto, q.assunto_url, q.capitulo,
    UPPER(COALESCE(NULLIF(q.official_answer, ''), c.extracted_answer, '')) AS gabarito,
    c.text AS comment_text, c.html AS comment_html, c.professor AS comment_professor
  FROM questions q
  LEFT JOIN comments c ON c.question_id = q.id_question
  WHERE q.type_question = 'MULTIPLA_ESCOLHA'
    AND COALESCE(q.anulada, 0) = 0
    AND COALESCE(q.desatualizada, 0) = 0
  ORDER BY q.id_question
  ${limitArg ? `LIMIT ${limitArg}` : ''}
`).all();

const altStmt = db.prepare(`
  SELECT letter, position, text, html FROM alternatives WHERE question_id = ? ORDER BY position
`);
const examSubjectsStmt = db.prepare(`
  SELECT profile_id, subject_key, subject_label, block_key, confidence, source
  FROM question_exam_subjects WHERE question_id = ?
`);
const existingDerived = new Set(
  tableExists('derived_ce_items')
    ? db.prepare('SELECT parent_question_id FROM derived_ce_items').all().map((row) => row.parent_question_id)
    : []
);

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

/* ---------- geração ---------- */

const stats = { parents: parents.length, semGabarito: 0, stemSkip: {}, altSkip: 0, gerados: 0, paisAproveitados: 0, jaExistiam: 0 };
const items = [];

for (const parent of parents) {
  if (existingDerived.has(parent.id_question)) { stats.jaExistiam += 1; continue; }
  const gabarito = String(parent.gabarito || '').trim().toUpperCase();
  if (!/^[A-E]$/.test(gabarito)) { stats.semGabarito += 1; continue; }

  const classification = classifyStem(parent.statement_text);
  if (classification.mode === 'skip') {
    stats.stemSkip[classification.reason] = (stats.stemSkip[classification.reason] || 0) + 1;
    continue;
  }

  const alternatives = altStmt.all(parent.id_question);
  const context = extractContext(parent.statement_text);
  let generatedFromParent = 0;

  for (const alt of alternatives) {
    if (!isEligibleAlternative(alt.text)) { stats.altSkip += 1; continue; }
    const isGabarito = alt.letter === gabarito;
    const answer = classification.mode === 'positive'
      ? (isGabarito ? 'CERTO' : 'ERRADO')
      : (isGabarito ? 'ERRADO' : 'CERTO');

    let assertion = String(alt.text).trim().replace(/[;,]$/, '.');
    if (!/[.!?]$/.test(assertion)) assertion += '.';
    assertion = assertion.charAt(0).toUpperCase() + assertion.slice(1);
    const statementText = context ? `${context}\n\n${assertion}` : assertion;
    const statementHtml = [
      context ? `<p class="derived-ce-context">${escapeHtml(context)}</p>` : '',
      `<p class="derived-ce-assertion">${escapeHtml(assertion)}</p>`
    ].filter(Boolean).join('\n');

    items.push({
      parent,
      alt,
      answer,
      mode: classification.mode,
      statementText,
      statementHtml,
      quality: classification.mode === 'positive' && assertion.length >= 80 ? 'auto_high' : 'auto_medium'
    });
    generatedFromParent += 1;
  }
  if (generatedFromParent > 0) stats.paisAproveitados += 1;
  stats.gerados += generatedFromParent;
}

/* ---------- relatório ---------- */

console.log('=== Gerador de itens C/E derivados ===');
console.log(`Questões-mãe MC elegíveis: ${stats.parents}`);
console.log(`Sem gabarito confiável: ${stats.semGabarito}`);
console.log(`Já derivadas anteriormente: ${stats.jaExistiam}`);
console.log('Enunciados descartados por formato:', JSON.stringify(stats.stemSkip));
console.log(`Alternativas descartadas pelos filtros: ${stats.altSkip}`);
console.log(`>>> Itens C/E gerados: ${stats.gerados} (de ${stats.paisAproveitados} questões-mãe)`);
const porGabarito = items.reduce((acc, item) => { acc[item.answer] = (acc[item.answer] || 0) + 1; return acc; }, {});
console.log('Distribuição de gabarito:', JSON.stringify(porGabarito));

if (!apply) {
  console.log('\n=== AMOSTRAS (dry-run — use --apply para gravar) ===');
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, 6);
  for (const item of shuffled) {
    console.log(`\n--- mãe #${item.parent.id_question} (${item.alt.letter}, modo ${item.mode}) → ${item.answer} [${item.quality}]`);
    console.log(item.statementText.slice(0, 400));
  }
  process.exit(0);
}

/* ---------- gravação ---------- */

db.exec(`
  CREATE TABLE IF NOT EXISTS derived_ce_items (
    question_id INTEGER PRIMARY KEY,
    parent_question_id INTEGER NOT NULL,
    parent_alternative_letter TEXT NOT NULL,
    parent_alternative_position INTEGER,
    polarity TEXT NOT NULL,
    quality TEXT NOT NULL,
    generator_version TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_derived_ce_parent ON derived_ce_items(parent_question_id);
`);

const maxExisting = db.prepare(
  `SELECT MAX(id_question) AS max_id FROM questions WHERE id_question >= ${DERIVED_CE_ID_START}`
).get();
let nextId = Math.max(DERIVED_CE_ID_START, Number(maxExisting?.max_id || 0) + 1);

const insertQuestion = db.prepare(`
  INSERT INTO questions (
    id_question, url, statement_html, statement_text, type_question, format_question,
    banca, banca_url, orgao_sigla, orgao_nome, orgao_url, cargo, concurso_id, concurso_ano, concurso_url,
    materia_id, materia, assunto_id, assunto, assunto_url, capitulo,
    anulada, desatualizada, possui_comentario,
    official_answer, official_answer_source, collected_at, updated_at
  ) VALUES (?, ?, ?, ?, 'CERTO_ERRADO', 'OBJETIVA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'derived_from_parent_gabarito', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const insertAlt = db.prepare(`
  INSERT INTO alternatives (question_id, position, letter, html, text) VALUES (?, ?, ?, ?, ?)
`);
const insertComment = db.prepare(`
  INSERT INTO comments (question_id, html, text, professor, extracted_answer, source_type)
  VALUES (?, ?, ?, ?, ?, 'derived_parent')
`);
const insertProvenance = db.prepare(`
  INSERT INTO derived_ce_items (
    question_id, parent_question_id, parent_alternative_letter, parent_alternative_position,
    polarity, quality, generator_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertExamSubject = db.prepare(`
  INSERT INTO question_exam_subjects (question_id, profile_id, subject_key, subject_label, block_key, confidence, source)
  VALUES (?, ?, ?, ?, ?, ?, 'derived_ce')
`);

db.exec('BEGIN');
try {
  for (const item of items) {
    const id = nextId;
    nextId += 1;
    const { parent, alt } = item;

    insertQuestion.run(
      id, parent.url || '', item.statementHtml, item.statementText,
      parent.banca || '', parent.banca_url || '', parent.orgao_sigla || '', parent.orgao_nome || '',
      parent.orgao_url || '', parent.cargo || '', parent.concurso_id || null, parent.concurso_ano || null,
      parent.concurso_url || '', parent.materia_id || null, parent.materia || '', parent.assunto_id || null,
      parent.assunto || '', parent.assunto_url || '', parent.capitulo || '',
      parent.comment_text ? 1 : 0, item.answer
    );

    insertAlt.run(id, 1, 'A', '<p>Certo</p>', 'Certo');
    insertAlt.run(id, 2, 'B', '<p>Errado</p>', 'Errado');

    if (parent.comment_text) {
      const header = `Comentário do professor na questão original (#${parent.id_question}, alternativa ${alt.letter}):`;
      insertComment.run(
        id,
        `<p><em>${escapeHtml(header)}</em></p>\n${parent.comment_html || `<p>${escapeHtml(parent.comment_text)}</p>`}`,
        `${header}\n\n${parent.comment_text}`,
        parent.comment_professor || '',
        item.answer
      );
    }

    insertProvenance.run(id, parent.id_question, alt.letter, alt.position || null, item.mode, item.quality, GENERATOR_VERSION);

    for (const subject of examSubjectsStmt.all(parent.id_question)) {
      insertExamSubject.run(
        id, subject.profile_id, subject.subject_key, subject.subject_label || subject.subject_key,
        subject.block_key || '', subject.confidence ?? 1
      );
    }
  }
  db.exec('COMMIT');
  console.log(`\nGravados ${items.length} itens C/E derivados (ids a partir de ${DERIVED_CE_ID_START}).`);
  console.log('Para desfazer: DELETE FROM questions WHERE id_question >= 910000000; (idem alternatives/comments/question_exam_subjects/derived_ce_items)');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
