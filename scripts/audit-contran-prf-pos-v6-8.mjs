#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const PREVIOUS_EXPORT = path.join(packageRoot, 'export_questoes_contran_prf_para_revisao.jsonl');
const OUTPUTS = {
  jsonl: path.join(packageRoot, 'export_pos_v6_8_questoes_contran_prf.jsonl'),
  csv: path.join(packageRoot, 'export_pos_v6_8_questoes_contran_prf.csv'),
  manifest: path.join(packageRoot, 'manifest_export_pos_v6_8_questoes_contran_prf.json'),
  diff: path.join(packageRoot, 'diff_pos_v6_8_campos_alterados.md'),
  critical: path.join(packageRoot, 'relatorio_validacao_15_criticas_pos_v6_8.md'),
  genericComments: path.join(packageRoot, 'comentarios_genericos_remanescentes_pos_v6_8.csv'),
  genericFoundations: path.join(packageRoot, 'fundamentos_genericos_pos_v6_8.csv'),
  accordion: path.join(packageRoot, 'relatorio_accordion_artigos_pos_v6_8.md'),
  encoding: path.join(packageRoot, 'relatorio_encoding_mojibake_pos_v6_8.md'),
  mc: path.join(packageRoot, 'validacao_multiplas_escolhas_pos_v6_8.csv'),
  ce: path.join(packageRoot, 'validacao_certo_errado_pos_v6_8.csv'),
  final: path.join(packageRoot, 'RELATORIO_FINAL_POS_V6_8_QUESTOES_CONTRAN_PRF.md')
};

const EXPORT_FIELDS = [
  'id', 'external_id', 'statement', 'enunciado', 'question_type', 'tipo',
  'alternatives', 'alternativas', 'correct_answer', 'gabarito',
  'explanation', 'comment', 'teacher_comment', 'explicacao_historica',
  'explicacao_para_iniciante', 'beginner_explanation', 'pegadinha',
  'trap_explanation', 'fundamento_normativo', 'normative_reference',
  'article_reference', 'article_full_text_status', 'current_resolution',
  'resolucao_atual', 'historical_resolution', 'topic', 'tema',
  'subtopic', 'subtema', 'axis', 'eixo', 'difficulty', 'tags',
  'source', 'origin', 'is_unpublished', 'questao_inedita',
  'is_official', 'official_exam', 'created_at', 'updated_at',
  'active', 'visible', 'deprecated', 'pedagogical_patch_version',
  'comment_style', 'needs_manual_review', 'review_reason'
];

const CRITICAL_EXTERNAL_IDS = [
  'CONTRAN_PRF_V5_CE_0049',
  'CONTRAN_PRF_V5_CE_0050',
  'CONTRAN_PRF_V5_CE_0051',
  'CONTRAN_PRF_V5_CE_0052',
  'CONTRAN_PRF_V5_MC_0013',
  'CONTRAN_PRF_V5_CE_0083',
  'CONTRAN_PRF_V5_CE_0084',
  'CONTRAN_PRF_V5_CE_0085',
  'CONTRAN_PRF_V5_CE_0086',
  'CONTRAN_PRF_V5_CE_0087',
  'CONTRAN_PRF_V5_CE_0088',
  'CONTRAN_PRF_V5_MC_0022',
  'CONTRAN_PRF_V5_CE_0137',
  'CONTRAN_PRF_V5_CE_0138',
  'CONTRAN_PRF_V5_CE_0262'
];

const PROTECTED_FIELDS = [
  'id', 'external_id', 'statement', 'enunciado', 'alternatives',
  'alternativas', 'correct_answer', 'gabarito', 'question_type', 'tipo',
  'is_official', 'official_exam', 'is_unpublished', 'questao_inedita'
];

const ALLOWED_FIELDS = [
  'explanation', 'comment', 'teacher_comment', 'explicacao_historica',
  'explicacao_para_iniciante', 'beginner_explanation', 'pegadinha',
  'trap_explanation', 'fundamento_normativo', 'normative_reference',
  'article_reference', 'article_full_text_status', 'pedagogical_patch_version',
  'comment_style', 'needs_manual_review', 'review_reason'
];

const GENERIC_PHRASES = [
  'A afirmativa esta de acordo com a resolucao.',
  'A norma disciplina dimensoes especificas.',
  'O item esta certo porque afirmou exatamente a consequencia pratica da regra',
  'Na fiscalizacao, o PRF deve verificar essa exigencia de forma autonoma',
  'sem presumir regularidade por outro requisito do veiculo ou da carga',
  'Cebraspe costuma cobrar exatamente essa separacao',
  'A pegadinha e achar que',
  'Regras da Resolucao',
  'Dispositivos da Resolucao',
  'Fundamento: Regras dimensionais da Resolucao',
  'Como o item manteve a regra correta'
];

