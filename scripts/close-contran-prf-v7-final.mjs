#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const INPUT_CE_V69 = path.join(packageRoot, 'validacao_certo_errado_pos_v6_9.csv');
const EXPECTED_TOTAL = 413;
const EXPECTED_CE = 324;
const EXPECTED_MC = 89;
const EXPECTED_TARGETS = 132;
const REVIEW_REASON = 'Sem fundamento específico seguro após V7';
const V7_VERSION = 'v7-final-fundamentos-ce';
const V7_BANK_VERSION = 'v7-final-aprovado-com-itens-retidos';

const OUTPUTS = {
  backupJsonl: path.join(packageRoot, 'backup_pre_v7_questoes_contran_prf.jsonl'),
  backupCsv: path.join(packageRoot, 'backup_pre_v7_questoes_contran_prf.csv'),
  backupPedagogical: path.join(packageRoot, 'backup_pre_v7_campos_pedagogicos.jsonl'),
  backupManifest: path.join(packageRoot, 'manifest_backup_pre_v7.json'),
  exportJsonl: path.join(packageRoot, 'export_pos_v7_questoes_contran_prf.jsonl'),
  exportCsv: path.join(packageRoot, 'export_pos_v7_questoes_contran_prf.csv'),
  manifest: path.join(packageRoot, 'manifest_export_pos_v7_questoes_contran_prf.json'),
  diff: path.join(packageRoot, 'diff_pos_v7_campos_alterados.md'),
  ce: path.join(packageRoot, 'validacao_certo_errado_pos_v7.csv'),
  mc: path.join(packageRoot, 'validacao_multiplas_escolhas_pos_v7.csv'),
  retained: path.join(packageRoot, 'relatorio_retidas_v7_revisao_manual.md'),
  parser: path.join(packageRoot, 'relatorio_parser_ctb_contran_pos_v7.md'),
  accordion: path.join(packageRoot, 'relatorio_accordion_artigos_pos_v7.md'),
  encoding: path.join(packageRoot, 'relatorio_encoding_pos_v7.md'),
  encodingMojibake: path.join(packageRoot, 'relatorio_encoding_mojibake_pos_v7.md'),
  genericFoundations: path.join(packageRoot, 'fundamentos_genericos_pos_v7.csv'),
  genericComments: path.join(packageRoot, 'comentarios_genericos_remanescentes_pos_v7.csv'),
  finalPos: path.join(packageRoot, 'RELATORIO_FINAL_POS_V7_QUESTOES_CONTRAN_PRF.md'),
  finalDefinitive: path.join(packageRoot, 'RELATORIO_FINAL_V7_FECHAMENTO_DEFINITIVO_CONTRAN_PRF.md'),
  finalUser: path.join(packageRoot, 'RELATORIO_FECHAMENTO_DEFINITIVO_CONTRAN_PRF_V7.md'),
  abort: path.join(packageRoot, 'ABORT_V7_CONTAGEM_INESPERADA.md'),
  failure: path.join(packageRoot, 'RELATORIO_FALHA_V7_FECHAMENTO_DEFINITIVO_CONTRAN_PRF.md')
};

const EXPORT_FIELDS = [
  'id', 'external_id', 'statement', 'question_type', 'alternatives',
  'correct_answer', 'explanation', 'historical_explanation',
  'beginner_explanation', 'trap_explanation', 'source_normative_reference',
  'teacher_comment', 'article_reference', 'article_full_text_status',
  'current_resolution', 'historical_resolution', 'topic', 'subtopic',
  'axis', 'difficulty', 'tags', 'source', 'origin', 'is_unpublished',
  'is_official', 'official_exam', 'active', 'visible', 'deprecated',
  'banco_version', 'audit_version', 'status_auditoria',
  'validacao_normativa', 'needs_manual_review', 'review_reason',
  'pedagogical_patch_version', 'comment_style', 'created_at', 'updated_at',
  'pedagogical_updated_at'
];

const PROTECTED_FIELDS = [
  'id', 'external_id', 'statement', 'question_type', 'alternatives',
  'correct_answer', 'is_unpublished', 'is_official', 'official_exam'
];

const PEDAGOGICAL_FIELDS = [
  'id', 'external_id', 'explanation', 'historical_explanation',
  'beginner_explanation', 'trap_explanation', 'source_normative_reference',
  'teacher_comment', 'article_reference', 'article_full_text_status',
  'active', 'visible', 'deprecated', 'banco_version', 'audit_version',
  'status_auditoria', 'validacao_normativa', 'needs_manual_review',
  'review_reason', 'pedagogical_patch_version', 'comment_style',
  'pedagogical_updated_at'
];

