import {
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs
} from './question-applied-theory-utils.mjs';
import { normalizeSearchText, sha256 } from './legal-knowledge-utils.mjs';

const args = parseArgs();
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const anchors = db.prepare(`
    SELECT source_key, source_title, source_url, legal_locator, exact_excerpt
    FROM question_applied_theory_legal_anchors
    WHERE COALESCE(source_key, '') <> ''
      AND COALESCE(legal_locator, '') <> ''
      AND COALESCE(exact_excerpt, '') <> ''
  `).all();

  let inserted = 0;
  for (const anchor of anchors) {
    const hash = sha256(anchor.exact_excerpt);
    const existing = db.prepare(`
      SELECT id
      FROM legal_article_segments
      WHERE source_key = ? AND segment_ref = ? AND excerpt_hash = ?
      LIMIT 1
    `).get(anchor.source_key, anchor.legal_locator, hash);
    if (existing) continue;
    db.prepare(`
      INSERT INTO legal_article_segments (
        source_key, source_title, source_url, segment_ref, segment_type,
        segment_text, normalized_text, is_current, extraction_method,
        excerpt_hash, extracted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'question_applied_theory_anchor_v6', ?, CURRENT_TIMESTAMP)
    `).run(
      anchor.source_key,
      anchor.source_title || '',
      anchor.source_url || '',
      anchor.legal_locator,
      inferSegmentType(anchor.legal_locator),
      anchor.exact_excerpt,
      normalizeSearchText(anchor.exact_excerpt),
      client === 'postgres' ? true : 1,
      hash
    );
    inserted += 1;
  }

  console.log('# Segmentos legais v6');
  console.log(`Banco: ${client}`);
  console.log(`Ancora(s) avaliadas: ${anchors.length}`);
  console.log(`Segmento(s) criados: ${inserted}`);
} finally {
  db.close();
}

function inferSegmentType(locator) {
  const text = String(locator || '').toLowerCase();
  if (text.includes('ficha')) return 'mbft_ficha';
  if (text.includes('anexo') && text.includes('alínea')) return 'anexo_alinea';
  if (text.includes('anexo') && text.includes('inciso')) return 'anexo_inciso';
  if (text.includes('alínea')) return 'alinea';
  if (text.includes('inciso')) return 'inciso';
  if (text.includes('art.')) return 'article';
  return 'segment';
}
