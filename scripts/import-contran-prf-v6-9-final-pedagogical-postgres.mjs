#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const DEFAULT_DIR = 'C:/Users/Justi/AppData/Local/Temp/contran_v69_patch_05271d81ef754228863410605bec1ab1';
const EXPECTED_COMMENT_PATCHES = 34;
const EXPECTED_ARTICLE_PATCHES = 7;
const EXPECTED_PARSER_CORRECTIONS = 4;

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(args.dir || DEFAULT_DIR);
  const dryRun = Boolean(args['dry-run']);
  const files = {
    comments: path.join(sourceDir, 'patch_comentarios_fundamentos_contran_prf_v6_9_final_pedagogico.jsonl'),
    articles: path.join(sourceDir, 'patch_artigos_accordion_ctb_parser_contran_prf_v6_9.jsonl'),
    parser: path.join(sourceDir, 'parser_corrections_ctb_contran_v6_9.json'),
    manifest: path.join(sourceDir, 'manifest_patch_v6_9_final_pedagogico.json')
  };

  const [commentPatches, articlePatches, parserCorrections, manifest] = await Promise.all([
    loadJsonl(files.comments, EXPECTED_COMMENT_PATCHES),
    loadJsonl(files.articles, EXPECTED_ARTICLE_PATCHES),
    loadJson(files.parser),
    loadJson(files.manifest)
  ]);
  validatePackage(commentPatches, articlePatches, parserCorrections, manifest);

  const timestamp = timestampForFile(new Date());
  const backups = {
    questions: path.join(packageRoot, 'exports', `backup_contran_prf_pedagogical_before_v6_9_final_${timestamp}.jsonl`),
    articles: path.join(packageRoot, 'exports', `backup_contran_normative_articles_before_v6_9_final_${timestamp}.jsonl`),
    references: path.join(packageRoot, 'exports', `backup_contran_question_normative_refs_before_v6_9_final_${timestamp}.jsonl`)
  };
  const reportPath = path.join(packageRoot, 'reports', `contran_prf_v6_9_final_pedagogico_import_report.json`);
  const reportMdPath = path.join(packageRoot, 'reports', `contran_prf_v6_9_final_pedagogico_import_report.md`);

  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'import-contran-prf-v6-9-final-pedagogical'
  });

  const report = {
    dryRun,
    database: { source: selected.sourceName, url: selected.redactedConnectionString },
    sourceDir,
    files,
    manifest,
    backups,
    expected: {
      commentPatches: EXPECTED_COMMENT_PATCHES,
      articlePatches: EXPECTED_ARTICLE_PATCHES,
      parserCorrections: EXPECTED_PARSER_CORRECTIONS
    },
    updatedQuestions: 0,
    upsertedArticles: 0,
    parserCorrectionsApplied: 0,
    parserReferenceRowsInserted: 0,
    articleReferencesLinked: 0,
    updatedExternalIds: [],
    accordionStatus: [],
    validations: {}
  };

  await client.connect();
  try {
    await client.query('BEGIN');
    await ensureSchema(client);

    const existingQuestions = await fetchExistingQuestions(client, commentPatches);
    validateQuestionsBefore(commentPatches, existingQuestions, report);

    const affectedRefQuestionIds = await collectAffectedReferenceQuestionIds(client, articlePatches, parserCorrections);
    await writeBackup(backups.questions, existingQuestions);
    await backupArticles(client, backups.articles, articlePatches);
    await backupReferences(client, backups.references, [...new Set([
      ...commentPatches.map((item) => Number(item.id)),
      ...affectedRefQuestionIds
    ])]);

    report.upsertedArticles = await upsertArticles(client, articlePatches);
    report.updatedQuestions = await updateQuestions(client, commentPatches);
    report.updatedExternalIds = commentPatches.map((item) => String(item.external_id));
    report.articleReferencesLinked = await linkArticleReferences(client, articlePatches);
    const parserReport = await applyParserCorrections(client, parserCorrections);
    report.parserCorrectionsApplied = parserReport.appliedCorrections;
    report.parserReferenceRowsInserted = parserReport.insertedReferences;

    const afterQuestions = await fetchExistingQuestions(client, commentPatches);
    validateQuestionsAfter(commentPatches, existingQuestions, afterQuestions, report);
    report.accordionStatus = await validateAccordionStatus(client);
    validateFinalCounts(report);

    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ ok: true, ...report }, null, 2) + '\n', 'utf8');
  await fs.writeFile(reportMdPath, renderMarkdownReport(report), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    updatedQuestions: report.updatedQuestions,
    upsertedArticles: report.upsertedArticles,
    parserCorrectionsApplied: report.parserCorrectionsApplied,
    parserReferenceRowsInserted: report.parserReferenceRowsInserted,
    articleReferencesLinked: report.articleReferencesLinked,
    updatedExternalIds: report.updatedExternalIds,
    backups,
    reportPath,
    reportMdPath,
    aviso: dryRun
      ? 'Dry-run concluido; nenhuma alteracao persistida.'
      : 'Patch V6.9 final aplicado. Somente campos pedagogicos, artigos normativos e referencias estruturadas foram alterados.'
  }, null, 2));
}

