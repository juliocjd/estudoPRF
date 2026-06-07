-- v6 - suporte a Teoria aplicada com dispositivo legal exato
-- PostgreSQL - idempotente

CREATE TABLE IF NOT EXISTS legal_article_segments (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  source_version TEXT,
  segment_ref TEXT NOT NULL,
  parent_ref TEXT,
  segment_type TEXT,
  segment_text TEXT NOT NULL,
  normalized_text TEXT,
  page_start INTEGER,
  page_end INTEGER,
  is_current BOOLEAN DEFAULT TRUE,
  extraction_method TEXT,
  excerpt_hash TEXT,
  raw_context TEXT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_key, segment_ref, excerpt_hash)
);

CREATE INDEX IF NOT EXISTS idx_legal_segments_source_ref
  ON legal_article_segments(source_key, segment_ref);

CREATE INDEX IF NOT EXISTS idx_legal_segments_type
  ON legal_article_segments(segment_type);

CREATE INDEX IF NOT EXISTS idx_legal_segments_normalized_text
  ON legal_article_segments USING gin (to_tsvector('portuguese', coalesce(normalized_text, segment_text)));

-- Tabela de âncoras legais exatas por card/questão.
CREATE TABLE IF NOT EXISTS question_applied_theory_legal_anchors (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL,
  card_id BIGINT,
  anchor_role TEXT DEFAULT 'primary',
  source_key TEXT NOT NULL,
  source_title TEXT,
  source_url TEXT,
  legal_locator TEXT NOT NULL,
  exact_excerpt TEXT NOT NULL,
  segment_id BIGINT REFERENCES legal_article_segments(id),
  applies_to_question_json JSONB,
  applies_to_alternatives_json JSONB,
  anchor_status TEXT DEFAULT 'verified',
  verification_method TEXT,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qatla_question
  ON question_applied_theory_legal_anchors(question_id);

CREATE INDEX IF NOT EXISTS idx_qatla_card
  ON question_applied_theory_legal_anchors(card_id);

CREATE INDEX IF NOT EXISTS idx_qatla_status
  ON question_applied_theory_legal_anchors(anchor_status);

-- Ajustes na tabela principal de cards. Se a tabela não existir ainda, criar forma mínima.
CREATE TABLE IF NOT EXISTS question_applied_theory_cards (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL UNIQUE,
  card_status TEXT DEFAULT 'draft',
  publish_status TEXT DEFAULT 'draft',
  source_mode TEXT,
  title TEXT,
  question_focus TEXT,
  historical_answer TEXT,
  current_answer TEXT,
  rule_that_solves_this_question TEXT,
  legal_basis TEXT,
  article_excerpt TEXT,
  applied_explanation TEXT,
  rule_summary_bullets JSONB,
  professor_tip TEXT,
  common_traps JSONB,
  study_conclusion TEXT,
  raw_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE question_applied_theory_cards
  ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS answer_for_study TEXT,
  ADD COLUMN IF NOT EXISTS legal_anchor_quality TEXT DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS primary_legal_locator TEXT,
  ADD COLUMN IF NOT EXISTS primary_exact_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS exact_excerpt_source_url TEXT,
  ADD COLUMN IF NOT EXISTS exact_anchor_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exact_anchor_review_status TEXT DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS issue_mapping_json JSONB,
  ADD COLUMN IF NOT EXISTS why_correct_json JSONB,
  ADD COLUMN IF NOT EXISTS why_wrong_json JSONB,
  ADD COLUMN IF NOT EXISTS should_show_as_applied_theory BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS validation_errors_json JSONB,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_json JSONB;

CREATE INDEX IF NOT EXISTS idx_qatc_publish_status
  ON question_applied_theory_cards(publish_status);

CREATE INDEX IF NOT EXISTS idx_qatc_anchor_quality
  ON question_applied_theory_cards(legal_anchor_quality);

CREATE INDEX IF NOT EXISTS idx_qatc_show_applied
  ON question_applied_theory_cards(should_show_as_applied_theory);
