
-- Diagnóstico da teoria aplicada individualizada
SELECT card_status, source_mode, count(*) FROM question_applied_theory_cards GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS traffic_questions FROM questions WHERE materia='Legislação de Trânsito e Transportes';
SELECT count(*) AS traffic_with_published_card
FROM questions q JOIN question_applied_theory_cards c ON c.question_id=q.id_question
WHERE q.materia='Legislação de Trânsito e Transportes' AND c.card_status='published';
SELECT q.id_question, q.desatualizada, c.card_status, c.source_mode, c.current_answer, c.title
FROM questions q LEFT JOIN question_applied_theory_cards c ON c.question_id=q.id_question
WHERE q.id_question IN (28259,28260,2002422,1028008,28104)
ORDER BY q.id_question;
-- Questões de trânsito sem card individualizado publicado ou com pendência
SELECT q.id_question, q.assunto, q.desatualizada, c.card_status, c.source_mode
FROM questions q LEFT JOIN question_applied_theory_cards c ON c.question_id=q.id_question
WHERE q.materia='Legislação de Trânsito e Transportes'
  AND COALESCE(c.card_status,'missing') <> 'published'
ORDER BY q.desatualizada DESC, q.assunto, q.id_question
LIMIT 200;
