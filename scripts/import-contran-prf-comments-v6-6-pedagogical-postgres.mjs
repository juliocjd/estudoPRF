#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const DEFAULT_PATCH_FILE = 'C:/Users/Justi/AppData/Local/Temp/contran_patch_v66_257eed753b9a4a1bb282a853590cde8a/patch_comentarios_contran_prf_v6_6_didatico.jsonl';
const EXPECTED_TOTAL = 413;
const PEDAGOGICAL_COLUMNS = [
  ['article_reference', 'text'],
  ['article_full_text', 'text'],
  ['article_full_text_status', 'text'],
  ['needs_manual_review', 'integer NOT NULL DEFAULT 0'],
  ['review_reason', 'text'],
  ['pedagogical_patch_version', 'text'],
  ['comment_style', 'text'],
  ['pedagogical_updated_at', 'timestamptz']
];

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    report: error.report || null
  }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const patchFile = path.resolve(args.file || DEFAULT_PATCH_FILE);
  const dryRun = Boolean(args['dry-run']);
  const patchItems = await loadPatch(patchFile);
  const backupPath = path.join(
    packageRoot,
    'exports',
    `backup_contran_prf_pedagogical_before_v6_6_${timestampForFile(new Date())}.jsonl`
  );

  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'import-contran-prf-comments-v6-6-pedagogical'
  });

  const report = {
    patchFile,
    dryRun,
    database: {
      source: selected.sourceName,
      url: selected.redactedConnectionString
    },
    patchTotal: patchItems.length,
    backupPath,
    updated: 0,
    notFound: [],
    withIncludedFullArticle: 0,
    withPendingArticle: 0,
    manualReview: 0,
    validations: {}
  };

  await client.connect();
  try {
    await client.query('BEGIN');
    await ensurePedagogicalColumns(client);
    const existing = await fetchExisting(client, patchItems);
    validatePatchAgainstDatabase(patchItems, existing, report);
    await writeBackup(backupPath, existing);
    const updateReport = await applyPatch(client, patchItems);
    Object.assign(report, updateReport);
    const after = await fetchExisting(client, patchItems);
    validateAfterUpdate(patchItems, existing, after, report);

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  console.log(JSON.stringify({
    ok: true,
    message: dryRun ? 'Dry-run concluido; nenhuma alteracao persistida.' : 'Patch V6.6 aplicado.',
    ...report,
    aviso: 'Somente campos pedagogicos da tabela contran_prf_unpublished_questions foram atualizados. IDs, enunciados, alternativas, gabaritos, historico de respostas e estatisticas foram preservados.'
  }, null, 2));
}

async function loadPatch(file) {
  const content = await fs.readFile(file, 'utf8');
  const rows = content.trimEnd().split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`JSONL invalido na linha ${index + 1}: ${error.message}`);
    }
  });
  if (rows.length !== EXPECTED_TOTAL) {
    throw new Error(`Patch deveria ter ${EXPECTED_TOTAL} linhas; encontrado ${rows.length}.`);
  }
  const missingRequired = rows.filter((item) => !item.id || !item.external_id || !item.explicacao_historica_new || !item.correct_answer);
  if (missingRequired.length) {
    throw new Error(`${missingRequired.length} item(ns) sem id, external_id, explicacao_historica_new ou correct_answer.`);
  }
  return rows;
}

