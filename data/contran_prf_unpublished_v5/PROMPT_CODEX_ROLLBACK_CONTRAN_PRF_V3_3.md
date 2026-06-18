# PROMPT CODEX - ROLLBACK DA VERSAO V3.3 E BLOQUEIO DO LOTE ANTIGO

Contexto: o lote anterior `CONTRAN_PRF_V3_3_AUDITADO_FINAL` foi importado, mas deve ser desativado porque o campo `explicacao_historica` foi usado de forma incorreta. No sistema, esse campo significa COMENTARIO DO PROFESSOR, ou seja, explicação do gabarito, e nao histórico cronológico de resoluções.

Tarefa:
1. Localize todas as questões importadas do lote anterior pelos critérios abaixo:
   - `batch_id` contendo `V3_3`;
   - IDs iniciados por `CONTRAN_PRF_V3_3`, se existirem;
   - `source` ou `origin` contendo `V3.3 auditado final`;
   - arquivo de importação `contran_prf_questoes_ineditas_v3_3_auditado_final`.
2. Faça rollback seguro:
   - se não houver histórico de respostas de usuários, remova o lote antigo;
   - se houver histórico de respostas, NÃO apague fisicamente: marque como `deprecated = true`, `active = false`, `visible = false`, `superseded_by_batch_id = "CONTRAN_PRF_V5_REFEITO_DO_ZERO_2026_06"`;
   - remova o lote antigo de planos de estudo, simulados, filtros públicos e contagens.
3. Preserve histórico de respostas do usuário, logs e auditoria.
4. Adicione uma migration/validação para impedir que lote desativado apareça em treino novo.
5. Gere relatório com: removidas, desativadas, preservadas por histórico, referências em planos removidas e testes executados.
6. Depois do rollback, importe apenas o lote V5 refeito do zero.

Regra de ouro: não misture questões antigas V3.3 com o novo lote V5. O campo `explicacao_historica` deve ser mapeado como comentário do professor/explicação do gabarito.
