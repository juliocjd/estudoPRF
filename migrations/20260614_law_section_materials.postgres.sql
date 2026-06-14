-- Materiais manuais em dispositivos da Legislacao PRF.
-- Idempotente para PostgreSQL.

CREATE TABLE IF NOT EXISTS law_section_materials (
  id BIGSERIAL PRIMARY KEY,
  section_id BIGINT NOT NULL REFERENCES law_compendium_sections(id) ON DELETE CASCADE,
  source_slug TEXT,
  section_key TEXT,
  material_type TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  image_data_url TEXT,
  image_mime_type TEXT,
  image_name TEXT,
  caption TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_law_section_materials_section
  ON law_section_materials(section_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_law_section_materials_key
  ON law_section_materials(source_slug, section_key, sort_order, id);

ALTER TABLE law_section_materials
  ADD COLUMN IF NOT EXISTS body_html TEXT;
