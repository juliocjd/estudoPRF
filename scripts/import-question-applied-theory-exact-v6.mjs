import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  initQuestionAppliedTheorySchema,
  normalizeSearchText,
  openCliDatabase,
  parseArgs,
  upsertAppliedTheoryCard
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const filePath = path.resolve(
  ROOT_DIR,
  args.file || args.seed || 'data/question_applied_theory_v6_exact_anchors/example_card_res819_cadeirinha_v6.json'
);

const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : (parsed.items || [parsed]);
  let imported = 0;
  let unresolved = 0;

  for (const entry of entries) {
    const item = resolveQuestionForEntry(entry);
    if (!item.question_id) {
      unresolved += 1;
      console.warn(`[sem vinculo] ${entry.card?.title || entry.title || filePath}`);
      continue;
    }
    upsertAppliedTheoryCard(db, item);
    imported += 1;
  }

  console.log('# Importacao de Teoria aplicada exata v6');
  console.log(`Banco: ${client}`);
  console.log(`Arquivo: ${path.relative(ROOT_DIR, filePath)}`);
  console.log(`Cards importados/atualizados: ${imported}`);
  console.log(`Sem questao correspondente: ${unresolved}`);
} finally {
  db.close();
}

function resolveQuestionForEntry(entry) {
  if (entry.question_id || entry.card?.question_id) {
    return { ...(entry.card || entry), question_id: entry.question_id || entry.card.question_id };
  }
  const match = entry.question_match || entry.questionMatch;
  if (!match) return entry.card || entry;

  const candidates = db.prepare(`
    SELECT id_question, materia, statement_text
    FROM questions
    WHERE materia = ?
  `).all(match.materia || 'Legislação de Trânsito e Transportes');

  const requiredStatementTerms = (match.statement_contains || []).map(normalizeSearchText).filter(Boolean);
  const requiredAlternativeTerms = (match.alternatives_contains || []).map(normalizeSearchText).filter(Boolean);

  for (const candidate of candidates) {
    const statement = normalizeSearchText(candidate.statement_text || '');
    if (!requiredStatementTerms.every((term) => statement.includes(term))) continue;
    if (requiredAlternativeTerms.length) {
      const alternatives = db.prepare('SELECT text FROM alternatives WHERE question_id = ?').all(candidate.id_question);
      const alternativesText = normalizeSearchText(alternatives.map((alt) => alt.text || '').join(' '));
      if (!requiredAlternativeTerms.every((term) => alternativesText.includes(term))) continue;
    }
    return {
      ...(entry.card || entry),
      question_id: candidate.id_question,
      generated_by: entry.card?.generated_by || 'codex_exact_anchor_v6'
    };
  }

  return entry.card || entry;
}
