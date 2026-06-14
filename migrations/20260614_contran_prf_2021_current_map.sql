-- 20260614_contran_prf_2021_current_map.sql
-- Objetivo: criar tabela de mapeamento edital PRF 2021 -> norma CONTRAN atual/substituta.
-- Seguro/idempotente para PostgreSQL. Não remove dados antigos.

BEGIN;

CREATE TABLE IF NOT EXISTS contran_prf_2021_current_map (
  id BIGSERIAL PRIMARY KEY,
  source_organ TEXT NOT NULL DEFAULT 'CONTRAN',
  source_number TEXT NOT NULL,
  source_year TEXT NOT NULL,
  source_title_hint TEXT,
  edital_scope TEXT NOT NULL DEFAULT 'texto integral',
  source_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_organ TEXT NOT NULL DEFAULT 'CONTRAN',
  target_number TEXT NOT NULL,
  target_year TEXT NOT NULL,
  target_title TEXT NOT NULL,
  target_official_url TEXT NOT NULL,
  relation TEXT NOT NULL,
  scope_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_norm_allowed_only_as_alias BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_current_study_filter BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  confidence TEXT NOT NULL DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_organ, source_number, source_year)
);

CREATE INDEX IF NOT EXISTS idx_contran_prf_2021_current_map_target
  ON contran_prf_2021_current_map (target_organ, target_number, target_year);

CREATE INDEX IF NOT EXISTS idx_contran_prf_2021_current_map_scope_gin
  ON contran_prf_2021_current_map USING GIN (scope_policy);

CREATE INDEX IF NOT EXISTS idx_contran_prf_2021_current_map_aliases_gin
  ON contran_prf_2021_current_map USING GIN (source_aliases);

