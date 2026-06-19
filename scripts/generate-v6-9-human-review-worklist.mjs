#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const SOURCES = {
  genericComments: path.join(packageRoot, 'comentarios_genericos_remanescentes_pos_v6_8.csv'),
  genericFoundations: path.join(packageRoot, 'fundamentos_genericos_pos_v6_8.csv'),
  exportJsonl: path.join(packageRoot, 'export_pos_v6_8_questoes_contran_prf.jsonl'),
  exportCsv: path.join(packageRoot, 'export_pos_v6_8_questoes_contran_prf.csv'),
  finalReport: path.join(packageRoot, 'RELATORIO_FINAL_POS_V6_8_QUESTOES_CONTRAN_PRF.md'),
  criticalReport: path.join(packageRoot, 'relatorio_validacao_15_criticas_pos_v6_8.md'),
  accordionReport: path.join(packageRoot, 'relatorio_accordion_artigos_pos_v6_8.md')
};

const OUTPUTS = {
  foundationsJsonl: path.join(packageRoot, 'v6_9_worklist_fundamentos_alta.jsonl'),
  foundationsCsv: path.join(packageRoot, 'v6_9_worklist_fundamentos_alta.csv'),
  commentsJsonl: path.join(packageRoot, 'v6_9_worklist_comentarios_genericos_unicos.jsonl'),
  commentsCsv: path.join(packageRoot, 'v6_9_worklist_comentarios_genericos_unicos.csv'),
  accordionJson: path.join(packageRoot, 'v6_9_worklist_accordion_pendentes.json'),
  accordionCsv: path.join(packageRoot, 'v6_9_worklist_accordion_pendentes.csv'),
  report: path.join(packageRoot, 'RELATORIO_WORKLIST_V6_9_REVISAO_HUMANA.md')
};

const INCIDENT_RESOLUTION_ORDER = [
  '882/2021',
  '945/2022',
  '798/2020',
  '918/2022',
  '938/2022',
  '525/2015',
  '432/2013',
  '723/2018'
];

const ESSENTIAL_TOPICS = [
  'Pesos e dimensoes',
  'Amarracao de cargas',
  'Fiscalizacao de velocidade',
  'Autuacao e multas',
  'Cronotacografo',
  'Tempo de direcao',
  'Alcool e substancia psicoativa',
  'Suspensao e cassacao'
];

const BASE_FIELDS = [
  'id',
  'external_id',
  'statement',
  'enunciado',
  'question_type',
  'tipo',
  'alternatives',
  'alternativas',
  'correct_answer',
  'gabarito',
  'current_resolution',
  'resolucao_atual',
  'topic',
  'tema',
  'subtopic',
  'subtema',
  'axis',
  'eixo',
  'difficulty',
  'teacher_comment',
  'explicacao_historica',
  'explicacao_para_iniciante',
  'beginner_explanation',
  'pegadinha',
  'trap_explanation',
  'fundamento_normativo',
  'normative_reference',
  'article_reference',
  'tags',
  'source',
  'origin'
];

const FOUNDATION_FIELDS = [
  'priority_order',
  ...BASE_FIELDS,
  'problema',
  'prioridade'
];

const COMMENT_FIELDS = [
  'priority_order',
  ...BASE_FIELDS,
  'comentario_atual_completo',
  'trechos_genericos_encontrados',
  'severidade',
  'sugestao_de_revisao'
];

