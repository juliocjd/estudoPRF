BEGIN;

ALTER TABLE study_answers
  ADD COLUMN IF NOT EXISTS correction_mode TEXT,
  ADD COLUMN IF NOT EXISTS expected_answer_source TEXT,
  ADD COLUMN IF NOT EXISTS non_scoring_reason TEXT,
  ADD COLUMN IF NOT EXISTS current_law_status_at_answer TEXT,
  ADD COLUMN IF NOT EXISTS scoring_version TEXT;

ALTER TABLE question_clusters
  ADD COLUMN IF NOT EXISTS cluster_policy TEXT DEFAULT 'interleave',
  ADD COLUMN IF NOT EXISTS max_visible_per_pass INTEGER DEFAULT 1;

ALTER TABLE study_served_questions
  ADD COLUMN IF NOT EXISTS cluster_id BIGINT,
  ADD COLUMN IF NOT EXISTS served_context_json JSONB;

CREATE INDEX IF NOT EXISTS idx_study_served_questions_cluster_recent
  ON study_served_questions(cluster_id, served_at);

UPDATE question_clusters
SET
  cluster_policy = CASE
    WHEN COALESCE(size, 0) > 40 THEN 'stats_only'
    WHEN cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 'suppress_variants'
    WHEN cluster_type = 'same_skill' THEN 'stats_only'
    ELSE COALESCE(NULLIF(cluster_policy, ''), 'interleave')
  END,
  max_visible_per_pass = CASE
    WHEN COALESCE(size, 0) <= 40
      AND cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 1
    ELSE COALESCE(max_visible_per_pass, 999)
  END
WHERE COALESCE(cluster_policy, '') = ''
   OR cluster_policy = 'interleave'
   OR max_visible_per_pass IS NULL;

COMMIT;
