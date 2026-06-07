import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  linkQuestionToLegalCard,
  openCliDatabase,
  parseArgs
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const linksPath = path.resolve(
  ROOT_DIR,
  args.links || 'data/legal_theory_v4_1/traffic_question_card_links_transito_v4_precision_safe.jsonl'
);
const source = String(args['replace-source'] || args.source || 'chatgpt_traffic_v4').trim();
const { db, client } = openCliDatabase(args);

try {
  if (source) {
    db.prepare('DELETE FROM question_legal_links WHERE source = ?').run(source);
  }

  const lines = fs.readFileSync(linksPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let imported = 0;
  let missingCard = 0;
  const byDisplayMode = new Map();

  for (const line of lines) {
    const item = JSON.parse(line);
    const cardKey = String(item.card_key || '').trim();
    const card = cardKey
      ? db.prepare('SELECT id FROM legal_topic_cards WHERE card_key = ?').get(cardKey)
      : null;
    if (!card?.id) {
      missingCard += 1;
      continue;
    }

    const displayMode = String(item.display_mode || '').trim();
    byDisplayMode.set(displayMode || 'missing', (byDisplayMode.get(displayMode || 'missing') || 0) + 1);

    linkQuestionToLegalCard(db, {
      questionId: item.question_id,
      cardId: card.id,
      cardKey,
      relationType: item.link_type || 'supports_answer',
      relevanceScore: Number(item.score || 0),
      reason: item.reason || '',
      source,
      displayMode,
      autoShowAsPrimary: Boolean(item.auto_show_as_primary),
      needsHumanReview: Boolean(item.needs_human_review),
      precisionLevel: item.precision || '',
      matchedTerms: item.matched_terms || [],
      matchedTermsInStatement: item.matched_terms_in_statement || [],
      evidence: {
        matched_terms: item.matched_terms || [],
        matched_terms_in_statement: item.matched_terms_in_statement || [],
        rejected_specific_candidate: item.rejected_specific_candidate || null,
        original_auto_show_as_primary: item.original_auto_show_as_primary ?? null
      },
      currentLawStatus: item.current_law_status || '',
      currentLawCanAutoScore: item.current_law_can_auto_score,
      currentLawAnswer: item.current_law_answer || '',
      warning: item.warning || ''
    });
    imported += 1;
  }

  console.log('# Importacao de vinculos questao -> Teoria rapida');
  console.log(`Banco: ${client}`);
  console.log(`Arquivo: ${path.relative(ROOT_DIR, linksPath)}`);
  console.log(`Fonte substituida: ${source}`);
  console.log(`Linhas lidas: ${lines.length}`);
  console.log(`Vinculos importados: ${imported}`);
  console.log(`Pulados sem card correspondente: ${missingCard}`);
  console.log('Por display_mode:');
  for (const [mode, count] of [...byDisplayMode.entries()].sort()) {
    console.log(`- ${mode}: ${count}`);
  }
} finally {
  db.close();
}
