-- Comentarios normativos atualizados em formato didatico/professor v3.
-- PostgreSQL. Idempotente. Nao altera comments nem gabaritos oficiais.

CREATE TABLE IF NOT EXISTS question_normative_teaching_comments (
  question_id BIGINT PRIMARY KEY,
  display_version TEXT,
  source_version TEXT,
  status TEXT,
  generation_status TEXT DEFAULT 'pending',
  review_status TEXT DEFAULT 'pending',
  current_answer TEXT,
  current_answer_raw TEXT,
  current_answer_confidence NUMERIC,
  answer_policy TEXT,
  historical_answer TEXT,
  main_legal_basis TEXT,
  legal_article_reference TEXT,
  legal_article_excerpt TEXT,
  article_exactness TEXT,
  short_explanation_md TEXT,
  current_rule_summary_md TEXT,
  professor_complement_md TEXT,
  study_conclusion_md TEXT,
  teaching_comment_md TEXT,
  teaching_comment_html TEXT,
  technical_details_json JSONB,
  generated_by TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE question_normative_teaching_comments
  ADD COLUMN IF NOT EXISTS display_version TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS current_answer TEXT,
  ADD COLUMN IF NOT EXISTS current_answer_raw TEXT,
  ADD COLUMN IF NOT EXISTS current_answer_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS answer_policy TEXT,
  ADD COLUMN IF NOT EXISTS historical_answer TEXT,
  ADD COLUMN IF NOT EXISTS historical_answer_raw TEXT,
  ADD COLUMN IF NOT EXISTS changed_answer TEXT,
  ADD COLUMN IF NOT EXISTS main_legal_basis TEXT,
  ADD COLUMN IF NOT EXISTS legal_article_reference TEXT,
  ADD COLUMN IF NOT EXISTS legal_article_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS article_exactness TEXT,
  ADD COLUMN IF NOT EXISTS short_explanation_md TEXT,
  ADD COLUMN IF NOT EXISTS current_rule_summary_md TEXT,
  ADD COLUMN IF NOT EXISTS professor_complement_md TEXT,
  ADD COLUMN IF NOT EXISTS study_conclusion_md TEXT,
  ADD COLUMN IF NOT EXISTS teaching_comment_md TEXT,
  ADD COLUMN IF NOT EXISTS teaching_comment_html TEXT,
  ADD COLUMN IF NOT EXISTS technical_details_json JSONB,
  ADD COLUMN IF NOT EXISTS generated_by TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generation_method TEXT,
  ADD COLUMN IF NOT EXISTS safety_level TEXT,
  ADD COLUMN IF NOT EXISTS recommendation TEXT,
  ADD COLUMN IF NOT EXISTS adaptation_status TEXT,
  ADD COLUMN IF NOT EXISTS study_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS legal_basis TEXT,
  ADD COLUMN IF NOT EXISTS current_rule_summary TEXT,
  ADD COLUMN IF NOT EXISTS why_outdated TEXT,
  ADD COLUMN IF NOT EXISTS literal_statement_note TEXT,
  ADD COLUMN IF NOT EXISTS source_base TEXT,
  ADD COLUMN IF NOT EXISTS alternatives_analysis JSONB,
  ADD COLUMN IF NOT EXISTS raw_json JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_qntc_question_id
  ON question_normative_teaching_comments(question_id);

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
    CHECK (status IS NULL OR status IN ('ready', 'needs_manual_review', 'discard'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qntc_answer_policy_chk'
  ) THEN
    ALTER TABLE question_normative_teaching_comments
    ADD CONSTRAINT qntc_answer_policy_chk
    CHECK (answer_policy IS NULL OR answer_policy IN (
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

CREATE INDEX IF NOT EXISTS idx_qntc_display_version ON question_normative_teaching_comments(display_version);
CREATE INDEX IF NOT EXISTS idx_qntc_generation_status ON question_normative_teaching_comments(generation_status);
CREATE INDEX IF NOT EXISTS idx_qntc_review_status ON question_normative_teaching_comments(review_status);
CREATE INDEX IF NOT EXISTS idx_qntc_article_exactness ON question_normative_teaching_comments(article_exactness);
CREATE INDEX IF NOT EXISTS idx_qntc_status ON question_normative_teaching_comments(status);
CREATE INDEX IF NOT EXISTS idx_qntc_answer_policy ON question_normative_teaching_comments(answer_policy);
CREATE INDEX IF NOT EXISTS idx_qntc_current_answer ON question_normative_teaching_comments(current_answer);
