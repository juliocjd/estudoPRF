# Teoria aplicada com dispositivo exato — v6

Este pacote corrige um problema da camada de Teoria aplicada: cards que citam a resolução de modo genérico, sem apontar o artigo/anexo/inciso/alínea que realmente resolve a questão.

## Regra principal

Sem dispositivo exato, o card não pode ser publicado como Teoria aplicada principal.

## Arquivos

- `prompt_codex_question_applied_theory_exact_anchors_v6.md`: prompt principal para o Codex.
- `migration_exact_legal_anchors_v6.sql`: migration PostgreSQL.
- `schema_question_applied_theory_card_exact_v6.json`: schema esperado do card.
- `quality_rules_exact_anchors_v6.json`: regras de validação.
- `legal_segment_extraction_patterns_v6.json`: padrões para extrair artigos, anexos, incisos e alíneas.
- `example_card_res819_cadeirinha_v6.json`: exemplo obrigatório para a questão de cadeirinha.
- `diagnostico_sql_exact_anchors_v6.sql`: consultas de validação.

## Ordem recomendada

1. Aplicar migration.
2. Reprocessar fontes legais e criar `legal_article_segments`.
3. Regerar/revalidar cards de Legislação de Trânsito.
4. Publicar apenas cards com âncora exata.
5. Rodar diagnóstico.

## Comandos esperados

```bash
node scripts/build-legal-segments.mjs --db-client postgres
node scripts/generate-question-applied-theory-cards.mjs --db-client postgres --materia "Legislação de Trânsito e Transportes" --require-exact-anchor
node scripts/validate-question-applied-theory-cards.mjs --db-client postgres --materia "Legislação de Trânsito e Transportes"
node scripts/diagnose-question-applied-theory-exact-anchors.mjs --db-client postgres
```

## Critério mínimo

O exemplo da Resolução CONTRAN nº 819/2021 deve mostrar:

```text
Anexo I, inciso II, alíneas a e b
```

com o trecho transcrito sobre “cadeirinha”.
