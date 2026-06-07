Você é um engenheiro sênior trabalhando no sistema local/PRF Study.

Objetivo desta rodada: substituir o pacote anterior de Teoria Rápida de Legislação de Trânsito por um pacote **precision-first**. O pacote anterior tentava dar cobertura total por assunto e poderia mostrar cards genéricos como se fossem a regra específica da questão. Isso é ruim para o aluno.

Agora a regra é:

1. Card específico só pode aparecer como "Regra que resolve a questão" se houver vínculo por evidência.
2. Evidência mínima: assunto compatível + termos do enunciado, alternativas ou comentário.
3. Se não houver evidência suficiente, use apenas card de panorama do assunto, com rótulo claro: "Panorama do assunto".
4. Panorama do assunto nunca pode ser exibido como se fosse a teoria que resolve a questão.
5. Vínculos ambíguos devem ir para revisão humana ou aparecer com aviso discreto, não como certeza.
6. Não inventar artigo, inciso, prazo, percentual ou regra numérica. Se o card não trouxer dispositivo específico, exibir apenas como orientação geral.

Arquivos deste pacote:

- legal_topic_cards_transito_v4_precision.json
- traffic_question_card_links_transito_v4_precision.jsonl
- traffic_question_card_links_transito_v4_precision.csv
- traffic_linking_rules_precision_v4.json
- traffic_question_links_needs_manual_review_v4.csv
- traffic_question_links_ambiguous_v4.json
- traffic_theory_coverage_by_subject_v4.csv
- traffic_question_jobs_for_card_review_v4.jsonl

Implementação desejada:

A) Importar os cards

Crie ou ajuste script:

node scripts/import-legal-topic-cards.mjs --db-client postgres --seed data/legal_topic_cards_transito_v4_precision.json --replace-source chatgpt_traffic_v4

O script deve fazer UPSERT em legal_topic_cards por card_key.

B) Importar vínculos questão → card

Crie ou ajuste script:

node scripts/import-question-legal-links.mjs --db-client postgres --links data/traffic_question_card_links_transito_v4_precision.jsonl --replace-source chatgpt_traffic_v4

Cada vínculo deve gravar pelo menos:

- question_id
- card_key/card_id
- link_type
- display_mode
- auto_show_as_primary
- needs_human_review
- score
- matched_terms/evidence
- source = chatgpt_traffic_v4

Se o schema atual de question_legal_links não tiver esses campos, criar migration incremental e idempotente.

C) Regra de exibição no frontend

Na aba Teoria rápida:

- se existir link auto_show_as_primary = true e needs_human_review = false:
  exibir como "Teoria rápida" com regra, fundamento, resumo e pegadinha.

- se o melhor link for subject_overview_fallback:
  exibir como "Panorama do assunto", não como regra que resolve a questão.
  Mostrar aviso curto: "Este é um panorama geral. Ainda não há microcard específico validado para esta questão."

- se needs_human_review = true:
  exibir como "Sugestão de teoria — revisar vínculo", ou não exibir automaticamente no modo Estudar agora.

- nunca mostrar card genérico como resposta/explicação da questão.

D) Regra de segurança pedagógica

A Teoria rápida deve complementar o estudo, não corrigir gabarito. A fonte de correção continua sendo o motor de respostas/gabaritos, especialmente question_current_law_answers para questões desatualizadas.

E) Diagnóstico obrigatório

Crie/rode:

node scripts/diagnose-legal-theory-coverage.mjs --db-client postgres --md data/diagnostico_teoria_rapida_v4.md --json data/diagnostico_teoria_rapida_v4.json

O relatório deve separar:

- questões com card específico;
- questões com apenas panorama do assunto;
- vínculos ambíguos;
- questões sem vínculo;
- cards mais usados;
- assuntos com cobertura fraca.

Critérios de aceite:

1. Nenhuma questão deve receber card específico sem evidência registrada.
2. Nenhum fallback por assunto deve aparecer como "regra que resolve a questão".
3. O aluno deve conseguir distinguir Teoria rápida específica de Panorama do assunto.
4. O modo Estudar agora não deve exibir card ambíguo como certeza.
5. A cobertura total pode incluir panorama, mas o diagnóstico deve informar a cobertura específica separadamente.
6. Não criar texto longo, técnico ou confuso para o aluno.
7. Não usar Teoria rápida para alterar gabarito.

Resumo deste pacote:
- Questões processadas: 2000
- Cards gerados: 171
- Links específicos: 1785
- Links apenas por panorama de assunto: 215
- Vínculos ambíguos: 203

## Estatísticas finais deste pacote

- Questões processadas: 2000
- Cards no seed: 171
- Links de Teoria rápida específica com auto_show_as_primary=true: 1365
- Links que devem ficar como panorama/sugestão/revisão: 635

Atenção: se a implementação mostrar os 635 como teoria específica, estará errada.


## Atualização v4.1 — proteção para questões desatualizadas

Use preferencialmente `traffic_question_card_links_transito_v4_precision_safe.jsonl`, não o arquivo sem sufixo `_safe`.

Esse arquivo adiciona `current_law_status`, `current_law_can_auto_score` e `current_law_answer` aos vínculos. Quando `current_law_status` for `needs_audit`, `no_valid_alternative` ou `discard`, o vínculo de teoria foi rebaixado para:

`display_mode = theory_reference_only__not_solution_current_law`

Nesses casos, a UI não deve exibir o card como “regra que resolve a questão” no modo legislação atual. Pode exibir, no máximo, como referência auxiliar/revisão geral depois da tentativa, com aviso.

Distribuição segura por display_mode:
{'rule_that_solves_or_clarifies_question': 1232, 'suggested_card_needs_review': 90, 'general_orientation_only': 295, 'theory_reference_only__not_solution_current_law': 383}
