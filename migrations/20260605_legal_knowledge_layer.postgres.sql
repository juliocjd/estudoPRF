-- Camada de legislacao e microteoria para estudo PRF.
-- PostgreSQL. Idempotente.

CREATE TABLE IF NOT EXISTS legal_sources (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_org TEXT,
  url TEXT NOT NULL,
  status TEXT,
  number TEXT,
  year INTEGER,
  published_at DATE,
  effective_at DATE,
  revoked_by TEXT,
  priority INTEGER DEFAULT 50,
  raw_text TEXT,
  raw_hash TEXT,
  fetched_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ,
  import_error TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_articles (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
  article_ref TEXT NOT NULL,
  article_order INTEGER,
  heading TEXT,
  text TEXT NOT NULL,
  normalized_text TEXT,
  excerpt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, article_ref)
);

CREATE TABLE IF NOT EXISTS legal_topic_cards (
  id BIGSERIAL PRIMARY KEY,
  card_key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  materia TEXT,
  assunto TEXT,
  microtema TEXT,
  level TEXT DEFAULT 'beginner',
  answer_summary TEXT,
  rule_summary TEXT,
  professor_note TEXT,
  common_traps TEXT,
  memory_hook TEXT,
  example_text TEXT,
  source_refs JSONB DEFAULT '[]'::jsonb,
  verified_status TEXT DEFAULT 'draft',
  generated_by TEXT DEFAULT 'system',
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_legal_links (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL,
  legal_article_id BIGINT REFERENCES legal_articles(id) ON DELETE SET NULL,
  legal_card_id BIGINT REFERENCES legal_topic_cards(id) ON DELETE SET NULL,
  relation_type TEXT DEFAULT 'supports_answer',
  relevance_score NUMERIC DEFAULT 0,
  reason TEXT,
  source TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, legal_article_id, legal_card_id, relation_type)
);

CREATE TABLE IF NOT EXISTS legal_change_events (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT REFERENCES legal_sources(id) ON DELETE SET NULL,
  change_key TEXT UNIQUE,
  title TEXT NOT NULL,
  previous_rule TEXT,
  current_rule TEXT,
  affected_topics JSONB DEFAULT '[]'::jsonb,
  affected_question_count INTEGER DEFAULT 0,
  effective_at DATE,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_study_lessons (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT,
  legal_card_id BIGINT REFERENCES legal_topic_cards(id) ON DELETE SET NULL,
  lesson_type TEXT NOT NULL DEFAULT 'error_remedy',
  title TEXT NOT NULL,
  short_text TEXT NOT NULL,
  created_from TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_sources_type_number
  ON legal_sources(source_type, number, year);
CREATE INDEX IF NOT EXISTS idx_legal_articles_source_ref
  ON legal_articles(source_id, article_ref);
CREATE INDEX IF NOT EXISTS idx_legal_articles_normalized_text
  ON legal_articles USING GIN (to_tsvector('portuguese', COALESCE(normalized_text, text, '')));
CREATE INDEX IF NOT EXISTS idx_legal_cards_materia_assunto
  ON legal_topic_cards(materia, assunto, microtema);
CREATE INDEX IF NOT EXISTS idx_question_legal_links_question
  ON question_legal_links(question_id);
CREATE INDEX IF NOT EXISTS idx_question_legal_links_card
  ON question_legal_links(legal_card_id);
CREATE INDEX IF NOT EXISTS idx_legal_change_events_effective_at
  ON legal_change_events(effective_at);
