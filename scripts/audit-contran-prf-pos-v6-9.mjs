#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const PREVIOUS_EXPORT = path.join(packageRoot, 'export_pos_v6_8_questoes_contran_prf.jsonl');
const WORKLIST_HIGH = path.join(packageRoot, 'v6_9_worklist_fundamentos_alta.jsonl');
const PREVIOUS_GENERIC_COMMENTS = path.join(packageRoot, 'comentarios_genericos_remanescentes_pos_v6_8.csv');
const PREVIOUS_GENERIC_FOUNDATIONS = path.join(packageRoot, 'fundamentos_genericos_pos_v6_8.csv');

const OUTPUTS = {
  jsonl: path.join(packageRoot, 'export_pos_v6_9_questoes_contran_prf.jsonl'),
  csv: path.join(packageRoot, 'export_pos_v6_9_questoes_contran_prf.csv'),
  manifest: path.join(packageRoot, 'manifest_export_pos_v6_9_questoes_contran_prf.json'),
  diff: path.join(packageRoot, 'diff_pos_v6_9_campos_alterados.md'),
  highFoundations: path.join(packageRoot, 'relatorio_validacao_34_fundamentos_alta_pos_v6_9.md'),
  accordion: path.join(packageRoot, 'relatorio_accordion_artigos_pos_v6_9.md'),
  missingArticles: path.join(packageRoot, 'missing_normative_articles_pos_v6_9.json'),
  genericComments: path.join(packageRoot, 'comentarios_genericos_remanescentes_pos_v6_9.csv'),
  genericFoundations: path.join(packageRoot, 'fundamentos_genericos_pos_v6_9.csv'),
  mc: path.join(packageRoot, 'validacao_multiplas_escolhas_pos_v6_9.csv'),
  ce: path.join(packageRoot, 'validacao_certo_errado_pos_v6_9.csv'),
  encoding: path.join(packageRoot, 'relatorio_encoding_mojibake_pos_v6_9.md'),
  final: path.join(packageRoot, 'RELATORIO_FINAL_POS_V6_9_QUESTOES_CONTRAN_PRF.md')
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

const GENERIC_COMMENT_PATTERNS = [
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
  'ExplicaÃ', 'questÃ', 'resoluÃ', 'fiscalizaÃ', 'aplicaÃ',
  'veÃ', 'direÃ', 'tolerÃ', 'Ã§', 'Ã£', 'Ã©', 'Ãª', 'Ã¡',
  'Ã³', 'Ãº', 'Ã­', 'Ã¢', 'Ã´', 'Â§', 'Âº', 'ï¿½'
];

const ACCORDION_CASES = [
  { label: 'Art. 2º, § 2º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '2', paragraph: '2', expectFound: true },
  { label: 'Art. 4º, I, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '4', item: 'I', expectFound: true },
  { label: 'Art. 6º, § 1º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '6', paragraph: '1', expectFound: true },
  { label: 'Art. 7º, § 4º, da Res. 798/2020', resolutionNumber: '798', resolutionYear: '2020', article: '7', paragraph: '4', expectFound: true },
  { label: 'Res. 432/2013 + CTB art. 165-A', rawReference: 'Res. 432/2013 e CTB art. 165-A.', lawArticle: '165-A', expectFound: true },
  { label: 'Res. 432/2013 + CTB art. 306', rawReference: 'Art. 1º da Res. 432/2013 e CTB art. 306.', lawArticle: '306', expectFound: true },
  { label: 'Res. 920/2022 + CTB art. 280, § 2º', rawReference: 'Res. 920/2022 e CTB art. 280, § 2º.', lawArticle: '280', lawParagraph: '2', expectFound: true },
  { label: 'Res. 993/2023 + CTB art. 105', rawReference: 'Res. 993/2023 e CTB art. 105.', lawArticle: '105', expectFound: false, pendingMessage: 'Texto integral do CTB art. 105 ainda nao cadastrado.' }
];

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const exportedAt = new Date().toISOString();
  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'audit-contran-prf-pos-v6-9'
  });

  let rows = [];
  let refs = [];
  let historyStats = [];
  let dbMojibake = [];
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    rows = await fetchRows(client);
    refs = await fetchReferences(client);
    historyStats = await fetchHistoryStats(client);
    dbMojibake = await findDatabaseMojibake(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const items = rows.map(mapRow);
  const previous = await loadJsonl(PREVIOUS_EXPORT);
  const worklist = await loadJsonl(WORKLIST_HIGH);
  const manifest = buildManifest(items, refs, exportedAt, selected);
  const diff = compareWithPrevious(items, previous);
  const highFoundations = validateHighFoundations(items, previous, worklist);
  const accordion = validateAccordion(refs);
  const missingArticles = buildMissingArticles(refs);
  const genericComments = findGenericComments(items);
  const genericFoundations = findGenericFoundations(items);
  const genericComparison = await buildGenericComparison(genericComments, genericFoundations);
  const mc = validateMultipleChoice(items, previous);
  const ce = validateTrueFalse(items);
  const fileMojibake = await findFileMojibake();
  const encoding = { db: dbMojibake, files: fileMojibake };
  const finalReport = buildFinalReport({
    exportedAt, manifest, diff, highFoundations, accordion,
    missingArticles, genericComments, genericFoundations,
    genericComparison, mc, ce, encoding, historyStats
  });

  await fs.writeFile(OUTPUTS.jsonl, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.csv, buildCsv(items, EXPORT_FIELDS), 'utf8');
  await fs.writeFile(OUTPUTS.manifest, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.diff, renderDiffReport(diff), 'utf8');
  await fs.writeFile(OUTPUTS.highFoundations, renderHighFoundationsReport(highFoundations), 'utf8');
  await fs.writeFile(OUTPUTS.accordion, renderAccordionReport(accordion), 'utf8');
  await fs.writeFile(OUTPUTS.missingArticles, JSON.stringify(missingArticles, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUTPUTS.genericComments, buildCsv(genericComments.rows, [
    'id', 'external_id', 'resolucao', 'tema', 'subtema', 'trecho_generico_encontrado',
    'comentario_completo', 'severidade', 'prioridade_alta', 'sugestao_de_revisao'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.genericFoundations, buildCsv(genericFoundations.rows, [
    'id', 'external_id', 'fundamento_atual', 'problema', 'resolucao', 'tema', 'subtema', 'prioridade'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.mc, buildCsv(mc.rows, [
    'id', 'external_id', 'gabarito', 'possui_A', 'possui_B', 'possui_C', 'possui_D', 'possui_E',
    'alternativa_correta_explica_como_correta', 'alternativas_inalteradas', 'inconsistencia_encontrada'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.ce, buildCsv(ce.rows, [
    'id', 'external_id', 'gabarito', 'gabarito_certo_errado_valido', 'possui_comentario',
    'possui_fundamento', 'possui_explicacao_iniciante', 'problema_encontrado'
  ]), 'utf8');
  await fs.writeFile(OUTPUTS.encoding, renderEncodingReport(encoding), 'utf8');
  await fs.writeFile(OUTPUTS.final, finalReport, 'utf8');

  const fileValidation = await validateOutputFiles();
  console.log(JSON.stringify({
    ok: true,
    modo: 'somente leitura no banco',
    banco: { fonte: selected.sourceName, url: selected.redactedConnectionString },
    total_exportado: items.length,
    total_por_tipo: manifest.total_por_tipo,
    fundamentos_alta: highFoundations.summary,
    accordion_ok: accordion.summary.ok,
    accordion_pendencias: accordion.summary.pending,
    comparacao_genericos: genericComparison,
    comentarios_genericos_remanescentes: genericComments.rows.length,
    fundamentos_genericos_remanescentes: genericFoundations.rows.length,
    problemas_encoding: encoding.db.length + encoding.files.length,
    arquivos: OUTPUTS,
    validacao_arquivos: fileValidation,
    aviso: 'A auditoria consultou o banco em transacao READ ONLY. Nenhuma questao, gabarito, resposta de usuario, historico ou estatistica foi alterado.'
  }, null, 2));
}

async function buildGenericComparison(genericComments, genericFoundations) {
  const previousComments = await countCsvRows(PREVIOUS_GENERIC_COMMENTS);
  const previousFoundations = await countCsvRows(PREVIOUS_GENERIC_FOUNDATIONS);
  return {
    comentarios: {
      arquivo_anterior: PREVIOUS_GENERIC_COMMENTS,
      total_anterior: previousComments,
      total_atual: genericComments.rows.length,
      reducao: previousComments - genericComments.rows.length,
      prioridade_alta_ou_critica_atual: genericComments.highPriority,
      estilo_medio_baixo_atual: genericComments.rows.length - genericComments.highPriority
    },
    fundamentos: {
      arquivo_anterior: PREVIOUS_GENERIC_FOUNDATIONS,
      total_anterior: previousFoundations,
      total_atual: genericFoundations.rows.length,
      reducao: previousFoundations - genericFoundations.rows.length,
      prioridade_alta_atual: genericFoundations.highPriority,
      estilo_medio_baixo_atual: genericFoundations.rows.length - genericFoundations.highPriority
    }
  };
}

async function countCsvRows(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return Math.max(0, content.trimEnd().split(/\r?\n/).length - 1);
  } catch {
    return 0;
  }
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
      cqr.question_id,
      cqr.external_id,
      COALESCE(cqr.reference_type, 'resolution') AS reference_type,
      COALESCE(cqr.law_name, '') AS law_name,
      COALESCE(cqr.law_number, '') AS law_number,
      COALESCE(cqr.law_year, '') AS law_year,
      cqr.resolution,
      cqr.resolution_number,
      cqr.resolution_year,
      cqr.article,
      cqr.paragraph,
      cqr.item,
      cqr.subitem,
      cqr.annex,
      cqr.raw_reference,
      cqr.display_order,
      cqr.needs_normative_reference_review,
      COALESCE(cqr.normative_article_id, cna_fallback.id) AS normative_article_id,
      COALESCE(NULLIF(cna.plain_text, ''), NULLIF(cna.full_text, ''), NULLIF(cna_fallback.plain_text, ''), cna_fallback.full_text, '') AS article_text,
      COALESCE(cna.title, cna_fallback.title, '') AS title
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
      AND COALESCE(cna_fallback.reference_type, 'resolution') = COALESCE(cqr.reference_type, 'resolution')
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
    out.push({ table, total_atual: count.rows[0]?.total || 0, observacao: 'Auditoria READ ONLY; nenhuma escrita feita nesta tabela.' });
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
  const typeCounts = countBy(items, 'tipo');
  return {
    total_questoes: items.length,
    total_por_tipo: typeCounts,
    total_por_resolucao: countBy(items, 'resolucao_atual'),
    total_por_tema: countBy(items, 'tema'),
    total_ativas: items.filter((item) => item.active).length,
    total_visiveis: items.filter((item) => item.visible).length,
    total_depreciadas: items.filter((item) => item.deprecated).length,
    total_oficiais_indevidamente_misturadas: officialMixed.length,
    total_referencias_estruturadas: refs.length,
    data_hora_exportacao: exportedAt,
    campos_encontrados: EXPORT_FIELDS.filter((field) => items.some((item) => hasValue(item[field]))),
    banco: { fonte: selected.sourceName, url: selected.redactedConnectionString },
    esperado: {
      total_questoes: 413,
      certo_errado: 324,
      multipla_escolha: 89,
      oficiais_misturadas: 0,
      ativas: 413,
      visiveis: 413,
      depreciadas: 0
    },
    validacao_esperado: {
      total_ok: items.length === 413,
      certo_errado_ok: (typeCounts.CERTO_ERRADO || 0) === 324,
      multipla_escolha_ok: (typeCounts.MULTIPLA_ESCOLHA || 0) === 89,
      oficiais_ok: officialMixed.length === 0,
      ativas_ok: items.filter((item) => item.active).length === 413,
      visiveis_ok: items.filter((item) => item.visible).length === 413,
      depreciadas_ok: items.filter((item) => item.deprecated).length === 0
    },
    criterio: 'contran_prf_unpublished_questions com is_unpublished=1 e marcadores PRF/CONTRAN/resolucao; sem dados pessoais, respostas de usuarios ou credenciais.'
  };
}

function compareWithPrevious(items, previousItems) {
  const previousById = new Map(previousItems.map((item) => [String(item.id), item]));
  const currentIds = new Set(items.map((item) => String(item.id)));
  const protectedChanges = [];
  const allowedChanges = [];
  const missingInPrevious = [];
  const previousOnly = [];
  for (const item of items) {
    const prev = previousById.get(String(item.id));
    if (!prev) {
      missingInPrevious.push(item.id);
      continue;
    }
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
    if (!currentIds.has(String(prev.id))) previousOnly.push(prev.id);
  }
  return {
    previous_file: PREVIOUS_EXPORT,
    total_atual: items.length,
    total_anterior: previousItems.length,
    total_comparado: items.length - missingInPrevious.length,
    campos_alterados_permitidos: allowedChanges,
    campos_alterados_indevidamente: protectedChanges,
    ausentes_no_export_anterior: missingInPrevious,
    presentes_so_no_export_anterior: previousOnly
  };
}

function validateHighFoundations(items, previousItems, worklist) {
  const currentByExternal = new Map(items.map((item) => [item.external_id, item]));
  const previousByExternal = new Map(previousItems.map((item) => [item.external_id, item]));
  const rows = worklist.map((entry) => {
    const externalId = clean(entry.external_id);
    const current = currentByExternal.get(externalId);
    const previous = previousByExternal.get(externalId);
    if (!current) {
      return {
        external_id: externalId,
        status: 'nao encontrado',
        fundamento_antes: clean(previous?.fundamento_normativo),
        fundamento_depois: '',
        comentario_mais_especifico: false,
        possui_dispositivo_especifico: false
      };
    }
    const beforeFoundation = clean(previous?.fundamento_normativo || entry.fundamento_normativo);
    const afterFoundation = clean(current.fundamento_normativo);
    const currentText = `${current.teacher_comment}\n${current.beginner_explanation}\n${current.trap_explanation}\n${afterFoundation}`;
    const beforeText = `${previous?.teacher_comment || entry.teacher_comment || ''}\n${beforeFoundation}`;
    const moreSpecific = specificityScore(currentText) > specificityScore(beforeText);
    const specificDevice = hasSpecificDevice(afterFoundation);
    const status = afterFoundation && specificDevice && (moreSpecific || stableValue(afterFoundation) !== stableValue(beforeFoundation))
      ? 'corrigido'
      : 'pendente';
    return {
      id: current.id,
      external_id: externalId,
      fundamento_antes: beforeFoundation,
      fundamento_depois: afterFoundation,
      status,
      comentario_mais_especifico: moreSpecific,
      possui_dispositivo_especifico: specificDevice,
      artigo_paragrafo_inciso_anexo: extractDeviceSummary(afterFoundation),
      patch_version: current.pedagogical_patch_version
    };
  });
  return {
    rows,
    summary: {
      total_worklist: worklist.length,
      corrigido: rows.filter((row) => row.status === 'corrigido').length,
      pendente: rows.filter((row) => row.status === 'pendente').length,
      nao_encontrado: rows.filter((row) => row.status === 'nao encontrado').length,
      pendentes_criticos: rows.filter((row) => row.status !== 'corrigido').length
    }
  };
}

function validateAccordion(refs) {
  const cases = ACCORDION_CASES.map((test) => {
    if (test.rawReference) {
      const rows = refs.filter((ref) => clean(ref.raw_reference) === test.rawReference);
      const lawRows = rows.filter((ref) =>
        clean(ref.reference_type) === 'law'
        && clean(ref.resolution_number) === '9503'
        && clean(ref.article) === test.lawArticle
        && (!test.lawParagraph || clean(ref.paragraph) === test.lawParagraph)
      );
      const badContranRows = rows.filter((ref) =>
        clean(ref.reference_type) !== 'law'
        && ['165-A', '165', '306', '280', '105'].includes(clean(ref.article))
        && clean(ref.resolution_number) !== '9503'
      );
      const hasText = lawRows.some((ref) => clean(ref.article_text));
      const pendingOk = !test.expectFound
        && lawRows.length > 0
        && lawRows.every((ref) => !clean(ref.article_text) && toBool(ref.needs_normative_reference_review));
      return {
        caso: test.label,
        ok: test.expectFound ? hasText && badContranRows.length === 0 : pendingOk && badContranRows.length === 0,
        source_type: 'CTB',
        status: test.expectFound ? (hasText ? 'included_full' : 'missing_full_text') : (pendingOk ? 'pending_ctb_full_text' : 'problem'),
        raw_reference: test.rawReference,
        law_rows: lawRows.map(refSummary),
        parser_confunde_ctb_com_contran: badContranRows.length > 0,
        mensagem_esperada: test.pendingMessage || ''
      };
    }
    const rows = refs.filter((ref) =>
      clean(ref.resolution_number) === test.resolutionNumber
      && clean(ref.resolution_year) === test.resolutionYear
      && clean(ref.article) === test.article
      && clean(ref.paragraph) === clean(test.paragraph)
      && clean(ref.item) === clean(test.item)
    );
    const found = rows.some((ref) => clean(ref.article_text));
    return {
      caso: test.label,
      ok: found === test.expectFound,
      status: found ? 'included_full' : 'missing_full_text',
      references: rows.map(refSummary)
    };
  });
  return {
    cases,
    summary: {
      total: cases.length,
      ok: cases.filter((item) => item.ok).length,
      pending: cases.filter((item) => item.status.includes('pending')).length,
      problems: cases.filter((item) => !item.ok).length
    }
  };
}

function buildMissingArticles(refs) {
  return refs
    .filter((ref) => !clean(ref.article_text))
    .map((ref) => ({
      question_id: ref.question_id,
      external_id: ref.external_id,
      source_type: clean(ref.reference_type) === 'law' || clean(ref.resolution_number) === '9503' ? 'CTB' : 'CONTRAN',
      status: clean(ref.reference_type) === 'law' || clean(ref.resolution_number) === '9503' ? 'pending_ctb_full_text' : 'pending_contran_full_text',
      raw_reference: clean(ref.raw_reference),
      resolution: clean(ref.resolution),
      resolution_number: clean(ref.resolution_number),
      resolution_year: clean(ref.resolution_year),
      article: clean(ref.article),
      paragraph: clean(ref.paragraph),
      item: clean(ref.item)
    }));
}

function findGenericComments(items) {
  const rows = [];
  for (const item of items) {
    const comment = clean(item.teacher_comment);
    const normalized = normalize(comment);
    for (const phrase of GENERIC_COMMENT_PATTERNS) {
      if (!normalized.includes(normalize(phrase))) continue;
      const severity = classifyGenericSeverity(item, comment);
      rows.push({
        id: item.id,
        external_id: item.external_id,
        resolucao: item.resolucao_atual,
        tema: item.tema,
        subtema: item.subtema,
        trecho_generico_encontrado: phrase,
        comentario_completo: comment,
        severidade: severity,
        prioridade_alta: severity === 'CRITICA' || severity === 'ALTA',
        sugestao_de_revisao: 'Revisar manualmente se ainda houver falta de regra concreta, valor, prazo, percentual ou fundamento especifico.'
      });
    }
  }
  return { rows, bySeverity: countBy(rows, 'severidade'), highPriority: rows.filter((row) => row.prioridade_alta).length };
}

function findGenericFoundations(items) {
  const rows = [];
  for (const item of items) {
    const foundation = clean(item.fundamento_normativo);
    const norm = normalize(foundation);
    const problems = [];
    if (!foundation) problems.push('fundamento vazio');
    if (/^(res\.?|resolucao)\s/i.test(norm) && !/(art|anexo)/i.test(norm)) problems.push('referencia apenas a resolucao');
    if (/(regras da|dispositivos da|resolucao aplicavel|fundamento: regras|mbft aprovado)/i.test(norm)) problems.push('fundamento generico');
    if (!hasSpecificDevice(foundation)) problems.push('sem artigo/anexo/paragrafo/inciso especifico');
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
  return { rows, byPriority: countBy(rows, 'prioridade'), highPriority: rows.filter((row) => row.prioridade === 'ALTA').length };
}

function validateMultipleChoice(items, previousItems) {
  const previousById = new Map(previousItems.map((item) => [String(item.id), item]));
  const rows = items.filter((item) => item.tipo === 'MULTIPLA_ESCOLHA').map((item) => {
    const text = item.teacher_comment || item.explanation || '';
    const answer = clean(item.gabarito).toUpperCase();
    const flags = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter) => [letter, new RegExp(`(^|\\n|\\s)${letter}\\)`, 'i').test(text)]));
    const correctOk = new RegExp(`(^|\\n|\\s)${answer}\\)\\s*(Certa|Correta|Certo|Gabarito)`, 'i').test(text);
    const prev = previousById.get(String(item.id));
    const alternativesUnchanged = prev ? stableValue(item.alternatives) === stableValue(prev.alternatives) : true;
    const problems = [];
    for (const letter of ['A', 'B', 'C', 'D', 'E']) if (!flags[letter]) problems.push(`sem explicacao ${letter})`);
    if (!correctOk) problems.push('alternativa correta nao marcada como certa/correta');
    if (!alternativesUnchanged) problems.push('alternativas alteradas');
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
      alternativas_inalteradas: alternativesUnchanged,
      inconsistencia_encontrada: problems.join(' | ')
    };
  });
  return { rows, total: rows.length, problemas: rows.filter((row) => row.inconsistencia_encontrada).length };
}

function validateTrueFalse(items) {
  const rows = items.filter((item) => item.tipo === 'CERTO_ERRADO').map((item) => {
    const answer = normalizeAnswer(item.gabarito);
    const problems = [];
    if (!['CERTO', 'ERRADO'].includes(answer)) problems.push('gabarito nao e CERTO/ERRADO');
    if (!clean(item.teacher_comment)) problems.push('sem comentario');
    if (!hasSpecificDevice(item.fundamento_normativo)) problems.push('sem fundamento especifico');
    if (!clean(item.beginner_explanation)) problems.push('sem explicacao para iniciante');
    return {
      id: item.id,
      external_id: item.external_id,
      gabarito: answer,
      gabarito_certo_errado_valido: ['CERTO', 'ERRADO'].includes(answer),
      possui_comentario: Boolean(clean(item.teacher_comment)),
      possui_fundamento: hasSpecificDevice(item.fundamento_normativo),
      possui_explicacao_iniciante: Boolean(clean(item.beginner_explanation)),
      problema_encontrado: problems.join(' | ')
    };
  });
  return { rows, total: rows.length, problemas: rows.filter((row) => row.problema_encontrado).length };
}

async function findDatabaseMojibake(client) {
  const result = await client.query(`
    SELECT question_id, external_id, statement, explanation, teacher_comment,
           beginner_explanation, trap_explanation, source_normative_reference
    FROM contran_prf_unpublished_questions
    WHERE COALESCE(is_unpublished, 0) = 1
  `);
  const rows = [];
  for (const row of result.rows) {
    for (const field of ['statement', 'explanation', 'teacher_comment', 'beginner_explanation', 'trap_explanation', 'source_normative_reference']) {
      const value = clean(row[field]);
      const found = findMojibake(value);
      if (found.length) {
        rows.push({
          local: 'postgres.contran_prf_unpublished_questions',
          id: row.question_id,
          external_id: row.external_id,
          campo: field,
          padroes: found,
          texto_quebrado: truncate(value, 500),
          status: 'pendente'
        });
      }
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
      content.split(/\r?\n/).forEach((line, index) => {
        const found = findMojibake(line);
        if (found.length) {
          rows.push({
            local: file,
            linha: index + 1,
            campo: 'arquivo',
            padroes: found,
            texto_quebrado: truncate(line, 500),
            status: 'pendente'
          });
        }
      });
    } catch {
      // Outputs may not exist before this audit writes them.
    }
  }
  return rows;
}

function renderDiffReport(diff) {
  const allowedCounts = countBy(diff.campos_alterados_permitidos, 'field');
  return `# Diff pos-V6.9 de campos alterados

- Export anterior: ${diff.previous_file}
- Total atual: ${diff.total_atual}
- Total anterior: ${diff.total_anterior}
- Total comparado: ${diff.total_comparado}
- Campos alterados permitidos: ${diff.campos_alterados_permitidos.length}
- Campos alterados indevidamente: ${diff.campos_alterados_indevidamente.length}

## Campos permitidos alterados

${Object.entries(allowedCounts).map(([field, total]) => `- ${field}: ${total}`).join('\n') || '- Nenhum'}

## Alteracoes indevidas em campos protegidos

${diff.campos_alterados_indevidamente.length ? diff.campos_alterados_indevidamente.map((item) => `- ${item.id} ${item.external_id}: ${item.field}`).join('\n') : '- Nenhuma alteracao indevida em campos protegidos.'}

## Historico e estatisticas

A auditoria foi executada em transacao READ ONLY e nao escreveu em tabelas de respostas, dominio, estatisticas ou historico.
`;
}

function renderHighFoundationsReport(report) {
  return `# Validacao dos 34 fundamentos de prioridade alta pos-V6.9

- Total na worklist: ${report.summary.total_worklist}
- Corrigidos: ${report.summary.corrigido}
- Pendentes: ${report.summary.pendente}
- Nao encontrados: ${report.summary.nao_encontrado}
- Pendentes criticos: ${report.summary.pendentes_criticos}

${report.rows.map((row) => `## ${row.external_id}

- Status: ${row.status}
- ID: ${row.id || ''}
- Comentario ficou mais especifico: ${row.comentario_mais_especifico ? 'sim' : 'nao'}
- Possui artigo/paragrafo/inciso/anexo quando cabivel: ${row.possui_dispositivo_especifico ? 'sim' : 'nao'}
- Dispositivos: ${row.artigo_paragrafo_inciso_anexo || ''}
- Fundamento antes: ${row.fundamento_antes || ''}
- Fundamento depois: ${row.fundamento_depois || ''}
`).join('\n')}
`;
}

function renderAccordionReport(report) {
  return `# Relatorio do accordion de artigos pos-V6.9

- Casos auditados: ${report.summary.total}
- OK: ${report.summary.ok}
- Pendencias classificadas: ${report.summary.pending}
- Problemas: ${report.summary.problems}

${report.cases.map((item) => `## ${item.caso}

- Status: ${item.status}
- OK: ${item.ok ? 'sim' : 'nao'}
- Source type: ${item.source_type || 'CONTRAN'}
- Parser confunde CTB com CONTRAN: ${item.parser_confunde_ctb_com_contran ? 'sim' : 'nao'}
- Referencia curta: ${item.raw_reference || ''}
- Mensagem esperada: ${item.mensagem_esperada || ''}
- Linhas: ${JSON.stringify(item.law_rows || item.references || [])}
`).join('\n')}
`;
}

function renderEncodingReport(encoding) {
  const rows = [...encoding.db, ...encoding.files];
  return `# Relatorio de encoding/mojibake pos-V6.9

- Ocorrencias no banco: ${encoding.db.length}
- Ocorrencias em arquivos/export: ${encoding.files.length}
- Total: ${rows.length}

## Termos verificados

- Explicacao
- questao
- resolucao
- fiscalizacao
- aplicacao
- veiculo
- direcao
- tolerancia

## Locais encontrados

${rows.length ? rows.map((row) => `- ${row.local}${row.linha ? `:${row.linha}` : ''} ${row.external_id || ''} ${row.campo}: ${row.status}. Padroes=${(row.padroes || []).join('|')}. Trecho: ${row.texto_quebrado}`).join('\n') : '- Nenhuma ocorrencia encontrada.'}
`;
}

function buildFinalReport(data) {
  const expectedOk = Object.values(data.manifest.validacao_esperado).every(Boolean);
  const protectedOk = data.diff.campos_alterados_indevidamente.length === 0;
  const highOk = data.highFoundations.summary.corrigido === 34 && data.highFoundations.summary.pendentes_criticos === 0;
  const accordionOk = data.accordion.summary.problems === 0;
  const encodingOk = data.encoding.db.length + data.encoding.files.length === 0;
  const mcOk = data.mc.total === 89 && data.mc.problemas === 0;
  const ceOk = data.ce.total === 324 && data.ce.problemas === 0;
  const recommendation = expectedOk && protectedOk && highOk && accordionOk && encodingOk && mcOk && ceOk
    ? 'aprovado'
    : protectedOk && expectedOk && highOk && accordionOk
      ? 'aprovado com ressalvas'
      : 'nao aprovado';

  return `# RELATORIO FINAL POS-V6.9 - QUESTOES CONTRAN PRF

- Status geral: ${recommendation.toUpperCase()}
- Data/hora: ${data.exportedAt}
- Total de questoes auditadas: ${data.manifest.total_questoes}
- Total por tipo: ${JSON.stringify(data.manifest.total_por_tipo)}
- Total por resolucao: ${JSON.stringify(data.manifest.total_por_resolucao)}
- Oficiais misturadas indevidamente: ${data.manifest.total_oficiais_indevidamente_misturadas}
- Ativas: ${data.manifest.total_ativas}
- Visiveis: ${data.manifest.total_visiveis}
- Depreciadas: ${data.manifest.total_depreciadas}

## Status dos 34 fundamentos de prioridade alta

- Corrigidos: ${data.highFoundations.summary.corrigido}
- Pendentes: ${data.highFoundations.summary.pendente}
- Nao encontrados: ${data.highFoundations.summary.nao_encontrado}
- Pendentes criticos: ${data.highFoundations.summary.pendentes_criticos}

## Accordion e CTB

- Casos OK: ${data.accordion.summary.ok}/${data.accordion.summary.total}
- Problemas: ${data.accordion.summary.problems}
- Pendencias CTB classificadas: ${data.missingArticles.filter((row) => row.source_type === 'CTB').length}
- CTB art. 105: ${data.accordion.cases.find((item) => item.caso.includes('CTB art. 105'))?.status || 'nao auditado'}

## Genericos remanescentes

- Comentarios genericos remanescentes: ${data.genericComments.rows.length}
- Comentarios genericos V6.8: ${data.genericComparison.comentarios.total_anterior}
- Reducao de comentarios genericos: ${data.genericComparison.comentarios.reducao}
- Comentarios prioridade alta/critica: ${data.genericComments.highPriority}
- Comentarios apenas estilo medio/baixo: ${data.genericComparison.comentarios.estilo_medio_baixo_atual}
- Fundamentos genericos remanescentes: ${data.genericFoundations.rows.length}
- Fundamentos genericos V6.8: ${data.genericComparison.fundamentos.total_anterior}
- Reducao de fundamentos genericos: ${data.genericComparison.fundamentos.reducao}
- Fundamentos prioridade alta: ${data.genericFoundations.highPriority}
- Fundamentos apenas estilo medio/baixo: ${data.genericComparison.fundamentos.estilo_medio_baixo_atual}

## Validacoes por tipo

- Multipla escolha: ${data.mc.total} auditadas; ${data.mc.problemas} com problema.
- Certo/Errado: ${data.ce.total} auditadas; ${data.ce.problemas} com problema.

## Encoding

- Problemas de encoding/mojibake: ${data.encoding.db.length + data.encoding.files.length}

## Campos protegidos

- Alteracoes indevidas: ${data.diff.campos_alterados_indevidamente.length}
- Campos pedagogicos/referencias alterados permitidos: ${data.diff.campos_alterados_permitidos.length}

## Historico e estatisticas

${data.historyStats.map((row) => `- ${row.table}: ${row.total_atual} registros atuais. ${row.observacao}`).join('\n') || '- Nenhuma tabela de historico/estatistica localizada.'}

## Recomendacao final

${recommendation}

## Arquivos gerados

${Object.values(OUTPUTS).map((file) => `- ${path.basename(file)}`).join('\n')}
`;
}

async function loadJsonl(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return content.trimEnd().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function validateOutputFiles() {
  const result = [];
  for (const file of Object.values(OUTPUTS)) {
    const stat = await fs.stat(file);
    result.push({ file, bytes: stat.size, ok: stat.isFile() && stat.size > 0 });
  }
  return result;
}

function buildCsv(rows, fields) {
  return [fields.map(csvCell).join(','), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\n') + '\n';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/\r?\n/g, ' ').replaceAll('"', '""')}"`;
}

function refSummary(ref) {
  return {
    question_id: ref.question_id,
    external_id: ref.external_id,
    type: clean(ref.reference_type),
    resolution_number: clean(ref.resolution_number),
    article: clean(ref.article),
    paragraph: clean(ref.paragraph),
    item: clean(ref.item),
    found: Boolean(clean(ref.article_text)),
    needs_review: toBool(ref.needs_normative_reference_review)
  };
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const key = clean(row[field]) || '(vazio)';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function classifyGenericSeverity(item, comment) {
  const text = `${comment}\n${item.fundamento_normativo}`;
  const hasRuleToken = /(\d|%|art\.|§|inciso|anexo|res\.)/i.test(text);
  if (!hasRuleToken) return 'CRITICA';
  if (requiresExactNumber(item) && !/(\d|%)/.test(comment)) return 'ALTA';
  if (/afirmou exatamente|verificar essa exigencia|cebraspe costuma/i.test(normalize(comment))) return 'MEDIA';
  return 'BAIXA';
}

function requiresExactNumber(item) {
  return /(tolerancia|prazo|tempo|direcao|velocidade|alcool|peso|dimens)/i.test(normalize(`${item.tema} ${item.subtema} ${item.statement}`));
}

function hasSpecificDevice(value) {
  return /(art\.?|arts\.?|anexo|§|inciso|,\s*[IVXLCDM]+\b|\b[IVXLCDM]+\s*-)/i.test(clean(value));
}

function extractDeviceSummary(value) {
  const text = clean(value);
  const matches = text.match(/(art\.?\s*\d+[A-Z-]*|arts\.?\s*[\d,\seA-Z-]+|§\s*\d+º?|inciso\s+[IVXLCDM]+|anexo\s+[IVXLCDM]+|,\s*[IVXLCDM]+\b)/gi);
  return matches ? [...new Set(matches)].join('; ') : '';
}

function specificityScore(value) {
  const text = clean(value);
  let score = 0;
  score += (text.match(/\d+/g) || []).length;
  score += (text.match(/art\.?/gi) || []).length * 3;
  score += (text.match(/§/g) || []).length * 3;
  score += (text.match(/inciso|anexo/gi) || []).length * 2;
  score += (text.match(/%|dias?|horas?|minutos?|kg|mg|metro|eixo|PBT|PBTC/gi) || []).length * 2;
  return score;
}

function normalizeAnswer(value) {
  const answer = normalize(value).toUpperCase();
  if (answer === 'C' || answer === 'CERTO') return 'CERTO';
  if (answer === 'E' || answer === 'ERRADO') return 'ERRADO';
  return clean(value).toUpperCase();
}

function findMojibake(value) {
  return MOJIBAKE_PATTERNS.filter((pattern) => clean(value).includes(pattern));
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
