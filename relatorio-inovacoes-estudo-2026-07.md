# Relatório de Inovações — Sistema de Estudo PRF

**Data:** 05/07/2026 · **Horizonte:** sem edital publicado — roadmap organizado por gatilhos, não por calendário. Banca provável Cebraspe, formato certo/errado com desconto por erro. Referência: em 2021 a Cebraspe deu ~4 meses entre edital e prova.

---

## 1. Diagnóstico do sistema atual

### O que já existe (e é bom)

O sistema é incomumente completo para um projeto pessoal: 12.486 questões (8.375 certo/errado + 4.111 múltipla escolha), motor adaptativo custom com repetição espaçada, 775 clusters de similaridade, caderno de erros com 5.346 registros, compêndio legal com 1.697 seções de 70 fontes, rastreamento de atualização normativa (diferencial raro — quase nenhuma plataforma comercial faz isso), 173 cards de tópicos legais, comentários IA, perfis de prova com pesos por matéria e scoring Cebraspe por bloco com cutoffs da prova de 2021.

### Os gaps críticos

**a) Os dados reais de estudo vivem no Postgres (Vercel), não no SQLite local.** *(Corrigido em 05/07: o diagnóstico original apontava "apenas 25 respostas", mas isso era o SQLite local desatualizado — o uso real está no Postgres de produção.)* Consequências práticas: (1) o histórico real precisa ser auditado no Postgres para saber quanto material o FSRS tem para otimizar; (2) toda melhoria de telemetria e schema precisa de migração dupla (SQLite + Postgres, seguindo o padrão `*-postgres.mjs` já existente); (3) o SQLite segue como fonte de conteúdo (questões, leis, comentários), e o Postgres como fonte de verdade do desempenho do aluno — os pipelines de IA em lote escrevem no SQLite e sobem via `export-sqlite-postgres.mjs`, enquanto o otimizador FSRS lê do Postgres.

**b) O algoritmo de repetição espaçada é custom e inferior ao estado da arte.** Deltas fixos por confiança (guess +0.03, doubt +0.12, sure +0.20) e intervalos hardcoded (7→15→30→60 dias) são essencialmente um SM-2 simplificado. O FSRS (Free Spaced Repetition Scheduler) modela dificuldade/estabilidade/recuperabilidade por item, é otimizável com o próprio histórico e virou padrão do Anki. Existe port JS pronto (`ts-fsrs`).

**c) O treino para o formato Cebraspe é superficial.** O `/api/cebraspe-risk-report` agrupa acertos por confiança e devolve uma frase genérica. Numa prova onde errar anula um acerto, a decisão marcar/deixar em branco vale dezenas de pontos — o corte de 2021 foi 73/101. Isso merece um módulo inteiro, não um relatório.

**d) 4.111 questões de múltipla escolha subaproveitadas.** Uma questão de 5 alternativas contém ~5 afirmações julgáveis. Convertidas em itens certo/errado, o banco no formato da prova quase dobra.

**e) Não existe módulo de discursiva.** A prova da PRF tem redação eliminatória. Zero referências a redação/discursiva no código.

**f) Lei seca sub-servida.** 173 cards para 1.697 seções legais, e sem agendamento espaçado próprio. Para PRF, decorar prazos, velocidades, valores de multa e pontuações do CTB é metade do jogo.

**g) Fragilidade de engenharia.** Monólito de 9.814 linhas, zero testes, magic numbers espalhados. Cada inovação nova aumenta o risco de quebrar o que funciona.

---

## 2. Base de evidência (o que a ciência diz que funciona)

Meta-análises consistentemente apontam **prática de recuperação** (testar-se) e **prática distribuída** (espaçar) como as duas técnicas de maior efeito — seu sistema já está construído sobre elas, o que é o acerto estrutural do projeto. Três refinamentos com forte evidência ainda não estão aplicados:

1. **Successive relearning** — reaprender o mesmo item até N recuperações bem-sucedidas *espaçadas* (não na mesma sessão). Combina os efeitos de teste e espaçamento; é o protocolo com melhores resultados em retenção de longo prazo.
2. **Interleaving** — misturar matérias/assuntos dentro da sessão em vez de blocos (efeito moderado, g≈0.42), melhora discriminação — exatamente a habilidade de não cair em pegadinha Cebraspe.
3. **Calibração metacognitiva** — treinar a correspondência entre confiança e acerto real. Em prova com penalização, calibração é literalmente pontuação.

---

## 3. Inovações propostas

### A. Motor de aprendizagem: migrar para FSRS

