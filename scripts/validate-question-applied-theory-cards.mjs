import {
  hasSpecificLegalLocator,
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const materia = args.materia || '';
  const rows = db.prepare(`
    SELECT c.*
    FROM question_applied_theory_cards c
    ${materia ? 'JOIN questions q ON q.id_question = c.question_id' : ''}
    ${materia ? 'WHERE q.materia = ?' : ''}
  `).all(...(materia ? [materia] : []));

  let valid = 0;
  let downgraded = 0;
  for (const row of rows) {
    const errors = [];
    const locator = row.primary_legal_locator || row.legal_basis || '';
    const excerpt = row.primary_exact_excerpt || row.article_excerpt || '';
    if (!hasSpecificLegalLocator(locator)) errors.push('NO_PRECISE_LOCATOR');
    if (!String(excerpt || '').trim()) errors.push('NO_EXACT_EXCERPT');
    if (!String(row.applied_explanation || '').trim()) errors.push('NO_APPLIED_EXPLANATION');
    const ok = errors.length === 0;
    if (ok) valid += 1;
    if (!ok && (row.card_status === 'published' || row.publish_status === 'published')) downgraded += 1;
    db.prepare(`
      UPDATE question_applied_theory_cards
      SET
        publish_status = ?,
        legal_anchor_quality = ?,
        exact_anchor_verified = ?,
        exact_anchor_review_status = ?,
        should_show_as_applied_theory = ?,
        validation_errors_json = ?,
        validated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE question_id = ?
    `).run(
      ok ? 'published' : 'review_only',
      ok ? 'exact' : 'missing',
      client === 'postgres' ? ok : (ok ? 1 : 0),
      ok ? 'verified' : 'needs_exact_anchor',
      client === 'postgres' ? ok : (ok ? 1 : 0),
      JSON.stringify(errors),
      row.question_id
    );
  }

  console.log('# Validacao de Teoria aplicada v6');
  console.log(`Banco: ${client}`);
  console.log(`Cards avaliados: ${rows.length}`);
  console.log(`Cards com ancora exata: ${valid}`);
  console.log(`Cards publicados rebaixados: ${downgraded}`);
} finally {
  db.close();
}
