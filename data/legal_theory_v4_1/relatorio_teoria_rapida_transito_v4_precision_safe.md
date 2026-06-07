# Relatório — Teoria rápida Legislação de Trânsito v4 precision-first

## Decisão de produto

Este pacote **não força card específico para todas as questões**. Ele processa as 2.000 questões, mas só permite exibição automática como "Teoria rápida" quando há evidência suficiente no enunciado/alternativas. Quando a evidência é fraca, genérica ou aparece apenas no comentário, o vínculo fica como panorama/sugestão e não deve ser exibido como certeza.

## Estatísticas finais

- Questões processadas: 2000
- Cards no seed: 171
- Links que podem aparecer automaticamente como Teoria rápida específica: 1365
- Links que NÃO devem aparecer como teoria específica automática: 635
- Vínculos rebaixados por evidência fraca/genérica: 133
- Vínculos marcados para revisão por evidência só em comentário/assunto: 186

## Distribuição por tipo

- specific_high_precision: 1645
- auto_show_as_primary: 1365
- needs_human_review: 287
- subject_overview_fallback: 348
- specific_medium_precision: 7

## Regra para a interface

- `auto_show_as_primary = true`: pode aparecer como Teoria rápida da questão.
- `needs_human_review = true`: não mostrar automaticamente no modo Estudar agora; pode aparecer apenas em área administrativa.
- `subject_overview_fallback`: mostrar apenas como Panorama do assunto, nunca como "regra que resolve".

## Por que não há 2.000 cards específicos automáticos?

Porque isso aumenta o risco de card irrelevante. A meta desta versão é impedir que o aluno perca tempo com teoria que não se amolda ao enunciado. Cobertura total pode existir como panorama, mas card específico exige evidência.


## Atualização v4.1 — proteção current_law

O arquivo seguro `traffic_question_card_links_transito_v4_precision_safe.jsonl` rebaixa vínculos de questões desatualizadas bloqueadas pela camada `question_current_law_answers`.

Distribuição por `display_mode` após proteção:

- rule_that_solves_or_clarifies_question: 1232
- theory_reference_only__not_solution_current_law: 383
- general_orientation_only: 295
- suggested_card_needs_review: 90


Use o arquivo `_safe` para importação. O arquivo antigo permanece apenas como referência.
