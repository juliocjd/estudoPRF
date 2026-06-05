-- Corrige contradicao do comentario da questao 300141.
-- O comentario cita que o 10º digito do VIN identifica o modelo do veiculo,
-- e a alternativa "o modelo" e a letra E. A frase final "gabarito letra A"
-- contradiz o proprio fundamento.

UPDATE comments
SET extracted_answer = 'E',
    checked_at = CURRENT_TIMESTAMP
WHERE question_id = 300141;

UPDATE questions
SET official_answer = 'E',
    official_answer_source = 'manual_comment_contradiction_20260605'
WHERE id_question = 300141;

DO $$
BEGIN
  IF to_regclass('public.question_answer_audit') IS NOT NULL THEN
    INSERT INTO question_answer_audit (
      question_id,
      answer,
      source,
      confidence,
      evidence_text,
      extractor_version,
      created_at
    )
    VALUES (
      300141,
      'E',
      'manual_comment_contradiction',
      0.99,
      'Comentario cita §6º da Res. CONTRAN 24/1998: decimo digito do VIN identifica o modelo do veiculo; na lista da questao, "o modelo" e a alternativa E. A frase final "gabarito letra A" contradiz o proprio comentario.',
      'manual-20260605',
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
