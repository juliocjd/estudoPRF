-- current-law-answers-v7
-- Fonte única para correção de questões desatualizadas pela legislação vigente.
-- PostgreSQL. Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS question_current_law_answers (
  question_id BIGINT PRIMARY KEY,
  historical_answer TEXT,
  current_answer TEXT,
  current_law_status TEXT NOT NULL DEFAULT 'needs_audit',
  can_auto_score_current_law BOOLEAN NOT NULL DEFAULT FALSE,
  do_not_use_historical_answer_in_current_law_mode BOOLEAN NOT NULL DEFAULT TRUE,
  answer_changed BOOLEAN,
  no_valid_alternative BOOLEAN NOT NULL DEFAULT FALSE,
  should_discard_from_current_law_study BOOLEAN NOT NULL DEFAULT FALSE,
  hide_from_main_study_until_verified BOOLEAN NOT NULL DEFAULT TRUE,

  legal_basis TEXT,
  article_reference TEXT,
  article_excerpt TEXT,
  teacher_explanation TEXT,
  rule_summary TEXT,
  professor_complement TEXT,
  study_conclusion TEXT,
  source_url TEXT,

  verification_method TEXT,
  source_version TEXT,
  teaching_comment_md TEXT,
  raw_json JSONB,

  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT qcla_status_check CHECK (
    current_law_status IN ('verified', 'needs_audit', 'no_valid_alternative', 'discard')
  ),
  CONSTRAINT qcla_autoscore_requires_answer CHECK (
    can_auto_score_current_law = FALSE OR current_answer IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_qcla_status ON question_current_law_answers(current_law_status);
CREATE INDEX IF NOT EXISTS idx_qcla_autoscore ON question_current_law_answers(can_auto_score_current_law);
CREATE INDEX IF NOT EXISTS idx_qcla_changed ON question_current_law_answers(answer_changed);
CREATE INDEX IF NOT EXISTS idx_qcla_hide ON question_current_law_answers(hide_from_main_study_until_verified);
CREATE INDEX IF NOT EXISTS idx_qcla_discard ON question_current_law_answers(should_discard_from_current_law_study);

-- Opcional: view para o backend consultar de forma simples.
CREATE OR REPLACE VIEW v_question_current_law_status AS
SELECT
  q.id_question AS question_id,
  q.desatualizada,
  q.anulada,
  COALESCE(qcla.current_law_status, CASE WHEN COALESCE(q.desatualizada,0)=1 THEN 'needs_audit' ELSE 'not_applicable' END) AS current_law_status,
  qcla.current_answer,
  qcla.can_auto_score_current_law,
  qcla.do_not_use_historical_answer_in_current_law_mode,
  qcla.answer_changed,
  qcla.no_valid_alternative,
  qcla.should_discard_from_current_law_study,
  qcla.hide_from_main_study_until_verified,
  qcla.legal_basis,
  qcla.article_reference,
  qcla.article_excerpt,
  qcla.teacher_explanation,
  qcla.rule_summary,
  qcla.professor_complement,
  qcla.study_conclusion,
  qcla.teaching_comment_md
FROM questions q
LEFT JOIN question_current_law_answers qcla ON qcla.question_id = q.id_question;

COMMIT;
