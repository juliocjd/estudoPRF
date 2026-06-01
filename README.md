# Materiais Tec para PDF

Automacao local para abrir aulas em texto no navegador autenticado e gerar PDFs, usando a sua propria sessao e o fluxo normal de visualizacao/impressao.

Use apenas para materiais que a sua assinatura permite acessar e imprimir. O programa nao tenta burlar login, captcha, bloqueio, DRM, limite tecnico ou permissao do site.

## Instalar

```powershell
npm install
npx playwright install chromium
Copy-Item config.example.json config.local.json
```

## Login

```powershell
npm run login -- --config config.local.json --start-url "https://www.tecconcursos.com.br/"
```

O Chromium vai abrir. Entre na sua conta normalmente e volte ao terminal para apertar `Enter`. A sessao fica salva em `.browser-profile/`.

## Gerar PDFs a partir de URLs

1. Coloque uma URL de aula por linha em `aulas.txt`.
2. Rode:

```powershell
npm run pdf -- --config config.local.json
```

Os PDFs serao salvos na pasta `pdfs/`.

## Coletar links de uma pagina

Se uma pagina listar varias aulas, ajuste `collect.startUrl`, `collect.linkSelector` e, se necessario, `collect.includePattern` em `config.local.json`.

Depois rode:

```powershell
npm run collect -- --config config.local.json
```

Isso gera `aulas.generated.txt`. Confira o arquivo antes de usar:

```powershell
npm run pdf -- --config config.local.json --urls aulas.generated.txt
```

## Coletar aulas do guia PRF 2021

O comando abaixo usa o guia do Tec para o concurso PRF 2021, cargo Policial Rodoviario Federal. Ele coleta os assuntos dos cadernos do guia que ja estiverem salvos na conta e gera uma lista de URLs imprimiveis.

```powershell
npm run collect-prf -- --config config.local.json
```

Arquivos gerados:

- `aulas.prf.txt`: URLs para passar ao comando `pdf`.
- `aulas.prf.json`: relatorio com modulos, assuntos e links encontrados.

Depois:

```powershell
npm run pdf-prf -- --config config.local.json
```

Esse comando le `aulas.prf.json` e salva em uma pasta por materia:

```text
pdfs/
  Direito Administrativo (Doutrina e Leis Federais)/
    Regime Juridico Administrativo.pdf
    Atos Administrativos.pdf
```

Se voce ja gerou os PDFs antigos todos soltos em `pdfs/`, organize sem reimprimir:

```powershell
npm run organize-prf -- --config config.local.json
```

Para ver o que sera movido antes:

```powershell
npm run organize-prf -- --config config.local.json --dry-run
```

Para colocar os assuntos na ordem do guia dentro de cada materia:

```powershell
npm run order-prf -- --config config.local.json
```

Exemplo:

```text
pdfs/
  Direito Administrativo (Doutrina e Leis Federais)/
    001 - Regime Juridico Administrativo.pdf
    002 - Atos Administrativos.pdf
```

## Banco local de questoes PRF

Para criar/alimentar um banco SQLite local com as questoes dos cadernos PRF:

```powershell
npm run questions-prf -- --config config.local.json
```

O banco padrao e `questoes-prf.sqlite`. Ele guarda cadernos, posicoes, questoes, alternativas, comentarios, gabarito inferido do comentario quando possivel, hashes de enunciado/conteudo para detectar duplicidade e metadados como banca, ano, cargo, materia e assunto.

Para testar com poucas questoes:

```powershell
npm run questions-prf -- --config config.local.json --limit 20
```

O comando retoma de onde parou: questoes ja coletadas nao sao baixadas novamente.

Se o Tec retornar verificacao humana ou limite temporario, aguarde e retome em blocos menores:

```powershell
npm run questions-prf -- --config config.local.json --limit 200 --delay 5000
```

Para reduzir a quantidade de acessos em cada execucao, faca a coleta em etapas:

```powershell
npm run questions-prf -- --config config.local.json --skip-comments --limit 300 --delay 3000
```

Se o bloqueio continuar perto de 100 questoes, use lotes com pausa longa antes de chegar nesse ponto:

```powershell
npm run questions-prf -- --config config.local.json --skip-comments --limit 300 --delay 3000 --batch-size 75 --batch-pause 1800000
```

Depois colete apenas os comentarios que ainda faltam:

```powershell
npm run questions-prf -- --config config.local.json --comments-only --skip-assets --limit 100 --delay 8000
```

Se os comentarios tambem forem limitados, aplique a mesma estrategia:

```powershell
npm run questions-prf -- --config config.local.json --comments-only --skip-assets --limit 100 --delay 8000 --batch-size 50 --batch-pause 1800000
```

Por padrao, o comando reutiliza o indice de questoes ja salvo no banco e nao reindexa o mesmo caderno a cada retomada. Use `--refresh-index` somente se quiser forcar uma nova leitura do indice no Tec.

O `config.local.json` pode excluir materias e cadernos da coleta de questoes. Por padrao, `skipQuestionMatterPatterns` e `skipQuestionNotebookIds` estao configurados para pular Ingles, Espanhol e Geopolitica/Geografia.

