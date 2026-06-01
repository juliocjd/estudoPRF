-- Estado de aproveitamento da questao na fila de estudo.
-- Idempotente. Nao altera questoes, comentarios nem historico de respostas.

CREATE TABLE IF NOT EXISTS question_study_status (
  question_id BIGINT PRIMARY KEY REFERENCES questions(id_question) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  notes TEXT,
  hidden_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_study_status_status
  ON question_study_status(status);

CREATE INDEX IF NOT EXISTS idx_question_study_status_reason
  ON question_study_status(reason);
