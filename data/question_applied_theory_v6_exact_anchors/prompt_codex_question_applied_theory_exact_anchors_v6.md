# Prompt para Codex — Teoria aplicada com dispositivo exato (v6)

Você é um engenheiro sênior full-stack e também deve agir como revisor de qualidade de conteúdo jurídico aplicado a estudo para concursos PRF. O sistema é um site de estudo de questões com PostgreSQL, Node.js e frontend estático.

## Problema que precisa ser corrigido

A camada atual de **Teoria aplicada à questão** melhorou em relação aos cards genéricos, mas ainda falha em algo essencial: muitas respostas trazem apenas o nome da resolução ou um fundamento genérico, sem indicar exatamente o local da norma que resolve a questão.

Exemplo de erro atual:

```text
Fundamento:
Resolução CONTRAN nº 819/2021; CTB, art. 168.
```

Para a questão:

```text
Crianças na faixa etária de 1 a 4 anos devem ser transportadas em automóveis, utilizando o seguinte dispositivo de segurança:
A) cadeirinha
B) bebê conforto
C) assento de elevação
D) cinto de segurança do veículo
```

Isso é insuficiente. A resposta correta deve apontar o dispositivo exato:

```text
Resolução CONTRAN nº 819/2021, art. 2º, combinado com o Anexo I, inciso II, alíneas a e b.

Anexo I, inciso II:
“cadeirinha”, para as seguintes condições:
a) crianças com idade superior a um ano e inferior ou igual a quatro anos; ou
b) crianças com peso entre 9 a 18 kg, conforme limite máximo definido pelo fabricante do dispositivo.
```

A Teoria aplicada deve explicar diretamente por que a alternativa A é correta.

## Objetivo

Reestruturar a camada de Teoria aplicada para que **todo card publicado ao aluno tenha dispositivo legal preciso**, com:

1. fonte normativa;
2. localização exata: artigo, parágrafo, inciso, alínea, anexo, item ou ficha;
3. trecho normativo objetivo;
4. conexão explícita com o enunciado;
5. explicação de professor;
6. resumo prático;
7. pegadinha de prova;
8. conclusão de estudo.

Não quero cards bonitos, mas genéricos. Se o card não apontar o dispositivo que resolve a questão, ele não deve ser exibido como Teoria aplicada principal.

## Regra central

```text
Sem dispositivo exato, sem publicação como Teoria aplicada principal.
```

Se o sistema não encontrar o dispositivo exato, marcar o card como:

```text
needs_exact_anchor
```

ou:

```text
needs_human_review
```

Nesse caso, a UI pode mostrar no máximo “Panorama do assunto”, recolhido, mas não pode apresentar como regra que resolve a questão.

## Fontes oficiais

Usar prioritariamente:

- CTB compilado no Planalto;
- Resoluções CONTRAN/SENATRAN oficiais no Gov.br;
- MBFT oficial;
- anexos oficiais das resoluções;
- norma vigente quando a questão estiver desatualizada.

Não usar blogs, sites de cursinho ou comentários de alunos como fonte normativa final. Eles podem ser usados apenas como pista, nunca como fundamento.

## Arquivos deste pacote

Use os arquivos abaixo:

```text
migration_exact_legal_anchors_v6.sql
quality_rules_exact_anchors_v6.json
schema_question_applied_theory_card_exact_v6.json
legal_segment_extraction_patterns_v6.json
example_card_res819_cadeirinha_v6.json
diagnostico_sql_exact_anchors_v6.sql
```

## Tarefa 1 — Migrar banco para suportar âncoras legais exatas

Executar a migration:

```text
migration_exact_legal_anchors_v6.sql
```

Ela cria ou ajusta estruturas para:

- segmentos legais extraídos de artigos e anexos;
- âncoras legais por card;
- status de qualidade do card;
- evidência de aplicação da norma ao enunciado.

Não apagar tabelas existentes. A migration deve ser idempotente.

## Tarefa 2 — Melhorar extração de dispositivos legais

Hoje o importador de fontes legais pode extrair artigos, mas nem sempre extrai bem **anexos, incisos, alíneas e itens**.

Ajustar scripts como:

```text
scripts/import-traffic-legal-sources.mjs
```

ou criar novo script:

```text
scripts/build-legal-segments.mjs
```

para popular:

```text
legal_article_segments
```

Cada segmento deve conter:

- `source_key`;
- `source_title`;
- `source_url`;
- `segment_ref`;
- `parent_ref`;
- `segment_type`;
- `segment_text`;
- `normalized_text`;
- `page_start` e `page_end`, se disponível;
- `is_current`;
- `extracted_at`.

Exemplos de `segment_ref` esperados:

```text
Art. 2º
Art. 2º, § 1º
Art. 4º, inciso I
Anexo I, inciso II
Anexo I, inciso II, alínea a
Anexo I, inciso II, alínea b
MBFT, ficha 519-30
```

O parser deve ser capaz de segmentar trechos como:

```text
ANEXO
...
II - “cadeirinha” (Figura 2), para as seguintes condições:
a) crianças com idade superior a um ano e inferior ou igual a quatro anos; ou
b) crianças com peso entre 9 a 18 kg...
```

## Tarefa 3 — Regerar/revisar os cards de Teoria aplicada

Para cada questão de Legislação de Trânsito:

1. ler enunciado e alternativas;
2. identificar o elemento material cobrado;
3. buscar dispositivo legal exato;
4. gerar a Teoria aplicada somente se houver âncora legal precisa;
5. salvar a âncora legal em `question_applied_theory_legal_anchors`;
6. salvar o card em `question_applied_theory_cards`;
7. marcar `publish_status` conforme a qualidade.

## Tarefa 4 — Regra rígida para questões desatualizadas

