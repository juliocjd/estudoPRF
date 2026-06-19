#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';
import {
  normalizeArticleNumber,
  parseContranNormativeReferences,
  parseResolution
} from './contran-normative-reference-parser.mjs';

const DEFAULT_DIR = 'C:/Users/Justi/AppData/Local/Temp/contran_patch_v66_257eed753b9a4a1bb282a853590cde8a';
const MIGRATION_FILE = path.join(packageRoot, 'migrations', '20260618_contran_normative_articles.sql');

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(args.dir || DEFAULT_DIR);
  const indexFile = path.resolve(args.index || path.join(sourceDir, 'indice_normativo_contran_prf_v6_6.json'));
  const patchFile = path.resolve(args.patch || path.join(sourceDir, 'patch_comentarios_contran_prf_v6_6_didatico.jsonl'));
  const dryRun = Boolean(args['dry-run']);

  const articles = await loadArticleIndex(indexFile);
  const patchItems = await loadPatch(patchFile);
  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'import-contran-normative-articles-v6-6'
  });
  const report = {
    dryRun,
    database: { source: selected.sourceName, url: selected.redactedConnectionString },
    sourceDir,
    indexFile,
    patchFile,
    articlesInSource: articles.length,
    patchItems: patchItems.length,
    articlesImported: 0,
    referencesLinked: 0,
    referencesNeedingReview: 0,
    missingQueued: 0,
    pendingQuestions: 0,
    examples: {}
  };

  await client.connect();
  try {
    await client.query('BEGIN');
    await applyMigration(client);
    report.articlesImported = await upsertArticles(client, articles);
    const linked = await linkQuestionReferences(client, patchItems);
    Object.assign(report, linked);
    report.examples = await collectExamples(client);
    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  await fs.mkdir(path.join(packageRoot, 'reports'), { recursive: true });
  const reportPath = path.join(packageRoot, 'reports', 'contran_normative_import_v6_6_report.json');
  await fs.writeFile(reportPath, JSON.stringify({ ok: true, ...report }, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    ok: true,
    ...report,
    reportPath,
    aviso: dryRun
      ? 'Dry-run concluido; nenhuma alteracao persistida.'
      : 'Importacao normativa concluida sem alterar questoes, alternativas, gabaritos, respostas ou estatisticas.'
  }, null, 2));
}

async function applyMigration(client) {
  const sql = await fs.readFile(MIGRATION_FILE, 'utf8');
  await client.query(sql);
}

async function loadArticleIndex(file) {
  const items = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(items)) throw new Error('Indice normativo invalido: esperado array.');
  return items.map((item) => {
    const resolution = parseResolution(item.resolution || '');
    const article = normalizeArticleNumber(item.article || '');
    if (!resolution || !article || !cleanText(item.full_text)) {
      throw new Error(`Artigo invalido no indice: ${JSON.stringify(item).slice(0, 200)}`);
    }
    return {
      ...resolution,
      article,
      paragraph: '',
      item: '',
      subitem: '',
      annex: '',
      title: `${resolution.resolution}, Art. ${article}`,
      fullText: cleanText(item.full_text),
      plainText: cleanText(item.full_text),
      sourceName: cleanText(item.source || 'Pacote V6.6 PRF/CONTRAN'),
      sourceVersionDate: cleanText(item.patch_version || 'V6_6_DIDATICO_2026-06-18')
    };
  });
}

async function loadPatch(file) {
  const content = await fs.readFile(file, 'utf8');
  return content.trimEnd().split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`JSONL invalido na linha ${index + 1}: ${error.message}`);
    }
  });
}

async function upsertArticles(client, articles) {
  let changed = 0;
  for (const article of articles) {
    const result = await client.query(`
      INSERT INTO contran_normative_articles (
        resolution, resolution_number, resolution_year, article, paragraph, item, subitem, annex,
        title, full_text, plain_text, source_name, source_version_date, is_current, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, 1, CURRENT_TIMESTAMP
      )
      ON CONFLICT (resolution_number, resolution_year, article, paragraph, item, subitem, annex)
      DO UPDATE SET
        resolution = excluded.resolution,
        title = excluded.title,
        full_text = excluded.full_text,
        plain_text = excluded.plain_text,
        source_name = excluded.source_name,
        source_version_date = excluded.source_version_date,
        is_current = 1,
        updated_at = CURRENT_TIMESTAMP
    `, [
      article.resolution,
      article.resolutionNumber,
      article.resolutionYear,
      article.article,
      article.paragraph,
      article.item,
      article.subitem,
      article.annex,
      article.title,
      article.fullText,
      article.plainText,
      article.sourceName,
      article.sourceVersionDate
    ]);
    changed += result.rowCount || 0;
  }
  return changed;
}

