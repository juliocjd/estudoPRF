#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_PATH = path.join(ROOT_DIR, 'data', 'plano_estudos_prf', 'dados_analise_prf_pesos_estudo.json');
const EXAM_KEYS = ['prf_2021_objetiva', 'prf_2019_objetiva', 'prf_2013_objetiva'];

const GROUPS = [
  {
    id: 'legislacao_transito',
    label: 'Legislacao de Transito',
    basePercent: 27,
    range: [25, 32],
    subjects: ['Legislacao de Transito', 'Legislacao de Transito e Transportes', 'CTB', 'CONTRAN', 'SENATRAN']
  },
  {
    id: 'portugues_redacao',
    label: 'Portugues + Redacao Oficial',
    basePercent: 14,
    range: [12, 16],
    subjects: ['Portugues', 'Redacao Oficial']
  },
  {
    id: 'constitucional_administrativo',
    label: 'Constitucional + Administrativo',
    basePercent: 13,
    range: [12, 15],
    subjects: ['Direito Constitucional', 'Direito Administrativo']
  },
  {
    id: 'penal_processual_legislacao_especial',
    label: 'Penal + Processo Penal + Legislacao Especial',
    basePercent: 17,
    range: [16, 20],
    subjects: ['Direito Penal', 'Processo Penal', 'Legislacao Especial']
  },
  {
    id: 'matematica_fisica',
    label: 'Matematica/RLM + Fisica',
    basePercent: 13,
    range: [12, 16],
    subjects: ['Matematica/RLM', 'Matematica', 'RLM', 'Fisica']
  },
  {
    id: 'informatica_etica_dh',
    label: 'Informatica + Etica + Direitos Humanos',
    basePercent: 10,
    range: [10, 14],
    subjects: ['Informatica/TI', 'Informatica', 'Etica', 'Administracao Publica', 'Direitos Humanos']
  },
  {
    id: 'geopolitica_leg_prf_ingles',
    label: 'Geopolitica + Legislacao PRF + Ingles',
    basePercent: 6,
    range: [6, 10],
    subjects: ['Geopolitica/Atualidades', 'Atualidades', 'Legislacao/atribuicoes da PRF', 'Ingles']
  }
];