Para questão desatualizada:

- consultar `question_current_law_answers`;
- usar apenas a resposta atual verificada;
- usar norma vigente;
- não usar gabarito histórico como fundamento de estudo atual;
- não publicar card com regra antiga como solução atual.

Se `question_current_law_answers.current_law_status = verified`, o card deve explicar a resposta pela lei atual.

Se `needs_audit`, `discard` ou `no_valid_alternative`, o card não deve aparecer como solução atual, exceto para informar:

```text
Esta questão não deve ser pontuada no modo legislação atual.
```

## Tarefa 5 — Formato obrigatório do card publicado

A UI deve mostrar exatamente esta estrutura, com os dados do banco:

```text
Teoria aplicada à questão

O que a questão cobra:
...

Gabarito pela regra atual/histórica:
...

Dispositivo que resolve:
Resolução/CTB/MBFT, artigo/anexo/inciso/alínea exatos.

Trecho da norma:
“...”

Aplicação ao enunciado:
Explique por que esse trecho resolve esta questão.

Resumo para memorizar:
- ...
- ...
- ...

Pegadinha de prova:
...

Conclusão para estudo:
...
```

Não exibir “Resolução nº X” isolada como fundamento. Sempre que houver anexo/inciso/alínea, indicar.

## Tarefa 6 — Exemplo obrigatório de validação

Para a questão sobre crianças de 1 a 4 anos e dispositivo de segurança, a Teoria aplicada deve ficar no padrão abaixo:

```text
O que a questão cobra:
Identificar qual dispositivo de retenção deve ser usado por criança com idade superior a 1 ano e inferior ou igual a 4 anos.

Gabarito:
Alternativa A — cadeirinha.

Dispositivo que resolve:
Resolução CONTRAN nº 819/2021, art. 2º, combinado com o Anexo I, inciso II, alíneas a e b.

Trecho da norma:
Anexo I, inciso II — “cadeirinha”, para as seguintes condições:
a) crianças com idade superior a um ano e inferior ou igual a quatro anos; ou
b) crianças com peso entre 9 a 18 kg, conforme limite máximo definido pelo fabricante do dispositivo.

Aplicação ao enunciado:
O enunciado fala expressamente em crianças de 1 a 4 anos. Essa faixa corresponde à “cadeirinha”, não ao bebê conforto, ao assento de elevação ou ao cinto do veículo.

Resumo para memorizar:
- Até 1 ano ou até 13 kg: bebê conforto/conversível.
- Mais de 1 ano até 4 anos, ou 9 a 18 kg: cadeirinha.
- Mais de 4 anos até 7 anos e meio, ou até 1,45 m e 15 a 36 kg: assento de elevação.
- Mais de 7 anos e meio até 10 anos, ou acima de 1,45 m: cinto do veículo.

Pegadinha:
A banca troca as faixas etárias dos dispositivos. O ponto decisivo aqui é “1 a 4 anos”, que aponta para cadeirinha.
```

Se o sistema não gerar algo com esse nível de precisão, o card deve ser considerado inválido.

## Tarefa 7 — Validação automática antes de publicar

Criar função de validação, por exemplo:

```js
validateAppliedTheoryCard(card, anchors, question)
```

Ela deve impedir publicação se:

- não houver `legal_locator` específico;
- `exact_excerpt` estiver vazio;
- o trecho normativo não tiver relação textual/material com o enunciado;
- o card citar apenas o nome da resolução;
- o card for genérico de assunto;
- o card não explicar por que a alternativa correta é correta;
- a questão desatualizada não usar `question_current_law_answers`.

## Tarefa 8 — Frontend

Na aba “Teoria rápida” ou “Teoria aplicada”, ajustar nomes e exibição:

- trocar “Teoria rápida” por “Teoria aplicada” quando houver card individual;
- mostrar o dispositivo exato em destaque;
- mostrar trecho da norma em bloco destacado;
- deixar texto oficial longo recolhido;
- não exibir card genérico como solução.

Se o card estiver `needs_exact_anchor`, mostrar:

```text
Ainda não há teoria aplicada validada para esta questão.
```

Se houver apenas panorama geral:

```text
Panorama do assunto
Este resumo ajuda no contexto, mas ainda não substitui a teoria aplicada desta questão.
```

## Tarefa 9 — Scripts esperados

Criar ou ajustar:

```bash
node scripts/build-legal-segments.mjs --db-client postgres
node scripts/generate-question-applied-theory-cards.mjs --db-client postgres --materia "Legislação de Trânsito e Transportes" --require-exact-anchor
node scripts/validate-question-applied-theory-cards.mjs --db-client postgres --materia "Legislação de Trânsito e Transportes"
node scripts/diagnose-question-applied-theory-exact-anchors.mjs --db-client postgres
```

## Tarefa 10 — Critérios de aceite

A implementação só está correta se:

1. A questão de 1 a 4 anos mostrar Resolução 819/2021, Anexo I, inciso II, alíneas a/b.
2. A Teoria aplicada transcrever o trecho específico da norma.
3. Nenhum card publicado exibir apenas “Resolução X” como fundamento.
4. Cards genéricos não aparecerem como solução da questão.
5. Questões desatualizadas usarem norma vigente e `question_current_law_answers`.
6. Cards sem âncora exata ficarem pendentes, não publicados.
7. O diagnóstico apontar quantos cards têm âncora exata, quantos estão pendentes e por quê.
8. O aluno iniciante consegue entender por que a resposta é aquela sem abrir PDF ou resolução inteira.

## Observação final

O objetivo não é cobertura artificial. O objetivo é efetividade. Melhor ter menos cards publicados, mas corretos e precisos, do que 2.000 cards genéricos que desperdiçam tempo do aluno.
