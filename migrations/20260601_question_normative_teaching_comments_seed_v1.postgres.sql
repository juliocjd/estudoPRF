-- Comentarios normativos didaticos atualizados - seed v1.
-- PostgreSQL. Idempotente. Nao altera comments nem gabaritos oficiais.

BEGIN;

CREATE TABLE IF NOT EXISTS question_normative_teaching_comments (
  question_id BIGINT PRIMARY KEY REFERENCES questions(id_question) ON DELETE CASCADE,

  source_version TEXT,
  generated_at TIMESTAMPTZ,
  generated_by TEXT,
  generation_method TEXT,

  status TEXT NOT NULL DEFAULT 'needs_manual_review',
  answer_policy TEXT NOT NULL DEFAULT 'not_assertive_manual_review',
  current_answer TEXT,
  current_answer_raw TEXT,
  current_answer_confidence NUMERIC(5,3),

  historical_answer TEXT,
  historical_answer_raw TEXT,
  changed_answer TEXT,
  safety_level TEXT,
  recommendation TEXT,
  adaptation_status TEXT,
  study_recommendation TEXT,

  title TEXT,
  teaching_comment_md TEXT,
  teaching_comment_html TEXT,

  legal_basis TEXT,
  current_rule_summary TEXT,
  why_outdated TEXT,
  literal_statement_note TEXT,
  source_base TEXT,

  alternatives_analysis JSONB,
  raw_json JSONB,

  review_status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewer_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Compatibilidade com versoes anteriores da tabela, caso ela ja exista.
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS source_version TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS generated_by TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS generation_method TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'needs_manual_review';
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS current_answer_raw TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS historical_answer_raw TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS changed_answer TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS literal_statement_note TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS source_base TEXT;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS alternatives_analysis JSONB;
ALTER TABLE question_normative_teaching_comments ADD COLUMN IF NOT EXISTS raw_json JSONB;

-- Se a primeira versao da tabela tiver PK em id, ainda assim precisamos de upsert por question_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qntc_question_id
  ON question_normative_teaching_comments(question_id);

-- Remove constraints antigas restritivas, se existirem, porque o seed v1 usa vocabulario proprio.
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS chk_qntc_answer_policy;
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS chk_qntc_adaptation_status;
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS chk_qntc_study_recommendation;
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS chk_qntc_safety_level;
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS qntc_status_chk;
ALTER TABLE question_normative_teaching_comments DROP CONSTRAINT IF EXISTS qntc_answer_policy_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qntc_status_chk'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT qntc_status_chk
    CHECK (status IN ('ready', 'needs_manual_review', 'discard'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qntc_answer_policy_chk'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT qntc_answer_policy_chk
    CHECK (answer_policy IN (
      'current_law_probable',
      'not_assertive_manual_review',
      'discard_original',
      'current_safe',
      'current_with_adaptation',
      'historical_only',
      'manual_review',
      'discard',
      'do_not_autocorrect'
    ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qntc_status ON question_normative_teaching_comments(status);
CREATE INDEX IF NOT EXISTS idx_qntc_current_answer ON question_normative_teaching_comments(current_answer);
CREATE INDEX IF NOT EXISTS idx_qntc_safety_level ON question_normative_teaching_comments(safety_level);
CREATE INDEX IF NOT EXISTS idx_qntc_recommendation ON question_normative_teaching_comments(recommendation);
CREATE INDEX IF NOT EXISTS idx_qntc_review_status ON question_normative_teaching_comments(review_status);
CREATE INDEX IF NOT EXISTS idx_qntc_answer_policy ON question_normative_teaching_comments(answer_policy);
CREATE INDEX IF NOT EXISTS idx_qntc_adaptation_status ON question_normative_teaching_comments(adaptation_status);

COMMIT;
