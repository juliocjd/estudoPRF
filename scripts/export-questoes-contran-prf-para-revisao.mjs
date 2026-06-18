#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const RESOLUTIONS = [
  '882/2021',
  '945/2022',
  '938/2022',
  '525/2015',
  '798/2020',
  '918/2022',
  '985/2022',
  '723/2018',
  '432/2013',
  '960/2022',
  '969/2022',
  '970/2022',
  '993/2023',
  '809/2020',
  '735/2018',
  '946/2022',
  '955/2022',
  '909/2022'
];

const OUTPUTS = {
  jsonl: path.join(packageRoot, 'export_questoes_contran_prf_para_revisao.jsonl'),
  csv: path.join(packageRoot, 'export_questoes_contran_prf_para_revisao.csv'),
  manifest: path.join(packageRoot, 'manifest_export_questoes_contran_prf.json')
};

const EXPORT_FIELDS = [
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
  'explanation',
  'comment',
  'teacher_comment',
  'explicacao_historica',
  'explicacao_para_iniciante',
  'beginner_explanation',
  'pegadinha',
  'trap_explanation',
  'fundamento_normativo',
  'normative_reference',
  'article_reference',
  'current_resolution',
  'resolucao_atual',
  'historical_resolution',
  'topic',
  'tema',
  'subtopic',
  'subtema',
  'axis',
  'eixo',
  'difficulty',
  'tags',
  'source',
  'origin',
  'is_unpublished',
  'questao_inedita',
  'is_official',
  'official_exam',
  'created_at',
  'updated_at',
  'batch_id',
  'banco_version',
  'audit_version',
  'status_auditoria',
  'validacao_normativa',
  'data_base_normativa',
  'active',
  'visible',
  'deprecated'
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'export-questoes-contran-prf-para-revisao'
  });

  await client.connect();
  let rows;
  try {
    await client.query('BEGIN READ ONLY');
    rows = await fetchRows(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const exportedAt = new Date().toISOString();
  const items = rows.map(mapRow);
  const validation = validateItems(items);
  if (!validation.ok) {
    throw new Error(`Validacao falhou antes da gravacao: ${validation.errors.join('; ')}`);
  }

  const manifest = buildManifest(items, exportedAt, selected);
  const jsonl = items.map((item) => JSON.stringify(item)).join('\n') + '\n';
  const csv = buildCsv(items);

  await fs.writeFile(OUTPUTS.jsonl, jsonl, 'utf8');
  await fs.writeFile(OUTPUTS.csv, csv, 'utf8');
  await fs.writeFile(OUTPUTS.manifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const fileValidation = await validateFiles(items, manifest);
  if (!fileValidation.ok) {
    throw new Error(`Arquivos gerados, mas a validacao final falhou: ${fileValidation.errors.join('; ')}`);
  }

  console.log(JSON.stringify({
    ok: true,
    modo: 'somente leitura',
    banco: {
      fonte: selected.sourceName,
      url: selected.redactedConnectionString
    },
    total_exportado: items.length,
    arquivos: OUTPUTS,
    exemplos: items.slice(0, 5).map((item) => ({
      id: item.id,
      external_id: item.external_id,
      tipo: item.tipo,
      resolucao_atual: item.resolucao_atual,
      tema: item.tema,
      gabarito: item.gabarito,
      enunciado: truncate(item.enunciado, 220)
    })),
    validacao: fileValidation,
    aviso: 'Nenhuma alteracao foi feita no banco: a consulta rodou em transacao READ ONLY e o script nao executa update, insert ou delete.'
  }, null, 2));
}

async function fetchRows(client) {
  const resolutionLikes = RESOLUTIONS.map((value) => `%${value}%`);
  const result = await client.query(`
    WITH selected_comments AS (
      SELECT DISTINCT ON (question_id)
        question_id,
        text,
        html_local,
        html
      FROM comments
      WHERE question_id IS NOT NULL
      ORDER BY question_id, date_text DESC NULLS LAST
    )
    SELECT
      cq.question_id,
      cq.external_id,
      COALESCE(NULLIF(cq.statement, ''), q.statement_text, q.statement_html) AS statement,
      cq.question_type,
      q.type_question AS question_type_from_questions,
      cq.alternatives,
      cq.correct_answer,
      cq.explanation,
      selected_comments.text AS comment_text,
      selected_comments.html_local AS comment_html_local,
      selected_comments.html AS comment_html,
      cq.teacher_comment,
      cq.historical_explanation,
      cq.beginner_explanation,
      cq.trap_explanation,
      cq.source_normative_reference,
      cq.current_resolution,
      cq.historical_resolution,
      cq.topic,
      cq.subtopic,
      cq.axis,
      cq.difficulty,
      cq.tags,
      cq.source,
      cq.origin,
      cq.is_unpublished,
      cq.is_official,
      cq.official_exam,
      cq.created_at,
      cq.updated_at,
      cq.batch_id,
      cq.banco_version,
      cq.audit_version,
      cq.status_auditoria,
      cq.validacao_normativa,
      cq.data_base_normativa,
      cq.active,
      cq.visible,
      cq.deprecated
    FROM contran_prf_unpublished_questions cq
    LEFT JOIN questions q ON q.id_question = cq.question_id
    LEFT JOIN selected_comments ON selected_comments.question_id = cq.question_id
    WHERE
      COALESCE(cq.active, 1) = 1
      AND COALESCE(cq.visible, 1) = 1
      AND COALESCE(cq.deprecated, 0) = 0
      AND COALESCE(cq.is_official, 0) = 0
      AND COALESCE(cq.official_exam, 0) = 0
      AND (
        COALESCE(cq.is_unpublished, 0) = 1
        OR cq.origin ILIKE '%Questao inedita - elaborada para treino PRF/CONTRAN%'
        OR cq.origin ILIKE '%Questão inédita - elaborada para treino PRF/CONTRAN%'
        OR cq.source ILIKE '%Banco inedito PRF/CONTRAN%'
        OR cq.source ILIKE '%Banco inédito PRF/CONTRAN%'
        OR cq.source ILIKE '%PRF/CONTRAN%'
        OR cq.tags ILIKE '%PRF%'
        OR cq.tags ILIKE '%CONTRAN%'
        OR cq.tags ILIKE '%Legisla%'
        OR cq.current_resolution ILIKE ANY($1::text[])
        OR cq.historical_resolution ILIKE ANY($1::text[])
      )
    ORDER BY cq.question_id ASC
  `, [resolutionLikes]);

  return result.rows;
}

function mapRow(row) {
  const statement = cleanText(row.statement);
  const type = cleanText(row.question_type || row.question_type_from_questions);
  const alternatives = parseStructured(row.alternatives);
  const tags = normalizeTags(row.tags);
  const answer = cleanText(row.correct_answer);
  const comment = cleanText(row.comment_text) || stripHtml(row.comment_html_local || row.comment_html || '');
  const teacherComment = cleanText(row.teacher_comment);
  const historical = cleanText(row.historical_explanation);
  const beginner = cleanText(row.beginner_explanation);
  const trap = cleanText(row.trap_explanation);
  const normativeReference = cleanText(row.source_normative_reference);
  const currentResolution = cleanText(row.current_resolution);
  const topic = cleanText(row.topic);
  const subtopic = cleanText(row.subtopic);
  const axis = cleanText(row.axis);

  return {
    id: row.question_id,
    external_id: cleanText(row.external_id),
    statement,
    enunciado: statement,
    question_type: type,
    tipo: type,
    alternatives,
    alternativas: alternatives,
    correct_answer: answer,
    gabarito: answer,
    explanation: cleanText(row.explanation),
    comment,
    teacher_comment: teacherComment,
    explicacao_historica: historical,
    explicacao_para_iniciante: beginner,
    beginner_explanation: beginner,
    pegadinha: trap,
    trap_explanation: trap,
    fundamento_normativo: normativeReference,
    normative_reference: normativeReference,
    article_reference: normativeReference,
    current_resolution: currentResolution,
    resolucao_atual: currentResolution,
    historical_resolution: cleanText(row.historical_resolution),
    topic,
    tema: topic,
    subtopic,
    subtema: subtopic,
    axis,
    eixo: axis,
    difficulty: cleanText(row.difficulty),
    tags,
    source: cleanText(row.source),
    origin: cleanText(row.origin),
    is_unpublished: toBoolean(row.is_unpublished),
    questao_inedita: toBoolean(row.is_unpublished),
    is_official: toBoolean(row.is_official),
    official_exam: toBoolean(row.official_exam),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    batch_id: cleanText(row.batch_id),
    banco_version: cleanText(row.banco_version),
    audit_version: cleanText(row.audit_version),
    status_auditoria: cleanText(row.status_auditoria),
    validacao_normativa: cleanText(row.validacao_normativa),
    data_base_normativa: cleanText(row.data_base_normativa),
    active: toBoolean(row.active),
    visible: toBoolean(row.visible),
    deprecated: toBoolean(row.deprecated)
  };
}

function buildManifest(items, exportedAt, selected) {
  return {
    total_questoes_exportadas: items.length,
    total_por_tipo: countBy(items, 'tipo'),
    total_por_resolucao: countBy(items, 'resolucao_atual'),
    total_por_tema: countBy(items, 'tema'),
    lista_de_campos_encontrados: EXPORT_FIELDS.filter((field) => items.some((item) => hasValue(item[field]))),
    data_hora_export: exportedAt,
    banco: {
      fonte: selected.sourceName,
      url: selected.redactedConnectionString
    },
    arquivos: OUTPUTS,
    criterio_usado_para_identificar_o_lote: {
      tabela_base: 'contran_prf_unpublished_questions',
      filtros_de_lote_atual: [
        'active = true',
        'visible = true',
        'deprecated = false',
        'is_official = false',
        'official_exam = false'
      ],
      criterios_de_inclusao_or: [
        'is_unpublished = true',
        'questao_inedita mapeado a partir de is_unpublished = true',
        'origin contem "Questao inedita - elaborada para treino PRF/CONTRAN"',
        'source contem "Banco inedito PRF/CONTRAN"',
        'source contem "PRF/CONTRAN"',
        'tags contem PRF, CONTRAN ou Legislacao de Transito',
        'current_resolution/historical_resolution contem as resolucoes CONTRAN listadas'
      ],
      resolucoes_consideradas: RESOLUTIONS,
      observacao: 'Exportacao somente leitura; nao inclui respostas de usuarios, emails, nomes de usuarios, tokens, credenciais ou historico de respostas.'
    },
    validacao: validateItems(items)
  };
}

function validateItems(items) {
  const missingId = items.filter((item) => !item.id).map((item) => item.external_id || null);
  const missingStatement = items.filter((item) => !hasValue(item.enunciado)).map((item) => item.id);
  const missingAnswer = items.filter((item) => !hasValue(item.gabarito)).map((item) => item.id);
  const officialMixed = items.filter((item) => item.is_official || item.official_exam).map((item) => item.id);
  const duplicateIds = findDuplicates(items.map((item) => item.id));
  const errors = [];

  if (missingId.length) errors.push(`${missingId.length} questoes sem id`);
  if (missingStatement.length) errors.push(`${missingStatement.length} questoes sem enunciado`);
  if (missingAnswer.length) errors.push(`${missingAnswer.length} questoes sem gabarito`);
  if (officialMixed.length) errors.push(`${officialMixed.length} questoes oficiais misturadas indevidamente`);
  if (duplicateIds.length) errors.push(`${duplicateIds.length} ids duplicados`);

  return {
    ok: errors.length === 0,
    errors,
    total: items.length,
    sem_id: missingId,
    sem_enunciado: missingStatement,
    sem_gabarito: missingAnswer,
    oficiais_misturadas: officialMixed,
    ids_duplicados: duplicateIds
  };
}

async function validateFiles(items, manifest) {
  const errors = [];
  for (const [key, file] of Object.entries(OUTPUTS)) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size === 0) errors.push(`${key} vazio ou invalido`);
    } catch {
      errors.push(`${key} nao foi gerado`);
    }
  }

  const jsonlContent = await fs.readFile(OUTPUTS.jsonl, 'utf8');
  const jsonlLines = jsonlContent.trimEnd() ? jsonlContent.trimEnd().split('\n') : [];
  if (jsonlLines.length !== items.length) {
    errors.push(`JSONL tem ${jsonlLines.length} linhas, esperado ${items.length}`);
  }
  for (const line of jsonlLines) JSON.parse(line);

  const manifestRead = JSON.parse(await fs.readFile(OUTPUTS.manifest, 'utf8'));
  if (manifestRead.total_questoes_exportadas !== manifest.total_questoes_exportadas) {
    errors.push('manifest com total divergente');
  }

  return {
    ...validateItems(items),
    ok: errors.length === 0 && validateItems(items).ok,
    errors: [...validateItems(items).errors, ...errors],
    arquivos_gerados: errors.length === 0
  };
}

function buildCsv(items) {
  const lines = [EXPORT_FIELDS.map(csvCell).join(',')];
  for (const item of items) {
    lines.push(EXPORT_FIELDS.map((field) => csvCell(item[field])).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const raw = (typeof value === 'object' ? JSON.stringify(value) : String(value))
    .replace(/\r?\n/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
  return `"${raw.replaceAll('"', '""')}"`;
}

function countBy(items, field) {
  const counts = {};
  for (const item of items) {
    const key = cleanText(item[field]) || '(vazio)';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function parseStructured(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeTags(value) {
  const parsed = parseStructured(value);
  if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
  const raw = cleanText(value);
  if (!raw) return [];
  return raw.split(/[;,|]/).map(cleanText).filter(Boolean);
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function stripHtml(value) {
  return cleanText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function toIso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? cleanText(value) : date.toISOString();
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function truncate(value, max) {
  const text = cleanText(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
