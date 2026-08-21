# Estudo PRF

Aplicativo local/web de estudo por questões para concurso, com motor adaptativo,
repetição espaçada (FSRS), clusters de questões, perfis de prova por edital e
análise normativa de questões desatualizadas. O banco pode ser SQLite local ou
Postgres remoto.

Para publicar o código e planejar a hospedagem com banco remoto, veja
[DEPLOYMENT.md](DEPLOYMENT.md).

## Instalar

```powershell
npm install
```

## Site local de estudo

Para abrir a interface com as questões do banco, alternativas, campo de resposta
e botão para ver comentário:

```powershell
npm run study
```

Depois acesse:

```text
http://127.0.0.1:4173
```

O site usa o banco `questoes-prf.sqlite` (ou Postgres, via `DB_CLIENT=postgres` e
`DATABASE_URL`) e registra suas respostas em uma tabela `study_answers`.
Quando houver PDF correspondente em `pdfs/<materia>/`, o botão `Teoria` abre a
aula do assunto da questão em uma nova aba.
Também há filtro de questões não resolvidas, botão para ir ao próximo assunto da
matéria, botão para ir à próxima questão não resolvida e opção `Retomar última`,
que abre pela última questão respondida.

Para rodar contra Postgres:

```powershell
npm run study:pg
```

## Motor adaptativo de estudo

Antes de usar as filas adaptativas em outro banco, rode a migração. Ela cria
backup automático antes de alterar o schema:

```powershell
npm run migrate-study-db
```

Para gerar um diagnóstico da base:

```powershell
npm run diagnose-study-db -- --md diagnostico_pos_migracao.md --json diagnostico_pos_migracao.json
```

Para ativar o motor adaptativo `PRF Otimizado`, rode nesta ordem:

```powershell
npm run migrate-adaptive-study

npm run build-question-clusters

npm run diagnose-study-efficiency

npm run diagnose-study-flow
```

O plano `PRF Otimizado` usa clusters de questões para mostrar primeiro
representantes, revisões vencidas, erros recentes e temas com maior peso no
edital PRF. As variações continuam acessíveis em `Ver todas` e também podem
aparecer como reforço quando houver erro, dúvida, chute ou revisão vencida.

`Estudar agora` é um fluxo contínuo adaptativo: cada clique busca a próxima melhor
questão, sem limite obrigatório de sessão. Ao reabrir o app com `Continuar estudo`
ativo, o sistema retoma a questão aberta e não respondida; se ela já foi
respondida, pula para a próxima recomendada. O modo `Ver todas` continua livre e
não aplica esse fluxo.

Para criar tags iniciais de habilidade a partir de matéria e assunto:

```powershell
npm run seed-question-skills
```

Campos e tabelas novos:

- `study_answers`: `confidence`, `error_type`, `elapsed_ms`, `study_mode`, `saw_comment`, `opened_theory`, `session_id`, `created_at`.
- `question_mastery`: domínio por questão, sequências de acerto/erro e próxima revisão.
- `subject_mastery`: domínio agregado por matéria/assunto.
- `study_events`: eventos de comentário, teoria e ciclo da questão.
- `question_answer_audit`: auditoria de gabaritos por fonte.
- `question_skill_tags`: habilidade inicial por matéria/assunto.
- `theory_links`: preparado para vínculos mais precisos com PDFs.
- `question_clusters`: famílias de questões exatas, semelhantes ou do mesmo assunto.
- `question_cluster_members`: membros e representante de cada família.
- `cluster_mastery`: domínio agregado por família.
- `study_strategy_profiles`: planos simples (`PRF Otimizado`, `Revisar erros`, `Revisar hoje`, `Ver todas`).
- `study_flow_state`: estado mínimo do fluxo contínuo, com última questão aberta e última respondida.
- `study_served_questions`: histórico curto de questões servidas para evitar repetição imediata.
- `study_session_items`: itens opcionais de sessão adaptativa; o botão `Estudar agora` não depende de micro-sessão.

## Perfis de prova e incidência externa

Para usar pesos externos de edital/incidência, rode a migração de perfis. Ela
também cria backup automático:

```powershell
npm run migrate-exam-profiles
```

Depois semeie os perfis PRF e escolha o ativo:

```powershell
npm run seed-prf-exam-profiles -- --active prf_2021_qconcursos_disciplina
```

Perfis disponíveis:

- `prf_2021_edital_blocos`
- `prf_2021_qconcursos_disciplina`
- `prf_2021_estrategia_agregado`
- `prf_pre_edital_personalizado`

Mapeie as matérias da base para o perfil desejado:

```powershell
npm run map-exam-subjects -- --profile prf_2021_qconcursos_disciplina
```

Para diagnosticar a cobertura da base em relação ao perfil:

```powershell
npm run diagnose-exam-coverage -- --profile prf_2021_qconcursos_disciplina --md cobertura_prf.md --json cobertura_prf.json
```

O painel `Base x Prova PRF` no site mostra peso esperado, questões esperadas,
questões da base, questões válidas, questões com gabarito, domínio e revisões
vencidas. O status ajuda a identificar disciplinas `alta_prioridade`,
`sub-representada`, `sem_gabarito_suficiente`, `super-representada` ou `ok`.

A fila inteligente usa a versão v2 quando acionada pelo site. Ela combina revisão
vencida, último erro, questão nunca resolvida, domínio baixo, peso externo da
disciplina, lacuna de cobertura, comentário, gabarito, anulação e desatualização.

## Análise normativa de questões desatualizadas

Para importar uma análise externa das questões marcadas como desatualizadas sem
alterar gabarito oficial nem comentário do professor, rode:

```powershell
npm run migrate-normative-updates

npm run import-normative-updates

npm run diagnose-normative-updates
```

A tabela `question_normative_updates` guarda a análise auxiliar em separado. Ela
não sobrescreve `questions.official_answer`, não altera `comments.extracted_answer`
e não remove `desatualizada = 1`.

No site, questões com análise importada exibem alerta e uma aba `Atualizacao` no
painel lateral. O menu `Relatorios` também passa a ter o painel `Revisao
normativa`, com filtros por recomendação, segurança, mudança de gabarito e status
de revisão.

O gabarito atualizado provável é exibido como análise auxiliar. Por padrão, o
sistema continua calculando acerto pelo gabarito histórico do banco.

## APIs úteis

```text
GET  /api/normative-updates
GET  /api/normative-updates/stats
POST /api/questions/:id/normative-review

GET  /api/exam-profiles
POST /api/exam-profiles/active
GET  /api/exam-coverage?profile=prf_2021_qconcursos_disciplina
GET  /api/smart-queue-v2?profile=prf_2021_qconcursos_disciplina&limit=50
GET  /api/session-plan?profile=prf_2021_qconcursos_disciplina&mode=balanced&size=30
GET  /api/adaptive-study/next?plan=prf_otimizado
GET  /api/adaptive-study/session?plan=prf_otimizado&size=20
GET  /api/adaptive-study/stats
GET  /api/study-resume-target?plan=prf_otimizado
GET  /api/question-clusters/:id
GET  /api/questions/:id/similar
GET  /api/cebraspe-risk-report
```

Para simulado Cebraspe:

```text
POST /api/exam-simulations/start
POST /api/exam-simulations/:id/answer
POST /api/exam-simulations/:id/finish
```

A pontuação do simulado segue o modelo Cebraspe: `+1` para acerto, `-1` para erro
e `0` para branco. Os cortes usados são Bloco I >= 15, Bloco II >= 10,
Bloco III >= 10 e total >= 50.