const ACCORDION_FIELDS = [
  'priority_order',
  'resolution',
  'article',
  'paragraph',
  'item',
  'annex',
  'raw_reference',
  'normalized_reference',
  'affected_question_ids',
  'affected_external_ids',
  'affected_questions_count',
  'sample_statement',
  'current_resolution',
  'topic',
  'subtopic',
  'reason',
  'status'
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  await ensureSources();

  const exportedQuestions = await readJsonl(SOURCES.exportJsonl);
  const questionByExternalId = new Map(exportedQuestions.map((item) => [String(item.external_id), item]));
  const questionById = new Map(exportedQuestions.map((item) => [String(item.id), item]));
  const genericFoundationRows = parseCsv(await fs.readFile(SOURCES.genericFoundations, 'utf8'));
  const genericCommentRows = parseCsv(await fs.readFile(SOURCES.genericComments, 'utf8'));
  const accordionRows = await fetchAccordionPending();

  const foundationWorklist = buildFoundationWorklist(genericFoundationRows, questionByExternalId);
  const commentWorklist = buildCommentWorklist(genericCommentRows, questionByExternalId);
  const accordionWorklist = buildAccordionWorklist(accordionRows, questionById);

  validateWorklists(foundationWorklist, commentWorklist, accordionWorklist);

  await fs.writeFile(OUTPUTS.foundationsJsonl, toJsonl(foundationWorklist), 'utf8');
  await fs.writeFile(OUTPUTS.foundationsCsv, buildCsv(foundationWorklist, FOUNDATION_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.commentsJsonl, toJsonl(commentWorklist), 'utf8');
  await fs.writeFile(OUTPUTS.commentsCsv, buildCsv(commentWorklist, COMMENT_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.accordionJson, JSON.stringify(accordionWorklist, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.accordionCsv, buildCsv(accordionWorklist, ACCORDION_FIELDS), 'utf8');

  const report = buildReport({
    exportedQuestions,
    genericFoundationRows,
    genericCommentRows,
    foundationWorklist,
    commentWorklist,
    accordionWorklist
  });
  await fs.writeFile(OUTPUTS.report, report, 'utf8');

  const fileValidation = await validateOutputFiles();
  console.log(JSON.stringify({
    ok: true,
    modo: 'exportacao e organizacao; banco consultado em READ ONLY apenas para accordion pendente',
    totais: {
      questoes_no_banco_exportadas: exportedQuestions.length,
      fundamentos_genericos: genericFoundationRows.length,
      fundamentos_alta: foundationWorklist.length,
      comentarios_genericos_ocorrencias: genericCommentRows.length,
      comentarios_genericos_questoes_unicas: commentWorklist.length,
      accordion_pendencias: accordionWorklist.length
    },
    arquivos: OUTPUTS,
    validacao_arquivos: fileValidation,
    aviso: 'Nenhuma correcao automatica foi feita. Nenhum update, insert ou delete foi executado no banco.'
  }, null, 2));
}

async function ensureSources() {
  const missing = [];
  for (const [key, file] of Object.entries(SOURCES)) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size === 0) missing.push(`${key}: ${file}`);
    } catch {
      missing.push(`${key}: ${file}`);
    }
  }
  if (!missing.length) return;
  throw new Error(`Fontes pos-V6.8 ausentes ou vazias. Reexecute scripts/audit-contran-prf-pos-v6-8.mjs antes da V6.9: ${missing.join('; ')}`);
}

function buildFoundationWorklist(rows, questionByExternalId) {
  const high = rows.filter((row) => clean(row.prioridade).toUpperCase() === 'ALTA');
  return high
    .map((row) => {
      const question = questionByExternalId.get(clean(row.external_id));
      if (!question) return null;
      return {
        priority_order: priorityOrder(question, { foundationPriority: 'ALTA' }),
        ...pickBase(question),
        problema: clean(row.problema),
        prioridade: clean(row.prioridade)
      };
    })
    .filter(Boolean)
    .sort(sortByPriority);
}

function buildCommentWorklist(rows, questionByExternalId) {
  const grouped = new Map();
  for (const row of rows) {
    const externalId = clean(row.external_id);
    if (!externalId) continue;
    if (!grouped.has(externalId)) grouped.set(externalId, []);
    grouped.get(externalId).push(row);
  }
  const result = [];
  for (const [externalId, group] of grouped.entries()) {
    const question = questionByExternalId.get(externalId);
    if (!question) continue;
    const genericSnippets = [...new Set(group.map((row) => clean(row.trecho_generico_encontrado)).filter(Boolean))];
    const severity = highestSeverity(group.map((row) => clean(row.severidade)));
    const suggestions = [...new Set(group.map((row) => clean(row.sugestao_de_revisao)).filter(Boolean))];
    result.push({
      priority_order: priorityOrder(question, { severity }),
      ...pickBase(question),
      comentario_atual_completo: clean(question.teacher_comment || question.comment || question.explanation || group[0]?.comentario_completo),
      trechos_genericos_encontrados: genericSnippets,
      severidade: severity,
      sugestao_de_revisao: suggestions.join(' | ')
    });
  }
  return result.sort(sortByPriority);
}

function buildAccordionWorklist(rows, questionById) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeAccordionKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const result = [];
  for (const [key, group] of grouped.entries()) {
    const first = group[0];
    const affectedIds = [...new Set(group.map((row) => Number(row.question_id)).filter(Boolean))].sort((a, b) => a - b);
    const affectedExternalIds = [...new Set(group.map((row) => clean(row.external_id)).filter(Boolean))].sort();
    const sample = questionById.get(String(affectedIds[0])) || {};
    result.push({
      priority_order: 4_000 + resolutionRank(sample.resolucao_atual || sample.current_resolution) * 100 + Math.min(affectedIds[0] || 99, 99),
      resolution: clean(first.resolution || formatResolution(first)),
      article: clean(first.article),
      paragraph: clean(first.paragraph),
      item: clean(first.item),
      annex: clean(first.annex),
      raw_reference: clean(first.raw_reference),
      normalized_reference: key,
      affected_question_ids: affectedIds,
      affected_external_ids: affectedExternalIds,
      affected_questions_count: affectedIds.length,
      sample_statement: clean(sample.statement || sample.enunciado),
      current_resolution: clean(sample.current_resolution || sample.resolucao_atual),
      topic: clean(sample.topic || sample.tema),
      subtopic: clean(sample.subtopic || sample.subtema),
      reason: 'Texto integral nao encontrado em contran_normative_articles com a chave normativa estruturada.',
      status: 'pendente'
    });
  }
  return result.sort(sortByPriority);
}

