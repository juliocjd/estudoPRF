import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_JSON = path.join(ROOT_DIR, 'data', 'comentarios_normativos_atualizados_professor_v3_seed.json');
const VALID_STATUS = new Set(['ready', 'needs_manual_review', 'discard']);
const VALID_POLICY = new Set(['current_law_probable', 'not_assertive_manual_review', 'discard_original']);
const VALID_ARTICLE_EXACTNESS = new Set(['exact', 'topic_safe', 'topic_only', 'manual']);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = normalizeDatabaseUrl(args['database-url'] || args.db || process.env.DATABASE_URL);
  const jsonPath = path.resolve(ROOT_DIR, args.json || DEFAULT_JSON);
  const dryRun = Boolean(args['dry-run']);
  const overwrite = args.overwrite !== false;
  const limit = args.limit ? Math.max(1, Number(args.limit)) : 0;

  if (!databaseUrl && !dryRun) {
    console.error('Defina DATABASE_URL ou passe --db para importar no Postgres.');
    process.exit(1);
  }

  const report = await importNormativeTeachingCommentsV3({
    databaseUrl,
    jsonPath,
    dryRun,
    overwrite,
    limit
  });
  console.log(renderReport(report));
}

export async function importNormativeTeachingCommentsV3({ databaseUrl, jsonPath = DEFAULT_JSON, dryRun = false, overwrite = true, limit = 0 }) {
  const seed = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
  const items = Array.isArray(seed.items) ? seed.items : [];
  if (!items.length) {
    throw new Error('JSON seed v3 sem array items.');
  }

  const selectedItems = limit ? items.slice(0, limit) : items;
  const report = {
    jsonPath,
    dryRun,
    overwrite,
    totalInFile: items.length,
    totalSelected: selectedItems.length,
    foundInDatabase: 0,
    notFound: 0,
    inserted: 0,
    updated: 0,
    skippedExisting: 0,
    byStatus: {},
    byArticleExactness: {},
    missingQuestionIds: [],
    errors: []
  };

  if (dryRun && !databaseUrl) {
    for (const item of selectedItems) {
      const normalized = normalizeSeedItem(item, seed);
      addCount(report.byStatus, normalized.status);
      addCount(report.byArticleExactness, normalized.articleExactness || 'sem_fundamento');
    }
    return report;
  }

  const sql = postgres(normalizeDatabaseUrl(databaseUrl), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  try {
    await assertReady(sql);

    for (const item of selectedItems) {
      try {
        const normalized = normalizeSeedItem(item, seed);
        addCount(report.byStatus, normalized.status);
        addCount(report.byArticleExactness, normalized.articleExactness || 'sem_fundamento');

        const questionExists = await sql`
          SELECT 1 AS ok
          FROM questions
          WHERE id_question = ${normalized.questionId}
          LIMIT 1
        `;
        if (!questionExists[0]) {
          report.notFound += 1;
          if (report.missingQuestionIds.length < 30) report.missingQuestionIds.push(normalized.questionId);
          continue;
        }
        report.foundInDatabase += 1;

        const existing = await sql`
          SELECT question_id
          FROM question_normative_teaching_comments
          WHERE question_id = ${normalized.questionId}
          LIMIT 1
        `;
        if (existing[0] && !overwrite) {
          report.skippedExisting += 1;
          continue;
        }

        if (dryRun) {
          if (existing[0]) report.updated += 1;
          else report.inserted += 1;
          continue;
        }

        await upsert(sql, normalized);
        if (existing[0]) report.updated += 1;
        else report.inserted += 1;
      } catch (error) {
        report.errors.push({
          questionId: item?.question_id || null,
          error: error.message || String(error)
        });
      }
    }

    return report;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function assertReady(sql) {
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('questions', 'question_normative_teaching_comments')
  `;
  const tables = new Set(rows.map((row) => row.table_name));
  if (!tables.has('questions')) throw new Error('Tabela questions nao encontrada.');
  if (!tables.has('question_normative_teaching_comments')) {
    throw new Error('Tabela question_normative_teaching_comments nao encontrada. Rode pg:migrate-normative-teaching-v3 primeiro.');
  }
}

function normalizeSeedItem(item, seed) {
  const questionId = Number(item?.question_id || item?.question?.id || 0);
  if (!questionId) throw new Error('Item sem question_id valido.');

  const status = validChoice(item.status, VALID_STATUS, 'needs_manual_review');
  const answerPolicy = validChoice(item.answer_policy, VALID_POLICY, status === 'discard' ? 'discard_original' : 'not_assertive_manual_review');
  const articleExactness = validChoice(item.article_exactness, VALID_ARTICLE_EXACTNESS, 'manual');

  return {
    questionId,
    displayVersion: clean(item.display_version) || 'professor-v3-2026-06-01',
    sourceVersion: clean(item.source_version) || 'normative-teaching-professor-v3-2026-06-01',
    status,
    generationStatus: clean(item.generation_status) || (status === 'ready' ? 'ready_for_import' : status),
    reviewStatus: clean(item.review_status) || (status === 'ready' ? 'pending' : status),
    currentAnswer: clean(item.current_answer) || null,
    currentAnswerRaw: clean(item.current_answer_raw) || null,
    currentAnswerConfidence: numericOrNull(item.current_answer_confidence),
    answerPolicy,
    historicalAnswer: clean(item.historical_answer) || null,
    mainLegalBasis: clean(item.main_legal_basis) || null,
    legalArticleReference: clean(item.legal_article_reference) || null,
    legalArticleExcerpt: clean(item.legal_article_excerpt) || null,
    articleExactness,
    shortExplanationMd: clean(item.short_explanation_md) || '',
    currentRuleSummaryMd: clean(item.current_rule_summary_md) || '',
    professorComplementMd: clean(item.professor_complement_md) || '',
    studyConclusionMd: clean(item.study_conclusion_md) || '',
    teachingCommentMd: clean(item.teaching_comment_md) || '',
    teachingCommentHtml: clean(item.teaching_comment_html) || '',
    technicalDetailsJson: item.technical_details_json && typeof item.technical_details_json === 'object' ? item.technical_details_json : {},
    generatedBy: clean(item.generated_by) || 'professor-v3-seed',
    generatedAt: item.generated_at || seed.created_at || null,
    rawJson: item
  };
}

async function upsert(sql, item) {
  const compatibility = compatibilityFields(item);
  await sql`
    INSERT INTO question_normative_teaching_comments (
      question_id,
      display_version,
      source_version,
      status,
      generation_status,
      review_status,
      current_answer,
      current_answer_raw,
      current_answer_confidence,
      answer_policy,
      historical_answer,
      historical_answer_raw,
      changed_answer,
      main_legal_basis,
      legal_article_reference,
      legal_article_excerpt,
      article_exactness,
      short_explanation_md,
      current_rule_summary_md,
      professor_complement_md,
      study_conclusion_md,
      teaching_comment_md,
      teaching_comment_html,
      technical_details_json,
      generated_by,
      generated_at,
      generation_method,
      safety_level,
      recommendation,
      adaptation_status,
      study_recommendation,
      title,
      legal_basis,
      current_rule_summary,
      why_outdated,
      literal_statement_note,
      source_base,
      alternatives_analysis,
      raw_json,
      updated_at
    )
    VALUES (
      ${item.questionId},
      ${item.displayVersion},
      ${item.sourceVersion},
      ${item.status},
      ${item.generationStatus},
      ${item.reviewStatus},
      ${item.currentAnswer},
      ${item.currentAnswerRaw},
      ${item.currentAnswerConfidence},
      ${item.answerPolicy},
      ${item.historicalAnswer},
      ${item.historicalAnswer},
      ${compatibility.changedAnswer},
      ${item.mainLegalBasis},
      ${item.legalArticleReference},
      ${item.legalArticleExcerpt},
      ${item.articleExactness},
      ${item.shortExplanationMd},
      ${item.currentRuleSummaryMd},
      ${item.professorComplementMd},
      ${item.studyConclusionMd},
      ${item.teachingCommentMd},
      ${item.teachingCommentHtml},
      ${sql.json(item.technicalDetailsJson)},
      ${item.generatedBy},
      ${item.generatedAt},
      'professor_v3_seed_import',
      ${compatibility.safetyLevel},
      ${compatibility.recommendation},
      ${compatibility.adaptationStatus},
      ${compatibility.studyRecommendation},
      'Comentario atualizado',
      ${item.legalArticleReference || item.mainLegalBasis},
      ${item.currentRuleSummaryMd},
      ${compatibility.whyOutdated},
      ${compatibility.literalStatementNote},
      ${compatibility.sourceBase},
      ${sql.json({})},
      ${sql.json(item.rawJson)},
      NOW()
    )
    ON CONFLICT (question_id) DO UPDATE SET
      display_version = EXCLUDED.display_version,
      source_version = EXCLUDED.source_version,
      status = EXCLUDED.status,
      generation_status = EXCLUDED.generation_status,
      review_status = EXCLUDED.review_status,
      current_answer = EXCLUDED.current_answer,
      current_answer_raw = EXCLUDED.current_answer_raw,
      current_answer_confidence = EXCLUDED.current_answer_confidence,
      answer_policy = EXCLUDED.answer_policy,
      historical_answer = EXCLUDED.historical_answer,
      historical_answer_raw = EXCLUDED.historical_answer_raw,
      changed_answer = EXCLUDED.changed_answer,
      main_legal_basis = EXCLUDED.main_legal_basis,
      legal_article_reference = EXCLUDED.legal_article_reference,
      legal_article_excerpt = EXCLUDED.legal_article_excerpt,
      article_exactness = EXCLUDED.article_exactness,
      short_explanation_md = EXCLUDED.short_explanation_md,
      current_rule_summary_md = EXCLUDED.current_rule_summary_md,
      professor_complement_md = EXCLUDED.professor_complement_md,
      study_conclusion_md = EXCLUDED.study_conclusion_md,
      teaching_comment_md = EXCLUDED.teaching_comment_md,
      teaching_comment_html = EXCLUDED.teaching_comment_html,
      technical_details_json = EXCLUDED.technical_details_json,
      generated_by = EXCLUDED.generated_by,
      generated_at = EXCLUDED.generated_at,
      generation_method = EXCLUDED.generation_method,
      safety_level = EXCLUDED.safety_level,
      recommendation = EXCLUDED.recommendation,
      adaptation_status = EXCLUDED.adaptation_status,
      study_recommendation = EXCLUDED.study_recommendation,
      title = EXCLUDED.title,
      legal_basis = EXCLUDED.legal_basis,
      current_rule_summary = EXCLUDED.current_rule_summary,
      why_outdated = EXCLUDED.why_outdated,
      literal_statement_note = EXCLUDED.literal_statement_note,
      source_base = EXCLUDED.source_base,
      alternatives_analysis = EXCLUDED.alternatives_analysis,
      raw_json = EXCLUDED.raw_json,
      updated_at = NOW()
  `;
}

function compatibilityFields(item) {
  const details = item.technicalDetailsJson || {};
  const normative = details.normative_update || {};
  const changedAnswer = clean(normative.mudanca_gabarito || normative.changed_answer);
  return {
    changedAnswer,
    safetyLevel: clean(normative.nivel_seguranca || normative.safety_level),
    recommendation: clean(normative.recomendacao || normative.recommendation),
    adaptationStatus: item.status === 'discard'
      ? 'discard'
      : item.status === 'needs_manual_review'
        ? 'manual_review'
        : 'adapt_legal_reference',
    studyRecommendation: item.status === 'discard'
      ? 'discard'
      : item.status === 'needs_manual_review'
        ? 'manual_review'
        : 'study_with_warning',
    whyOutdated: clean(normative.por_que_desatualizada || normative.why_outdated),
    literalStatementNote: clean(normative.observacao_enunciado_literal || normative.literal_statement_note),
    sourceBase: clean(normative.fonte_base || normative.source_base || item.mainLegalBasis)
  };
}

function renderReport(report) {
  return [
    '# Importacao de comentarios atualizados professor v3',
    '',
    `Arquivo: ${report.jsonPath}`,
    `Itens no seed: ${report.totalInFile}`,
    `Processados: ${report.totalSelected}`,
    `Encontrados no banco: ${report.foundInDatabase}`,
    `Nao encontrados no banco: ${report.notFound}`,
    `Inseridos: ${report.inserted}`,
    `Atualizados: ${report.updated}`,
    `Existentes pulados: ${report.skippedExisting}`,
    `Dry-run: ${report.dryRun ? 'sim' : 'nao'}`,
    `Overwrite: ${report.overwrite ? 'sim' : 'nao'}`,
    '',
    `Ready: ${report.byStatus.ready || 0}`,
    `Needs manual review: ${report.byStatus.needs_manual_review || 0}`,
    `Discard: ${report.byStatus.discard || 0}`,
    '',
    `Artigo exato: ${report.byArticleExactness.exact || 0}`,
    `Artigo por tema seguro: ${report.byArticleExactness.topic_safe || 0}`,
    `So fundamento geral: ${report.byArticleExactness.topic_only || 0}`,
    `Manual: ${report.byArticleExactness.manual || 0}`,
    report.missingQuestionIds.length ? `IDs nao encontrados: ${report.missingQuestionIds.join(', ')}` : '',
    report.errors.length ? `Erros: ${JSON.stringify(report.errors.slice(0, 10), null, 2)}` : 'Erros: 0'
  ].filter(Boolean).join('\n');
}

function normalizeDatabaseUrl(value) {
  let url = String(value || '').trim();
  url = url.replace(/^\$env:DATABASE_URL\s*=\s*/i, '');
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '');
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

function addCount(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function validChoice(value, allowed, fallback) {
  const text = clean(value);
  return allowed.has(text) ? text : fallback;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