Para coleta agressiva, o `config.local.json` usa `questionDelayMs` baixo e sem pausa por lote. Para voltar ao modo conservador com pausa longa, use:

```powershell
npm run questions-prf -- --config config.delay-conservador.json --skip-comments --limit 200
```

Se quiser acompanhar manualmente e resolver a verificacao humana quando o Tec pedir, use:

```powershell
npm run questions-prf -- --config config.local.json --skip-comments --limit 10000 --manual-on-block
```

Nesse modo, quando houver bloqueio temporario/verificacao, o navegador fica aberto e o terminal espera voce pressionar `Enter` para tentar continuar do mesmo ponto.

Para priorizar as materias principais da PRF antes do restante:

```powershell
npm run questions-prf -- --config config.prioridade.json --skip-comments --limit 10000 --manual-on-block
```

Depois, para buscar comentarios das questoes prioritarias ja salvas:

```powershell
npm run questions-prf -- --config config.prioridade.json --comments-only --skip-assets --limit 10000 --manual-on-block
```

Para testar se o gabarito ja vem no JSON do indice do caderno, sem baixar questoes individualmente:

```powershell
npm run questions-prf -- --config config.prioridade.json --index-only --manual-on-block
```

Se o Tec enviar gabarito nesse JSON, ele sera salvo em `questions.official_answer` e usado pelo site para corrigir respostas antes mesmo de existir comentario.

Para baixar localmente imagens que aparecam nos comentarios ja salvos:

```powershell
npm run assets-prf -- --config config.local.json
```

Tambem e possivel baixar imagens em lotes:

```powershell
npm run assets-prf -- --config config.local.json --limit 50 --delay 1000
```

As imagens ficam em `assets/comments/<id-da-questao>/`. O campo `comments.html` preserva o HTML original, e `comments.html_local` aponta para os arquivos locais baixados.

## Site local de estudo

Para abrir uma interface local com as questoes do banco, alternativas, campo de resposta e botao para ver comentario:

```powershell
npm run study -- --config config.local.json
```

Depois acesse:

```text
http://127.0.0.1:4173
```

O site usa o banco `questoes-prf.sqlite` e registra suas respostas em uma tabela local chamada `study_answers`.
Quando houver PDF correspondente em `pdfs/<materia>/`, o botao `Teoria` abre a aula do assunto da questao em uma nova aba.
Tambem ha filtro de questoes nao resolvidas, botao para ir ao proximo assunto da materia, botao para ir a proxima questao nao resolvida e opcao `Retomar ultima`, que abre pela ultima questao respondida.

## Motor adaptativo de estudo

Antes de usar as filas adaptativas em outro banco, rode a migracao. Ela cria backup automatico antes de alterar o schema:

```powershell
npm run migrate-study-db
```

Para gerar um diagnostico da base:

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

Os comandos completos equivalentes sao:

```powershell
node scripts/migrate-adaptive-study-engine.mjs --db questoes-prf.sqlite

node scripts/build-question-clusters.mjs `
  --db questoes-prf.sqlite `
  --profile prf_2021_qconcursos_disciplina

node scripts/diagnose-study-efficiency.mjs `
  --db questoes-prf.sqlite `
  --profile prf_2021_qconcursos_disciplina `
  --md data/diagnostico_eficiencia_estudo.md `
  --json data/diagnostico_eficiencia_estudo.json
```

O plano `PRF Otimizado` usa clusters de questoes para mostrar primeiro representantes, revisoes vencidas, erros recentes e temas com maior peso no edital PRF. As variacoes continuam acessiveis em `Ver todas` e tambem podem aparecer como reforco quando houver erro, duvida, chute ou revisao vencida.

`Estudar agora` e um fluxo continuo adaptativo: cada clique busca a proxima melhor questao, sem limite obrigatorio de sessao. Ao reabrir o app com `Continuar estudo` ativo, o sistema retoma a questao aberta e nao respondida; se ela ja foi respondida, pula para a proxima recomendada. O modo `Ver todas` continua livre e nao aplica esse fluxo.

Para publicar o codigo e planejar a hospedagem com banco remoto, veja [DEPLOYMENT.md](DEPLOYMENT.md).

Para criar tags iniciais de habilidade a partir de materia e assunto:

```powershell
npm run seed-question-skills
```

Para testar o backfill conservador de gabaritos inferidos dos comentarios:

```powershell
npm run backfill-answers-prf -- --db questoes-prf.sqlite --dry-run
```

Sem `--dry-run`, o comando grava apenas inferencias de alta confianca em `comments.extracted_answer` e registra evidencia em `question_answer_audit`. Ele nao sobrescreve `questions.official_answer`.

Campos e tabelas novos:

- `study_answers`: `confidence`, `error_type`, `elapsed_ms`, `study_mode`, `saw_comment`, `opened_theory`, `session_id`, `created_at`.
- `question_mastery`: dominio por questao, sequencias de acerto/erro e proxima revisao.
- `subject_mastery`: dominio agregado por materia/assunto.
- `study_events`: eventos de comentario, teoria e ciclo da questao.
- `question_answer_audit`: auditoria de gabaritos por fonte.
- `question_skill_tags`: habilidade inicial por materia/assunto.
- `theory_links`: preparado para vinculos mais precisos com PDFs.
- `question_clusters`: familias de questoes exatas, semelhantes ou do mesmo assunto.
- `question_cluster_members`: membros e representante de cada familia.
- `cluster_mastery`: dominio agregado por familia.
- `study_strategy_profiles`: planos simples (`PRF Otimizado`, `Revisar erros`, `Revisar hoje`, `Ver todas`).
- `study_flow_state`: estado minimo do fluxo continuo, com ultima questao aberta e ultima respondida.
- `study_served_questions`: historico curto de questoes servidas para evitar repeticao imediata.
- `study_session_items`: itens opcionais de sessao adaptativa; o botao `Estudar agora` nao depende de micro-sessao.

## Perfis de prova e incidencia externa

Para usar pesos externos de edital/incidencia, rode a migracao de perfis. Ela tambem cria backup automatico:

```powershell
npm run migrate-exam-profiles
```

Depois semeie os perfis PRF e escolha o ativo:

```powershell
npm run seed-prf-exam-profiles -- --active prf_2021_qconcursos_disciplina
```

Perfis disponiveis:

- `prf_2021_edital_blocos`
- `prf_2021_qconcursos_disciplina`
- `prf_2021_estrategia_agregado`
- `prf_pre_edital_personalizado`

Mapeie as materias da base para o perfil desejado:

```powershell
npm run map-exam-subjects -- --profile prf_2021_qconcursos_disciplina
```

Para diagnosticar a cobertura da base em relacao ao perfil:

```powershell
npm run diagnose-exam-coverage -- --profile prf_2021_qconcursos_disciplina --md cobertura_prf.md --json cobertura_prf.json
```

O painel `Base x Prova PRF` no site mostra peso esperado, questoes esperadas, questoes da base, questoes validas, questoes com gabarito, dominio e revisoes vencidas. O status ajuda a identificar disciplinas `alta_prioridade`, `sub-representada`, `sem_gabarito_suficiente`, `super-representada` ou `ok`.

A fila inteligente usa a versao v2 quando acionada pelo site. Ela combina revisao vencida, ultimo erro, questao nunca resolvida, dominio baixo, peso externo da disciplina, lacuna de cobertura, comentario, gabarito, anulacao e desatualizacao.

## Analise normativa de questoes desatualizadas

Para importar uma analise externa das questoes marcadas como desatualizadas sem alterar gabarito oficial nem comentario do professor, rode:

```powershell
npm run migrate-normative-updates

npm run import-normative-updates

npm run diagnose-normative-updates
```

Os comandos completos equivalentes sao:

```powershell
node scripts/migrate-normative-updates.mjs --db questoes-prf.sqlite

node scripts/import-normative-updates.mjs `
  --db questoes-prf.sqlite `
  --json data/analise_atualizacao_questoes_transito.json `
  --source-version transito-2026-05-31 `
  --report data/import-normative-updates-report.json

node scripts/diagnose-normative-updates.mjs `
  --db questoes-prf.sqlite `
  --md data/diagnostico_normativo.md `
  --json data/diagnostico_normativo.json
```

A tabela `question_normative_updates` guarda a analise auxiliar em separado. Ela nao sobrescreve `questions.official_answer`, nao altera `comments.extracted_answer` e nao remove `desatualizada = 1`.

No site, questoes com analise importada exibem alerta e uma aba `Atualizacao` no painel lateral. O menu `Relatorios` tambem passa a ter o painel `Revisao normativa`, com filtros por recomendacao, seguranca, mudanca de gabarito e status de revisao.

APIs uteis:

```text
GET  /api/normative-updates
GET  /api/normative-updates/stats
POST /api/questions/:id/normative-review
```

O gabarito atualizado provavel e exibido como analise auxiliar. Por padrao, o sistema continua calculando acerto pelo gabarito historico do banco.

APIs uteis:

```text
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

A pontuacao do simulado segue o modelo Cebraspe: `+1` para acerto, `-1` para erro e `0` para branco. Os cortes usados sao Bloco I >= 15, Bloco II >= 10, Bloco III >= 10 e total >= 50.

Se quiser salvar todos os cadernos disponiveis do guia PRF antes de coletar, rode com `--save-missing`. Isso altera sua conta no Tec, criando os cadernos do guia.

```powershell
npm run collect-prf -- --config config.local.json --save-missing
```

## Ajustes comuns

- `selectors.ready`: seletor que indica que a aula carregou.
- `selectors.title`: seletor usado para nomear o PDF.
- `selectors.content`: se preenchido, remove elementos fora desse conteudo antes de imprimir.
- `selectors.printButton`: se a pagina tiver um botao "imprimir" que abre uma versao limpa, coloque o seletor CSS dele aqui.
- `settleMs`: espera extra apos carregar/clicar, util para paginas que renderizam devagar.

Para descobrir seletores, clique com o botao direito no elemento no navegador, use "Inspecionar" e copie um seletor simples e estavel.
