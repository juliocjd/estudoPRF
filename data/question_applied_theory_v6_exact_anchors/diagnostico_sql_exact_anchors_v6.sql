-- Diagnóstico v6 - Teoria aplicada com âncoras legais exatas

-- 1. Total de cards e status de publicação
SELECT publish_status, legal_anchor_quality, COUNT(*) AS total
FROM question_applied_theory_cards
GROUP BY publish_status, legal_anchor_quality
ORDER BY publish_status, legal_anchor_quality;

-- 2. Cards publicados sem âncora exata: deve retornar zero
SELECT id, question_id, title, legal_basis, primary_legal_locator
FROM question_applied_theory_cards
WHERE publish_status = 'published'
  AND (
    COALESCE(exact_anchor_verified, false) = false
    OR COALESCE(primary_legal_locator, '') = ''
    OR COALESCE(primary_exact_excerpt, '') = ''
  )
LIMIT 100;

-- 3. Cards com fundamento genérico indevido
SELECT id, question_id, title, legal_basis
FROM question_applied_theory_cards
WHERE publish_status = 'published'
  AND (
    legal_basis ILIKE '%CTB no tema%'
    OR legal_basis ILIKE '%legislação vigente%'
    OR legal_basis ~* '^Resolução CONTRAN nº [0-9]+/[0-9]{4}\.?$'
  )
LIMIT 100;

-- 4. Questões de trânsito com/sem card aplicado publicado
SELECT
  COUNT(*) FILTER (WHERE c.id IS NOT NULL AND c.publish_status = 'published') AS com_card_publicado,
  COUNT(*) FILTER (WHERE c.id IS NULL OR c.publish_status <> 'published') AS sem_card_publicado,
  COUNT(*) AS total
FROM questions q
LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
WHERE q.materia = 'Legislação de Trânsito e Transportes';

-- 5. Questões desatualizadas que têm card publicado sem usar lei atual: deve retornar zero
SELECT q.id_question, c.id AS card_id, c.source_mode, c.title
FROM questions q
JOIN question_applied_theory_cards c ON c.question_id = q.id_question
WHERE q.desatualizada = 1
  AND c.publish_status = 'published'
  AND c.source_mode NOT IN ('current_law', 'current_law_verified')
LIMIT 100;

-- 6. Exemplo obrigatório: procurar questão com enunciado de 1 a 4 anos e cadeirinha
SELECT
  q.id_question,
  c.title,
  c.primary_legal_locator,
  c.primary_exact_excerpt,
  c.applied_explanation
FROM questions q
LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
WHERE q.statement_text ILIKE '%1 a 4 anos%'
   OR q.statement_text ILIKE '%um ano%quatro anos%'
LIMIT 20;
