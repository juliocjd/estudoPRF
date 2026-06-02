-- Edicoes do aluno para a camada de comentario normativo atualizado.
-- Mantem o seed original em question_normative_teaching_comments intacto.

CREATE TABLE IF NOT EXISTS question_normative_teaching_student_edits (
  question_id BIGINT PRIMARY KEY,
  legal_basis_md TEXT,
  short_explanation_md TEXT,
  current_rule_summary_md TEXT,
  professor_complement_md TEXT,
  study_conclusion_md TEXT,
  edited_by TEXT DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qntc_student_edits_updated
  ON question_normative_teaching_student_edits(updated_at);