async function linkQuestionReferences(client, patchItems) {
  let referencesLinked = 0;
  let referencesNeedingReview = 0;
  let missingQueued = 0;
  let pendingQuestions = 0;

  for (const item of patchItems) {
    const rawReference = cleanText(item.fundamento_normativo_new || item.normative_reference_new || item.article_reference_new);
    const parsed = parseContranNormativeReferences(rawReference);
    const references = parsed.references;
    if (item.article_full_text_status === 'pending_exact_full_text') pendingQuestions += 1;
    if (!parsed.ok) referencesNeedingReview += 1;

    for (let index = 0; index < references.length; index += 1) {
      const ref = references[index];
      const articleId = await findArticleId(client, ref);
      const needsReview = !articleId || parsed.needsReview;
      if (needsReview) referencesNeedingReview += 1;
      await upsertQuestionReference(client, item, ref, articleId, rawReference, index, needsReview);
      referencesLinked += 1;
      if (!articleId) {
        await queueMissingReference(client, item, ref, rawReference);
        missingQueued += 1;
      }
    }

    if (!references.length) {
      const fallbackResolution = parseResolution(rawReference || item.current_resolution || '');
      if (fallbackResolution) {
        await queueMissingReference(client, item, {
          ...fallbackResolution,
          article: '',
          paragraph: '',
          item: '',
          subitem: '',
          annex: ''
        }, rawReference);
        missingQueued += 1;
      }
    }
  }

  return { referencesLinked, referencesNeedingReview, missingQueued, pendingQuestions };
}

async function findArticleId(client, ref) {
  if (!ref.article && !ref.annex) return null;
  const result = await client.query(`
    SELECT id
    FROM contran_normative_articles
    WHERE resolution_number = $1
      AND resolution_year = $2
      AND article = $3
      AND paragraph = ''
      AND item = ''
      AND subitem = ''
      AND annex = $4
      AND is_current = 1
    LIMIT 1
  `, [ref.resolutionNumber, ref.resolutionYear, ref.article || '', ref.annex || '']);
  return result.rows[0]?.id || null;
}

async function upsertQuestionReference(client, item, ref, articleId, rawReference, index, needsReview) {
  await client.query(`
    INSERT INTO contran_question_normative_references (
      question_id, external_id, normative_article_id, resolution, resolution_number, resolution_year,
      article, paragraph, item, subitem, annex, raw_reference, display_order,
      needs_normative_reference_review, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12, $13,
      $14, CURRENT_TIMESTAMP
    )
    ON CONFLICT (question_id, resolution_number, resolution_year, article, paragraph, item, subitem, annex)
    DO UPDATE SET
      external_id = excluded.external_id,
      normative_article_id = excluded.normative_article_id,
      resolution = excluded.resolution,
      raw_reference = excluded.raw_reference,
      display_order = excluded.display_order,
      needs_normative_reference_review = excluded.needs_normative_reference_review,
      updated_at = CURRENT_TIMESTAMP
  `, [
    Number(item.id),
    cleanText(item.external_id),
    articleId,
    ref.resolution,
    ref.resolutionNumber,
    ref.resolutionYear,
    ref.article || '',
    ref.paragraph || '',
    ref.item || '',
    ref.subitem || '',
    ref.annex || '',
    rawReference,
    index + 1,
    needsReview ? 1 : 0
  ]);
}

async function queueMissingReference(client, item, ref, rawReference) {
  await client.query(`
    INSERT INTO missing_normative_articles_queue (
      resolution, resolution_number, resolution_year, article, paragraph, item, subitem, annex,
      question_id, external_id, raw_reference, status, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, 'PENDENTE', CURRENT_TIMESTAMP
    )
    ON CONFLICT (resolution_number, resolution_year, article, paragraph, item, subitem, annex, question_id)
    DO UPDATE SET
      external_id = excluded.external_id,
      raw_reference = excluded.raw_reference,
      status = 'PENDENTE',
      updated_at = CURRENT_TIMESTAMP
  `, [
    ref.resolution || '',
    ref.resolutionNumber || '',
    ref.resolutionYear || '',
    ref.article || '',
    ref.paragraph || '',
    ref.item || '',
    ref.subitem || '',
    ref.annex || '',
    Number(item.id),
    cleanText(item.external_id),
    rawReference
  ]);
}

async function collectExamples(client) {
  const multiple = await client.query(`
    SELECT question_id, raw_reference, COUNT(*)::int AS refs
    FROM contran_question_normative_references
    GROUP BY question_id, raw_reference
    HAVING COUNT(*) >= 3
    ORDER BY question_id
    LIMIT 1
  `);
  const available = await client.query(`
    SELECT cqr.question_id, cqr.raw_reference, cna.title, left(cna.plain_text, 180) AS text
    FROM contran_question_normative_references cqr
    JOIN contran_normative_articles cna ON cna.id = cqr.normative_article_id
    ORDER BY cqr.question_id, cqr.display_order
    LIMIT 1
  `);
  const pending = await client.query(`
    SELECT question_id, raw_reference, resolution, article
    FROM missing_normative_articles_queue
    WHERE status = 'PENDENTE'
    ORDER BY question_id
    LIMIT 1
  `);
  const pendingSummary = await client.query(`
    SELECT resolution, article, COUNT(DISTINCT question_id)::int AS questions
    FROM missing_normative_articles_queue
    WHERE status = 'PENDENTE'
    GROUP BY resolution, article
    ORDER BY questions DESC, resolution, article
    LIMIT 20
  `);
  return {
    multipleArticles: multiple.rows[0] || null,
    availableArticle: available.rows[0] || null,
    pendingArticle: pending.rows[0] || null,
    pendingSummary: pendingSummary.rows
  };
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

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}
