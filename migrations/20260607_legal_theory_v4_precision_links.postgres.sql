-- Teoria rapida de transito v4.1 precision-safe.
-- Incremental e idempotente: adiciona metadados de seguranca aos vinculos questao -> card.

ALTER TABLE question_legal_links
  ADD COLUMN IF NOT EXISTS card_key TEXT,
  ADD COLUMN IF NOT EXISTS display_mode TEXT,
  ADD COLUMN IF NOT EXISTS auto_show_as_primary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS precision_level TEXT,
  ADD COLUMN IF NOT EXISTS matched_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS matched_terms_in_statement JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS current_law_status TEXT,
  ADD COLUMN IF NOT EXISTS current_law_can_auto_score BOOLEAN,
  ADD COLUMN IF NOT EXISTS current_law_answer TEXT,
  ADD COLUMN IF NOT EXISTS warning TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_question_legal_links_display_mode
  ON question_legal_links(display_mode);
CREATE INDEX IF NOT EXISTS idx_question_legal_links_primary_safe
  ON question_legal_links(question_id, auto_show_as_primary, needs_human_review, display_mode);
CREATE INDEX IF NOT EXISTS idx_question_legal_links_source
  ON question_legal_links(source);
