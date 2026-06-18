# README - Banco de Questões PRF/CONTRAN V5 refeito do zero

Este pacote substitui os lotes anteriores. O lote V3.3 deve ser removido ou desativado antes da importação.

## Ponto crítico

No sistema do usuário, o campo `explicacao_historica` significa **comentário do professor**. Neste V5, ele explica o gabarito. Não é histórico cronológico das resoluções.

## Contagens

- Total: 413
- Certo/Errado: 324
- Múltipla escolha: 89

## Arquivos

- `contran_prf_questoes_ineditas_v5_refeito_do_zero.jsonl`: importação recomendada.
- `contran_prf_questoes_ineditas_v5_refeito_do_zero.json`: leitura estruturada.
- `contran_prf_questoes_ineditas_v5_refeito_do_zero.csv`: auditoria tabular.
- `caderno_contran_prf_questoes_ineditas_v5_refeito_do_zero.pdf`: conferência humana.
- `PROMPT_CODEX_ROLLBACK_CONTRAN_PRF_V3_3.md`: rollback seguro.
- `PROMPT_CODEX_INSERIR_QUESTOES_CONTRAN_PRF_V5_REFEITO_DO_ZERO.md`: importação V5.

## Recomendação

Executar rollback, importar em dry-run, validar, importar oficialmente e rodar os testes.
