-- Banco de questoes ineditas PRF/CONTRAN V5 refeito do zero.
-- SQLite. Idempotente. Nao remove nem substitui questoes oficiais.
-- O campo explicacao_historica do pacote V5 e tratado como comentario do professor.

CREATE TABLE IF NOT EXISTS contran_prf_unpublished_questions (
  question_id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  statement TEXT NOT NULL,
  statement_hash TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('CERTO_ERRADO', 'MULTIPLA_ESCOLHA')),
  alternatives TEXT,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  historical_explanation TEXT,
  beginner_explanation TEXT,
  trap_explanation TEXT,
  current_resolution TEXT,
  historical_resolution TEXT,
  topic TEXT,
  subtopic TEXT,
  axis TEXT,
  difficulty TEXT,
  source_normative_reference TEXT,
  source_url TEXT,
  additional_source_urls TEXT,
  teacher_comment TEXT,
  alternative_explanations TEXT,
  is_unpublished INTEGER NOT NULL DEFAULT 1,
  is_official INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL,
  exam_board TEXT,
  exam_year INTEGER,
  official_exam INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  tags TEXT,
  data_base_normativa TEXT,
  revisar_se_alteracao_normativa INTEGER,
  banco_version TEXT,
  batch_id TEXT,
  audit_version TEXT,
  status_auditoria TEXT,
  validacao_normativa TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  visible INTEGER NOT NULL DEFAULT 1,
  deprecated INTEGER NOT NULL DEFAULT 0,
  superseded_by_batch_id TEXT,
  deprecated_at TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contran_prf_unpublished_import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_label TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_version TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'started',
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]',
  report_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_statement_hash
  ON contran_prf_unpublished_questions(statement_hash);
CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_resolution
  ON contran_prf_unpublished_questions(current_resolution);
CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_axis
  ON contran_prf_unpublished_questions(axis);
CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_topic
  ON contran_prf_unpublished_questions(topic, subtopic);
CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_type_difficulty
  ON contran_prf_unpublished_questions(question_type, difficulty);
CREATE INDEX IF NOT EXISTS idx_contran_prf_unpublished_batch_visibility
  ON contran_prf_unpublished_questions(batch_id, active, visible, deprecated);
