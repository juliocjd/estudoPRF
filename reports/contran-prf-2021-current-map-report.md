# Relatorio - mapa CONTRAN PRF 2021 atualizado

Gerado em: 2026-06-15T12:23:48.943Z
Base do pacote: 2026-06-14

## Resumo

- Normas antigas/itens do edital mapeados: 39
- Normas atuais unicas para estudo: 30
- Itens com anexos/fichas/recorte especial: 7
- Itens com revisao manual ou confianca menor que high: 1

## Itens com escopo excluido ou recorte especial

| Fonte do edital | Alvo atual | Escopo do edital | Regra aplicada |
|---|---|---|---|
| CONTRAN 92/1998 | CONTRAN 938/2022 | exceto os anexos | excluir anexos |
| CONTRAN 227/2007 | CONTRAN 970/2022 | exceto os anexos | excluir anexos |
| CONTRAN 552/2015 | CONTRAN 945/2022 | exceto os anexos | excluir anexos |
| CONTRAN 561/2015 | CONTRAN 985/2022 | exceto as fichas | excluir fichas; somente equivalente atual: MBFT sem fichas de enquadramento; preservar apenas parte normativa/intro/regras gerais que substitui o edital |
| CONTRAN 667/2017 | CONTRAN 970/2022 | exceto os anexos | excluir anexos |
| CONTRAN 735/2018 | CONTRAN 735/2018 | exceto os anexos | excluir anexos |
| CONTRAN 789/2020 | CONTRAN 1.020/2025 | Anexo I | somente equivalente atual: Somente conteudo atual equivalente ao antigo Anexo I da Resolucao 789/2020; nao importar o restante da Resolucao 1.020/2025 sem vinculo com esse recorte. |

## Itens que exigem atencao

- CONTRAN 92/1998 -> CONTRAN 938/2022: confianca medium - A numeracao oficial usual aparece como Resolucao 92/1999; manter alias 92/1998 para bater com o texto do edital.

## Testes de fumaca esperados

| Busca por | Deve resolver para | Observacao |
|---|---|---|
| CONTRAN 552/2015 | CONTRAN 945/2022 | anexos excluidos |
| CONTRAN 561/2015 | CONTRAN 985/2022 | fichas excluidas; recorte equivalente atual |
| CONTRAN 349/2010 | CONTRAN 955/2022 | substituida_ou_consolidada |
| CONTRAN 740/2018 | CONTRAN 1.004/2023 | substituida_ou_consolidada |
| CONTRAN 789/2020 | CONTRAN 1.020/2025 | recorte equivalente atual |
| CONTRAN 806/2020 | CONTRAN 1.014/2025 | cadeia anual |

## Conferencia do banco

- Fonte da conexao: `DATABASE_URL` (Neon pooler)
- Linhas em `contran_prf_2021_current_map`: 39
- Alvos atuais unicos no banco: 30
- Aliases historicos no banco: 42
- Ultima importacao registrada: 2026-06-14T13:30:56.375Z
