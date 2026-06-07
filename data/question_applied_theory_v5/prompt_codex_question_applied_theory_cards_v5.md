
Você é um engenheiro sênior full-stack e educacional. O sistema PRF Study já tem questões, respostas pela legislação atual e uma camada de Teoria rápida por assunto. Essa camada por assunto ficou genérica demais.

Objetivo desta entrega v5:
Criar uma nova camada de TEORIA APLICADA À QUESTÃO, com um card individual por questão, principalmente para questões desatualizadas.

Problema a resolver:
O aluno não deve ver um card amplo que apenas fala do assunto. Ele deve ver a regra que resolve aquela pergunta específica. Se a questão estiver desatualizada, o card deve mostrar a nova regra vigente, o fundamento e como o gabarito muda ou por que a questão não deve ser pontuada.

Arquivos do pacote:
- migration_question_applied_theory_cards_postgres_v5.sql
- question_applied_theory_generation_jobs_transito_v5.jsonl
- question_applied_theory_generation_jobs_desatualizadas_priority_v5.jsonl
- question_applied_theory_cards_golden_seed_v5.json
- schema_question_applied_theory_card_v5.json
- quality_rules_question_applied_theory_v5.json
- import-question-applied-theory-cards-v5.mjs
- diagnostico_sql_question_applied_theory_v5.sql

Regras fundamentais:
1. Não substitua a camada de correção. A fonte de correção de questões desatualizadas continua sendo question_current_law_answers.
2. A nova tabela question_applied_theory_cards serve para ENSINAR, não para decidir gabarito.
3. Contudo, o card aplicado deve usar current_answer quando question_current_law_answers estiver verified.
4. Para questão desatualizada needs_audit, não publique card didático com resposta atual. Gere status needs_current_law_audit.
5. Para questão no_valid_alternative, publique card explicando a regra atual, mas sem pontuar.
6. Para questão normal, o card pode usar o gabarito histórico e comentário do professor, desde que a regra seja aplicada ao enunciado específico.
7. Não use card genérico como principal.
8. Antes de publicar, valide se o card menciona pelo menos um elemento material do enunciado: prazo, percentual, idade, exceção, penalidade, documento, equipamento, condição factual ou alternativa.
9. Para questões com prazo/percentual/idade/número, o card deve comparar o valor do enunciado com o valor legal correto.
10. Não use confidence como gabarito.

Fluxo de implementação:
1. Rodar a migration.
2. Importar os golden cards para testes.
3. Criar script para carregar jobs de question_applied_theory_generation_jobs_desatualizadas_priority_v5.jsonl em question_applied_theory_generation_jobs.
4. Criar geração em lote, usando schema_question_applied_theory_card_v5.json como contrato de saída.
5. Gerar primeiro as 441 desatualizadas.
6. Só publicar card se passar pelas quality rules.
7. Depois gerar as demais questões de trânsito.
8. Atualizar a API GET /api/questions/:id para retornar appliedTheoryCard.
9. Atualizar frontend: aba “Teoria aplicada” deve aparecer antes de “Teoria rápida” genérica.

Comportamento no frontend:
- Antes de responder no modo Estudar agora: não revelar gabarito, nem conclusão que entregue a resposta.
- Depois de responder: mostrar card completo.
- Se card_status=published: mostrar como “Teoria aplicada à questão”.
- Se card_status=needs_current_law_audit: mostrar “Esta questão precisa de auditoria normativa antes de receber teoria aplicada segura.”
- Se card_status=no_valid_alternative: mostrar “Sem alternativa compatível pela legislação vigente” e a regra atual.
- Se não houver card individual: pode mostrar card por assunto apenas como “Panorama do assunto”, recolhido.

Testes obrigatórios:
- 28259: card deve explicar que o prazo atual é 30 dias, não 15, logo a assertiva é ERRADA pela legislação atual.
- 28260: card deve explicar película refletiva vedada/proibida; não refletiva pode ser admitida se respeitar transmitância.
- 2002422: card deve explicar transmitância atual do para-brisa: 70%, alternativa D.
- 1028008: card deve dizer que não há alternativa compatível pela regra atual e não deve pontuar.
- 28104: card deve explicar que revezamento particular entre pais não é transporte escolar regular sujeito às exigências do CTB arts. 136/138.

Critério de aceite:
- O sistema nunca mostra card genérico como se resolvesse a questão.
- Toda questão desatualizada publicada tem nova regra, fundamento e aplicação ao enunciado.
- Se a questão desatualizada não tem resposta atual verificada, ela não recebe card publicado com resposta.
- A UI fica simples: gabarito/regra/fundamento/resumo/pegadinha/conclusão, sem dados técnicos.