Substituir o scheduler custom pelo `ts-fsrs`. Cada questão/card ganha estado (difficulty, stability, retrievability); a fila prioriza itens no ponto ótimo de esquecimento. Com ~1.000 respostas acumuladas, rodar o otimizador FSRS sobre o próprio histórico para personalizar os 19 parâmetros. Manter o mastery atual como camada de exibição, mas o agendamento vem do FSRS. Incluir successive relearning: item errado só "gradua" após 3 recuperações corretas espaçadas.

### B. Módulo Cebraspe: transformar o formato da prova em vantagem

1. **Gerador de itens C/E via LLM**: pipeline batch (nos moldes do `ai-comments-prf`) que converte cada alternativa das 4.111 questões de múltipla escolha em afirmação julgável, com gabarito derivado e validação amostral manual. Potencial: +10–15 mil itens no formato exato da prova, a custo quase zero.
2. **Treinador de calibração**: manter o registro de confiança obrigatório e construir dashboard com curva de calibração e Brier score por matéria. A saída prática é uma **política de marcação personalizada**: "em Legislação, seus 'doubt' têm 78% de acerto → marque; em Informática, 52% → deixe em branco". Recalculada continuamente, exibida no pós-simulado.
3. **Simulado realista**: ativar as tabelas `exam_simulations` (hoje vazias) com modo prova completo — 120 itens, 4h corridas, sem feedback durante, blocos e cutoffs de 2021, opção "deixar em branco" como resposta de primeira classe, e relatório pós-prova: pontos ganhos/perdidos por política de chute, desempenho por hora de prova (fadiga), posição estimada vs. corte de 2021.
4. **Detector de pegadinha**: usar LLM para anotar em cada item errado *qual* mecanismo a banca usou (troca de palavra restritiva, generalização indevida, prazo trocado, exceção omitida). Vira taxonomia pesquisável e alimenta drills do tipo "20 itens de troca de prazo".

### C. Lei seca como sistema de primeira classe

1. **Cloze cards automáticos**: gerar cards de lacuna (prazo, valor, velocidade, pontuação, autoridade competente) a partir das 1.697 seções do compêndio, priorizadas por incidência em prova via `question_legal_links` e `question_exam_subjects`. Agendados pelo mesmo FSRS. Meta: cobrir os ~300 artigos mais cobrados.
2. **Áudio de revisão (TTS)**: exportar resumos dos artigos top-N em áudio para revisão passiva em deslocamento/treino físico. Baixo custo, ganha horas mortas.
3. **Trilha "o que mudou"**: você já rastreia gabaritos alterados por mudança normativa — transformar isso em trilha de estudo ativa ("estas 47 questões mudaram de resposta desde 2021; a banca ama cobrar exatamente o que mudou").

### D. IA tutora (evoluir dos comentários estáticos)

1. **Diagnóstico automático de erro**: o campo `error_type` existe mas é manual. Classificar cada erro via LLM (conceito, leitura, pegadinha, lei desatualizada, chute) cruzando questão + resposta + tempo + confiança. Erros de conceito → fila de reparo com teoria; erros de leitura recorrentes → drill de atenção.
2. **Tutor socrático pós-erro**: em vez de mostrar o comentário direto, um chat curto que faz 2–3 perguntas-guia antes de revelar ("o que o art. 306 exige além da alcoolemia?"). Gerar a explicação só depois da tentativa de elaboração — o esforço de recuperação é o que fixa.
3. **Variantes de questão**: para itens dominados, gerar variação que troca o detalhe crítico (mesmo artigo, pegadinha diferente). Você já tem o pipeline de questões inéditas CONTRAN (413 questões, v3→v7) — generalizar para qualquer cluster fraco.

### E. Direção estratégica: otimizador pontos-por-hora

Cruzar três dados que você já tem — peso da matéria no perfil de prova (`exam_subject_weights`), incidência histórica por assunto e mastery atual — num único número: **pontos esperados de ganho por hora de estudo** em cada assunto. O plano diário passa a alocar tempo onde o ponto marginal é mais barato, e o dashboard mostra "nota projetada na prova de 2021" evoluindo semana a semana rumo ao corte (73). Isso converte estudo em placar, o que também resolve motivação.

### F. Discursiva (gap total hoje)

Módulo simples: banco de temas prováveis (segurança viária, atribuições PRF, direitos humanos), editor com limite de 30 linhas e timer, correção via LLM com a rubrica Cebraspe real (apresentação, estrutura, conteúdo, gramática — com desconto por erro/linha), histórico de notas. Uma redação por semana na fase de base, duas por semana após o edital. Redação elimina; treinar só questões é risco assimétrico.

### G. Além das questões

Consistência supera intensidade em 3–6 meses. Sugestões leves: streak diário e meta semanal de itens/minutos no dashboard; sessão de aquecimento automática de 10 min ao abrir (revisões FSRS vencidas); "modo reta final" que congela conteúdo novo a 30 dias da prova e vira só revisão + simulado; e registro de sono/treino físico opcional correlacionado com acerto — TAF também reprova.