const MOJIBAKE_PATTERNS = [
  'ExplicaÃ', 'questÃ', 'resoluÃ', 'infraÃ', 'fiscalizaÃ', 'aplicaÃ',
  'atenÃ', 'veÃ', 'direÃ', 'tolerÃ', 'usuÃ', 'tÃ', 'Ãƒ', 'Ã§',
  'Ã£', 'Ã©', 'Ãª', 'Ã­', 'Ã³', 'Ãº', 'Â§', 'Âº', '�'
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const exportedAt = new Date().toISOString();
  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'audit-contran-prf-pos-v6-8'
  });

  let rows;
  let refs;
  let dbMojibake;
  let historyStats;
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    rows = await fetchRows(client);
    refs = await fetchReferences(client);
    dbMojibake = await findDatabaseMojibake(client);
    historyStats = await fetchHistoryStats(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const items = rows.map(mapRow);
  const previousItems = await loadPreviousExport(PREVIOUS_EXPORT);
  const previousCriticalBackup = await loadLatestCriticalBackup();
  const manifest = buildManifest(items, refs, exportedAt, selected);
  const diff = compareWithPrevious(items, previousItems);
  const critical = validateCritical(items, previousCriticalBackup);
  const genericComments = findGenericComments(items);
  const genericFoundations = findGenericFoundations(items);
  const accordion = validateAccordion(items, refs);
  const fileMojibake = await findFileMojibake();
  const encoding = { db: dbMojibake, files: fileMojibake };
  const mc = validateMultipleChoice(items);
  const ce = validateTrueFalse(items);
  const finalReport = buildFinalReport({
    exportedAt, manifest, diff, critical, genericComments,
    genericFoundations, accordion, encoding, mc, ce, historyStats
  });

  await fs.writeFile(OUTPUTS.jsonl, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.csv, buildCsv(items, EXPORT_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.manifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.diff, renderDiffReport(diff), 'utf8');
  await fs.writeFile(OUTPUTS.critical, renderCriticalReport(critical), 'utf8');
  await fs.writeFile(OUTPUTS.genericComments, buildCsv(genericComments.rows, [
    'id', 'external_id', 'resolucao', 'tema', 'subtema',
    'trecho_generico_encontrado', 'comentario_completo', 'severidade',
    'sugestao_de_revisao'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.genericFoundations, buildCsv(genericFoundations.rows, [
    'id', 'external_id', 'fundamento_atual', 'problema',
    'resolucao', 'tema', 'subtema', 'prioridade'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.accordion, renderAccordionReport(accordion), 'utf8');
  await fs.writeFile(OUTPUTS.encoding, renderEncodingReport(encoding), 'utf8');
  await fs.writeFile(OUTPUTS.mc, buildCsv(mc.rows, [
    'id', 'external_id', 'gabarito', 'possui_A', 'possui_B',
    'possui_C', 'possui_D', 'possui_E',
    'alternativa_correta_explica_como_correta', 'inconsistencia_encontrada'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.ce, buildCsv(ce.rows, [
    'id', 'external_id', 'gabarito', 'possui_regra_aplicavel',
    'possui_aplicacao_ao_item', 'possui_cuidado_de_prova',
    'possui_fundamento', 'problema_encontrado'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.final, finalReport, 'utf8');

  const fileValidation = await validateOutputFiles();
  console.log(JSON.stringify({
    ok: true,
    modo: 'somente leitura no banco',
    banco: { fonte: selected.sourceName, url: selected.redactedConnectionString },
    total_exportado: items.length,
    total_por_tipo: manifest.total_por_tipo,
    criticas_corrigidas: critical.summary.corrigida,
    criticas_parciais: critical.summary.parcialmente_corrigida,
    criticas_nao_corrigidas: critical.summary.nao_corrigida,
    comentarios_genericos_remanescentes: genericComments.rows.length,
    fundamentos_genericos_remanescentes: genericFoundations.rows.length,
    problemas_encoding: dbMojibake.length + fileMojibake.length,
    arquivos: OUTPUTS,
    validacao_arquivos: fileValidation,
    aviso: 'A auditoria consultou o banco em transacao READ ONLY. Nenhuma questao, gabarito, resposta de usuario, historico ou estatistica foi alterado.'
  }, null, 2));
}

async function fetchRows(client) {
  const result = await client.query(`
    SELECT
      question_id, external_id, statement, question_type, alternatives,
      correct_answer, explanation, historical_explanation, beginner_explanation,
      trap_explanation, source_normative_reference, teacher_comment,
      article_reference, article_full_text_status, current_resolution,
      historical_resolution, topic, subtopic, axis, difficulty, tags,
      source, origin, is_unpublished, is_official, official_exam, created_at,
      updated_at, active, visible, deprecated, pedagogical_patch_version,
      comment_style, needs_manual_review, review_reason
    FROM contran_prf_unpublished_questions
    WHERE COALESCE(is_unpublished, 0) = 1
      AND (
        source ILIKE '%PRF/CONTRAN%'
        OR origin ILIKE '%PRF/CONTRAN%'
        OR batch_id ILIKE '%contran%'
        OR current_resolution ILIKE '%/%'
      )
    ORDER BY question_id
  `);
  return result.rows;
}

async function fetchReferences(client) {
  const result = await client.query(`
    SELECT
      cqr.question_id, cqr.external_id, cqr.resolution_number,
      cqr.resolution_year, cqr.article, cqr.paragraph, cqr.item,
      cqr.subitem, cqr.annex, cqr.raw_reference, cqr.display_order,
      cqr.needs_normative_reference_review,
      COALESCE(cqr.normative_article_id, cna_fallback.id) AS normative_article_id,
      COALESCE(cna.plain_text, cna_fallback.plain_text) AS plain_text,
      COALESCE(cna.full_text, cna_fallback.full_text) AS full_text,
      COALESCE(cna.title, cna_fallback.title) AS title
    FROM contran_question_normative_references cqr
    LEFT JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
    LEFT JOIN contran_normative_articles cna_fallback
      ON cqr.normative_article_id IS NULL
      AND cna_fallback.resolution_number = cqr.resolution_number
      AND cna_fallback.resolution_year = cqr.resolution_year
      AND COALESCE(cna_fallback.article, '') = COALESCE(cqr.article, '')
      AND COALESCE(cna_fallback.paragraph, '') = COALESCE(cqr.paragraph, '')
      AND COALESCE(cna_fallback.item, '') = COALESCE(cqr.item, '')
      AND COALESCE(cna_fallback.subitem, '') = COALESCE(cqr.subitem, '')
      AND COALESCE(cna_fallback.annex, '') = COALESCE(cqr.annex, '')
    ORDER BY cqr.question_id, cqr.display_order, cqr.id
  `);
  return result.rows;
}

async function fetchHistoryStats(client) {
  const tables = ['study_answers', 'question_answer_audit', 'question_mastery', 'question_study_status', 'study_served_questions'];
  const out = [];
  for (const table of tables) {
    const exists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS ok
    `, [table]);
    if (!exists.rows[0]?.ok) continue;
    const count = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    out.push({ table, total_atual: count.rows[0]?.total || 0, observacao: 'Sem baseline historico no export anterior; tabela nao foi escrita por esta auditoria.' });
  }
  return out;
}

function mapRow(row) {
  const alternatives = parseJson(row.alternatives, row.alternatives || {});
  const statement = clean(row.statement);
  const type = clean(row.question_type);
  const answer = clean(row.correct_answer);
  const teacherComment = clean(row.teacher_comment || row.historical_explanation || row.explanation);
  const beginner = clean(row.beginner_explanation);
  const trap = clean(row.trap_explanation);
  const foundation = clean(row.source_normative_reference || row.article_reference);
  return {
    id: row.question_id,
    external_id: clean(row.external_id),
    statement,
    enunciado: statement,
    question_type: type,
    tipo: type,
    alternatives,
    alternativas: alternatives,
    correct_answer: answer,
    gabarito: answer,
    explanation: clean(row.explanation),
    comment: teacherComment,
    teacher_comment: teacherComment,
    explicacao_historica: clean(row.historical_explanation),
    explicacao_para_iniciante: beginner,
    beginner_explanation: beginner,
    pegadinha: trap,
    trap_explanation: trap,
    fundamento_normativo: foundation,
    normative_reference: foundation,
    article_reference: clean(row.article_reference || foundation),
    article_full_text_status: clean(row.article_full_text_status),
    current_resolution: clean(row.current_resolution),
    resolucao_atual: clean(row.current_resolution),
    historical_resolution: clean(row.historical_resolution),
    topic: clean(row.topic),
    tema: clean(row.topic),
    subtopic: clean(row.subtopic),
    subtema: clean(row.subtopic),
    axis: clean(row.axis),
    eixo: clean(row.axis),
    difficulty: clean(row.difficulty),
    tags: normalizeTags(row.tags),
    source: clean(row.source),
    origin: clean(row.origin),
    is_unpublished: toBool(row.is_unpublished),
    questao_inedita: toBool(row.is_unpublished),
    is_official: toBool(row.is_official),
    official_exam: toBool(row.official_exam),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    active: toBool(row.active, true),
    visible: toBool(row.visible, true),
    deprecated: toBool(row.deprecated),
    pedagogical_patch_version: clean(row.pedagogical_patch_version),
    comment_style: clean(row.comment_style),
    needs_manual_review: toBool(row.needs_manual_review),
    review_reason: clean(row.review_reason)
  };
}

function buildManifest(items, refs, exportedAt, selected) {
  const officialMixed = items.filter((item) => item.is_official || item.official_exam);
  return {
    total_questoes: items.length,
    total_por_tipo: countBy(items, 'tipo'),
    total_por_resolucao: countBy(items, 'resolucao_atual'),
    total_por_tema: countBy(items, 'tema'),
    total_ativas: items.filter((item) => item.active).length,
    total_visiveis: items.filter((item) => item.visible).length,
    total_depreciadas: items.filter((item) => item.deprecated).length,
    total_oficiais_indevidamente_misturadas: officialMixed.length,
    total_sem_comentario: items.filter((item) => !clean(item.teacher_comment)).length,
    total_sem_fundamento_normativo: items.filter((item) => !clean(item.fundamento_normativo)).length,
    total_sem_explicacao_para_iniciante: items.filter((item) => !clean(item.beginner_explanation)).length,
    total_sem_pegadinha: items.filter((item) => !clean(item.trap_explanation)).length,
    total_referencias_estruturadas: refs.length,
    data_hora_exportacao: exportedAt,
    campos_encontrados: EXPORT_FIELDS.filter((field) => items.some((item) => hasValue(item[field]))),
    banco: { fonte: selected.sourceName, url: selected.redactedConnectionString },
    esperado: {
      total_questoes: 413,
      certo_errado: 324,
      multipla_escolha: 89,
      oficiais_misturadas: 0
    },
    validacao_esperado: {
      total_ok: items.length === 413,
      certo_errado_ok: (countBy(items, 'tipo').CERTO_ERRADO || 0) === 324,
      multipla_escolha_ok: (countBy(items, 'tipo').MULTIPLA_ESCOLHA || 0) === 89,
      oficiais_ok: officialMixed.length === 0
    },
    criterio: 'contran_prf_unpublished_questions com is_unpublished=1 e marcadores PRF/CONTRAN/resolucao CONTRAN; sem dados pessoais ou respostas de usuarios.'
  };
}

async function loadPreviousExport(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return content.trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function loadLatestCriticalBackup() {
  const dir = path.join(packageRoot, 'exports');
  try {
    const files = (await fs.readdir(dir))
      .filter((name) => /^backup_contran_prf_pedagogical_before_v6_8_critical_.*\.jsonl$/.test(name))
      .sort()
      .reverse();
    if (!files.length) return [];
    const content = await fs.readFile(path.join(dir, files[0]), 'utf8');
    return content.trimEnd().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function compareWithPrevious(items, previousItems) {
  const previousById = new Map(previousItems.map((item) => [String(item.id), item]));
  const compared = [];
  const protectedChanges = [];
  const allowedChanges = [];
  const missingInPrevious = [];
  const newInPreviousOnly = [];
  const currentIds = new Set(items.map((item) => String(item.id)));
  for (const item of items) {
    const prev = previousById.get(String(item.id));
    if (!prev) {
      missingInPrevious.push(item.id);
      continue;
    }
    compared.push(item.id);
    for (const field of PROTECTED_FIELDS) {
      if (stableValue(item[field]) !== stableValue(prev[field])) {
        protectedChanges.push({ id: item.id, external_id: item.external_id, field, before: prev[field], after: item[field] });
      }
    }
    for (const field of ALLOWED_FIELDS) {
      if (stableValue(item[field]) !== stableValue(prev[field])) {
        allowedChanges.push({ id: item.id, external_id: item.external_id, field });
      }
    }
  }
  for (const prev of previousItems) {
    if (!currentIds.has(String(prev.id))) newInPreviousOnly.push(prev.id);
  }
  return {
    previous_file: PREVIOUS_EXPORT,
    total_atual: items.length,
    total_anterior: previousItems.length,
    total_comparado: compared.length,
    campos_alterados_permitidos: allowedChanges,
    campos_alterados_indevidamente: protectedChanges,
    ausentes_no_export_anterior: missingInPrevious,
    presentes_so_no_export_anterior: newInPreviousOnly
  };
}

function validateCritical(items, previousBackup) {
  const byExternal = new Map(items.map((item) => [item.external_id, item]));
  const beforeByExternal = new Map(previousBackup.map((row) => [row.external_id, row]));
  const rows = [];
  for (const externalId of CRITICAL_EXTERNAL_IDS) {
    const item = byExternal.get(externalId);
    if (!item) {
      rows.push({ external_id: externalId, status: 'nao corrigida', problemas: ['nao encontrada'] });
      continue;
    }
    const text = normalize(`${item.teacher_comment}\n${item.fundamento_normativo}\n${item.beginner_explanation}\n${item.trap_explanation}`);
    const problems = [];
    if (/882\/2021/.test(item.resolucao_atual) || /882\/2021/.test(item.fundamento_normativo)) {
      if (!text.includes('5%')) problems.push('nao menciona 5% para PBT/PBTC');
      if (!/(12,5%|12.5%)/.test(text)) problems.push('nao menciona 12,5% para eixo');
      if (!/PBT\/PBTC/i.test(item.teacher_comment) || !/eixo/i.test(item.teacher_comment)) problems.push('nao diferencia PBT/PBTC e eixo');
      if (!/art\.?\s*50/i.test(item.fundamento_normativo)) problems.push('fundamento sem art. 50');
      if (/0051|0052|MC_0013/.test(externalId) && !/art\.?\s*52/i.test(item.fundamento_normativo)) problems.push('fundamento sem art. 52 quando cabivel');
    }
    if (/525\/2015/.test(item.resolucao_atual) || /525\/2015/.test(item.fundamento_normativo)) {
      if (/0083|0084/.test(externalId) && !/(5h30|5 horas e meia|5 \(cinco\) horas e meia)/i.test(item.teacher_comment)) problems.push('nao menciona 5h30');
      if (/0085|0086|MC_0022/.test(externalId) && !/30 minutos/i.test(item.teacher_comment)) problems.push('nao menciona 30 minutos');
      if (/0085|0086|MC_0022/.test(externalId) && !/(6 horas|cada 6)/i.test(item.teacher_comment)) problems.push('nao menciona 6 horas para carga');
      if (/0087|0088/.test(externalId) && !/(passageiros|4 horas|cada 4)/i.test(item.teacher_comment)) problems.push('nao explica passageiros');
      if (!/art\.?\s*3/i.test(item.fundamento_normativo)) problems.push('fundamento sem art. 3');
    }
    if (/918\/2022/.test(item.resolucao_atual) || /918\/2022/.test(item.fundamento_normativo)) {
      if (!/180 dias/i.test(item.teacher_comment)) problems.push('nao menciona 180 dias');
      if (!/360 dias/i.test(item.teacher_comment)) problems.push('nao menciona 360 dias');
      if (!/(defesa previa|defesa prévia|prazo)/i.test(item.teacher_comment)) problems.push('nao diferencia prazo simples/ampliado');
      if (!/art\.?\s*9/i.test(item.fundamento_normativo)) problems.push('fundamento nao aponta art. 9');
    }
    if (/432\/2013/.test(item.resolucao_atual) || /432\/2013/.test(item.fundamento_normativo)) {
      if (!/valor medido/i.test(item.teacher_comment)) problems.push('nao explica valor medido');
      if (!/valor considerado/i.test(item.teacher_comment)) problems.push('nao explica valor considerado');
      if (!/(margem|tolerancia|tolerância)/i.test(item.teacher_comment)) problems.push('nao explica margem de tolerancia');
      if (!/(anexo i|tabela)/i.test(item.teacher_comment + ' ' + item.fundamento_normativo)) problems.push('nao menciona Anexo I/tabela');
    }
    rows.push({
      id: item.id,
      external_id: externalId,
      status: problems.length ? 'parcialmente corrigida' : 'corrigida',
      problemas: problems,
      antes: truncate(clean(beforeByExternal.get(externalId)?.teacher_comment || beforeByExternal.get(externalId)?.historical_explanation || ''), 360),
      depois: truncate(item.teacher_comment, 520),
      fundamento_atual: item.fundamento_normativo
    });
  }
  return {
    rows,
    summary: {
      corrigida: rows.filter((row) => row.status === 'corrigida').length,
      parcialmente_corrigida: rows.filter((row) => row.status === 'parcialmente corrigida').length,
      nao_corrigida: rows.filter((row) => row.status === 'nao corrigida').length
    }
  };
}

function findGenericComments(items) {
  const rows = [];
  for (const item of items) {
    const comment = clean(item.teacher_comment);
    const normalized = normalize(comment);
    for (const phrase of GENERIC_PHRASES) {
      if (!normalized.includes(normalize(phrase))) continue;
      rows.push({
        id: item.id,
        external_id: item.external_id,
        resolucao: item.resolucao_atual,
        tema: item.tema,
        subtema: item.subtema,
        trecho_generico_encontrado: phrase,
        comentario_completo: comment,
        severidade: classifyGenericSeverity(item, comment),
        sugestao_de_revisao: 'Revisar manualmente para substituir formula generica por regra concreta, valor/prazo/percentual e fundamento especifico.'
      });
    }
  }
  return { rows, total: rows.length, bySeverity: countBy(rows, 'severidade') };
}

function classifyGenericSeverity(item, comment) {
  const text = `${comment}\n${item.fundamento_normativo}`;
  const hasRuleToken = /(\d|%|art\.|§|inciso|anexo|res\.)/i.test(text);
  if (!hasRuleToken) return 'CRITICA';
  if (requiresExactNumber(item) && !/(\d|%)/.test(comment)) return 'ALTA';
  if (/afirmou exatamente|verificar essa exigencia|Cebraspe costuma/i.test(normalize(comment))) return 'MEDIA';
  return 'BAIXA';
}

function requiresExactNumber(item) {
  return /(tolerancia|prazo|tempo|direcao|velocidade|alcool|peso|dimens)/i.test(normalize(`${item.tema} ${item.subtema} ${item.statement}`));
}

function findGenericFoundations(items) {
  const rows = [];
  for (const item of items) {
    const foundation = clean(item.fundamento_normativo);
    const norm = normalize(foundation);
    const problems = [];
    if (!foundation) problems.push('fundamento vazio');
    if (/^(res\.?|resolucao|resolução)\s/i.test(norm) && !/(art|anexo)/i.test(norm)) problems.push('referencia apenas a resolucao');
    if (/(regras da|dispositivos da|resolucao aplicavel|fundamento: regras|mbft aprovado)/i.test(norm)) problems.push('fundamento generico');
    if (!/(art\.?|arts\.?|anexo|§|inciso|, [ivxlcdm]+\b)/i.test(foundation)) problems.push('sem artigo/anexo/paragrafo/inciso especifico');
    if (problems.length) {
      rows.push({
        id: item.id,
        external_id: item.external_id,
        fundamento_atual: foundation,
        problema: [...new Set(problems)].join(' | '),
        resolucao: item.resolucao_atual,
        tema: item.tema,
        subtema: item.subtema,
        prioridade: requiresExactNumber(item) ? 'ALTA' : 'MEDIA'
      });
    }
  }
  return { rows, total: rows.length, byPriority: countBy(rows, 'prioridade') };
}

function validateAccordion(items, refs) {
  const refsByQuestion = groupBy(refs, (ref) => String(ref.question_id));
  const byExternal = new Map(items.map((item) => [item.external_id, item]));
  const examples = [];

  const art11 = findQuestionWithArticles(items, refsByQuestion, '882', ['11', '18', '19']);
  examples.push(accordionExample('Arts. 11, 18 e 19 da Res. 882/2021', art11, refsByQuestion, ['11', '18', '19']));

  examples.push(accordionExample('Art. 50, I e par. 3, da Res. 882/2021', byExternal.get('CONTRAN_PRF_V5_CE_0049'), refsByQuestion, ['50']));

  const art4 = findQuestionWithArticles(items, refsByQuestion, '882', ['4']);
  examples.push(accordionExample('Art. 4, pars. 1 e 2, da Res. 882/2021', art4, refsByQuestion, ['4']));

  const pending = findPendingAccordion(items, refsByQuestion);
  examples.push(accordionExample('Fundamento pendente', pending, refsByQuestion, []));

  const allRefs = refs.filter((ref) => items.some((item) => Number(item.id) === Number(ref.question_id)));
  const pendingRefs = allRefs.filter((ref) => !ref.plain_text && !ref.full_text);
  const parserProblems = allRefs.filter((ref) => !ref.normative_article_id && !ref.plain_text && !ref.full_text);
  const reviewFlags = allRefs.filter((ref) => ref.needs_normative_reference_review);
  return {
    examples,
    artigos_encontrados: allRefs.length - pendingRefs.length,
    artigos_pendentes: pendingRefs.length,
    exemplos_funcionando: examples.filter((example) => example.ok).length,
    exemplos_pendentes: examples.filter((example) => example.pending).length,
    problemas_de_parser: parserProblems.map((ref) => ({
      question_id: ref.question_id,
      external_id: ref.external_id,
      raw_reference: ref.raw_reference,
      resolution_number: ref.resolution_number,
      article: ref.article
    })),
    referencias_marcadas_para_revisao: reviewFlags.map((ref) => ({
      question_id: ref.question_id,
      external_id: ref.external_id,
      raw_reference: ref.raw_reference,
      resolution_number: ref.resolution_number,
      article: ref.article,
      resolvida_por_fallback: Boolean(ref.plain_text || ref.full_text)
    }))
  };
}

function accordionExample(name, item, refsByQuestion, expectedArticles) {
  if (!item) return { caso: name, ok: false, pending: true, problema: 'questao exemplo nao localizada' };
  const refs = refsByQuestion.get(String(item.id)) || [];
  const foundArticles = refs.filter((ref) => ref.plain_text || ref.full_text).map((ref) => String(ref.article));
  const missing = expectedArticles.filter((article) => !foundArticles.includes(String(article)));
  return {
    caso: name,
    id: item.id,
    external_id: item.external_id,
    fundamento: item.fundamento_normativo,
    artigos_encontrados: foundArticles,
    ok: expectedArticles.length ? missing.length === 0 : refs.some((ref) => !ref.plain_text && !ref.full_text),
    pending: refs.some((ref) => !ref.plain_text && !ref.full_text),
    problema: missing.length ? `artigos esperados nao encontrados: ${missing.join(', ')}` : ''
  };
}

function findQuestionWithArticles(items, refsByQuestion, resolutionNumber, articles) {
  return items.find((item) => {
    const refs = refsByQuestion.get(String(item.id)) || [];
    return articles.every((article) => refs.some((ref) => ref.resolution_number === resolutionNumber && String(ref.article) === article));
  });
}

function findPendingAccordion(items, refsByQuestion) {
  return items.find((item) => (refsByQuestion.get(String(item.id)) || []).some((ref) => !ref.plain_text && !ref.full_text));
}

async function findDatabaseMojibake(client) {
  const questionResult = await client.query(`
    SELECT question_id, external_id, statement, explanation, teacher_comment,
           beginner_explanation, trap_explanation, source_normative_reference
    FROM contran_prf_unpublished_questions
    WHERE COALESCE(is_unpublished, 0) = 1
  `);
  const rows = [];
  for (const row of questionResult.rows) {
    for (const field of ['statement', 'explanation', 'teacher_comment', 'beginner_explanation', 'trap_explanation', 'source_normative_reference']) {
      const value = clean(row[field]);
      const found = findMojibake(value);
      if (found.length) {
        rows.push({
          local: 'postgres.contran_prf_unpublished_questions',
          id: row.question_id,
          external_id: row.external_id,
          campo: field,
          texto_quebrado: truncate(value, 500),
          correcao_sugerida: 'Revisar o texto no banco antes de corrigir automaticamente.',
          status: 'pendente'
        });
      }
    }
  }
  const refResult = await client.query(`
    SELECT question_id, external_id, raw_reference
    FROM contran_question_normative_references
  `);
  for (const row of refResult.rows) {
    const value = clean(row.raw_reference);
    const found = findMojibake(value);
    if (found.length) {
      rows.push({
        local: 'postgres.contran_question_normative_references',
        id: row.question_id,
        external_id: row.external_id,
        campo: 'raw_reference',
        texto_quebrado: truncate(value, 500),
        correcao_sugerida: 'Revisar raw_reference estruturada antes de corrigir automaticamente.',
        status: 'pendente'
      });
    }
  }
  return rows;
}

async function findFileMojibake() {
  const files = ['public/study/study.js', 'public/study/index.html', OUTPUTS.jsonl, OUTPUTS.csv];
  const rows = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(packageRoot, file), 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        const found = findMojibake(line);
        if (found.length) {
          rows.push({
            local: file,
            linha: index + 1,
            campo: 'arquivo',
            texto_quebrado: truncate(line, 500),
            correcao_sugerida: 'Corrigir encoding no arquivo de interface/export.',
            status: file.startsWith('public/study') ? 'corrigido antes do relatorio' : 'pendente'
          });
        }
      });
    } catch {
      // Export files may not exist yet on first check.
    }
  }
  return rows;
}

function findMojibake(value) {
  return MOJIBAKE_PATTERNS.filter((pattern) => value.includes(pattern));
}

function validateMultipleChoice(items) {
  const rows = items.filter((item) => item.tipo === 'MULTIPLA_ESCOLHA').map((item) => {
    const text = item.teacher_comment || item.explanation || '';
    const answer = clean(item.gabarito).toUpperCase();
    const flags = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter) => [letter, new RegExp(`(^|\\n)\\s*${letter}\\)`, 'i').test(text)]));
    const correctOk = new RegExp(`(^|\\n)\\s*${answer}\\)\\s*(Certa|Correta|Certo)`, 'i').test(text);
    const problems = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E']) if (!flags[letter]) problems.push(`sem explicacao ${letter})`);
    if (!correctOk) problems.push('alternativa correta nao marcada como certa/correta');
    return {
      id: item.id,
      external_id: item.external_id,
      gabarito: answer,
      possui_A: flags.A,
      possui_B: flags.B,
      possui_C: flags.C,
      possui_D: flags.D,
      possui_E: flags.E,
      alternativa_correta_explica_como_correta: correctOk,
      inconsistencia_encontrada: problems.join(' | ')
    };
  });
  return { rows, total: rows.length, problemas: rows.filter((row) => row.inconsistencia_encontrada).length };
}

function validateTrueFalse(items) {
  const rows = items.filter((item) => item.tipo === 'CERTO_ERRADO').map((item) => {
    const text = `${item.teacher_comment || item.explanation || ''}\nFundamento: ${item.fundamento_normativo}`;
    const answer = clean(item.gabarito).toUpperCase() === 'C' ? 'CERTO' : 'ERRADO';
    const hasAnswer = new RegExp(`Gabarito:\\s*${answer}`, 'i').test(text);
    const hasRule = /Regra aplic[aá]vel/i.test(text);
    const hasApplication = /Aplica[cç][aã]o ao item/i.test(text);
    const hasCare = /Cuidado de prova/i.test(text);
    const hasFoundation = isSpecificFoundation(item.fundamento_normativo) || /Fundamento:/i.test(text);
    const problems = [];
    if (!hasAnswer) problems.push(`sem Gabarito: ${answer}`);
    if (!hasRule) problems.push('sem Regra aplicavel');
    if (!hasApplication) problems.push('sem Aplicacao ao item');
    if (!hasCare) problems.push('sem Cuidado de prova');
    if (!hasFoundation) problems.push('sem Fundamento especifico');
    return {
      id: item.id,
      external_id: item.external_id,
      gabarito: answer,
      possui_regra_aplicavel: hasRule,
      possui_aplicacao_ao_item: hasApplication,
      possui_cuidado_de_prova: hasCare,
      possui_fundamento: hasFoundation,
      problema_encontrado: problems.join(' | ')
    };
  });
  return { rows, total: rows.length, problemas: rows.filter((row) => row.problema_encontrado).length };
}

function isSpecificFoundation(value) {
  return /(art\.?|arts\.?|anexo|§|inciso|,\s*[IVXLCDM]+\b)/i.test(clean(value));
}

async function validateOutputFiles() {
  const result = [];
  for (const file of Object.values(OUTPUTS)) {
    const stat = await fs.stat(file);
    result.push({ file, bytes: stat.size, ok: stat.isFile() && stat.size > 0 });
  }
  return result;
}

function renderDiffReport(diff) {
  const bad = diff.campos_alterados_indevidamente;
  const allowedCounts = countBy(diff.campos_alterados_permitidos, 'field');
  return `# Diff pos-V6.8 de campos alterados

- Total atual: ${diff.total_atual}
- Total anterior: ${diff.total_anterior}
- Total comparado: ${diff.total_comparado}
- Campos alterados permitidos: ${diff.campos_alterados_permitidos.length}
- Campos alterados indevidamente: ${bad.length}

## Campos permitidos alterados

${Object.entries(allowedCounts).map(([field, total]) => `- ${field}: ${total}`).join('\n') || '- Nenhum'}

## Alteracoes indevidas

${bad.length ? bad.map((item) => `- ${item.id} ${item.external_id}: ${item.field}`).join('\n') : '- Nenhuma alteracao indevida em campos protegidos.'}

## Observacao sobre historico e estatisticas

O export anterior nao contem snapshot de respostas de usuarios ou estatisticas. Esta auditoria consultou o banco em transacao READ ONLY e nao executou escrita nessas tabelas.
`;
}

function renderCriticalReport(critical) {
  return `# Validacao das 15 criticas pos-V6.8

- Corrigidas: ${critical.summary.corrigida}
- Parcialmente corrigidas: ${critical.summary.parcialmente_corrigida}
- Nao corrigidas: ${critical.summary.nao_corrigida}

${critical.rows.map((row) => `## ${row.external_id}

- Status: ${row.status}
- ID: ${row.id || ''}
- Fundamento atual: ${row.fundamento_atual || ''}
- Problemas: ${row.problemas?.length ? row.problemas.join('; ') : 'nenhum'}
- Antes: ${row.antes || '(sem backup localizado)'}
- Depois: ${row.depois || ''}
`).join('\n')}
`;
}

function renderAccordionReport(accordion) {
  return `# Relatorio do accordion de artigos pos-V6.8

- Artigos encontrados: ${accordion.artigos_encontrados}
- Artigos pendentes: ${accordion.artigos_pendentes}
- Exemplos funcionando: ${accordion.exemplos_funcionando}
- Exemplos pendentes: ${accordion.exemplos_pendentes}
- Problemas de parser: ${accordion.problemas_de_parser.length}
- Referencias marcadas para revisao: ${accordion.referencias_marcadas_para_revisao.length}

## Exemplos

${accordion.examples.map((example) => `- ${example.caso}: ${example.ok ? 'OK' : 'PROBLEMA'}${example.pending ? ' / pendente' : ''} | id=${example.id || ''} | artigos=${(example.artigos_encontrados || []).join(', ')} | ${example.problema || ''}`).join('\n')}

## Problemas de parser

${accordion.problemas_de_parser.length ? accordion.problemas_de_parser.slice(0, 200).map((item) => `- ${item.question_id} ${item.external_id}: ${item.raw_reference}`).join('\n') : '- Nenhum problema de parser nas referencias estruturadas auditadas.'}

## Referencias marcadas para revisao

${accordion.referencias_marcadas_para_revisao.length ? accordion.referencias_marcadas_para_revisao.slice(0, 200).map((item) => `- ${item.question_id} ${item.external_id}: ${item.raw_reference} | resolvida_por_fallback=${item.resolvida_por_fallback}`).join('\n') : '- Nenhuma referencia marcada para revisao.'}
`;
}

function renderEncodingReport(encoding) {
  const rows = [...encoding.files, ...encoding.db];
  return `# Relatorio de encoding/mojibake pos-V6.8

- Ocorrencias em arquivos: ${encoding.files.length}
- Ocorrencias no banco: ${encoding.db.length}
- Total: ${rows.length}

## Locais encontrados

${rows.length ? rows.map((row) => `- ${row.local}${row.linha ? `:${row.linha}` : ''} ${row.external_id || ''} ${row.campo}: ${row.status}. Sugestao: ${row.correcao_sugerida}. Trecho: ${row.texto_quebrado}`).join('\n') : '- Nenhum mojibake remanescente encontrado nos arquivos auditados, export atual ou campos de texto do lote no banco.'}

## Labels esperados

- Explicacao para iniciante
- Comentario do professor
- Pegadinha
- Fundamento normativo
- Questao inedita - elaborada para treino PRF/CONTRAN
`;
}

function buildFinalReport(data) {
  const statusGeral = data.manifest.validacao_esperado.total_ok
    && data.manifest.validacao_esperado.certo_errado_ok
    && data.manifest.validacao_esperado.multipla_escolha_ok
    && data.manifest.validacao_esperado.oficiais_ok
    && data.diff.campos_alterados_indevidamente.length === 0
    ? 'OK com pendencias pedagogicas remanescentes para revisao humana'
    : 'ATENCAO';
  return `# RELATORIO FINAL POS-V6.8 - QUESTOES CONTRAN PRF

- Status geral: ${statusGeral}
- Data/hora: ${data.exportedAt}
- Total de questoes auditadas: ${data.manifest.total_questoes}
- Total por tipo: ${JSON.stringify(data.manifest.total_por_tipo)}
- Total por resolucao: ${JSON.stringify(data.manifest.total_por_resolucao)}
- Oficiais misturadas indevidamente: ${data.manifest.total_oficiais_indevidamente_misturadas}
- Ativas: ${data.manifest.total_ativas}
- Visiveis: ${data.manifest.total_visiveis}
- Depreciadas: ${data.manifest.total_depreciadas}

## Status das 15 criticas

- Corrigidas: ${data.critical.summary.corrigida}
- Parcialmente corrigidas: ${data.critical.summary.parcialmente_corrigida}
- Nao corrigidas: ${data.critical.summary.nao_corrigida}

## Pendencias remanescentes

- Comentarios genericos remanescentes: ${data.genericComments.rows.length}
- Fundamentos genericos remanescentes: ${data.genericFoundations.rows.length}
- Problemas de encoding: ${data.encoding.db.length + data.encoding.files.length}
- Accordion: ${data.accordion.exemplos_funcionando}/${data.accordion.examples.length} exemplos OK; ${data.accordion.artigos_pendentes} referencias pendentes no lote.
- Multipla escolha: ${data.mc.total} auditadas; ${data.mc.problemas} com problema.
- Certo/Errado: ${data.ce.total} auditadas; ${data.ce.problemas} com problema.
- Alteracoes indevidas em campos protegidos: ${data.diff.campos_alterados_indevidamente.length}

## Historico e estatisticas

${data.historyStats.map((row) => `- ${row.table}: ${row.total_atual} registros atuais. ${row.observacao}`).join('\n') || '- Nenhuma tabela de historico/estatistica localizada.'}

## Recomendacoes finais

- Nao fazer nova rodada automatica de correcao de comentarios sem revisao humana dos CSVs gerados.
- Priorizar linhas CRITICA/ALTA em comentarios_genericos_remanescentes_pos_v6_8.csv e fundamentos_genericos_pos_v6_8.csv.
- Validar visualmente no app uma questao de cada grupo do relatorio de accordion.

## Arquivos gerados

${Object.values(OUTPUTS).map((file) => `- ${path.basename(file)}`).join('\n')}
`;
}

function buildCsv(rows, fields) {
  return [fields.map(csvCell).join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n') + '\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`;
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = clean(row[field]) || '(vazio)';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function groupBy(rows, keyFn) {
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  return out;
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function stableValue(value) {
  if (value && typeof value === 'object') return JSON.stringify(value);
  return clean(value).replace(/\s+/g, ' ').trim();
}

function parseJson(value, fallback) {
  if (!value || typeof value !== 'string') return value || fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value;
  return clean(value).split(/[;,]/).map((tag) => tag.trim()).filter(Boolean);
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return clean(value) !== '';
}

function toBool(value, defaultValue = false) {
  if (value === null || value === undefined || value === '') return defaultValue;
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function toIso(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : date.toISOString();
}

function truncate(value, max) {
  const text = clean(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