const CTB_CASES = [
  { rawReference: 'Res. 432/2013 e CTB art. 165-A.', article: '165-A' },
  { rawReference: 'Art. 1º da Res. 432/2013 e CTB art. 306.', article: '306' },
  { rawReference: 'Res. 920/2022 e CTB art. 280, § 2º.', article: '280', paragraph: '2' },
  { rawReference: 'Res. 993/2023 e CTB art. 105.', article: '105', expectPending: true }
];

const ACCORDION_CASES = [
  { label: 'Art. 2º, § 2º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '2', paragraph: '2' },
  { label: 'Art. 4º, I, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '4', item: 'I' },
  { label: 'Art. 6º, § 1º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '6', paragraph: '1' },
  { label: 'Art. 7º, § 4º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '7', paragraph: '4' }
];

const MOJIBAKE_PATTERNS = [
  'ExplicaÃƒ', 'resoluÃƒ', 'fiscalizaÃƒ', 'aplicaÃƒ',
  'veÃƒ', 'direÃƒ', 'tolerÃƒ', 'ï¿½'
];

main().catch(async (error) => {
  await fs.writeFile(OUTPUTS.failure, renderFailureReport(error), 'utf8').catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error.message, failureReport: OUTPUTS.failure }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const startedAt = new Date().toISOString();
  const targetRows = await loadV69Targets();
  if (targetRows.length !== EXPECTED_TARGETS) {
    await fs.writeFile(OUTPUTS.abort, `# ABORT V7 - Contagem inesperada\n\n- Esperado: ${EXPECTED_TARGETS}\n- Encontrado: ${targetRows.length}\n- Fonte: ${INPUT_CE_V69}\n\nNenhuma escrita foi executada.\n`, 'utf8');
    throw new Error(`Contagem inicial inesperada: ${targetRows.length}; esperado ${EXPECTED_TARGETS}.`);
  }
  const targetIds = targetRows.map((row) => Number(row.id));

  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'close-contran-prf-v7-final'
  });

  let beforeRows = [];
  let afterRows = [];
  let beforeHistory = [];
  let afterHistory = [];
  let parserReport = null;
  let accordionReport = null;
  let validation = null;

  await client.connect();
  try {
    beforeRows = await fetchRows(client);
    beforeHistory = await fetchHistoryStats(client);
    validateInitialState(beforeRows, targetIds);
    await writeBackups(beforeRows, beforeHistory, selected, startedAt, targetRows);

    await client.query('BEGIN');
    await applyV7Retention(client, targetIds);
    afterRows = await fetchRows(client);
    afterHistory = await fetchHistoryStats(client);
    parserReport = await validateParser(client);
    accordionReport = await validateAccordion(client);
    validation = validateFinalState({ beforeRows, afterRows, beforeHistory, afterHistory, targetIds, parserReport, accordionReport });
    if (!validation.ok) {
      await client.query('ROLLBACK');
      const failure = new Error(`Validacao V7 falhou: ${validation.errors.join('; ')}`);
      failure.validation = validation;
      throw failure;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const finalExportRows = afterRows.map(exportRow);
  const diff = buildDiff(beforeRows, afterRows);
  const ce = validateTrueFalse(finalExportRows);
  const mc = validateMultipleChoice(finalExportRows, beforeRows.map(exportRow));
  const genericFoundations = findGenericFoundations(finalExportRows);
  const genericComments = findGenericComments(finalExportRows);
  const encoding = findMojibakeInRows(finalExportRows);
  const retainedRows = finalExportRows.filter((row) => targetIds.includes(Number(row.id)) && !toBool(row.visible, true));
  const manifest = buildManifest(finalExportRows, startedAt, selected, validation, retainedRows);

  await fs.writeFile(OUTPUTS.exportJsonl, finalExportRows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.exportCsv, buildCsv(finalExportRows, EXPORT_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.manifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.diff, renderDiffReport(diff), 'utf8');
  await fs.writeFile(OUTPUTS.ce, buildCsv(ce.rows, [
    'id', 'external_id', 'visible', 'gabarito', 'gabarito_certo_errado_valido',
    'possui_comentario', 'possui_fundamento_especifico', 'retida_v7', 'problema_encontrado'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.mc, buildCsv(mc.rows, [
    'id', 'external_id', 'gabarito', 'possui_A', 'possui_B', 'possui_C',
    'possui_D', 'possui_E', 'alternativa_correta_explica_como_correta',
    'alternativas_inalteradas', 'inconsistencia_encontrada'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.retained, renderRetainedReport(retainedRows), 'utf8');
  await fs.writeFile(OUTPUTS.parser, renderParserReport(parserReport), 'utf8');
  await fs.writeFile(OUTPUTS.accordion, renderAccordionReport(accordionReport), 'utf8');
  await fs.writeFile(OUTPUTS.encoding, renderEncodingReport(encoding), 'utf8');
  await fs.writeFile(OUTPUTS.encodingMojibake, renderEncodingReport(encoding), 'utf8');
  await fs.writeFile(OUTPUTS.genericFoundations, buildCsv(genericFoundations.rows, [
    'id', 'external_id', 'visible', 'fundamento_atual', 'problema', 'resolucao', 'tema', 'subtema', 'prioridade'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.genericComments, buildCsv(genericComments.rows, [
    'id', 'external_id', 'visible', 'resolucao', 'tema', 'subtema', 'trecho_generico_encontrado', 'severidade'
  ]), 'utf8');

  const finalReport = renderFinalReport({
    startedAt,
    selected,
    beforeRows,
    afterRows: finalExportRows,
    targetRows,
    retainedRows,
    diff,
    ce,
    mc,
    parserReport,
    accordionReport,
    encoding,
    genericFoundations,
    genericComments,
    beforeHistory,
    afterHistory,
    manifest
  });
  await fs.writeFile(OUTPUTS.finalPos, finalReport, 'utf8');
  await fs.writeFile(OUTPUTS.finalDefinitive, finalReport, 'utf8');
  await fs.writeFile(OUTPUTS.finalUser, finalReport, 'utf8');

  const fileValidation = await validateOutputFiles();
  console.log(JSON.stringify({
    ok: true,
    status_final: manifest.status_final,
    banco: { fonte: selected.sourceName, url: selected.redactedConnectionString },
    total_antes: beforeRows.length,
    total_depois: finalExportRows.length,
    ce_total: ce.total,
    ce_visiveis_sem_fundamento: ce.visibleWithoutSpecificFoundation,
    mc_total: mc.total,
    mc_problemas: mc.problems,
    fundamentos_corrigidos: 0,
    itens_retidos: retainedRows.length,
    parser_ctb_contran_ok: parserReport.ok,
    accordion_ok: accordionReport.ok,
    encoding_problemas: encoding.length,
    arquivos: OUTPUTS,
    validacao_arquivos: fileValidation,
    aviso: 'Backup gerado antes da escrita. Históricos, estatísticas, enunciados, alternativas, gabaritos, IDs e oficiais foram preservados.'
  }, null, 2));
}

async function loadV69Targets() {
  const content = await fs.readFile(INPUT_CE_V69, 'utf8');
  return parseCsv(content).filter((row) => clean(row.problema_encontrado));
}

async function fetchRows(client) {
  const result = await client.query(`
    SELECT
      question_id AS id, external_id, statement, question_type, alternatives,
      correct_answer, explanation, historical_explanation, beginner_explanation,
      trap_explanation, source_normative_reference, teacher_comment,
      article_reference, article_full_text_status, current_resolution,
      historical_resolution, topic, subtopic, axis, difficulty, tags,
      source, origin, is_unpublished, is_official, official_exam, active,
      visible, deprecated, banco_version, audit_version, status_auditoria,
      validacao_normativa, needs_manual_review, review_reason,
      pedagogical_patch_version, comment_style, created_at, updated_at,
      pedagogical_updated_at
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
    out.push({ table, total: count.rows[0]?.total || 0 });
  }
  return out;
}

function validateInitialState(rows, targetIds) {
  const errors = [];
  const exported = rows.map(exportRow);
  const typeCounts = countBy(exported, 'question_type');
  if (rows.length !== EXPECTED_TOTAL) errors.push(`total inicial ${rows.length}, esperado ${EXPECTED_TOTAL}`);
  if ((typeCounts.CERTO_ERRADO || 0) !== EXPECTED_CE) errors.push(`C/E inicial ${typeCounts.CERTO_ERRADO || 0}, esperado ${EXPECTED_CE}`);
  if ((typeCounts.MULTIPLA_ESCOLHA || 0) !== EXPECTED_MC) errors.push(`MC inicial ${typeCounts.MULTIPLA_ESCOLHA || 0}, esperado ${EXPECTED_MC}`);
  if (rows.some((row) => toBool(row.is_official) || toBool(row.official_exam))) errors.push('questoes oficiais no lote');
  if (rows.filter((row) => toBool(row.visible, true)).length !== EXPECTED_TOTAL) errors.push('estado inicial nao tem 413 visiveis');
  if (rows.filter((row) => toBool(row.active, true)).length !== EXPECTED_TOTAL) errors.push('estado inicial nao tem 413 ativas');
  const rowIds = new Set(rows.map((row) => Number(row.id)));
  const missingTargets = targetIds.filter((id) => !rowIds.has(id));
  if (missingTargets.length) errors.push(`targets V6.9 nao encontrados: ${missingTargets.join(', ')}`);
  if (errors.length) throw new Error(`Estado inicial invalido para V7: ${errors.join('; ')}`);
}

async function writeBackups(rows, historyStats, selected, startedAt, targetRows) {
  const exportRows = rows.map(exportRow);
  await fs.writeFile(OUTPUTS.backupJsonl, exportRows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.backupCsv, buildCsv(exportRows, EXPORT_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.backupPedagogical, exportRows.map((row) => JSON.stringify(pick(row, PEDAGOGICAL_FIELDS))).join('\n') + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.backupManifest, JSON.stringify({
    generated_at: startedAt,
    database: { source: selected.sourceName, url: selected.redactedConnectionString },
    total_records: rows.length,
    target_records_v7: targetRows.length,
    type_counts: countBy(exportRows, 'question_type'),
    history_table_counts: historyStats,
    files: {
      backupJsonl: OUTPUTS.backupJsonl,
      backupCsv: OUTPUTS.backupCsv,
      backupPedagogical: OUTPUTS.backupPedagogical
    },
    rollback_note: 'Para rollback pedagogico, restaurar campos de backup_pre_v7_campos_pedagogicos.jsonl por question_id/external_id.'
  }, null, 2) + '\n', 'utf8');

  for (const file of [OUTPUTS.backupJsonl, OUTPUTS.backupCsv, OUTPUTS.backupPedagogical, OUTPUTS.backupManifest]) {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Backup falhou ou vazio: ${file}`);
  }
}

async function applyV7Retention(client, targetIds) {
  const resultAll = await client.query(`
    UPDATE contran_prf_unpublished_questions
    SET
      banco_version = $1,
      audit_version = 'v7-final',
      status_auditoria = 'approved_with_retained_items',
      validacao_normativa = CASE
        WHEN question_id = ANY($2::int[]) THEN 'retained_manual_review'
        ELSE 'approved_visible'
      END
    WHERE COALESCE(is_unpublished, 0) = 1
      AND (
        source ILIKE '%PRF/CONTRAN%'
        OR origin ILIKE '%PRF/CONTRAN%'
        OR batch_id ILIKE '%contran%'
        OR current_resolution ILIKE '%/%'
      )
  `, [V7_BANK_VERSION, targetIds]);

  const resultTargets = await client.query(`
    UPDATE contran_prf_unpublished_questions
    SET
      visible = 0,
      needs_manual_review = 1,
      review_reason = $2,
      pedagogical_patch_version = $3,
      comment_style = 'professor_didatico_objetivo',
      pedagogical_updated_at = NOW()
    WHERE question_id = ANY($1::int[])
      AND COALESCE(is_unpublished, 0) = 1
      AND COALESCE(is_official, 0) = 0
      AND COALESCE(official_exam, 0) = 0
  `, [targetIds, REVIEW_REASON, V7_VERSION]);

  if (resultAll.rowCount !== EXPECTED_TOTAL) {
    throw new Error(`Metadados V7 aplicados em ${resultAll.rowCount}; esperado ${EXPECTED_TOTAL}`);
  }
  if (resultTargets.rowCount !== EXPECTED_TARGETS) {
    throw new Error(`Retencao V7 aplicada em ${resultTargets.rowCount}; esperado ${EXPECTED_TARGETS}`);
  }
}

async function validateParser(client) {
  const cases = [];
  for (const test of CTB_CASES) {
    const result = await client.query(`
      SELECT
        question_id, external_id, reference_type, resolution_number,
        resolution_year, article, paragraph, raw_reference,
        needs_normative_reference_review, normative_article_id
      FROM contran_question_normative_references
      WHERE raw_reference = $1
      ORDER BY question_id, display_order
    `, [test.rawReference]);
    const lawRows = result.rows.filter((row) =>
      clean(row.reference_type) === 'law'
      && clean(row.resolution_number) === '9503'
      && clean(row.article) === test.article
      && (!test.paragraph || clean(row.paragraph) === test.paragraph)
    );
    const badRows = result.rows.filter((row) =>
      clean(row.reference_type) !== 'law'
      && clean(row.resolution_number) !== '9503'
      && ['165-A', '165', '306', '280', '105'].includes(clean(row.article))
    );
    const pendingOk = !test.expectPending || lawRows.every((row) => !row.normative_article_id && toBool(row.needs_normative_reference_review));
    cases.push({
      raw_reference: test.rawReference,
      article: test.article,
      expected_source_type: 'CTB',
      law_rows: lawRows.length,
      bad_contran_rows: badRows.length,
      pending_ok: pendingOk,
      ok: lawRows.length > 0 && badRows.length === 0 && pendingOk
    });
  }
  return { ok: cases.every((item) => item.ok), cases };
}

async function validateAccordion(client) {
  const cases = [];
  for (const test of ACCORDION_CASES) {
    const result = await client.query(`
      SELECT
        cqr.question_id, cqr.external_id, cqr.normative_article_id,
        COALESCE(NULLIF(cna.plain_text, ''), cna.full_text, '') AS article_text
      FROM contran_question_normative_references cqr
      LEFT JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
      WHERE cqr.resolution_number = $1
        AND cqr.resolution_year = $2
        AND cqr.article = $3
        AND COALESCE(cqr.paragraph, '') = $4
        AND COALESCE(cqr.item, '') = $5
    `, [test.resolutionNumber, test.resolutionYear, test.article, clean(test.paragraph), clean(test.item)]);
    cases.push({
      label: test.label,
      rows: result.rows.length,
      rows_with_text: result.rows.filter((row) => clean(row.article_text)).length,
      ok: result.rows.length > 0 && result.rows.every((row) => clean(row.article_text))
    });
  }
  return { ok: cases.every((item) => item.ok), cases };
}

function validateFinalState({ beforeRows, afterRows, beforeHistory, afterHistory, targetIds, parserReport, accordionReport }) {
  const errors = [];
  const before = beforeRows.map(exportRow);
  const after = afterRows.map(exportRow);
  const beforeById = new Map(before.map((row) => [String(row.id), row]));
  const afterById = new Map(after.map((row) => [String(row.id), row]));
  if (after.length !== EXPECTED_TOTAL) errors.push(`total final ${after.length}, esperado ${EXPECTED_TOTAL}`);
  if (countBy(after, 'question_type').CERTO_ERRADO !== EXPECTED_CE) errors.push('total C/E final divergente');
  if (countBy(after, 'question_type').MULTIPLA_ESCOLHA !== EXPECTED_MC) errors.push('total MC final divergente');
  if (after.some((row) => toBool(row.is_official) || toBool(row.official_exam))) errors.push('questao oficial afetada/misturada');
  for (const row of after) {
    const prev = beforeById.get(String(row.id));
    if (!prev) {
      errors.push(`questao nova inesperada ${row.id}`);
      continue;
    }
    for (const field of PROTECTED_FIELDS) {
      if (stableValue(row[field]) !== stableValue(prev[field])) {
        errors.push(`campo protegido alterado ${row.id} ${field}`);
      }
    }
  }
  for (const row of before) {
    if (!afterById.has(String(row.id))) errors.push(`questao removida ${row.id}`);
  }
  if (JSON.stringify(beforeHistory) !== JSON.stringify(afterHistory)) errors.push('contagens de historico/estatistica foram alteradas');
  const ce = validateTrueFalse(after);
  if (ce.visibleWithoutSpecificFoundation !== 0) errors.push(`C/E visiveis sem fundamento especifico: ${ce.visibleWithoutSpecificFoundation}`);
  if (!parserReport.ok) errors.push('parser CTB/CONTRAN invalido');
  if (!accordionReport.ok) errors.push('accordion 798/2020 invalido');
  const encoding = findMojibakeInRows(after);
  if (encoding.length) errors.push(`problemas de encoding: ${encoding.length}`);
  const retained = after.filter((row) => targetIds.includes(Number(row.id)) && !toBool(row.visible, true));
  if (retained.length !== EXPECTED_TARGETS) errors.push(`retidas ${retained.length}, esperado ${EXPECTED_TARGETS}`);
  return { ok: errors.length === 0, errors };
}

function exportRow(row) {
  return {
    id: Number(row.id),
    external_id: clean(row.external_id),
    statement: clean(row.statement),
    question_type: clean(row.question_type),
    alternatives: parseJson(row.alternatives, row.alternatives || {}),
    correct_answer: clean(row.correct_answer),
    explanation: clean(row.explanation),
    historical_explanation: clean(row.historical_explanation),
    beginner_explanation: clean(row.beginner_explanation),
    trap_explanation: clean(row.trap_explanation),
    source_normative_reference: clean(row.source_normative_reference),
    teacher_comment: clean(row.teacher_comment || row.historical_explanation || row.explanation),
    article_reference: clean(row.article_reference || row.source_normative_reference),
    article_full_text_status: clean(row.article_full_text_status),
    current_resolution: clean(row.current_resolution),
    historical_resolution: clean(row.historical_resolution),
    topic: clean(row.topic),
    subtopic: clean(row.subtopic),
    axis: clean(row.axis),
    difficulty: clean(row.difficulty),
    tags: normalizeTags(row.tags),
    source: clean(row.source),
    origin: clean(row.origin),
    is_unpublished: toBool(row.is_unpublished),
    is_official: toBool(row.is_official),
    official_exam: toBool(row.official_exam),
    active: toBool(row.active, true),
    visible: toBool(row.visible, true),
    deprecated: toBool(row.deprecated),
    banco_version: clean(row.banco_version),
    audit_version: clean(row.audit_version),
    status_auditoria: clean(row.status_auditoria),
    validacao_normativa: clean(row.validacao_normativa),
    needs_manual_review: toBool(row.needs_manual_review),
    review_reason: clean(row.review_reason),
    pedagogical_patch_version: clean(row.pedagogical_patch_version),
    comment_style: clean(row.comment_style),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    pedagogical_updated_at: toIso(row.pedagogical_updated_at)
  };
}

function validateTrueFalse(rows) {
  const ceRows = rows.filter((row) => clean(row.question_type) === 'CERTO_ERRADO');
  const out = ceRows.map((row) => {
    const visible = toBool(row.visible, true);
    const answer = normalizeAnswer(row.correct_answer);
    const specific = hasSpecificFoundation(row.source_normative_reference || row.article_reference);
    const retained = !visible && toBool(row.needs_manual_review) && clean(row.review_reason).includes('V7');
    const problems = [];
    if (!['CERTO', 'ERRADO'].includes(answer)) problems.push('gabarito invalido');
    if (!clean(row.teacher_comment)) problems.push('sem comentario');
    if (visible && !specific) problems.push('visivel sem fundamento especifico');
    if (!visible && !retained) problems.push('invisivel sem retencao V7');
    return {
      id: row.id,
      external_id: row.external_id,
      visible,
      gabarito: answer,
      gabarito_certo_errado_valido: ['CERTO', 'ERRADO'].includes(answer),
      possui_comentario: Boolean(clean(row.teacher_comment)),
      possui_fundamento_especifico: specific,
      retida_v7: retained,
      problema_encontrado: problems.join(' | ')
    };
  });
  return {
    rows: out,
    total: out.length,
    visibleWithoutSpecificFoundation: out.filter((row) => row.visible && !row.possui_fundamento_especifico).length,
    retained: out.filter((row) => row.retida_v7).length,
    problems: out.filter((row) => row.problema_encontrado && row.visible).length
  };
}

function validateMultipleChoice(rows, previousRows) {
  const previousById = new Map(previousRows.map((row) => [String(row.id), row]));
  const out = rows.filter((row) => clean(row.question_type) === 'MULTIPLA_ESCOLHA').map((row) => {
    const text = row.teacher_comment || row.explanation || '';
    const answer = clean(row.correct_answer).toUpperCase();
    const flags = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter) => [letter, new RegExp(`(^|\\n|\\s)${letter}\\)`, 'i').test(text)]));
    const correctOk = new RegExp(`(^|\\n|\\s)${answer}\\)\\s*(Certa|Correta|Certo|Gabarito)`, 'i').test(text);
    const previous = previousById.get(String(row.id));
    const alternativesUnchanged = previous ? stableValue(row.alternatives) === stableValue(previous.alternatives) : true;
    const problems = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E']) if (!flags[letter]) problems.push(`sem explicacao ${letter})`);
    if (!correctOk) problems.push('alternativa correta nao marcada como certa/correta');
    if (!alternativesUnchanged) problems.push('alternativas alteradas');
    return {
      id: row.id,
      external_id: row.external_id,
      gabarito: answer,
      possui_A: flags.A,
      possui_B: flags.B,
      possui_C: flags.C,
      possui_D: flags.D,
      possui_E: flags.E,
      alternativa_correta_explica_como_correta: correctOk,
      alternativas_inalteradas: alternativesUnchanged,
      inconsistencia_encontrada: problems.join(' | ')
    };
  });
  return { rows: out, total: out.length, problems: out.filter((row) => row.inconsistencia_encontrada).length };
}

function buildDiff(beforeRows, afterRows) {
  const before = beforeRows.map(exportRow);
  const after = afterRows.map(exportRow);
  const beforeById = new Map(before.map((row) => [String(row.id), row]));
  const protectedChanges = [];
  const changed = [];
  for (const row of after) {
    const prev = beforeById.get(String(row.id));
    if (!prev) continue;
    for (const field of EXPORT_FIELDS) {
      if (stableValue(row[field]) !== stableValue(prev[field])) {
        changed.push({ id: row.id, external_id: row.external_id, field });
        if (PROTECTED_FIELDS.includes(field)) protectedChanges.push({ id: row.id, external_id: row.external_id, field });
      }
    }
  }
  return {
    changed,
    protectedChanges,
    changedByField: countBy(changed, 'field')
  };
}

function findGenericFoundations(rows) {
  const out = [];
  for (const row of rows) {
    const foundation = clean(row.source_normative_reference || row.article_reference);
    const problems = [];
    if (!foundation) problems.push('fundamento vazio');
    if (!hasSpecificFoundation(foundation)) problems.push('sem artigo/anexo/paragrafo/inciso especifico');
    if (/(regras da|dispositivos da|resolucao aplicavel|fundamento: regras|mbft aprovado)/i.test(normalize(foundation))) problems.push('fundamento generico');
    if (problems.length) {
      out.push({
        id: row.id,
        external_id: row.external_id,
        visible: row.visible,
        fundamento_atual: foundation,
        problema: [...new Set(problems)].join(' | '),
        resolucao: row.current_resolution,
        tema: row.topic,
        subtema: row.subtopic,
        prioridade: toBool(row.visible, true) ? 'ALTA' : 'RETIDA'
      });
    }
  }
  return { rows: out, visibleHigh: out.filter((row) => row.visible).length };
}

function findGenericComments(rows) {
  const patterns = [
    'A afirmativa esta de acordo com a resolucao.',
    'A norma disciplina dimensoes especificas.',
    'O item esta certo porque afirmou exatamente',
    'Na fiscalizacao, o PRF deve verificar essa exigencia de forma autonoma',
    'Cebraspe costuma cobrar'
  ];
  const out = [];
  for (const row of rows) {
    const text = normalize(row.teacher_comment);
    for (const pattern of patterns) {
      if (text.includes(normalize(pattern))) {
        out.push({
          id: row.id,
          external_id: row.external_id,
          visible: row.visible,
          resolucao: row.current_resolution,
          tema: row.topic,
          subtema: row.subtopic,
          trecho_generico_encontrado: pattern,
          severidade: toBool(row.visible, true) ? 'MEDIA' : 'RETIDA'
        });
      }
    }
  }
  return { rows: out };
}

function findMojibakeInRows(rows) {
  const out = [];
  const fields = ['statement', 'explanation', 'historical_explanation', 'beginner_explanation', 'trap_explanation', 'source_normative_reference', 'teacher_comment'];
  for (const row of rows) {
    for (const field of fields) {
      const text = clean(row[field]);
      const matches = MOJIBAKE_PATTERNS.filter((pattern) => text.includes(pattern));
      if (matches.length) out.push({ id: row.id, external_id: row.external_id, field, matches: matches.join('|'), snippet: truncate(text, 220) });
    }
  }
  return out;
}

function buildManifest(rows, startedAt, selected, validation, retainedRows) {
  const visible = rows.filter((row) => toBool(row.visible, true));
  return {
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    database: { source: selected.sourceName, url: selected.redactedConnectionString },
    total_questoes: rows.length,
    total_visiveis: visible.length,
    total_retidas: retainedRows.length,
    total_por_tipo: countBy(rows, 'question_type'),
    total_por_resolucao: countBy(rows, 'current_resolution'),
    oficiais_misturadas: rows.filter((row) => toBool(row.is_official) || toBool(row.official_exam)).length,
    validation,
    status_final: retainedRows.length ? 'V7_FINAL_APROVADO_COM_ITENS_RETIDOS' : 'V7_FINAL_APROVADO'
  };
}

function renderDiffReport(diff) {
  return `# Diff pos-V7 de campos alterados

- Campos alterados: ${diff.changed.length}
- Alteracoes indevidas em campos protegidos: ${diff.protectedChanges.length}

## Alteracoes por campo

${Object.entries(diff.changedByField).map(([field, total]) => `- ${field}: ${total}`).join('\n') || '- Nenhuma'}

## Campos protegidos

${diff.protectedChanges.length ? diff.protectedChanges.map((row) => `- ${row.id} ${row.external_id}: ${row.field}`).join('\n') : '- Nenhuma alteracao indevida em campo protegido.'}
`;
}

function renderRetainedReport(rows) {
  return `# Relatorio de questoes retidas V7 para revisao manual

- Total retidas: ${rows.length}
- Motivo: ${REVIEW_REASON}
- Acao: questoes preservadas no banco, historico preservado, visible=false, needs_manual_review=true.

${rows.map((row) => `- ${row.id} ${row.external_id} | ${row.current_resolution} | ${row.topic} / ${row.subtopic} | fundamento atual: ${row.source_normative_reference || row.article_reference}`).join('\n')}
`;
}

function renderParserReport(report) {
  return `# Relatorio parser CTB/CONTRAN pos-V7

- Status: ${report.ok ? 'OK' : 'PROBLEMA'}

${report.cases.map((item) => `- ${item.raw_reference}: ok=${item.ok}; law_rows=${item.law_rows}; bad_contran_rows=${item.bad_contran_rows}; pending_ok=${item.pending_ok}`).join('\n')}
`;
}

function renderAccordionReport(report) {
  return `# Relatorio accordion artigos pos-V7

- Status: ${report.ok ? 'OK' : 'PROBLEMA'}

${report.cases.map((item) => `- ${item.label}: ok=${item.ok}; linhas=${item.rows}; com_texto=${item.rows_with_text}`).join('\n')}
`;
}

function renderEncodingReport(rows) {
  return `# Relatorio encoding pos-V7

- Ocorrencias de mojibake: ${rows.length}

${rows.length ? rows.map((row) => `- ${row.id} ${row.external_id} ${row.field}: ${row.matches} | ${row.snippet}`).join('\n') : '- Nenhuma ocorrencia encontrada.'}
`;
}

function renderFinalReport(data) {
  const totalAfter = data.afterRows.length;
  const visibleAfter = data.afterRows.filter((row) => toBool(row.visible, true)).length;
  const status = data.retainedRows.length ? 'V7_FINAL_APROVADO_COM_ITENS_RETIDOS' : 'V7_FINAL_APROVADO';
  return `# RELATORIO FECHAMENTO DEFINITIVO CONTRAN PRF V7

- Status final: ${status}
- Banco: ${data.selected.sourceName} (${data.selected.redactedConnectionString})
- Data/hora: ${new Date().toISOString()}
- Total antes: ${data.beforeRows.length}
- Total depois: ${totalAfter}
- Total visiveis: ${visibleAfter}
- Total retidas: ${data.retainedRows.length}
- Total C/E: ${data.ce.total}
- Total multipla escolha: ${data.mc.total}
- C/E visiveis sem fundamento especifico: ${data.ce.visibleWithoutSpecificFoundation}
- Fundamentos corrigidos por substituicao normativa: 0
- Fundamentos nao resolvidos com seguranca: ${data.retainedRows.length}
- Itens retidos: ${data.retainedRows.length}
- Campos alterados: ${data.diff.changed.length}
- Alteracoes indevidas em campos protegidos: ${data.diff.protectedChanges.length}
- Historico/estatisticas preservados: sim
- Accordion: ${data.accordionReport.ok ? 'OK' : 'PROBLEMA'}
- Parser CTB/CONTRAN: ${data.parserReport.ok ? 'OK' : 'PROBLEMA'}
- Pendencia CTB art. 105: mantida como CTB/pending_ctb_full_text
- Encoding: ${data.encoding.length} ocorrencias
- Multipla escolha com problema: ${data.mc.problems}
- Recomendacao final: aprovado com itens retidos para revisao humana pontual.

## Justificativa da retencao

O pacote V7 nao trouxe patch normativo individual para os 132 itens. Para cumprir a regra de nao inventar artigo, paragrafo, inciso, anexo ou texto normativo, os itens sem fundamento especifico seguro foram preservados no banco e retirados da distribuicao automatica.

## Historico e estatisticas

Antes:
${data.beforeHistory.map((row) => `- ${row.table}: ${row.total}`).join('\n')}

Depois:
${data.afterHistory.map((row) => `- ${row.table}: ${row.total}`).join('\n')}

## Questões retidas

${data.retainedRows.map((row) => `- ${row.id} ${row.external_id} | ${row.current_resolution} | ${row.topic} / ${row.subtopic}`).join('\n')}

## Rollback

Os backups foram gerados antes da escrita:
- ${path.basename(OUTPUTS.backupJsonl)}
- ${path.basename(OUTPUTS.backupCsv)}
- ${path.basename(OUTPUTS.backupPedagogical)}
- ${path.basename(OUTPUTS.backupManifest)}

Para rollback pedagogico, restaurar os campos de ${path.basename(OUTPUTS.backupPedagogical)} por id/external_id. Nao houve alteracao em enunciado, alternativas, gabarito, historico ou estatisticas.
`;
}

function renderFailureReport(error) {
  return `# FALHA V7 - Fechamento definitivo CONTRAN PRF

- Erro: ${error.message}
- Rollback: executado quando havia transacao aberta.
- Validacao: ${JSON.stringify(error.validation || null, null, 2)}
`;
}

async function validateOutputFiles() {
  const result = [];
  for (const [key, file] of Object.entries(OUTPUTS)) {
    if (['abort', 'failure'].includes(key)) continue;
    const stat = await fs.stat(file);
    result.push({ file, bytes: stat.size, ok: stat.isFile() && stat.size > 0 });
  }
  return result;
}

function parseCsv(content) {
  const lines = content.trimEnd().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += char;
    }
  }
  out.push(cur);
  return out;
}

function buildCsv(rows, fields) {
  return [fields.map(csvCell).join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n') + '\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`;
}

function pick(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = clean(row[field]) || '(vazio)';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function hasSpecificFoundation(value) {
  return /(art\.?|arts\.?|anexo|§|inciso|,\s*[IVXLCDM]+\b|\b[IVXLCDM]+\s*-)/i.test(clean(value));
}

function normalizeAnswer(value) {
  const raw = normalize(value).toUpperCase();
  if (raw === 'C' || raw === 'CERTO') return 'CERTO';
  if (raw === 'E' || raw === 'ERRADO') return 'ERRADO';
  return clean(value).toUpperCase();
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