async function ensureSchema(client) {
  await client.query(`
    ALTER TABLE contran_normative_articles
      ADD COLUMN IF NOT EXISTS reference_type text NOT NULL DEFAULT 'resolution'
  `);
  await client.query(`
    ALTER TABLE contran_question_normative_references
      ADD COLUMN IF NOT EXISTS reference_type text NOT NULL DEFAULT 'resolution',
      ADD COLUMN IF NOT EXISTS law_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS law_number text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS law_year text NOT NULL DEFAULT ''
  `);
  await client.query(`
    ALTER TABLE missing_normative_articles_queue
      ADD COLUMN IF NOT EXISTS reference_type text NOT NULL DEFAULT 'resolution',
      ADD COLUMN IF NOT EXISTS law_name text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS law_number text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS law_year text NOT NULL DEFAULT ''
  `);
}

async function fetchExistingQuestions(client, patches) {
  const ids = patches.map((item) => Number(item.id));
  const externalIds = patches.map((item) => String(item.external_id));
  const result = await client.query(`
    SELECT
      question_id, external_id, statement, question_type, alternatives, correct_answer,
      explanation, historical_explanation, beginner_explanation, trap_explanation,
      source_normative_reference, teacher_comment, alternative_explanations,
      article_reference, article_full_text, article_full_text_status,
      needs_manual_review, review_reason, pedagogical_patch_version,
      comment_style, pedagogical_updated_at, updated_at,
      is_unpublished, is_official, official_exam, active, visible, deprecated
    FROM contran_prf_unpublished_questions
    WHERE question_id = ANY($1::int[])
       OR external_id = ANY($2::text[])
    ORDER BY question_id
  `, [ids, externalIds]);
  return result.rows;
}

function validateQuestionsBefore(patches, rows, report) {
  const byId = new Map(rows.map((row) => [Number(row.question_id), row]));
  const errors = [];
  for (const patch of patches) {
    const row = byId.get(Number(patch.id));
    if (!row) {
      errors.push({ id: patch.id, external_id: patch.external_id, error: 'not_found' });
      continue;
    }
    if (row.external_id !== patch.external_id) errors.push({ id: patch.id, error: 'external_id_mismatch', db: row.external_id, patch: patch.external_id });
    if (clean(row.correct_answer) !== clean(patch.correct_answer)) errors.push({ id: patch.id, error: 'answer_mismatch', db: row.correct_answer, patch: patch.correct_answer });
    if (clean(row.question_type) !== clean(patch.question_type)) errors.push({ id: patch.id, error: 'type_mismatch', db: row.question_type, patch: patch.question_type });
    if (!toBoolean(row.is_unpublished) || toBoolean(row.is_official) || toBoolean(row.official_exam)) errors.push({ id: patch.id, error: 'not_unpublished_or_official' });
    const dbStatement = normalizeText(row.statement);
    const patchStatement = normalizeText(patch.statement_snapshot);
    if (dbStatement && patchStatement && dbStatement !== patchStatement) errors.push({ id: patch.id, error: 'statement_mismatch' });
  }
  report.validations.before = { ok: errors.length === 0, errors };
  if (errors.length) throw new Error('Validacao pre-importacao falhou; rollback executado.');
}

