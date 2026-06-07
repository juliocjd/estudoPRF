import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, openCliDatabase, parseArgs } from './legal-knowledge-utils.mjs';

export { ROOT_DIR, openCliDatabase, parseArgs };

export function initQuestionAppliedTheorySchema(db, client = 'sqlite') {
  if (client === 'postgres') {
    db.exec(fs.readFileSync(path.join(ROOT_DIR, 'migrations', '20260607_question_applied_theory_cards_v5.postgres.sql'), 'utf8'));
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS question_applied_theory_cards (
      question_id INTEGER PRIMARY KEY,
      card_status TEXT NOT NULL,
      source_mode TEXT NOT NULL,
      historical_answer TEXT,
      current_answer TEXT,
      answer_changed INTEGER,
      no_valid_alternative INTEGER DEFAULT 0,
      title TEXT NOT NULL,
      question_focus TEXT NOT NULL,
      rule_that_solves_this_question TEXT NOT NULL,
      legal_basis TEXT NOT NULL,
      article_excerpt TEXT,
      applied_explanation TEXT NOT NULL,
      rule_summary_bullets TEXT NOT NULL DEFAULT '[]',
      professor_tip TEXT,
      common_traps TEXT NOT NULL DEFAULT '[]',
      study_conclusion TEXT NOT NULL,
      show_warning TEXT,
      show_before_answer INTEGER NOT NULL DEFAULT 0,
      show_after_answer INTEGER NOT NULL DEFAULT 1,
      source_urls TEXT NOT NULL DEFAULT '[]',
      teaching_card_md TEXT,
      teaching_card_html TEXT,
      generated_by TEXT,
      verified_status TEXT NOT NULL DEFAULT 'unverified',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_qatc_status ON question_applied_theory_cards(card_status);
    CREATE INDEX IF NOT EXISTS idx_qatc_source_mode ON question_applied_theory_cards(source_mode);
    CREATE INDEX IF NOT EXISTS idx_qatc_current_answer ON question_applied_theory_cards(current_answer);

    CREATE TABLE IF NOT EXISTS question_applied_theory_generation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      generation_policy TEXT NOT NULL,
      job_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, generation_policy)
    );

    CREATE INDEX IF NOT EXISTS idx_qat_jobs_status_priority ON question_applied_theory_generation_jobs(status, priority);
    CREATE INDEX IF NOT EXISTS idx_qat_jobs_question ON question_applied_theory_generation_jobs(question_id);
  `);
}

export function upsertAppliedTheoryCard(db, item = {}) {
  const isPostgres = Boolean(db.databaseUrl);
  const json = (value) => JSON.stringify(Array.isArray(value) ? value : []);
  const bool = (value) => (isPostgres ? Boolean(value) : (value ? 1 : 0));
  const nullableBool = (value) => {
    if (value === null || value === undefined) return null;
    return isPostgres ? Boolean(value) : (value ? 1 : 0);
  };
  db.prepare(`
    INSERT INTO question_applied_theory_cards (
      question_id, card_status, source_mode, historical_answer, current_answer,
      answer_changed, no_valid_alternative, title, question_focus,
      rule_that_solves_this_question, legal_basis, article_excerpt,
      applied_explanation, rule_summary_bullets, professor_tip, common_traps,
      study_conclusion, show_warning, show_before_answer, show_after_answer,
      source_urls, teaching_card_md, teaching_card_html, generated_by,
      verified_status, reviewed_by, reviewed_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      card_status = excluded.card_status,
      source_mode = excluded.source_mode,
      historical_answer = excluded.historical_answer,
      current_answer = excluded.current_answer,
      answer_changed = excluded.answer_changed,
      no_valid_alternative = excluded.no_valid_alternative,
      title = excluded.title,
      question_focus = excluded.question_focus,
      rule_that_solves_this_question = excluded.rule_that_solves_this_question,
      legal_basis = excluded.legal_basis,
      article_excerpt = excluded.article_excerpt,
      applied_explanation = excluded.applied_explanation,
      rule_summary_bullets = excluded.rule_summary_bullets,
      professor_tip = excluded.professor_tip,
      common_traps = excluded.common_traps,
      study_conclusion = excluded.study_conclusion,
      show_warning = excluded.show_warning,
      show_before_answer = excluded.show_before_answer,
      show_after_answer = excluded.show_after_answer,
      source_urls = excluded.source_urls,
      teaching_card_md = excluded.teaching_card_md,
      teaching_card_html = excluded.teaching_card_html,
      generated_by = excluded.generated_by,
      verified_status = excluded.verified_status,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    Number(item.question_id),
    item.card_status,
    item.source_mode,
    item.historical_answer || null,
    item.current_answer || null,
    nullableBool(item.answer_changed),
    bool(item.no_valid_alternative),
    item.title,
    item.question_focus,
    item.rule_that_solves_this_question,
    item.legal_basis,
    item.article_excerpt || null,
    item.applied_explanation,
    json(item.rule_summary_bullets),
    item.professor_tip || '',
    json(item.common_traps),
    item.study_conclusion,
    item.show_warning || null,
    bool(item.show_before_answer),
    item.show_after_answer === false ? bool(false) : bool(true),
    json(item.source_urls),
    item.teaching_card_md || null,
    item.teaching_card_html || null,
    item.generated_by || 'import',
    item.verified_status || 'unverified',
    item.reviewed_by || null,
    item.reviewed_at || null
  );
}

export function upsertAppliedTheoryJob(db, item = {}) {
  const payload = JSON.stringify(item);
  db.prepare(`
    INSERT INTO question_applied_theory_generation_jobs (
      question_id, priority, generation_policy, job_payload, status, updated_at
    )
    VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(question_id, generation_policy) DO UPDATE SET
      priority = excluded.priority,
      job_payload = excluded.job_payload,
      status = CASE
        WHEN question_applied_theory_generation_jobs.status IN ('generated', 'imported') THEN question_applied_theory_generation_jobs.status
        ELSE 'pending'
      END,
      error = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    Number(item.question_id),
    Number(item.priority || 100),
    item.generation_policy || item.policy || 'question_applied_theory_v5',
    payload
  );
}
