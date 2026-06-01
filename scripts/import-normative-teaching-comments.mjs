import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_JSON = path.join(ROOT_DIR, 'data', 'normative-comments', 'comentarios_normativos_atualizados_seed_v1.json');
const VALID_STATUS = new Set(['ready', 'needs_manual_review', 'discard']);
const VALID_POLICY = new Set(['current_law_probable', 'not_assertive_manual_review', 'discard_original']);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = normalizeDatabaseUrl(args['database-url'] || args.db || process.env.DATABASE_URL);
  const jsonPath = path.resolve(ROOT_DIR, args.json || DEFAULT_JSON);
  const dryRun = Boolean(args['dry-run']);
  const limit = args.limit ? Math.max(1, Number(args.limit)) : 0;

  if (!databaseUrl && !dryRun) {
    console.error('Defina DATABASE_URL ou passe --database-url para importar no Postgres.');
    process.exit(1);
  }

  const report = await importNormativeTeachingComments({
    databaseUrl,
    jsonPath,
    dryRun,
    limit
  });
  console.log(renderReport(report));
}

export async function importNormativeTeachingComments({ databaseUrl, jsonPath = DEFAULT_JSON, dryRun = false, limit = 0 }) {
  databaseUrl = normalizeDatabaseUrl(databaseUrl);
  const seed = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
  const items = Array.isArray(seed.items) ? seed.items : [];
  if (!items.length) {
    throw new Error('JSON seed sem array items.');
  }

  const selectedItems = limit ? items.slice(0, limit) : items;
  const report = {
    jsonPath,
    dryRun,
    totalInFile: items.length,
    totalSelected: selectedItems.length,
    foundInDatabase: 0,
    notFound: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    byStatus: {},
    missingQuestionIds: [],
    errors: []
  };

  if (dryRun && !databaseUrl) {
    for (const item of selectedItems) {
      const normalized = normalizeSeedItem(item);
      report.byStatus[normalized.status] = (report.byStatus[normalized.status] || 0) + 1;
    }
    return report;
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  try {
    await assertReady(sql);

    for (const item of selectedItems) {
      try {
        const normalized = normalizeSeedItem(item);
        report.byStatus[normalized.status] = (report.byStatus[normalized.status] || 0) + 1;

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

function normalizeDatabaseUrl(value) {
  let url = String(value || '').trim();
  url = url.replace(/^\$env:DATABASE_URL\s*=\s*/i, '');
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '');
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
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
    throw new Error('Tabela question_normative_teaching_comments nao encontrada. Rode a migration primeiro.');
  }
}

function normalizeSeedItem(item) {
  const questionId = Number(item?.question_id || item?.question?.id || 0);
  if (!questionId) throw new Error('Item sem question_id valido.');
  const status = validChoice(item.status, VALID_STATUS, 'needs_manual_review');
  const answerPolicy = validChoice(item.answer_policy, VALID_POLICY, status === 'discard' ? 'discard_original' : 'not_assertive_manual_review');
  const review = item.review || {};

  return {
    questionId,
    sourceVersion: clean(item.source_version),
    generatedAt: item.generated_at || null,
    generatedBy: clean(item.generated_by),
    generationMethod: clean(item.generation_method),
    status,
    answerPolicy,
    currentAnswer: clean(item.current_answer) || null,
    currentAnswerRaw: clean(item.current_answer_raw) || null,
    currentAnswerConfidence: numericOrNull(item.current_answer_confidence),
    historicalAnswer: clean(item.historical_answer) || null,
    historicalAnswerRaw: clean(item.historical_answer_raw) || null,
    changedAnswer: clean(item.changed_answer) || null,
    safetyLevel: clean(item.safety_level) || null,
    recommendation: clean(item.recommendation) || null,
    adaptationStatus: clean(item.adaptation_status) || null,
    studyRecommendation: clean(item.study_recommendation) || null,
    title: clean(item.title) || null,
    teachingCommentMd: clean(item.teaching_comment_md) || '',
    teachingCommentHtml: clean(item.teaching_comment_html) || '',
    legalBasis: clean(item.legal_basis) || null,
    currentRuleSummary: clean(item.current_rule_summary) || null,
    whyOutdated: clean(item.why_outdated) || null,
    literalStatementNote: clean(item.literal_statement_note) || null,
    sourceBase: clean(item.source_base) || null,
    alternativesAnalysis: item.alternatives_analysis || null,
    rawJson: item,
    reviewStatus: clean(review.review_status) || 'pending',
    reviewedAt: review.reviewed_at || null,
    reviewedBy: clean(review.reviewed_by) || null,
    reviewerNotes: clean(review.reviewer_notes) || null
  };
}

async function upsert(sql, item) {
  await sql`
    INSERT INTO question_normative_teaching_comments (
      question_id,
      source_version,
      generated_at,
      generated_by,
      generation_method,
      status,
      answer_policy,
      current_answer,
      current_answer_raw,
      current_answer_confidence,
      historical_answer,
      historical_answer_raw,
      changed_answer,
      safety_level,
      recommendation,
      adaptation_status,
      study_recommendation,
      title,
      teaching_comment_md,
      teaching_comment_html,
      legal_basis,
      current_rule_summary,
      why_outdated,
      literal_statement_note,
      source_base,
      alternatives_analysis,
      raw_json,
      review_status,
      reviewed_at,
      reviewed_by,
      reviewer_notes,
      created_at,
      updated_at
    )
    VALUES (
      ${item.questionId},
      ${item.sourceVersion},
      ${item.generatedAt},
      ${item.generatedBy},
      ${item.generationMethod},
      ${item.status},
      ${item.answerPolicy},
      ${item.currentAnswer},
      ${item.currentAnswerRaw},
      ${item.currentAnswerConfidence},
      ${item.historicalAnswer},
      ${item.historicalAnswerRaw},
      ${item.changedAnswer},
      ${item.safetyLevel},
      ${item.recommendation},
      ${item.adaptationStatus},
      ${item.studyRecommendation},
      ${item.title},
      ${item.teachingCommentMd},
      ${item.teachingCommentHtml},
      ${item.legalBasis},
      ${item.currentRuleSummary},
      ${item.whyOutdated},
      ${item.literalStatementNote},
      ${item.sourceBase},
      ${sql.json(item.alternativesAnalysis || {})},
      ${sql.json(item.rawJson)},
      ${item.reviewStatus},
      ${item.reviewedAt},
      ${item.reviewedBy},
      ${item.reviewerNotes},
      NOW(),
      NOW()
    )
    ON CONFLICT (question_id) DO UPDATE SET
      source_version = EXCLUDED.source_version,
      generated_at = EXCLUDED.generated_at,
      generated_by = EXCLUDED.generated_by,
      generation_method = EXCLUDED.generation_method,
      status = EXCLUDED.status,
      answer_policy = EXCLUDED.answer_policy,
      current_answer = EXCLUDED.current_answer,
      current_answer_raw = EXCLUDED.current_answer_raw,
      current_answer_confidence = EXCLUDED.current_answer_confidence,
      historical_answer = EXCLUDED.historical_answer,
      historical_answer_raw = EXCLUDED.historical_answer_raw,
      changed_answer = EXCLUDED.changed_answer,
      safety_level = EXCLUDED.safety_level,
      recommendation = EXCLUDED.recommendation,
      adaptation_status = EXCLUDED.adaptation_status,
      study_recommendation = EXCLUDED.study_recommendation,
      title = EXCLUDED.title,
      teaching_comment_md = EXCLUDED.teaching_comment_md,
      teaching_comment_html = EXCLUDED.teaching_comment_html,
      legal_basis = EXCLUDED.legal_basis,
      current_rule_summary = EXCLUDED.current_rule_summary,
      why_outdated = EXCLUDED.why_outdated,
      literal_statement_note = EXCLUDED.literal_statement_note,
      source_base = EXCLUDED.source_base,
      alternatives_analysis = EXCLUDED.alternatives_analysis,
      raw_json = EXCLUDED.raw_json,
      review_status = EXCLUDED.review_status,
      reviewed_at = COALESCE(question_normative_teaching_comments.reviewed_at, EXCLUDED.reviewed_at),
      reviewed_by = COALESCE(question_normative_teaching_comments.reviewed_by, EXCLUDED.reviewed_by),
      reviewer_notes = COALESCE(question_normative_teaching_comments.reviewer_notes, EXCLUDED.reviewer_notes),
      updated_at = NOW()
  `;
}

function renderReport(report) {
  return [
    `Arquivo: ${report.jsonPath}`,
    `Total no arquivo: ${report.totalInFile}`,
    `Processados: ${report.totalSelected}`,
    `Encontrados no banco: ${report.foundInDatabase}`,
    `Nao encontrados: ${report.notFound}`,
    `Inseridos: ${report.inserted}`,
    `Atualizados: ${report.updated}`,
    `Dry-run: ${report.dryRun ? 'sim' : 'nao'}`,
    `Por status: ${JSON.stringify(report.byStatus)}`,
    report.missingQuestionIds.length ? `IDs nao encontrados: ${report.missingQuestionIds.join(', ')}` : '',
    report.errors.length ? `Erros: ${JSON.stringify(report.errors.slice(0, 10), null, 2)}` : 'Erros: 0'
  ].filter(Boolean).join('\n');
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
