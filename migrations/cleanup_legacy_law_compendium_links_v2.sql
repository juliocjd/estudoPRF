-- cleanup_legacy_law_compendium_links_v2.sql
-- Use antes de reconstruir remissões e vínculos com os scripts v2.
-- Remove vínculos/remissões antigos, que foram gerados por correspondência ampla e podem estar falsos.

BEGIN;
DELETE FROM law_section_comment_links;
DELETE FROM law_section_question_links;
DELETE FROM law_compendium_cross_references;
COMMIT;
