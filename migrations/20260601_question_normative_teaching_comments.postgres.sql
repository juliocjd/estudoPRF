-- Comentarios normativos didaticos para questoes desatualizadas.
-- PostgreSQL. Idempotente. Nao altera comments nem gabaritos oficiais.

CREATE TABLE IF NOT EXISTS question_normative_teaching_comments (
  id BIGSERIAL PRIMARY KEY,

  question_id BIGINT NOT NULL,
  normative_update_id BIGINT NULL,

  source_type TEXT NOT NULL DEFAULT 'ai_normative',
  generator_model TEXT,
  generator_version TEXT NOT NULL DEFAULT 'normative-teaching-v1',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  historical_answer TEXT,
  current_answer TEXT,
  current_answer_label TEXT,
  current_answer_confidence NUMERIC(4,3),
  answer_changed BOOLEAN,
  answer_policy TEXT NOT NULL DEFAULT 'do_not_autocorrect',

  adaptation_status TEXT NOT NULL DEFAULT 'needs_review',
  study_recommendation TEXT NOT NULL DEFAULT 'manual_review',
  safety_level TEXT,

  adapted_statement TEXT,
  short_explanation TEXT,
  teaching_comment_md TEXT,
  teaching_comment_html TEXT,
  legal_basis TEXT,
  current_rule_summary TEXT,
  why_outdated TEXT,
  literal_statement_warning TEXT,

  alternatives_analysis_json JSONB,
  source_normative_json JSONB,
  raw_generation_json JSONB,

  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_qntc_question_generator UNIQUE (question_id, generator_version)
);

CREATE INDEX IF NOT EXISTS idx_qntc_question_id
  ON question_normative_teaching_comments(question_id);

CREATE INDEX IF NOT EXISTS idx_qntc_current_answer
  ON question_normative_teaching_comments(current_answer);

CREATE INDEX IF NOT EXISTS idx_qntc_answer_policy
  ON question_normative_teaching_comments(answer_policy);

CREATE INDEX IF NOT EXISTS idx_qntc_adaptation_status
  ON question_normative_teaching_comments(adaptation_status);

CREATE INDEX IF NOT EXISTS idx_qntc_study_recommendation
  ON question_normative_teaching_comments(study_recommendation);

CREATE INDEX IF NOT EXISTS idx_qntc_review_status
  ON question_normative_teaching_comments(review_status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qntc_answer_policy'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT chk_qntc_answer_policy
    CHECK (answer_policy IN (
      'current_safe',
      'current_with_adaptation',
      'historical_only',
      'manual_review',
      'discard',
      'do_not_autocorrect'
    ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qntc_adaptation_status'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT chk_qntc_adaptation_status
    CHECK (adaptation_status IN (
      'no_adaptation_needed',
      'adapt_statement',
      'adapt_legal_reference',
      'adapt_alternatives',
      'manual_review',
      'discard',
      'needs_review'
    ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qntc_study_recommendation'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT chk_qntc_study_recommendation
    CHECK (study_recommendation IN (
      'study_current_rule',
      'study_with_warning',
      'manual_review',
      'discard'
    ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qntc_safety_level'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT chk_qntc_safety_level
    CHECK (safety_level IS NULL OR safety_level IN ('high', 'medium', 'low', 'manual'));
  END IF;
END $$;
