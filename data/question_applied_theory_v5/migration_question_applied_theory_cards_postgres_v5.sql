
-- v5: teoria aplicada individualmente à questão
-- PostgreSQL
CREATE TABLE IF NOT EXISTS question_applied_theory_cards (
  question_id BIGINT PRIMARY KEY REFERENCES questions(id_question) ON DELETE CASCADE,
  card_status TEXT NOT NULL CHECK (card_status IN ('published','draft_needs_review','needs_current_law_audit','no_valid_alternative','discarded','blocked')),
  source_mode TEXT NOT NULL CHECK (source_mode IN ('historical_law','current_law_verified','current_law_no_valid_alternative','current_law_needs_audit','current_law_discard')),
  historical_answer TEXT,
  current_answer TEXT,
  answer_changed BOOLEAN,
  no_valid_alternative BOOLEAN DEFAULT FALSE,
  title TEXT NOT NULL,
  question_focus TEXT NOT NULL,
  rule_that_solves_this_question TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  article_excerpt TEXT,
  applied_explanation TEXT NOT NULL,
  rule_summary_bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  professor_tip TEXT,
  common_traps JSONB NOT NULL DEFAULT '[]'::jsonb,
  study_conclusion TEXT NOT NULL,
  show_warning TEXT,
  show_before_answer BOOLEAN NOT NULL DEFAULT FALSE,
  show_after_answer BOOLEAN NOT NULL DEFAULT TRUE,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  teaching_card_md TEXT,
  teaching_card_html TEXT,
  generated_by TEXT,
  verified_status TEXT NOT NULL DEFAULT 'unverified',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qatc_status ON question_applied_theory_cards(card_status);
CREATE INDEX IF NOT EXISTS idx_qatc_source_mode ON question_applied_theory_cards(source_mode);
CREATE INDEX IF NOT EXISTS idx_qatc_current_answer ON question_applied_theory_cards(current_answer);

CREATE TABLE IF NOT EXISTS question_applied_theory_generation_jobs (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(id_question) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  generation_policy TEXT NOT NULL,
  job_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','generated','imported','failed','blocked')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(question_id, generation_policy)
);
CREATE INDEX IF NOT EXISTS idx_qat_jobs_status_priority ON question_applied_theory_generation_jobs(status, priority);
CREATE INDEX IF NOT EXISTS idx_qat_jobs_question ON question_applied_theory_generation_jobs(question_id);
