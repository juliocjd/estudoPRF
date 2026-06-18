# PROMPT CODEX - IMPORTAR BANCO PRF/CONTRAN V5 REFEITO DO ZERO

Integre ao projeto o banco `contran_prf_questoes_ineditas_v5_refeito_do_zero.jsonl` contido no pacote V5. Este lote substitui integralmente os lotes anteriores V3/V3.3/V4 de questões inéditas CONTRAN.

## Regras obrigatórias

1. Antes de importar, execute o prompt de rollback `PROMPT_CODEX_ROLLBACK_CONTRAN_PRF_V3_3.md`.
2. Extraia o ZIP `pacote_banco_questoes_contran_prf_v5_refeito_do_zero.zip` em pasta temporária.
3. Valide o manifesto e o JSONL.
4. Total esperado: 413 questões.
5. Tipos esperados:
   - Certo/Errado: 324
   - Múltipla escolha: 89
6. Todas devem permanecer como inéditas:
   - `questao_inedita = true`
   - `is_unpublished = true`
   - `is_official = false`
   - `origin = "Questão inédita - elaborada para treino PRF/CONTRAN"`
   - `exam_board = "INEDITA_ESTILO_CEBRASPE"` ou equivalente
   - `exam_year = null`
7. Campo mais importante: `explicacao_historica` deve ser exibido como **Comentário do professor**. Não exibir esse campo como histórico normativo.
8. Para múltipla escolha, a tela de correção deve exibir o comentário por alternativa, indicando por que A, B, C, D e E estão certas ou erradas.
9. Para Certo/Errado, a tela deve exibir por que o item está Certo ou Errado e qual foi a pegadinha.
10. Importação idempotente:
    - usar `external_id` como chave externa;
    - atualizar se existir;
    - inserir se não existir;
    - não duplicar;
    - não apagar histórico de respostas.
11. Criar/ajustar filtros por:
    - questão inédita;
    - resolução;
    - eixo;
    - tema;
    - subtema;
    - tipo de questão;
    - dificuldade.
12. Garantir que o lote V5 não entre nas estatísticas de cobrança real de provas anteriores. Ele pode entrar apenas em estatísticas de treino.

## Validações automatizadas

- total importado = 413;
- todas possuem `explicacao_historica` não vazia;
- toda múltipla escolha possui alternativas A-E;
- todo comentário de múltipla escolha contém justificativa para A, B, C, D e E;
- toda questão C/E tem gabarito C ou E;
- toda múltipla escolha tem gabarito A, B, C, D ou E;
- nenhuma questão tem `is_official = true`;
- nenhuma questão antiga V3.3 permanece visível para treino novo.

## Entrega esperada

Ao final, informe:
- rollback executado;
- quantidade de registros antigos removidos ou desativados;
- quantidade de questões V5 inseridas/atualizadas;
- migrations/scripts criados;
- filtros criados;
- resultado dos testes.
