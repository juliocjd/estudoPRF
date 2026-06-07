import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const outMd = path.resolve(ROOT_DIR, args.md || 'data/diagnostico_question_applied_theory_exact_anchors_v6.md');
const outJson = path.resolve(ROOT_DIR, args.json || 'data/diagnostico_question_applied_theory_exact_anchors_v6.json');
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const byStatus = db.prepare(`
    SELECT
      COALESCE(publish_status, card_status) AS publish_status,
      COALESCE(legal_anchor_quality, 'missing') AS legal_anchor_quality,
      COUNT(*) AS total
    FROM question_applied_theory_cards
    GROUP BY COALESCE(publish_status, card_status), COALESCE(legal_anchor_quality, 'missing')
    ORDER BY publish_status, legal_anchor_quality
  `).all();
  const invalidPublished = db.prepare(`
    SELECT question_id, title, legal_basis, primary_legal_locator
    FROM question_applied_theory_cards
    WHERE COALESCE(publish_status, card_status) = 'published'
      AND (
        COALESCE(exact_anchor_verified, false) = false
        OR COALESCE(primary_legal_locator, '') = ''
        OR COALESCE(primary_exact_excerpt, '') = ''
      )
    LIMIT 100
  `).all();
  const trafficCoverage = db.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE c.question_id IS NOT NULL AND COALESCE(c.publish_status, c.card_status) = 'published') AS com_card_publicado,
      COUNT(*) FILTER (WHERE c.question_id IS NULL OR COALESCE(c.publish_status, c.card_status) <> 'published') AS sem_card_publicado,
      COUNT(*) AS total
    FROM questions q
    LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE q.materia = 'Legislação de Trânsito e Transportes'
  `).get();
  const cadeirinha = db.prepare(`
    SELECT q.id_question, c.title, c.primary_legal_locator, c.primary_exact_excerpt
    FROM questions q
    LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE q.statement_text LIKE '%1 a 4 anos%'
      AND q.statement_text LIKE '%dispositivo de segurança%'
    LIMIT 20
  `).all();

  const result = {
    generated_at: new Date().toISOString(),
    database: client,
    by_status: byStatus,
    invalid_published: invalidPublished,
    traffic_coverage: trafficCoverage,
    cadeirinha_example: cadeirinha
  };

  const md = [
    '# Diagnostico de Teoria aplicada com ancoras exatas v6',
    '',
    `Banco: ${client}`,
    '',
    '## Status',
    '',
    ...byStatus.map((row) => `- ${row.publish_status} / ${row.legal_anchor_quality}: ${row.total}`),
    '',
    '## Cobertura em Transito',
    '',
    `- Com card publicado: ${trafficCoverage?.com_card_publicado || 0}`,
    `- Sem card publicado: ${trafficCoverage?.sem_card_publicado || 0}`,
    `- Total: ${trafficCoverage?.total || 0}`,
    '',
    '## Publicados invalidos',
    '',
    invalidPublished.length
      ? invalidPublished.map((row) => `- ${row.question_id}: ${row.title || '(sem titulo)'}`).join('\n')
      : 'Nenhum card publicado sem ancora exata.',
    '',
    '## Teste cadeirinha',
    '',
    ...cadeirinha.map((row) => `- ${row.id_question}: ${row.primary_legal_locator || 'sem card'}`)
  ].join('\n');

  fs.writeFileSync(outMd, md, 'utf8');
  fs.writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
  console.log(md);
} finally {
  db.close();
}
