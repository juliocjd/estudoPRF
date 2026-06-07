# Teoria aplicada à questão — v5

Este pacote substitui a lógica de “card por assunto como resposta principal” por uma camada individualizada: `question_applied_theory_cards`.

## Por quê
A Teoria rápida por assunto ficou genérica. O aluno precisa de uma explicação aplicada ao enunciado específico, especialmente em questões desatualizadas.

## Conteúdo
- 2.000 jobs de Legislação de Trânsito em `question_applied_theory_generation_jobs_transito_v5.jsonl`.
- 441 jobs prioritários de questões desatualizadas em `question_applied_theory_generation_jobs_desatualizadas_priority_v5.jsonl`.
- Golden seed com 5 exemplos revisados: 28259, 28260, 2002422, 1028008 e 28104.

## Regra principal
Não publicar card genérico. O card publicado precisa falar da questão.

## Comandos sugeridos
```bash
psql "$DATABASE_URL" -f data/question_applied_theory_v5/migration_question_applied_theory_cards_postgres_v5.sql
node data/question_applied_theory_v5/import-question-applied-theory-cards-v5.mjs --file data/question_applied_theory_v5/question_applied_theory_cards_golden_seed_v5.json
```

Depois, peça ao Codex para implementar a carga dos jobs e a geração em lote conforme o prompt.

Gerado em 2026-06-07T14:28:46.411806Z.
