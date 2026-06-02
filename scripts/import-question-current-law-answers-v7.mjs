#!/usr/bin/env node
/*
Import question_current_law_answers_seed_v7.json into PostgreSQL.

Usage:
  DATABASE_URL=postgres://... node scripts/import-question-current-law-answers-v7.mjs
  node scripts/import-question-current-law-answers-v7.mjs --db "$DATABASE_URL" --json data/question_current_law_answers_seed_v7.json
*/
import fs from 'node:fs/promises';
import process from 'node:process';
import postgres from 'postgres';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const connectionString = args.db || args['database-url'] || process.env.DATABASE_URL;
const jsonPath = args.json || 'data/question_current_law_answers_seed_v7.json';

if (!connectionString) {
  console.error('Informe --db, --database-url ou DATABASE_URL.');
  process.exit(1);
}

const payload = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
const items = Array.isArray(payload) ? payload : payload.items;
if (!Array.isArray(items)) {
  throw new Error('JSON invalido: esperado array ou objeto com items[].');
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30
});

try {
  let inserted = 0;
  let updated = 0;
  const upsertSql = `
    INSERT INTO question_current_law_answers (
      question_id, historical_answer, current_answer, current_law_status,
      can_auto_score_current_law, do_not_use_historical_answer_in_current_law_mode,
      answer_changed, no_valid_alternative, should_discard_from_current_law_study,
      hide_from_main_study_until_verified, legal_basis, article_reference, article_excerpt,
      teacher_explanation, rule_summary, professor_complement, study_conclusion,
      source_url, verification_method, source_version, teaching_comment_md, raw_json,
      imported_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,now(),now()
    )
    ON CONFLICT (question_id) DO UPDATE SET
      historical_answer = EXCLUDED.historical_answer,
      current_answer = EXCLUDED.current_answer,
      current_law_status = EXCLUDED.current_law_status,
      can_auto_score_current_law = EXCLUDED.can_auto_score_current_law,
      do_not_use_historical_answer_in_current_law_mode = EXCLUDED.do_not_use_historical_answer_in_current_law_mode,
      answer_changed = EXCLUDED.answer_changed,
      no_valid_alternative = EXCLUDED.no_valid_alternative,
      should_discard_from_current_law_study = EXCLUDED.should_discard_from_current_law_study,
      hide_from_main_study_until_verified = EXCLUDED.hide_from_main_study_until_verified,
      legal_basis = EXCLUDED.legal_basis,
      article_reference = EXCLUDED.article_reference,
      article_excerpt = EXCLUDED.article_excerpt,
      teacher_explanation = EXCLUDED.teacher_explanation,
      rule_summary = EXCLUDED.rule_summary,
      professor_complement = EXCLUDED.professor_complement,
      study_conclusion = EXCLUDED.study_conclusion,
      source_url = EXCLUDED.source_url,
      verification_method = EXCLUDED.verification_method,
      source_version = EXCLUDED.source_version,
      teaching_comment_md = EXCLUDED.teaching_comment_md,
      raw_json = EXCLUDED.raw_json,
      updated_at = now()
    RETURNING (xmax = 0) AS inserted
  `;

  await sql.begin(async (tx) => {
    for (const item of items) {
      const values = [
        item.question_id,
        item.historical_answer || null,
        item.current_answer || null,
        item.current_law_status || 'needs_audit',
        Boolean(item.can_auto_score_current_law),
        item.do_not_use_historical_answer_in_current_law_mode !== false,
        item.answer_changed,
        Boolean(item.no_valid_alternative),
        Boolean(item.should_discard_from_current_law_study),
        item.hide_from_main_study_until_verified !== false,
        item.legal_basis || null,
        item.article_reference || null,
        item.article_excerpt || null,
        item.teacher_explanation || null,
        item.rule_summary || null,
        item.professor_complement || null,
        item.study_conclusion || null,
        item.source_url || null,
        item.verification_method || null,
        item.source_version || payload.version || null,
        item.teaching_comment_md || null,
        JSON.stringify(item)
      ];
      const rows = await tx.unsafe(upsertSql, values);
      if (rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }
  });

  const stats = await sql`
    SELECT current_law_status, count(*)::int AS n
    FROM question_current_law_answers
    GROUP BY current_law_status
    ORDER BY current_law_status
  `;
  console.log('Importacao concluida.');
  console.log({ total: items.length, inserted, updated });
  console.table(stats);
} finally {
  await sql.end({ timeout: 5 });
}
