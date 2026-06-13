-- migration_law_compendium_prf_postgres_v1.sql
-- Camada "Apostila da Lei" / legislação PRF vigente.
-- Idempotente para PostgreSQL.

CREATE TABLE IF NOT EXISTS law_compendium_sources (
  slug TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  number TEXT,
  year INTEGER,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT DEFAULT 'draft', -- draft | validated_current | historical_revoked | needs_verification | import_error
  current_status TEXT,
  official_url TEXT,
  official_index_url TEXT,
  source_hash TEXT,
  raw_text TEXT,
  raw_html TEXT,
  raw_pdf_path TEXT,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  official_checked_at TIMESTAMPTZ,
  effective_at DATE,
  revoked_at DATE,
  replaces JSONB DEFAULT '[]'::jsonb,
  replaced_by JSONB DEFAULT '[]'::jsonb,
  edital_origin JSONB DEFAULT '[]'::jsonb,
  validation_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS law_compendium_sections (
  id BIGSERIAL PRIMARY KEY,
  source_slug TEXT NOT NULL REFERENCES law_compendium_sources(slug) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  parent_section_key TEXT,
  hierarchy_level TEXT NOT NULL, -- titulo | capitulo | secao | artigo | paragrafo | inciso | alinea | anexo | item | ficha | quadro
  display_ref TEXT NOT NULL,     -- Art. 5º, § 1º, II, a, Anexo I etc.
  title TEXT,
  text TEXT NOT NULL,
  normalized_text TEXT,
  order_index INTEGER DEFAULT 0,
  is_revoked BOOLEAN DEFAULT FALSE,
  is_current BOOLEAN DEFAULT TRUE,
  extraction_confidence NUMERIC DEFAULT 1,
  raw_fragment TEXT,
  UNIQUE(source_slug, section_key)
);

CREATE INDEX IF NOT EXISTS idx_law_sections_source_order
  ON law_compendium_sections(source_slug, order_index);
CREATE INDEX IF NOT EXISTS idx_law_sections_display_ref
  ON law_compendium_sections(source_slug, display_ref);
CREATE INDEX IF NOT EXISTS idx_law_sections_normalized_text
  ON law_compendium_sections USING gin (to_tsvector('portuguese', COALESCE(normalized_text, text)));

CREATE TABLE IF NOT EXISTS law_compendium_cross_references (
  id BIGSERIAL PRIMARY KEY,
  source_slug TEXT NOT NULL REFERENCES law_compendium_sources(slug) ON DELETE CASCADE,
  section_id BIGINT REFERENCES law_compendium_sections(id) ON DELETE CASCADE,
  ref_text TEXT NOT NULL,
  target_source_slug TEXT,
  target_locator TEXT,
  resolved_section_id BIGINT REFERENCES law_compendium_sections(id) ON DELETE SET NULL,
  quoted_target_text TEXT,
  resolution_status TEXT DEFAULT 'pending', -- pending | resolved | unresolved | ambiguous
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_law_cross_refs_section
  ON law_compendium_cross_references(section_id);
CREATE INDEX IF NOT EXISTS idx_law_cross_refs_target
  ON law_compendium_cross_references(target_source_slug, target_locator);

CREATE TABLE IF NOT EXISTS law_compendium_study_summaries (
  source_slug TEXT PRIMARY KEY REFERENCES law_compendium_sources(slug) ON DELETE CASCADE,
  top_summary TEXT NOT NULL,
  what_it_covers JSONB DEFAULT '[]'::jsonb,
  high_yield_points JSONB DEFAULT '[]'::jsonb,
  common_traps JSONB DEFAULT '[]'::jsonb,
  related_ctb_articles JSONB DEFAULT '[]'::jsonb,
  generated_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS law_section_question_links (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES law_compendium_sections(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  link_kind TEXT NOT NULL DEFAULT 'tested_by', -- tested_by | example | comment_mentions | current_law_answer | applied_theory
  evidence TEXT,
  confidence NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, question_id, link_kind)
);

CREATE INDEX IF NOT EXISTS idx_law_question_links_question
  ON law_section_question_links(question_id);
CREATE INDEX IF NOT EXISTS idx_law_question_links_section
  ON law_section_question_links(section_id);

CREATE TABLE IF NOT EXISTS law_section_comment_links (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES law_compendium_sections(id) ON DELETE CASCADE,
  question_id INTEGER,
  comment_source TEXT DEFAULT 'tec',
  excerpt TEXT,
  evidence TEXT,
  confidence NUMERIC DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_law_comment_links_section
  ON law_section_comment_links(section_id);
CREATE INDEX IF NOT EXISTS idx_law_comment_links_question
  ON law_section_comment_links(question_id);

CREATE TABLE IF NOT EXISTS law_compendium_import_runs (
  id BIGSERIAL PRIMARY KEY,
  run_key TEXT UNIQUE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  sources_total INTEGER DEFAULT 0,
  sources_imported INTEGER DEFAULT 0,
  sections_imported INTEGER DEFAULT 0,
  cross_refs_found INTEGER DEFAULT 0,
  cross_refs_resolved INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  report JSONB DEFAULT '{}'::jsonb
);

-- View sugerida: quais normas ainda não podem ir para a apostila vigente.
CREATE OR REPLACE VIEW law_compendium_publication_blockers AS
SELECT slug, title, status, validation_notes
FROM law_compendium_sources
WHERE status NOT IN ('validated_current', 'historical_revoked');