async function fetchAccordionPending() {
  const { client } = createClient({
    preferDirect: true,
    applicationName: 'generate-v6-9-human-review-worklist'
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT
        cqr.question_id,
        cqr.external_id,
        cqr.resolution,
        cqr.resolution_number,
        cqr.resolution_year,
        cqr.article,
        cqr.paragraph,
        cqr.item,
        cqr.subitem,
        cqr.annex,
        cqr.raw_reference
      FROM contran_question_normative_references cqr
      JOIN contran_prf_unpublished_questions cq ON cq.question_id = cqr.question_id
      LEFT JOIN contran_normative_articles cna
        ON cna.id = cqr.normative_article_id
      LEFT JOIN contran_normative_articles cna_fallback
        ON cqr.normative_article_id IS NULL
        AND cna_fallback.resolution_number = cqr.resolution_number
        AND cna_fallback.resolution_year = cqr.resolution_year
        AND COALESCE(cna_fallback.article, '') = COALESCE(cqr.article, '')
        AND COALESCE(cna_fallback.paragraph, '') = COALESCE(cqr.paragraph, '')
        AND COALESCE(cna_fallback.item, '') = COALESCE(cqr.item, '')
        AND COALESCE(cna_fallback.subitem, '') = COALESCE(cqr.subitem, '')
        AND COALESCE(cna_fallback.annex, '') = COALESCE(cqr.annex, '')
      WHERE COALESCE(cq.is_unpublished, 0) = 1
        AND COALESCE(cq.is_official, 0) = 0
        AND COALESCE(cq.official_exam, 0) = 0
        AND COALESCE(cq.active, 1) = 1
        AND COALESCE(cq.visible, 1) = 1
        AND COALESCE(cq.deprecated, 0) = 0
        AND COALESCE(cna.plain_text, cna.full_text, cna_fallback.plain_text, cna_fallback.full_text, '') = ''
      ORDER BY cqr.resolution_number, cqr.resolution_year, cqr.article, cqr.paragraph, cqr.item, cqr.annex, cqr.question_id
    `);
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

function pickBase(question) {
  return Object.fromEntries(BASE_FIELDS.map((field) => [field, question[field] ?? '']));
}

function priorityOrder(question, context = {}) {
  if (context.foundationPriority === 'ALTA') {
    return 1_000 + resolutionRank(question.resolucao_atual || question.current_resolution) * 100 + topicRank(question.tema || question.topic);
  }
  if (INCIDENT_RESOLUTION_ORDER.some((resolution) => clean(question.resolucao_atual || question.current_resolution).includes(resolution))) {
    return 2_000 + resolutionRank(question.resolucao_atual || question.current_resolution) * 100 + severityRank(context.severity) * 10;
  }
  if (ESSENTIAL_TOPICS.includes(clean(question.tema || question.topic))) {
    return 3_000 + topicRank(question.tema || question.topic) * 100 + severityRank(context.severity) * 10;
  }
  if (context.severity === 'BAIXA') return 5_000 + resolutionRank(question.resolucao_atual || question.current_resolution) * 100;
  return 3_500 + resolutionRank(question.resolucao_atual || question.current_resolution) * 100 + severityRank(context.severity) * 10;
}

function resolutionRank(value) {
  const text = clean(value);
  const index = INCIDENT_RESOLUTION_ORDER.findIndex((resolution) => text.includes(resolution));
  return index >= 0 ? index : 99;
}

function topicRank(value) {
  const index = ESSENTIAL_TOPICS.indexOf(clean(value));
  return index >= 0 ? index : 99;
}

function severityRank(value) {
  return { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }[clean(value).toUpperCase()] ?? 9;
}

function highestSeverity(values) {
  return [...values].filter(Boolean).sort((a, b) => severityRank(a) - severityRank(b))[0] || '';
}

function sortByPriority(a, b) {
  return Number(a.priority_order || 0) - Number(b.priority_order || 0)
    || Number(a.id || a.affected_question_ids?.[0] || 0) - Number(b.id || b.affected_question_ids?.[0] || 0)
    || clean(a.external_id || a.normalized_reference).localeCompare(clean(b.external_id || b.normalized_reference));
}

function normalizeAccordionKey(row) {
  return [
    clean(row.resolution_number),
    clean(row.resolution_year),
    clean(row.article),
    clean(row.paragraph),
    clean(row.item),
    clean(row.annex),
    clean(row.raw_reference)
  ].join('|');
}

function formatResolution(row) {
  const number = clean(row.resolution_number);
  const year = clean(row.resolution_year);
  return number && year ? `Res. CONTRAN ${number}/${year}` : '';
}

function buildReport(data) {
  const topAffectedResolutions = topCounts([
    ...data.foundationWorklist.map((row) => row.resolucao_atual || row.current_resolution),
    ...data.commentWorklist.map((row) => row.resolucao_atual || row.current_resolution)
  ], 12);
  const topAffectedTopics = topCounts([
    ...data.foundationWorklist.map((row) => row.tema || row.topic),
    ...data.commentWorklist.map((row) => row.tema || row.topic)
  ], 12);

  return `# RELATORIO WORKLIST V6.9 - REVISAO HUMANA

- Status: pacote V6.9 gerado para revisao humana, sem correcao automatica.
- Total de questoes no banco/export pos-V6.8: ${data.exportedQuestions.length}
- Total de fundamentos genericos: ${data.genericFoundationRows.length}
- Total de fundamentos prioridade ALTA: ${data.foundationWorklist.length}
- Total de comentarios genericos por ocorrencia: ${data.genericCommentRows.length}
- Total de comentarios genericos por questao unica: ${data.commentWorklist.length}
- Total de pendencias de accordion: ${data.accordionWorklist.length}

## Top resolucoes mais afetadas

${topAffectedResolutions.map(([key, total]) => `- ${key}: ${total}`).join('\n') || '- Nenhuma'}

## Top temas mais afetados

${topAffectedTopics.map(([key, total]) => `- ${key}: ${total}`).join('\n') || '- Nenhum'}

## Recomendacao de ordem de revisao

1. Revisar primeiro \`v6_9_worklist_fundamentos_alta.*\`, ordenado por \`priority_order\`.
2. Em seguida, revisar resolucoes mais incidentes dentro de \`v6_9_worklist_comentarios_genericos_unicos.*\`: Res. 882/2021, 945/2022, 798/2020, 918/2022, 938/2022, 525/2015, 432/2013 e 723/2018.
3. Priorizar temas essenciais antes de ajustes apenas estilisticos.
4. Tratar \`v6_9_worklist_accordion_pendentes.*\` como fila normativa separada para cadastro de textos integrais.
5. Nao aplicar patch em banco sem revisao humana dos arquivos gerados.

## Validacao

- Nenhum update foi executado.
- Nenhum insert foi executado.
- Nenhum delete foi executado.
- Enunciados, alternativas e gabaritos foram apenas copiados do export pos-V6.8.
- Historico de usuarios e estatisticas nao foram consultados para escrita nem alterados.
- Todas as linhas deduplicadas possuem \`external_id\`.
- Nao ha duplicidade indevida no arquivo de comentarios genericos unicos.

## Arquivos gerados

${Object.values(OUTPUTS).map((file) => `- ${path.basename(file)}`).join('\n')}
`;
}

function validateWorklists(foundationWorklist, commentWorklist, accordionWorklist) {
  const errors = [];
  for (const [name, rows] of [
    ['fundamentos_alta', foundationWorklist],
    ['comentarios_genericos_unicos', commentWorklist]
  ]) {
    const missingExternal = rows.filter((row) => !clean(row.external_id));
    if (missingExternal.length) errors.push(`${name}: ${missingExternal.length} linhas sem external_id`);
  }
  const duplicatedComments = duplicates(commentWorklist.map((row) => clean(row.external_id)));
  if (duplicatedComments.length) {
    errors.push(`comentarios_genericos_unicos com external_id duplicado: ${duplicatedComments.slice(0, 10).join(', ')}`);
  }
  const missingAccordionIds = accordionWorklist.filter((row) => !row.affected_external_ids?.length);
  if (missingAccordionIds.length) errors.push(`accordion_pendentes: ${missingAccordionIds.length} grupos sem external_id afetado`);
  if (errors.length) throw new Error(`Validacao V6.9 falhou: ${errors.join('; ')}`);
}

async function validateOutputFiles() {
  const out = [];
  for (const file of Object.values(OUTPUTS)) {
    const stat = await fs.stat(file);
    out.push({ file, bytes: stat.size, ok: stat.isFile() && stat.size > 0 });
  }
  return out;
}

function topCounts(values, limit) {
  const counts = new Map();
  for (const value of values.map(clean).filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

async function readJsonl(file) {
  const content = await fs.readFile(file, 'utf8');
  return content.trimEnd().split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`JSONL invalido em ${file}:${index + 1}: ${error.message}`);
    }
  });
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map(clean);
  return rows.slice(1).filter((items) => items.some((item) => clean(item))).map((items) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = items[index] ?? '';
    });
    return obj;
  });
}

function buildCsv(rows, fields) {
  const lines = [fields.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(fields.map((field) => csvCell(row[field])).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}