async function updateQuestions(client, patches) {
  const sql = `
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
  for (const patch of patches) {
    const metadata = JSON.stringify({
      article_full_text_status: clean(patch.article_full_text_status),
      article_full_text: patch.article_full_text_status === 'included_full' ? clean(patch.article_full_text) : '',
      needs_manual_review: Boolean(patch.needs_manual_review),
      review_reason: clean(patch.review_reason),
      patch_version: clean(patch.patch_version),
      update_scope: clean(patch.update_scope),
      comment_style: clean(patch.comment_style),
      patch_reason: clean(patch.patch_reason)
    });
    const result = await client.query(sql, [
      Number(patch.id),
      String(patch.external_id),
      clean(patch.explanation_new || patch.teacher_comment_new),
      clean(patch.explicacao_historica_new || patch.teacher_comment_new),
      clean(patch.beginner_explanation_new || patch.explicacao_para_iniciante_new),
      clean(patch.trap_explanation_new || patch.pegadinha_new),
      clean(patch.fundamento_normativo_new || patch.normative_reference_new),
      clean(patch.teacher_comment_new || patch.explicacao_historica_new),
      metadata,
      clean(patch.article_reference_new || patch.normative_reference_new || patch.fundamento_normativo_new),
      patch.article_full_text_status === 'included_full' ? clean(patch.article_full_text) : '',
      clean(patch.article_full_text_status),
      patch.needs_manual_review ? 1 : 0,
      clean(patch.review_reason),
      clean(patch.patch_version),
      clean(patch.comment_style)
    ]);
    updated += result.rowCount;
  }
  return updated;
}

async function upsertArticles(client, articles) {
  const sql = `
    INSERT INTO contran_normative_articles (
      reference_type,
      resolution, resolution_number, resolution_year, article, paragraph,
      item, subitem, annex, title, full_text, plain_text, source_url,
      source_name, source_version_date, is_current, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, NOW()
    )
    ON CONFLICT (resolution_number, resolution_year, article, paragraph, item, subitem, annex)
    DO UPDATE SET
      reference_type = excluded.reference_type,
      resolution = excluded.resolution,
      title = excluded.title,
      full_text = excluded.full_text,
      plain_text = excluded.plain_text,
      source_url = excluded.source_url,
      source_name = excluded.source_name,
      source_version_date = excluded.source_version_date,
      is_current = excluded.is_current,
      updated_at = NOW()
  `;
  let changed = 0;
  for (const article of articles) {
    const result = await client.query(sql, [
      articleReferenceType(article),
      clean(article.resolution),
      clean(article.resolution_number),
      clean(article.resolution_year),
      clean(article.article),
      normalizeParagraph(article.paragraph),
      clean(article.item),
      clean(article.subitem),
      clean(article.annex),
      clean(article.title),
      clean(article.full_text),
      clean(article.plain_text || article.full_text),
      clean(article.source_url),
      clean(article.source_name),
      clean(article.source_version_date),
      article.is_current === false || article.is_current === 0 || article.is_current === '0' ? 0 : 1
    ]);
    changed += result.rowCount;
  }
  return changed;
}

async function linkArticleReferences(client, articles) {
  let linked = 0;
  for (const article of articles) {
    const found = await findArticleId(client, article);
    if (!found) continue;
    const result = await client.query(`
      UPDATE contran_question_normative_references
      SET
        normative_article_id = $1,
        needs_normative_reference_review = 0,
        reference_type = $2,
        updated_at = NOW()
      WHERE resolution_number = $3
        AND resolution_year = $4
        AND article = $5
        AND COALESCE(paragraph, '') = $6
        AND COALESCE(item, '') = $7
        AND COALESCE(subitem, '') = $8
        AND COALESCE(annex, '') = $9
    `, [
      found,
      articleReferenceType(article),
      clean(article.resolution_number),
      clean(article.resolution_year),
      clean(article.article),
      normalizeParagraph(article.paragraph),
      clean(article.item),
      clean(article.subitem),
      clean(article.annex)
    ]);
    linked += result.rowCount;
  }
  return linked;
}

async function applyParserCorrections(client, corrections) {
  let appliedCorrections = 0;
  let insertedReferences = 0;
  for (const correction of corrections) {
    const rawReference = clean(correction.raw_reference);
    const affected = await client.query(`
      SELECT DISTINCT question_id, external_id
      FROM contran_question_normative_references
      WHERE raw_reference = $1
      UNION
      SELECT question_id, external_id
      FROM contran_prf_unpublished_questions
      WHERE source_normative_reference = $1
        AND COALESCE(is_unpublished, 0) = 1
        AND COALESCE(is_official, 0) = 0
        AND COALESCE(official_exam, 0) = 0
    `, [rawReference]);
    if (!affected.rows.length) continue;

    for (const row of affected.rows) {
      await client.query(
        'DELETE FROM contran_question_normative_references WHERE question_id = $1 AND raw_reference = $2',
        [row.question_id, rawReference]
      );
      let displayOrder = 1;
      for (const ref of correction.correct_structured_references || []) {
        const normalized = normalizeStructuredReference(ref, rawReference);
        const articleId = await findArticleId(client, normalized);
        const needsReview = normalized.type === 'law' && !articleId ? 1 : 0;
        await insertStructuredReference(client, {
          questionId: Number(row.question_id),
          externalId: clean(row.external_id),
          articleId,
          ref: normalized,
          rawReference,
          displayOrder,
          needsReview
        });
        displayOrder += 1;
        insertedReferences += 1;
      }
    }
    appliedCorrections += 1;
  }
  return { appliedCorrections, insertedReferences };
}

async function insertStructuredReference(client, input) {
  const ref = input.ref;
  await client.query(`
    INSERT INTO contran_question_normative_references (
      question_id, external_id, normative_article_id,
      reference_type, law_name, law_number, law_year,
      resolution, resolution_number, resolution_year,
      article, paragraph, item, subitem, annex, raw_reference,
      display_order, needs_normative_reference_review, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, NOW()
    )
    ON CONFLICT (question_id, resolution_number, resolution_year, article, paragraph, item, subitem, annex)
    DO UPDATE SET
      external_id = excluded.external_id,
      normative_article_id = excluded.normative_article_id,
      reference_type = excluded.reference_type,
      law_name = excluded.law_name,
      law_number = excluded.law_number,
      law_year = excluded.law_year,
      resolution = excluded.resolution,
      raw_reference = excluded.raw_reference,
      display_order = excluded.display_order,
      needs_normative_reference_review = excluded.needs_normative_reference_review,
      updated_at = NOW()
  `, [
    input.questionId,
    input.externalId,
    input.articleId,
    ref.type,
    clean(ref.lawName),
    clean(ref.lawNumber),
    clean(ref.lawYear),
    clean(ref.resolution),
    clean(ref.resolutionNumber),
    clean(ref.resolutionYear),
    clean(ref.article),
    normalizeParagraph(ref.paragraph),
    clean(ref.item),
    clean(ref.subitem),
    clean(ref.annex),
    input.rawReference,
    input.displayOrder,
    input.needsReview
  ]);
}

async function findArticleId(client, ref) {
  const result = await client.query(`
    SELECT id
    FROM contran_normative_articles
    WHERE resolution_number = $1
      AND resolution_year = $2
      AND article = $3
      AND COALESCE(paragraph, '') = $4
      AND COALESCE(item, '') = $5
      AND COALESCE(subitem, '') = $6
      AND COALESCE(annex, '') = $7
      AND COALESCE(is_current, 1) = 1
    ORDER BY
      CASE WHEN COALESCE(NULLIF(plain_text, ''), full_text, '') <> '' THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST,
      id DESC
    LIMIT 1
  `, [
    clean(ref.resolution_number || ref.resolutionNumber),
    clean(ref.resolution_year || ref.resolutionYear),
    clean(ref.article),
    normalizeParagraph(ref.paragraph),
    clean(ref.item),
    clean(ref.subitem),
    clean(ref.annex)
  ]);
  return result.rows[0]?.id || null;
}

function normalizeStructuredReference(ref, rawReference) {
  const type = clean(ref.type) || 'resolution';
  if (type === 'law') {
    return {
      type,
      resolution: clean(ref.law || 'CTB - Lei nº 9.503/1997'),
      resolutionNumber: clean(ref.law_number || '9503'),
      resolutionYear: clean(ref.law_year || '1997'),
      article: clean(ref.article),
      paragraph: normalizeParagraph(ref.paragraph),
      item: clean(ref.item),
      subitem: clean(ref.subitem),
      annex: clean(ref.annex),
      lawName: clean(ref.law || 'CTB - Lei nº 9.503/1997'),
      lawNumber: clean(ref.law_number || '9503'),
      lawYear: clean(ref.law_year || '1997'),
      rawReference
    };
  }
  return {
    type: 'resolution',
    resolution: clean(ref.resolution),
    resolutionNumber: clean(ref.resolution_number),
    resolutionYear: clean(ref.resolution_year),
    article: clean(ref.article),
    paragraph: normalizeParagraph(ref.paragraph),
    item: clean(ref.item),
    subitem: clean(ref.subitem),
    annex: clean(ref.annex),
    lawName: '',
    lawNumber: '',
    lawYear: '',
    rawReference
  };
}

async function collectAffectedReferenceQuestionIds(client, articles, corrections) {
  const ids = new Set();
  for (const article of articles) {
    const result = await client.query(`
      SELECT question_id
      FROM contran_question_normative_references
      WHERE resolution_number = $1
        AND resolution_year = $2
        AND article = $3
        AND paragraph = $4
        AND item = $5
        AND subitem = $6
        AND annex = $7
    `, [
      clean(article.resolution_number),
      clean(article.resolution_year),
      clean(article.article),
      normalizeParagraph(article.paragraph),
      clean(article.item),
      clean(article.subitem),
      clean(article.annex)
    ]);
    for (const row of result.rows) ids.add(Number(row.question_id));
  }
  for (const correction of corrections) {
    const result = await client.query(`
      SELECT question_id FROM contran_question_normative_references WHERE raw_reference = $1
      UNION
      SELECT question_id FROM contran_prf_unpublished_questions WHERE source_normative_reference = $1
    `, [clean(correction.raw_reference)]);
    for (const row of result.rows) ids.add(Number(row.question_id));
  }
  return [...ids].filter(Boolean);
}

function validateQuestionsAfter(patches, beforeRows, afterRows, report) {
  const beforeById = new Map(beforeRows.map((row) => [Number(row.question_id), row]));
  const afterById = new Map(afterRows.map((row) => [Number(row.question_id), row]));
  const unchangedFailures = [];
  const pedagogicalFailures = [];
  for (const patch of patches) {
    const before = beforeById.get(Number(patch.id));
    const after = afterById.get(Number(patch.id));
    if (!before || !after) continue;
    for (const field of ['question_id', 'external_id', 'statement', 'alternatives', 'correct_answer', 'question_type', 'updated_at']) {
      if (stable(before[field]) !== stable(after[field])) {
        unchangedFailures.push({ id: patch.id, field });
      }
    }
    const expected = {
      teacher_comment: patch.teacher_comment_new,
      historical_explanation: patch.explicacao_historica_new,
      explanation: patch.explanation_new,
      beginner_explanation: patch.beginner_explanation_new || patch.explicacao_para_iniciante_new,
      trap_explanation: patch.trap_explanation_new || patch.pegadinha_new,
      source_normative_reference: patch.fundamento_normativo_new || patch.normative_reference_new,
      article_reference: patch.article_reference_new,
      article_full_text_status: patch.article_full_text_status,
      pedagogical_patch_version: patch.patch_version,
      comment_style: patch.comment_style
    };
    for (const [field, value] of Object.entries(expected)) {
      if (clean(after[field]) !== clean(value)) pedagogicalFailures.push({ id: patch.id, field });
    }
  }
  report.validations.after = {
    ok: !unchangedFailures.length && !pedagogicalFailures.length && report.updatedQuestions === patches.length,
    unchangedFailures,
    pedagogicalFailures,
    expectedUpdatedQuestions: patches.length,
    actualUpdatedQuestions: report.updatedQuestions
  };
  if (!report.validations.after.ok) throw new Error('Validacao pos-importacao falhou; rollback executado.');
}

async function validateAccordionStatus(client) {
  const cases = [
    { label: 'Art. 2º, § 2º, da Res. 798/2020', refs: [{ resolutionNumber: '798', resolutionYear: '2020', article: '2', paragraph: '2' }], expectFound: true },
    { label: 'Art. 4º, I, da Res. 798/2020', refs: [{ resolutionNumber: '798', resolutionYear: '2020', article: '4', item: 'I' }], expectFound: true },
    { label: 'Art. 6º, § 1º, da Res. 798/2020', refs: [{ resolutionNumber: '798', resolutionYear: '2020', article: '6', paragraph: '1' }], expectFound: true },
    { label: 'Art. 7º, § 4º, da Res. 798/2020', refs: [{ resolutionNumber: '798', resolutionYear: '2020', article: '7', paragraph: '4' }], expectFound: true },
    { label: 'Res. 432/2013 + CTB art. 165-A', rawReference: 'Res. 432/2013 e CTB art. 165-A.', expectLawArticle: '165-A', expectFound: true },
    { label: 'Res. 432/2013 + CTB art. 306', rawReference: 'Art. 1º da Res. 432/2013 e CTB art. 306.', expectLawArticle: '306', expectFound: true },
    { label: 'Res. 920/2022 + CTB art. 280, § 2º', rawReference: 'Res. 920/2022 e CTB art. 280, § 2º.', expectLawArticle: '280', expectParagraph: '2', expectFound: true },
    { label: 'Res. 993/2023 + CTB art. 105', rawReference: 'Res. 993/2023 e CTB art. 105.', expectLawArticle: '105', expectFound: false }
  ];
  const out = [];
  for (const item of cases) {
    if (item.refs) {
      const statuses = [];
      for (const ref of item.refs) statuses.push(await referenceFound(client, ref));
      out.push({
        label: item.label,
        ok: statuses.every((status) => status.found === item.expectFound),
        statuses
      });
      continue;
    }
    const rows = await client.query(`
      SELECT
        cqr.question_id,
        cqr.external_id,
        cqr.reference_type,
        cqr.resolution,
        cqr.resolution_number,
        cqr.resolution_year,
        cqr.article,
        cqr.paragraph,
        cqr.normative_article_id,
        cqr.needs_normative_reference_review,
        COALESCE(NULLIF(cna.plain_text, ''), cna.full_text, '') AS text
      FROM contran_question_normative_references cqr
      LEFT JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
      WHERE cqr.raw_reference = $1
      ORDER BY cqr.question_id, cqr.display_order
    `, [item.rawReference]);
    const lawRows = rows.rows.filter((row) =>
      row.reference_type === 'law'
      && row.resolution_number === '9503'
      && row.article === item.expectLawArticle
      && (!item.expectParagraph || row.paragraph === item.expectParagraph)
    );
    out.push({
      label: item.label,
      ok: item.expectFound
        ? lawRows.some((row) => clean(row.text))
        : lawRows.length > 0 && lawRows.every((row) => !clean(row.text) && toBoolean(row.needs_normative_reference_review)),
      totalRows: rows.rows.length,
      lawRows: lawRows.map((row) => ({
        questionId: row.question_id,
        externalId: row.external_id,
        article: row.article,
        paragraph: row.paragraph,
        found: Boolean(clean(row.text)),
        needsReview: toBoolean(row.needs_normative_reference_review)
      }))
    });
  }
  return out;
}

async function referenceFound(client, ref) {
  const result = await client.query(`
    SELECT
      cqr.question_id,
      cqr.external_id,
      cqr.normative_article_id,
      cqr.needs_normative_reference_review,
      COALESCE(NULLIF(cna.plain_text, ''), cna.full_text, '') AS text
    FROM contran_question_normative_references cqr
    LEFT JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
    WHERE cqr.resolution_number = $1
      AND cqr.resolution_year = $2
      AND cqr.article = $3
      AND COALESCE(cqr.paragraph, '') = $4
      AND COALESCE(cqr.item, '') = $5
      AND COALESCE(cqr.subitem, '') = $6
      AND COALESCE(cqr.annex, '') = $7
    ORDER BY cqr.question_id
  `, [
    ref.resolutionNumber,
    ref.resolutionYear,
    ref.article,
    normalizeParagraph(ref.paragraph),
    clean(ref.item),
    clean(ref.subitem),
    clean(ref.annex)
  ]);
  return {
    reference: ref,
    totalRows: result.rows.length,
    found: result.rows.length > 0 && result.rows.every((row) => clean(row.text)),
    examples: result.rows.slice(0, 5).map((row) => ({
      questionId: row.question_id,
      externalId: row.external_id,
      articleId: row.normative_article_id || null,
      textLength: clean(row.text).length,
      needsReview: toBoolean(row.needs_normative_reference_review)
    }))
  };
}

function validateFinalCounts(report) {
  const errors = [];
  if (report.updatedQuestions !== EXPECTED_COMMENT_PATCHES) errors.push(`questoes atualizadas ${report.updatedQuestions}, esperado ${EXPECTED_COMMENT_PATCHES}`);
  if (report.upsertedArticles !== EXPECTED_ARTICLE_PATCHES) errors.push(`artigos importados ${report.upsertedArticles}, esperado ${EXPECTED_ARTICLE_PATCHES}`);
  if (report.parserCorrectionsApplied !== EXPECTED_PARSER_CORRECTIONS) errors.push(`correcoes parser ${report.parserCorrectionsApplied}, esperado ${EXPECTED_PARSER_CORRECTIONS}`);
  const accordionFailures = report.accordionStatus.filter((item) => !item.ok);
  if (accordionFailures.length) errors.push(`falhas accordion: ${accordionFailures.map((item) => item.label).join('; ')}`);
  report.validations.final = { ok: errors.length === 0, errors };
  if (errors.length) throw new Error(`Validacao final falhou: ${errors.join('; ')}`);
}

async function backupArticles(client, file, articles) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const keys = articles.map((article) => ({
    resolutionNumber: clean(article.resolution_number),
    resolutionYear: clean(article.resolution_year),
    article: clean(article.article),
    paragraph: normalizeParagraph(article.paragraph),
    item: clean(article.item),
    subitem: clean(article.subitem),
    annex: clean(article.annex)
  }));
  const result = await client.query(`
    SELECT *
    FROM contran_normative_articles
    WHERE (resolution_number, resolution_year, article, paragraph, item, subitem, annex) IN (
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
    )
    ORDER BY resolution_number, resolution_year, article, paragraph, item, subitem, annex
  `, [
    keys.map((k) => k.resolutionNumber),
    keys.map((k) => k.resolutionYear),
    keys.map((k) => k.article),
    keys.map((k) => k.paragraph),
    keys.map((k) => k.item),
    keys.map((k) => k.subitem),
    keys.map((k) => k.annex)
  ]);
  await writeBackup(file, result.rows);
}

async function backupReferences(client, file, questionIds) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!questionIds.length) {
    await writeBackup(file, []);
    return;
  }
  const result = await client.query(`
    SELECT *
    FROM contran_question_normative_references
    WHERE question_id = ANY($1::int[])
    ORDER BY question_id, display_order, id
  `, [questionIds.map(Number)]);
  await writeBackup(file, result.rows);
}

async function writeBackup(file, rows) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

function renderMarkdownReport(report) {
  return `# Importacao V6.9 Final Pedagogico PRF/CONTRAN

- Status: ${report.dryRun ? 'dry-run sem persistencia' : 'aplicado'}
- Questoes atualizadas: ${report.updatedQuestions}
- Artigos/trechos normativos importados: ${report.upsertedArticles}
- Correcoes de parser aplicadas: ${report.parserCorrectionsApplied}
- Referencias de parser inseridas/atualizadas: ${report.parserReferenceRowsInserted}
- Referencias vinculadas aos artigos V6.9: ${report.articleReferencesLinked}

## External IDs atualizados

${report.updatedExternalIds.map((id) => `- ${id}`).join('\n')}

## Validacoes

- Campos protegidos preservados: ${report.validations.after?.unchangedFailures?.length === 0 ? 'sim' : 'nao'}
- Gabarito/enunciado/alternativas/tipo sem alteracao: ${report.validations.after?.unchangedFailures?.length === 0 ? 'sim' : 'nao'}
- Questoes oficiais misturadas: nao

## Accordion

${report.accordionStatus.map((item) => `- ${item.label}: ${item.ok ? 'OK' : 'FALHA'}`).join('\n')}

## Backups

- Questoes: ${report.backups.questions}
- Artigos: ${report.backups.articles}
- Referencias: ${report.backups.references}
`;
}

async function loadJsonl(file, expectedTotal) {
  const content = await fs.readFile(file, 'utf8');
  const rows = content.trimEnd().split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: JSON invalido: ${error.message}`);
    }
  });
  if (rows.length !== expectedTotal) {
    throw new Error(`${file} deveria conter ${expectedTotal} linhas; encontrado ${rows.length}.`);
  }
  return rows;
}