async function ensurePedagogicalColumns(client) {
  for (const [column, definition] of PEDAGOGICAL_COLUMNS) {
    await client.query(`ALTER TABLE contran_prf_unpublished_questions ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }
}

async function fetchExisting(client, patchItems) {
  const ids = patchItems.map((item) => Number(item.id));
  const externalIds = patchItems.map((item) => String(item.external_id));
  const result = await client.query(`
    SELECT
      cq.question_id,
      cq.external_id,
      cq.statement,
      q.statement_text,
      cq.alternatives,
      cq.correct_answer,
      cq.explanation,
      cq.historical_explanation,
      cq.beginner_explanation,
      cq.trap_explanation,
      cq.source_normative_reference,
      cq.teacher_comment,
      cq.alternative_explanations,
      cq.article_reference,
      cq.article_full_text,
      cq.article_full_text_status,
      cq.needs_manual_review,
      cq.review_reason,
      cq.pedagogical_patch_version,
      cq.comment_style,
      cq.pedagogical_updated_at,
      cq.updated_at,
      cq.is_unpublished,
      cq.is_official,
      cq.official_exam,
      cq.active,
      cq.visible,
      cq.deprecated,
      q.statement_html
    FROM contran_prf_unpublished_questions cq
    LEFT JOIN questions q ON q.id_question = cq.question_id
    WHERE cq.question_id = ANY($1::int[])
       OR cq.external_id = ANY($2::text[])
    ORDER BY cq.question_id
  `, [ids, externalIds]);
  return result.rows;
}

function validatePatchAgainstDatabase(patchItems, existingRows, report) {
  const byId = new Map(existingRows.map((row) => [Number(row.question_id), row]));
  const byExternalId = new Map(existingRows.map((row) => [String(row.external_id), row]));
  const notFound = [];
  const answerMismatch = [];
  const statementMismatch = [];
  const officialRows = [];

  for (const item of patchItems) {
    const row = byId.get(Number(item.id)) || byExternalId.get(String(item.external_id));
    if (!row) {
      notFound.push({ id: item.id, external_id: item.external_id });
      continue;
    }
    if (String(row.correct_answer || '').trim() !== String(item.correct_answer || '').trim()) {
      answerMismatch.push({ id: item.id, db: row.correct_answer, patch: item.correct_answer });
    }
    const dbStatement = normalizeText(row.statement || row.statement_text || row.statement_html || '');
    const patchStatement = normalizeText(item.statement_snapshot || '');
    if (dbStatement && patchStatement && dbStatement !== patchStatement) {
      statementMismatch.push({ id: item.id, external_id: item.external_id });
    }
    if (toBoolean(row.is_official) || toBoolean(row.official_exam) || !toBoolean(row.is_unpublished)) {
      officialRows.push({ id: item.id, external_id: item.external_id });
    }
  }

  report.notFound = notFound;
  report.validations.before = {
    ok: !notFound.length && !answerMismatch.length && !statementMismatch.length && !officialRows.length,
    notFound,
    answerMismatch,
    statementMismatch,
    officialRows
  };
  if (!report.validations.before.ok) {
    throw new Error('Validacao pre-update falhou; nenhum update foi aplicado.');
  }
}

async function writeBackup(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const content = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.writeFile(file, content, 'utf8');
}

async function applyPatch(client, patchItems) {
  const updateSql = `
    UPDATE contran_prf_unpublished_questions
    SET
      explanation = $3,
      historical_explanation = $4,
      beginner_explanation = $5,
      trap_explanation = $6,
      source_normative_reference = $7,
      teacher_comment = $8,
      alternative_explanations = $9,
      article_reference = $10,
      article_full_text = $11,
      article_full_text_status = $12,
      needs_manual_review = $13,
      review_reason = $14,
      pedagogical_patch_version = $15,
      comment_style = $16,
      pedagogical_updated_at = NOW()
    WHERE question_id = $1
      AND external_id = $2
      AND COALESCE(is_unpublished, 0) = 1
      AND COALESCE(is_official, 0) = 0
      AND COALESCE(official_exam, 0) = 0
      AND COALESCE(active, 1) = 1
      AND COALESCE(visible, 1) = 1
      AND COALESCE(deprecated, 0) = 0
  `;
  let updated = 0;
  let withIncludedFullArticle = 0;
  let withPendingArticle = 0;
  let manualReview = 0;
  for (const item of patchItems) {
    const includedFull = item.article_full_text_status === 'included_full';
    const articleFullText = includedFull ? cleanText(item.article_full_text) : '';
    const alternativeExplanations = JSON.stringify({
      article_full_text_status: cleanText(item.article_full_text_status),
      article_full_text: articleFullText,
      needs_manual_review: Boolean(item.needs_manual_review),
      review_reason: cleanText(item.review_reason),
      patch_version: cleanText(item.patch_version),
      update_scope: cleanText(item.update_scope),
      comment_style: cleanText(item.comment_style)
    });
    const result = await client.query(updateSql, [
      Number(item.id),
      String(item.external_id),
      cleanText(item.explanation_new || item.teacher_comment_new),
      cleanText(item.explicacao_historica_new || item.teacher_comment_new),
      cleanText(item.beginner_explanation_new || item.explicacao_para_iniciante_new),
      cleanText(item.trap_explanation_new || item.pegadinha_new),
      cleanText(item.fundamento_normativo_new || item.normative_reference_new),
      cleanText(item.teacher_comment_new || item.explicacao_historica_new),
      alternativeExplanations,
      cleanText(item.article_reference_new || item.normative_reference_new || item.fundamento_normativo_new),
      articleFullText,
      cleanText(item.article_full_text_status),
      item.needs_manual_review ? 1 : 0,
      cleanText(item.review_reason),
      cleanText(item.patch_version),
      cleanText(item.comment_style)
    ]);
    updated += result.rowCount;
    if (includedFull) withIncludedFullArticle += 1;
    if (item.article_full_text_status === 'pending_exact_full_text') withPendingArticle += 1;
    if (item.needs_manual_review) manualReview += 1;
  }
  return { updated, withIncludedFullArticle, withPendingArticle, manualReview };
}

function validateAfterUpdate(patchItems, beforeRows, afterRows, report) {
  const beforeById = new Map(beforeRows.map((row) => [Number(row.question_id), row]));
  const afterById = new Map(afterRows.map((row) => [Number(row.question_id), row]));
  const unchangedFailures = [];
  const pedagogyFailures = [];
  const articleFailures = [];

  for (const item of patchItems) {
    const before = beforeById.get(Number(item.id));
    const after = afterById.get(Number(item.id));
    if (!before || !after) continue;
    for (const field of ['question_id', 'external_id', 'statement', 'statement_text', 'statement_html', 'alternatives', 'correct_answer', 'updated_at']) {
      if (String(before[field] ?? '') !== String(after[field] ?? '')) {
        unchangedFailures.push({ id: item.id, field });
      }
    }
    if (cleanText(after.historical_explanation) !== cleanText(item.explicacao_historica_new)) {
      pedagogyFailures.push({ id: item.id, field: 'historical_explanation' });
    }
    if (cleanText(after.teacher_comment) !== cleanText(item.teacher_comment_new)) {
      pedagogyFailures.push({ id: item.id, field: 'teacher_comment' });
    }
    if (cleanText(after.article_full_text_status) !== cleanText(item.article_full_text_status)) {
      articleFailures.push({ id: item.id, field: 'article_full_text_status' });
    }
    if (item.article_full_text_status !== 'included_full' && cleanText(after.article_full_text)) {
      articleFailures.push({ id: item.id, field: 'article_full_text_not_allowed' });
    }
  }

  report.validations.after = {
    ok: !unchangedFailures.length && !pedagogyFailures.length && !articleFailures.length && report.updated === patchItems.length,
    unchangedFailures,
    pedagogyFailures,
    articleFailures,
    updatedExpected: patchItems.length,
    updatedActual: report.updated
  };
  if (!report.validations.after.ok) {
    throw new Error('Validacao pos-update falhou.');
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