export function loadPlanoPrfAnalysisData(filePath = DEFAULT_DATA_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function gerar_plano_prf(config = {}, analysisData = loadPlanoPrfAnalysisData()) {
  validateAnalysisData(analysisData);
  const normalizedConfig = normalizeConfig(config);
  const activeGroups = filterGroupsByEdital(normalizedConfig);
  const distribution = buildHourDistribution(activeGroups, normalizedConfig);
  const topicCatalog = buildTopicCatalog(analysisData);
  const sessions = buildWeeklySessions(distribution, topicCatalog, normalizedConfig);
  const weeks = buildWeekPlan(sessions, normalizedConfig);
  const simulations = buildSimulations(normalizedConfig);
  const questionGoals = buildQuestionGoals(sessions);
  const legislationChecklist = buildLegislationChecklist(topicCatalog.traffic);

  const plan = {
    metadata: {
      generated_at: new Date().toISOString(),
      source_title: analysisData.metadata?.title || '',
      source_generated_at: analysisData.metadata?.generated_at || '',
      methodology: analysisData.metadata?.methodology || '',
      warning: analysisData.metadata?.important_warning || 'Conferir edital, retificacoes, normas vigentes e jurisprudencia atual antes do plano definitivo.'
    },
    config: normalizedConfig,
    alertas: [
      'Antes do cronograma final, conferir edital vigente e retificacoes.',
      'Conferir resolucoes CONTRAN/SENATRAN vigentes e se o edital exige norma historica ou norma atual.',
      'Conferir jurisprudencia atual em temas de CTB, processo penal, abordagem, alcool e direitos fundamentais.'
    ],
    exams_used: EXAM_KEYS.map((examKey) => ({
      exam_key: examKey,
      items: analysisData.exams?.[examKey] || {}
    })),
    visao_geral: {
      semanas: normalizedConfig.semanas_disponiveis,
      horas_por_semana: normalizedConfig.horas_por_semana,
      dias_de_estudo_por_semana: normalizedConfig.dias_de_estudo_por_semana,
      sessoes_por_semana: sessions.length,
      horas_por_sessao: round2(normalizedConfig.horas_por_semana / sessions.length),
      revisao_espacada: ['24h', '7 dias', '30 dias'],
      estilo_questoes: 'Cebraspe/CESPE - Certo/Errado'
    },
    distribuicao_percentual_horas: distribution,
    quadro_semanal_modelo: sessions,
    cronograma: weeks,
    revisoes_programadas: buildReviewRules(),
    simulados: simulations,
    metas_questoes_por_materia: questionGoals,
    classificacao_erros: [
      'erro de conteudo',
      'erro de leitura',
      'erro de memorizacao literal',
      'erro por norma desatualizada',
      'chute'
    ],
    legislacao_transito_priorizada: topicCatalog.traffic,
    materias_nao_transito_priorizadas: topicCatalog.nonTraffic,
    checklist_legislacao_atualizada: legislationChecklist
  };

  validatePlanoPrf(plan);
  return {
    json: plan,
    markdown: renderPlanoPrfMarkdown(plan)
  };
}

export function renderPlanoPrfMarkdown(plan) {
  const lines = [];
  lines.push('# Plano de estudos PRF');
  lines.push('');
  lines.push(`> ALERTA: ${plan.metadata.warning}`);
  for (const alert of plan.alertas) lines.push(`> - ${alert}`);
  lines.push('');
  lines.push('## Visao geral');
  lines.push(`- Semanas: ${plan.visao_geral.semanas}`);
  lines.push(`- Horas por semana: ${plan.visao_geral.horas_por_semana}`);
  lines.push(`- Dias por semana: ${plan.visao_geral.dias_de_estudo_por_semana}`);
  lines.push(`- Sessoes por semana: ${plan.visao_geral.sessoes_por_semana}`);
  lines.push(`- Revisao espacada: ${plan.visao_geral.revisao_espacada.join(', ')}`);
  lines.push(`- Questoes: ${plan.visao_geral.estilo_questoes}`);
  lines.push('');
  lines.push('## Distribuicao percentual de horas');
  lines.push('| Bloco | % | Horas/semana | Ajuste |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const item of plan.distribuicao_percentual_horas) {
    lines.push(`| ${item.label} | ${item.percentual}% | ${item.horas_semana} | ${item.ajuste_nivel} |`);
  }
  lines.push('');
  lines.push('## Quadro semanal modelo');
  lines.push('| Dia | Sessao | Bloco | Duracao | Tarefas |');
  lines.push('| --- | ---: | --- | ---: | --- |');
  for (const session of plan.quadro_semanal_modelo) {
    lines.push(`| ${session.dia} | ${session.sessao_no_dia} | ${session.bloco} | ${session.duracao_horas}h | ${session.tarefas.join('; ')} |`);
  }
  lines.push('');
  lines.push('## Tarefas por sessao');
  lines.push('- Leitura ou revisao teorica objetiva.');
  lines.push('- Mapa mental/checklist do tema.');
  lines.push('- 10 a 30 itens C/E, conforme duracao.');
  lines.push('- Correcao ativa com classificacao do erro.');
  lines.push('- Flashcards ou resumo de um paragrafo.');
  lines.push('- Agendamento de revisao em 24h, 7 dias e 30 dias.');
  lines.push('');
  lines.push('## Revisoes programadas');
  for (const item of plan.revisoes_programadas) lines.push(`- ${item.quando}: ${item.acao}`);
  lines.push('');
  lines.push('## Simulados');
  for (const simulado of plan.simulados) {
    lines.push(`- Semana ${simulado.semana}: ${simulado.tipo}, ${simulado.itens} itens C/E, com relatorio por assunto.`);
  }
  lines.push('');
  lines.push('## Metas de questoes por materia');
  lines.push('| Bloco | Itens C/E por semana | Correcao esperada |');
  lines.push('| --- | ---: | --- |');
  for (const goal of plan.metas_questoes_por_materia) {
    lines.push(`| ${goal.bloco} | ${goal.itens_ce_por_semana} | ${goal.correcao_ativa} |`);
  }
  lines.push('');
  lines.push('## Legislacao de Transito - normas de prova x estudo atual');
  lines.push('| Tema | Norma cobrada na prova | Norma atual de estudo | Prioridade | Foco |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const topic of plan.legislacao_transito_priorizada.slice(0, 12)) {
    lines.push(`| ${topic.tema} | ${topic.norma_cobrada_na_prova} | ${topic.norma_atual_de_estudo} | ${topic.prioridade} | ${topic.foco} |`);
  }
  lines.push('');
  lines.push('## Checklist de legislacao atualizada');
  for (const item of plan.checklist_legislacao_atualizada) {
    lines.push(`- [ ] ${item}`);
  }
  return `${lines.join('\n')}\n`;
}

export function validatePlanoPrf(plan) {
  const errors = [];
  const examKeys = new Set((plan.exams_used || []).map((item) => item.exam_key));
  for (const key of examKeys) {
    if (!EXAM_KEYS.includes(key)) errors.push(`exam_key invalido: ${key}`);
  }
  if (examKeys.size !== EXAM_KEYS.length) errors.push('provas objetivas PRF 2021/2019/2013 devem permanecer separadas');
  const totalPercent = sum(plan.distribuicao_percentual_horas.map((item) => item.percentual));
  if (Math.abs(totalPercent - 100) > 0.1) errors.push(`distribuicao de horas soma ${totalPercent}, esperado 100`);
  if (!plan.revisoes_programadas?.some((item) => item.quando === '24h')
    || !plan.revisoes_programadas?.some((item) => item.quando === '7 dias')
    || !plan.revisoes_programadas?.some((item) => item.quando === '30 dias')) {
    errors.push('plano sem revisao espacada 24h/7d/30d');
  }
  if (!plan.quadro_semanal_modelo?.every((session) => session.itens_ce >= 10)) {
    errors.push('toda sessao deve conter pelo menos 10 itens C/E');
  }
  for (const topic of plan.legislacao_transito_priorizada || []) {
    if (!topic.norma_cobrada_na_prova || !topic.norma_atual_de_estudo) {
      errors.push(`tema de transito sem normas separadas: ${topic.topic_id}`);
    }
  }
  if (errors.length) {
    const error = new Error(`Plano PRF invalido: ${errors.join('; ')}`);
    error.validationErrors = errors;
    throw error;
  }
  return true;
}

function normalizeConfig(config = {}) {
  const semanasByDate = config.data_prova ? weeksUntil(config.data_prova) : 0;
  return {
    semanas_disponiveis: clampInt(config.semanas_disponiveis || semanasByDate || 12, 4, 80),
    horas_por_semana: clampNumber(config.horas_por_semana || 20, 4, 80),
    dias_de_estudo_por_semana: clampInt(config.dias_de_estudo_por_semana || 5, 3, 7),
    nivel_por_materia: config.nivel_por_materia || {},
    edital_publicado: Boolean(config.edital_publicado),
    materias_do_edital: Array.isArray(config.materias_do_edital) ? config.materias_do_edital : [],
    data_prova: config.data_prova || '',
    preferencias: config.preferencias || {}
  };
}

function buildHourDistribution(groups, config) {
  const weighted = groups.map((group) => {
    const level = averageLevel(group.subjects, config.nivel_por_materia);
    const factor = level < 3
      ? 1 + ((3 - level) * 0.12)
      : level >= 4
        ? 1 - ((level - 3) * 0.07)
        : 1;
    return {
      ...group,
      level,
      adjusted: group.basePercent * factor
    };
  });
  const total = sum(weighted.map((item) => item.adjusted));
  let distribution = weighted.map((item) => ({
    id: item.id,
    label: item.label,
    percentual: round2((item.adjusted / total) * 100),
    horas_semana: 0,
    ajuste_nivel: item.level === null ? 'sem nivel informado' : `nivel medio ${round2(item.level)}`,
    subjects: item.subjects
  }));
  const diff = round2(100 - sum(distribution.map((item) => item.percentual)));
  if (distribution.length && diff) distribution[0].percentual = round2(distribution[0].percentual + diff);
  distribution = distribution.map((item) => ({
    ...item,
    horas_semana: round2((item.percentual / 100) * config.horas_por_semana)
  }));
  return distribution.sort((a, b) => b.percentual - a.percentual);
}

function buildTopicCatalog(data) {
  return {
    traffic: (data.traffic?.themes || [])
      .map((theme) => ({
        topic_id: theme.topic_id || slug(theme.tema),
        tema: theme.tema || '',
        norma_cobrada_na_prova: theme.norma_epoca || '',
        norma_atual_de_estudo: theme.norma_atual || '',
        exam_counts: {
          prf_2021_objetiva: theme.prf2021 || '0',
          prf_2019_objetiva: theme.prf2019 || '0',
          prf_2013_objetiva: theme.prf2013 || '0'
        },
        prioridade: Number(theme.prioridade || 0),
        foco: theme.foco || ''
      }))
      .sort((a, b) => b.prioridade - a.prioridade),
    nonTraffic: (data.non_traffic?.subjects || [])
      .map((subject) => ({
        subject: subject.subject || '',
        counts_by_exam: {
          prf_2021_objetiva: Number(subject['2021'] || 0),
          prf_2019_objetiva: Number(subject['2019'] || 0),
          prf_2013_objetiva: Number(subject['2013'] || 0)
        },
        total: Number(subject.total || 0),
        priority: Number(subject.priority || 0),
        topics: subject.topics || []
      }))
      .sort((a, b) => b.priority - a.priority)
  };
}

function buildWeeklySessions(distribution, catalog, config) {
  const sessionsPerDay = (config.horas_por_semana / config.dias_de_estudo_por_semana) >= 3 ? 2 : 1;
  const totalSessions = config.dias_de_estudo_por_semana * sessionsPerDay;
  const duration = round2(config.horas_por_semana / totalSessions);
  const weightedQueue = expandWeightedQueue(distribution, totalSessions);
  return weightedQueue.map((group, index) => {
    const topic = pickTopicForGroup(group.id, catalog, index);
    const itens = duration >= 2.5 ? 30 : duration >= 1.5 ? 20 : 10;
    return {
      dia: Math.floor(index / sessionsPerDay) + 1,
      sessao_no_dia: (index % sessionsPerDay) + 1,
      bloco_id: group.id,
      bloco: group.label,
      duracao_horas: duration,
      foco: topic?.tema || topic?.subject || group.label,
      topic_id: topic?.topic_id || '',
      norma_cobrada_na_prova: topic?.norma_cobrada_na_prova || '',
      norma_atual_de_estudo: topic?.norma_atual_de_estudo || '',
      itens_ce: itens,
      tarefas: [
        'teoria objetiva',
        'mapa mental/checklist',
        `${itens} itens C/E`,
        'correcao ativa',
        'registro de erro',
        'flashcards/resumo',
        'agendar 24h/7d/30d'
      ]
    };
  });
}

function buildWeekPlan(sessions, config) {
  return Array.from({ length: config.semanas_disponiveis }, (_, weekIndex) => {
    const semana = weekIndex + 1;
    return {
      semana,
      fase: semana <= Math.ceil(config.semanas_disponiveis / 2) ? 'base e consolidacao' : 'reta final e simulados',
      sessoes: sessions.map((session, index) => ({
        ...session,
        foco: rotateFocus(session, semana, index)
      })),
      revisoes: ['revisar sessoes de 24h', 'revisar sessoes de 7 dias', semana > 4 ? 'revisar sessoes de 30 dias' : 'iniciar banco de revisoes de 30 dias']
    };
  });
}

function buildReviewRules() {
  return [
    { quando: '24h', acao: 'refazer erros e revisar checklist da sessao anterior' },
    { quando: '7 dias', acao: '10 a 20 itens C/E do mesmo tema e revisao dos flashcards' },
    { quando: '30 dias', acao: 'mini-simulado por assunto e correcao ativa dos erros recorrentes' }
  ];
}

function buildSimulations(config) {
  const half = Math.ceil(config.semanas_disponiveis / 2);
  const simulations = [];
  for (let week = 2; week <= config.semanas_disponiveis; week += 1) {
    if ((week <= half && week % 2 === 0) || week > half) {
      simulations.push({
        semana: week,
        tipo: week <= half ? 'simulado quinzenal' : 'simulado semanal',
        itens: 120,
        estilo: 'Cebraspe/CESPE Certo/Errado',
        relatorio_por_assunto: true
      });
    }
  }
  return simulations;
}

function buildQuestionGoals(sessions) {
  const byGroup = new Map();
  for (const session of sessions) {
    const current = byGroup.get(session.bloco_id) || {
      bloco: session.bloco,
      itens_ce_por_semana: 0,
      correcao_ativa: 'classificar erro e registrar providencia'
    };
    current.itens_ce_por_semana += session.itens_ce;
    byGroup.set(session.bloco_id, current);
  }
  return [...byGroup.values()].sort((a, b) => b.itens_ce_por_semana - a.itens_ce_por_semana);
}

function buildLegislationChecklist(trafficTopics) {
  const norms = new Set();
  for (const topic of trafficTopics) {
    if (topic.norma_atual_de_estudo) norms.add(topic.norma_atual_de_estudo);
  }
  return [
    'Conferir edital e retificacoes antes de fechar o ciclo.',
    'Conferir CTB vigente e leis correlatas citadas no edital.',
    ...[...norms].slice(0, 18).map((norm) => `Conferir vigencia e alteracoes: ${norm}`),
    'Separar norma cobrada na prova anterior da norma atual de estudo.',
    'Registrar erro por norma desatualizada quando a questao historica nao puder ser aproveitada.'
  ];
}

function validateAnalysisData(data) {
  for (const key of EXAM_KEYS) {
    if (!data.exams?.[key]) throw new Error(`Dados sem exam_key obrigatorio: ${key}`);
  }
  if (!Array.isArray(data.traffic?.themes)) throw new Error('Dados sem traffic.themes');
  if (!Array.isArray(data.non_traffic?.subjects)) throw new Error('Dados sem non_traffic.subjects');
}

function filterGroupsByEdital(config) {
  if (!config.edital_publicado || !config.materias_do_edital.length) return GROUPS;
  const edital = config.materias_do_edital.map(normalizeText);
  const groups = GROUPS.filter((group) => group.subjects.some((subject) => edital.some((item) => item.includes(normalizeText(subject)) || normalizeText(subject).includes(item))));
  return groups.length ? groups : GROUPS;
}

function averageLevel(subjects, levels = {}) {
  const values = [];
  for (const [key, value] of Object.entries(levels)) {
    const normalizedKey = normalizeText(key);
    if (subjects.some((subject) => normalizedKey.includes(normalizeText(subject)) || normalizeText(subject).includes(normalizedKey))) {
      const number = Number(value);
      if (Number.isFinite(number)) values.push(clampNumber(number, 0, 5));
    }
  }
  if (!values.length) return null;
  return sum(values) / values.length;
}

function expandWeightedQueue(distribution, totalSessions) {
  const selected = [];
  const counters = new Map(distribution.map((item) => [item.id, 0]));
  for (let index = 0; index < totalSessions; index += 1) {
    const next = [...distribution].sort((a, b) => {
      const left = (counters.get(a.id) || 0) / a.percentual;
      const right = (counters.get(b.id) || 0) / b.percentual;
      return left - right;
    })[0];
    selected.push(next);
    counters.set(next.id, (counters.get(next.id) || 0) + 1);
  }
  return selected;
}

function pickTopicForGroup(groupId, catalog, index) {
  if (groupId === 'legislacao_transito') return catalog.traffic[index % catalog.traffic.length];
  const subjects = groupSubjects(groupId);
  const pool = catalog.nonTraffic.filter((item) => subjects.some((subject) => normalizeText(item.subject).includes(normalizeText(subject)) || normalizeText(subject).includes(normalizeText(item.subject))));
  return pool[index % Math.max(1, pool.length)] || catalog.nonTraffic[index % catalog.nonTraffic.length];
}

function rotateFocus(session, week, index) {
  if (session.bloco_id === 'legislacao_transito') return session.foco;
  return `${session.foco} - ciclo ${((week + index - 1) % 4) + 1}`;
}

function groupSubjects(groupId) {
  return GROUPS.find((group) => group.id === groupId)?.subjects || [];
}

function weeksUntil(dateText) {
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return 0;
  const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
  return days > 0 ? Math.ceil(days / 7) : 0;
}

function clampInt(value, min, max) {
  return Math.round(clampNumber(value, min, max));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const config = args.config ? JSON.parse(fs.readFileSync(path.resolve(args.config), 'utf8')) : {};
  const data = loadPlanoPrfAnalysisData(args.data ? path.resolve(args.data) : DEFAULT_DATA_PATH);
  const result = gerar_plano_prf(config, data);
  if (args['out-json']) {
    fs.mkdirSync(path.dirname(path.resolve(args['out-json'])), { recursive: true });
    fs.writeFileSync(path.resolve(args['out-json']), `${JSON.stringify(result.json, null, 2)}\n`, 'utf8');
  }
  if (args['out-md']) {
    fs.mkdirSync(path.dirname(path.resolve(args['out-md'])), { recursive: true });
    fs.writeFileSync(path.resolve(args['out-md']), result.markdown, 'utf8');
  }
  if (!args['out-json'] && !args['out-md']) {
    process.stdout.write(args.json ? `${JSON.stringify(result.json, null, 2)}\n` : result.markdown);
  }
}