---

## 4. Fundação técnica (pré-requisito, não burocracia)

1. **Instrumentar tudo agora.** Com 25 respostas registradas, nenhum algoritmo personaliza nada. Garantir que todo modo de estudo grave em `study_answers` (confiança, tempo, erro) — cada semana sem telemetria é uma semana de personalização perdida.
2. **Extrair módulos do monólito** apenas onde vai mexer: scheduler (FSRS), scoring de simulado e geração IA como módulos separados com testes. Não reescrever o resto.
3. **Centralizar magic numbers** num `study-config.mjs` (thresholds de mastery, deltas, cutoffs) — vira painel de ajuste em vez de caça ao número no código.
4. **Smoke tests** para os 10 endpoints críticos (já existe `smoke-study-engine` como semente).

---

## 5. Roadmap priorizado (por gatilho, não por calendário)

Sem data de prova, o que muda não é a prioridade — é o que dispara cada iniciativa. Três gatilhos: **Agora** (fase de base, em ondas sequenciais), **Edital publicado** (~4 meses até a prova, pelo histórico Cebraspe/PRF) e **30 dias da prova**.

| # | Iniciativa | Impacto | Esforço | Gatilho |
|---|-----------|---------|---------|---------|
| 1 | Telemetria completa + registro de confiança obrigatório | Alto | Baixo | Agora · 1ª onda |
| 2 | FSRS no lugar do scheduler custom (`ts-fsrs`) | Alto | Médio | Agora · 1ª onda |
| 3 | Simulado realista 120 itens + relatório de política de chute | Alto | Médio | Agora · 1ª onda |
| 4 | Otimizador pontos-por-hora + nota projetada no dashboard | Alto | Baixo | Agora · 1ª onda |
| 5 | Cloze cards de lei seca (top 300 artigos) no FSRS | Alto | Médio | Agora · 2ª onda |
| 6 | Gerador de itens C/E a partir de múltipla escolha (LLM) | Alto | Médio | Agora · 2ª onda |
| 7 | Diagnóstico automático de erro + detector de pegadinha | Médio-alto | Médio | Agora · 2ª onda |
| 8 | Módulo de discursiva com correção LLM (1 redação/semana) | Alto (eliminatória) | Médio | Agora · 2ª onda |
| 9 | Tutor socrático pós-erro | Médio | Médio | Agora · 3ª onda |
| 10 | Variantes de questão para clusters fracos | Médio | Alto | Agora · 3ª onda |
| 11 | TTS lei seca + trilha "o que mudou" | Médio | Baixo | Agora · 3ª onda |
| 12 | Modo reta final (congela conteúdo novo, só revisão+simulado) | Alto | Baixo | Construir no edital · ativar a 30 dias da prova |

**Regra de ouro do roadmap:** a 1ª onda vem primeiro porque tudo depois depende de dados (1), de agendamento correto (2) e de um placar que diga se está funcionando (3–4).

**Vantagens do cenário sem data:** a fase de base é onde o FSRS rende mais (retenção de longo prazo melhora quanto mais histórico acumula), e é o momento certo para os itens de esforço alto (6, 10) sem sacrificar revisão. Calibre a retenção-alvo do FSRS em ~85–90%; quando o edital sair, reagende para "reter até a data da prova".

**Ao publicar o edital, o sistema vira a chave automaticamente:** simulado completo semanal, 2 discursivas/semana, otimizador pontos-por-hora manda no plano diário, e conferência do conteúdo programático contra a cobertura do banco (assuntos novos no edital → prioridade máxima).

---

## Fontes

- [Open Spaced Repetition / FSRS](https://open-spaced-repetition.github.io/) · [fsrs4anki — ABC of FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs) · [FSRS vs SM-2](https://studyglen.com/guides/best-spaced-repetition-apps)
- [Meta-análise: prática distribuída e testing effect (STEM)](https://link.springer.com/article/10.1186/s40594-024-00468-5) · [Retrieval + spaced practice combinadas](https://evidencebased.education/resource/retrieval-and-spaced-practice-study-strategies-that-must-be-combined/) · [Retrieval practice em escolas reais](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1632206/full)
- [Tutores socráticos com LLM (avaliação)](https://arxiv.org/pdf/2508.06583) · [Diagnóstico de erro por IA — BEA 2025](https://arxiv.org/pdf/2506.10627)
- [Concurso PRF 2026 — situação](https://www.tecconcursos.com.br/blog/noticias/concurso-prf-2026/) · [Cebraspe PRF 2021](https://www.cebraspe.org.br/concursos/prf_21)