async function loadJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function validatePackage(comments, articles, parserCorrections, manifest) {
  const errors = [];
  if (manifest.comment_patch_records !== EXPECTED_COMMENT_PATCHES) errors.push('manifest.comment_patch_records divergente');
  if (manifest.article_patch_records !== EXPECTED_ARTICLE_PATCHES) errors.push('manifest.article_patch_records divergente');
  if (manifest.parser_corrections !== EXPECTED_PARSER_CORRECTIONS) errors.push('manifest.parser_corrections divergente');
  if (!Array.isArray(parserCorrections) || parserCorrections.length !== EXPECTED_PARSER_CORRECTIONS) errors.push('parser_corrections com total divergente');
  for (const item of comments) {
    if (!item.id || !item.external_id || !item.correct_answer || !item.question_type || !item.teacher_comment_new) {
      errors.push(`patch comentario incompleto: ${item.external_id || item.id || '(sem id)'}`);
    }
  }
  for (const item of articles) {
    if (!item.resolution_number || !item.resolution_year || !item.article || !item.full_text) {
      errors.push(`patch artigo incompleto: ${item.title || JSON.stringify(item)}`);
    }
  }
  if (errors.length) throw new Error(`Pacote V6.9 invalido: ${errors.join('; ')}`);
}

function articleReferenceType(article) {
  return clean(article.resolution_number) === '9503' || /^CTB\b/i.test(clean(article.resolution)) ? 'law' : 'resolution';
}

function normalizeParagraph(value) {
  const text = clean(value)
    .replace(/^§+\s*/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/^par[aá]grafo\s+/i, '')
    .trim()
    .toLowerCase();
  if (text === 'unico' || text === 'único') return 'único';
  return text;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function normalizeText(value) {
  return clean(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stable(value) {
  return clean(value).replace(/\s+/g, ' ').trim();
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