CREATE TABLE IF NOT EXISTS contran_prf_2021_import_runs (
  id BIGSERIAL PRIMARY KEY,
  run_label TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'started',
  report JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Opcional: tabela de aliases de busca, para que o usuário encontre questões por "Res. 210/06" ou "Res. 882/21".
CREATE TABLE IF NOT EXISTS legal_norm_aliases (
  id BIGSERIAL PRIMARY KEY,
  old_organ TEXT NOT NULL DEFAULT 'CONTRAN',
  old_number TEXT NOT NULL,
  old_year TEXT NOT NULL,
  current_organ TEXT NOT NULL DEFAULT 'CONTRAN',
  current_number TEXT NOT NULL,
  current_year TEXT NOT NULL,
  alias_reason TEXT NOT NULL DEFAULT 'PRF_2021_current_resolution_map',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (old_organ, old_number, old_year, current_organ, current_number, current_year)
);

CREATE INDEX IF NOT EXISTS idx_legal_norm_aliases_old_norm
  ON legal_norm_aliases (old_organ, old_number, old_year);

CREATE INDEX IF NOT EXISTS idx_legal_norm_aliases_current_norm
  ON legal_norm_aliases (current_organ, current_number, current_year);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contran_prf_2021_relation') THEN
    ALTER TABLE contran_prf_2021_current_map
      ADD CONSTRAINT chk_contran_prf_2021_relation
      CHECK (relation IN ('substituida_ou_consolidada', 'permanece_vigente', 'substituida_por_cadeia_anual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contran_prf_2021_confidence') THEN
    ALTER TABLE contran_prf_2021_current_map
      ADD CONSTRAINT chk_contran_prf_2021_confidence
      CHECK (confidence IN ('high', 'medium', 'low'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contran_prf_2021_nonempty_refs') THEN
    ALTER TABLE contran_prf_2021_current_map
      ADD CONSTRAINT chk_contran_prf_2021_nonempty_refs
      CHECK (
        btrim(source_number) <> '' AND btrim(source_year) <> '' AND
        btrim(target_number) <> '' AND btrim(target_year) <> '' AND
        target_official_url ~ '^https://'
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_contran_prf_2021_current_map_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contran_prf_2021_current_map_updated_at ON contran_prf_2021_current_map;
CREATE TRIGGER trg_contran_prf_2021_current_map_updated_at
BEFORE UPDATE ON contran_prf_2021_current_map
FOR EACH ROW
EXECUTE FUNCTION set_contran_prf_2021_current_map_updated_at();

CREATE OR REPLACE FUNCTION contran_norm_ref_key(p_number TEXT, p_year TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN regexp_replace(coalesce(p_number, ''), '\D', '', 'g') = '' THEN ''
      ELSE coalesce(nullif(ltrim(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), '0'), ''), '0')
    END
    || '/'
    || CASE
      WHEN length(regexp_replace(coalesce(p_year, ''), '\D', '', 'g')) = 2
        THEN CASE
          WHEN regexp_replace(coalesce(p_year, ''), '\D', '', 'g')::int > 80
            THEN '19' || regexp_replace(coalesce(p_year, ''), '\D', '', 'g')
          ELSE '20' || regexp_replace(coalesce(p_year, ''), '\D', '', 'g')
        END
      ELSE regexp_replace(coalesce(p_year, ''), '\D', '', 'g')
    END
$$;

CREATE OR REPLACE FUNCTION resolve_contran_prf_2021_norm(
  p_number TEXT,
  p_year TEXT,
  p_organ TEXT DEFAULT 'CONTRAN'
)
RETURNS TABLE (
  source_organ TEXT,
  source_number TEXT,
  source_year TEXT,
  source_title_hint TEXT,
  edital_scope TEXT,
  target_organ TEXT,
  target_number TEXT,
  target_year TEXT,
  target_title TEXT,
  target_official_url TEXT,
  relation TEXT,
  scope_policy JSONB,
  old_norm_allowed_only_as_alias BOOLEAN,
  show_in_current_study_filter BOOLEAN,
  notes TEXT,
  confidence TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH wanted AS (
    SELECT contran_norm_ref_key(p_number, p_year) AS ref_key, coalesce(nullif(btrim(p_organ), ''), 'CONTRAN') AS organ
  )
  SELECT
    m.source_organ, m.source_number, m.source_year, m.source_title_hint, m.edital_scope,
    m.target_organ, m.target_number, m.target_year, m.target_title, m.target_official_url,
    m.relation, m.scope_policy, m.old_norm_allowed_only_as_alias, m.show_in_current_study_filter,
    m.notes, m.confidence
  FROM contran_prf_2021_current_map m
  CROSS JOIN wanted w
  WHERE m.source_organ = w.organ
    AND (
      contran_norm_ref_key(m.source_number, m.source_year) = w.ref_key
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(m.source_aliases) alias(value)
        WHERE contran_norm_ref_key(split_part(alias.value, '/', 1), split_part(alias.value, '/', 2)) = w.ref_key
      )
    )
  ORDER BY CASE m.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, m.id
  LIMIT 1
$$;

CREATE OR REPLACE VIEW contran_prf_2021_current_study_targets AS
SELECT
  target_organ,
  target_number,
  target_year,
  min(target_title) AS target_title,
  min(target_official_url) AS target_official_url,
  count(*)::int AS mapped_sources,
  jsonb_agg(
    jsonb_build_object(
      'source_organ', source_organ,
      'source_number', source_number,
      'source_year', source_year,
      'edital_scope', edital_scope,
      'relation', relation,
      'scope_policy', scope_policy
    )
    ORDER BY source_year, source_number
  ) AS source_refs
FROM contran_prf_2021_current_map
WHERE show_in_current_study_filter = true
GROUP BY target_organ, target_number, target_year;

CREATE OR REPLACE VIEW contran_prf_2021_scope_exclusions AS
SELECT
  source_organ,
  source_number,
  source_year,
  edital_scope,
  target_organ,
  target_number,
  target_year,
  relation,
  scope_policy,
  notes
FROM contran_prf_2021_current_map
WHERE (scope_policy ? 'exclude_annexes_from_original_edital' AND (scope_policy->>'exclude_annexes_from_original_edital')::boolean = true)
   OR (scope_policy ? 'exclude_fichas_from_original_edital' AND (scope_policy->>'exclude_fichas_from_original_edital')::boolean = true)
   OR (scope_policy->>'include_only_current_equivalent' IS NOT NULL AND scope_policy->>'include_only_current_equivalent' <> '');

COMMENT ON TABLE contran_prf_2021_current_map IS 'Mapa edital PRF 2021: resolução CONTRAN cobrada à época -> norma atual/substituta para estudo.';
COMMENT ON COLUMN contran_prf_2021_current_map.source_aliases IS 'Aliases históricos aceitos na busca, ex.: 210/2006 para item que veio como 210/2011 no edital informado.';
COMMENT ON COLUMN contran_prf_2021_current_map.scope_policy IS 'Regras de escopo do edital: anexos excluídos, fichas excluídas ou recorte equivalente específico.';
COMMENT ON FUNCTION resolve_contran_prf_2021_norm(TEXT, TEXT, TEXT) IS 'Resolve número/ano CONTRAN antigo ou alias para o alvo atual de estudo do mapa PRF 2021.';

COMMIT;
