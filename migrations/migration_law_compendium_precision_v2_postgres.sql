-- migration_law_compendium_precision_v2_postgres.sql
-- Corrige a camada "Legislação PRF / Apostila da Lei" para evitar remissões e vínculos falsos.
-- PostgreSQL. Idempotente.

BEGIN;

ALTER TABLE law_compendium_sources
  ADD COLUMN IF NOT EXISTS publication_group TEXT DEFAULT 'unset',
  ADD COLUMN IF NOT EXISTS show_in_student_compendium BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publication_block_reason TEXT,
  ADD COLUMN IF NOT EXISTS validation_method TEXT,
  ADD COLUMN IF NOT EXISTS import_quality TEXT DEFAULT 'unknown';

UPDATE law_compendium_sources
SET publication_group = CASE
      WHEN status = 'validated_current' THEN 'current_law'
      WHEN status = 'historical_revoked' THEN 'historical_only'
      ELSE 'admin_pending'
    END,
    show_in_student_compendium = CASE WHEN status = 'validated_current' THEN TRUE ELSE FALSE END,
    publication_block_reason = CASE
      WHEN status = 'validated_current' THEN NULL
      WHEN status = 'historical_revoked' THEN 'Norma histórica/revogada. Não deve aparecer na apostila vigente do aluno; usar apenas como mapeamento do edital antigo para norma atual.'
      ELSE COALESCE(validation_notes, 'Fonte pendente de validação oficial. Não publicar ao aluno como vigente.')
    END,
    import_quality = CASE
      WHEN status = 'validated_current' AND EXISTS (
        SELECT 1 FROM law_compendium_sections s WHERE s.source_slug = law_compendium_sources.slug
      ) THEN 'sections_imported'
      WHEN status = 'validated_current' THEN 'current_without_sections'
      WHEN status = 'historical_revoked' THEN 'historical_redirect_only'
      ELSE 'not_publishable'
    END
WHERE publication_group = 'unset' OR publication_group IS NULL;

ALTER TABLE law_compendium_sections
  ADD COLUMN IF NOT EXISTS locator_canonical TEXT,
  ADD COLUMN IF NOT EXISTS article_number TEXT,
  ADD COLUMN IF NOT EXISTS paragraph_number TEXT,
  ADD COLUMN IF NOT EXISTS inciso_ref TEXT,
  ADD COLUMN IF NOT EXISTS alinea_ref TEXT,
  ADD COLUMN IF NOT EXISTS annex_ref TEXT,
  ADD COLUMN IF NOT EXISTS root_article_key TEXT,
  ADD COLUMN IF NOT EXISTS clean_text TEXT,
  ADD COLUMN IF NOT EXISTS quality_flags JSONB DEFAULT '[]'::jsonb;

UPDATE law_compendium_sections
SET locator_canonical = lower(regexp_replace(coalesce(display_ref, ''), '[^a-zA-Z0-9º°§]+', ' ', 'g')),
    clean_text = regexp_replace(coalesce(text, ''), '\s+§\s*$', '', 'g')
WHERE locator_canonical IS NULL OR clean_text IS NULL;

ALTER TABLE law_compendium_cross_references
  ADD COLUMN IF NOT EXISTS display_policy TEXT DEFAULT 'hide',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS target_display_ref TEXT,
  ADD COLUMN IF NOT EXISTS target_text_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS is_self_reference BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extracted_context TEXT;

UPDATE law_compendium_cross_references cr
SET display_policy = 'hide',
    confidence = COALESCE(confidence, 0),
    reason = COALESCE(reason, 'Registro legado ocultado até reconstrução estrita v2.')
WHERE display_policy IS NULL OR display_policy = 'show' OR reason IS NULL;

ALTER TABLE law_section_question_links
  ADD COLUMN IF NOT EXISTS display_policy TEXT DEFAULT 'hide',
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'legacy_unreviewed',
  ADD COLUMN IF NOT EXISTS matched_source_slug TEXT,
  ADD COLUMN IF NOT EXISTS matched_display_ref TEXT,
  ADD COLUMN IF NOT EXISTS matched_locator_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS material_match_status TEXT DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_field TEXT;

UPDATE law_section_question_links
SET display_policy = 'hide',
    link_status = CASE WHEN link_status IS NULL OR link_status = '' THEN 'legacy_unreviewed' ELSE link_status END,
    material_match_status = COALESCE(material_match_status, 'not_checked'),
    review_status = COALESCE(review_status, 'unreviewed')
WHERE display_policy IS NULL OR display_policy = 'show';

ALTER TABLE law_section_comment_links
  ADD COLUMN IF NOT EXISTS display_policy TEXT DEFAULT 'hide',
  ADD COLUMN IF NOT EXISTS link_status TEXT DEFAULT 'legacy_unreviewed',
  ADD COLUMN IF NOT EXISTS matched_source_slug TEXT,
  ADD COLUMN IF NOT EXISTS matched_display_ref TEXT,
  ADD COLUMN IF NOT EXISTS matched_locator_json JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS material_match_status TEXT DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_field TEXT;

UPDATE law_section_comment_links
SET display_policy = 'hide',
    link_status = CASE WHEN link_status IS NULL OR link_status = '' THEN 'legacy_unreviewed' ELSE link_status END,
    material_match_status = COALESCE(material_match_status, 'not_checked'),
    review_status = COALESCE(review_status, 'unreviewed')
WHERE display_policy IS NULL OR display_policy = 'show';

CREATE TABLE IF NOT EXISTS law_compendium_quality_audit (
  id BIGSERIAL PRIMARY KEY,
  audit_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  source_slug TEXT,
  section_id BIGINT,
  question_id INTEGER,
  payload JSONB DEFAULT '{}'::jsonb
);

CREATE OR REPLACE VIEW law_compendium_student_sources AS
SELECT *
FROM law_compendium_sources
WHERE status = 'validated_current'
  AND show_in_student_compendium = TRUE
  AND import_quality = 'sections_imported';

CREATE OR REPLACE VIEW law_compendium_visible_cross_references AS
SELECT *
FROM law_compendium_cross_references
WHERE resolution_status = 'resolved'
  AND display_policy = 'show_in_article'
  AND COALESCE(is_self_reference, FALSE) = FALSE
  AND resolved_section_id IS NOT NULL;

CREATE OR REPLACE VIEW law_compendium_visible_question_links AS
SELECT *
FROM law_section_question_links
WHERE display_policy = 'show_in_article'
  AND link_status = 'verified_exact_locator'
  AND confidence >= 0.90;

CREATE OR REPLACE VIEW law_compendium_visible_comment_links AS
SELECT *
FROM law_section_comment_links
WHERE display_policy = 'show_in_article'
  AND link_status IN ('verified_exact_locator', 'derived_from_verified_question')
  AND confidence >= 0.70;

COMMIT;
