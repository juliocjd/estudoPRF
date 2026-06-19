#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const DEFAULT_DIR = 'C:/Users/Justi/AppData/Local/Temp/contran_articles_v67_dec0cc829add4a7d9a5147b1188d1523';
const DEFAULT_EXPECTED_TOTAL = 461;
const MIGRATION_FILE = path.join(packageRoot, 'migrations', '20260618_contran_normative_articles.sql');

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, report: error.report || null }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(args.dir || DEFAULT_DIR);
  const patchFile = path.resolve(args.file || path.join(sourceDir, 'contran_normative_articles_patch_v6_7.jsonl'));
  const manifestFile = path.resolve(args.manifest || path.join(sourceDir, 'manifest_patch_artigos_contran_prf_v6_7.json'));
  const dryRun = Boolean(args['dry-run']);
  const expectedTotal = Number(args['expected-total'] || DEFAULT_EXPECTED_TOTAL);
  const articles = await loadPatch(patchFile, expectedTotal);
  const manifest = await loadManifest(manifestFile);
  const backupPath = path.join(
    packageRoot,
    'exports',
    `backup_contran_normative_articles_before_v6_7_${timestampForFile(new Date())}.jsonl`
  );

  const { client, selected } = createClient({
    preferDirect: true,
    applicationName: 'import-contran-normative-articles-v6-7'
  });

  const report = {
    dryRun,
    database: {
      source: selected.sourceName,
      url: selected.redactedConnectionString
    },
    patchFile,
    manifestFile,
    backupPath,
    expectedTotal,
    patchTotal: articles.length,
    manifestTotal: manifest?.total_article_rows || null,
    beforeCount: 0,
    insertedOrUpdated: 0,
    afterCount: 0,
    duplicateKeys: [],
    explicitReferencesValidated: {},
    untouchedTables: [
      'questions',
      'question_alternatives',
      'comments',
      'answer_history',
      'question_answer_stats',
      'user_answers'
    ]
  };

  await client.connect();
  try {
    await client.query('BEGIN');
    await applyMigration(client);
    report.beforeCount = await countArticles(client);
    await backupArticles(client, backupPath);
    report.insertedOrUpdated = await upsertArticles(client, articles);
    report.afterCount = await countArticles(client);
    report.explicitReferencesValidated = await validateExplicitReferences(client);
    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    error.report = report;
    throw error;
  } finally {
    await client.end().catch(() => {});
  }

  const reportPath = path.join(packageRoot, 'reports', 'contran_normative_articles_import_v6_7_report.json');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ ok: true, ...report }, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({
    ok: true,
    ...report,
    reportPath,
    aviso: dryRun
      ? 'Dry-run concluido; nenhuma alteracao persistida.'
      : 'Importacao V6.7 concluida. Apenas contran_normative_articles recebeu upsert.'
  }, null, 2));
}

async function applyMigration(client) {
  const sql = await fs.readFile(MIGRATION_FILE, 'utf8');
  await client.query(sql);
}

async function loadPatch(file, expectedTotal) {
  const content = await fs.readFile(file, 'utf8');
  const rows = content.trimEnd().split('\n').filter(Boolean).map((line, index) => {
    try {
      return normalizeArticle(JSON.parse(line), index + 1);
    } catch (error) {
      throw new Error(`Linha ${index + 1} invalida no patch V6.7: ${error.message}`);
    }
  });
  if (rows.length !== expectedTotal) {
    throw new Error(`Patch V6.7 deveria ter ${expectedTotal} artigos; encontrado ${rows.length}.`);
  }
  const keys = new Set();
  const duplicateKeys = [];
  for (const row of rows) {
    const key = articleKey(row);
    if (keys.has(key)) duplicateKeys.push(key);
    keys.add(key);
  }
  if (duplicateKeys.length) {
    throw new Error(`Patch V6.7 contem chaves duplicadas: ${duplicateKeys.slice(0, 5).join(', ')}`);
  }
  return rows;
}

async function loadManifest(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeArticle(item, lineNumber) {
  const article = {
    resolution: cleanText(item.resolution),
    resolutionNumber: cleanText(item.resolution_number),
    resolutionYear: cleanText(item.resolution_year),
    article: cleanText(item.article),
    paragraph: cleanText(item.paragraph),
    item: cleanText(item.item),
    subitem: cleanText(item.subitem),
    annex: cleanText(item.annex),
    title: cleanText(item.title),
    fullText: cleanText(item.full_text),
    plainText: cleanText(item.plain_text || item.full_text),
    sourceUrl: cleanText(item.source_url),
    sourceName: cleanText(item.source_name),
    sourceVersionDate: cleanText(item.source_version_date),
    isCurrent: item.is_current === true || item.is_current === 1 || item.is_current === '1' ? 1 : 0
  };
  const missing = [];
  if (!article.resolution) missing.push('resolution');
  if (!article.resolutionNumber) missing.push('resolution_number');
  if (!article.resolutionYear) missing.push('resolution_year');
  if (!article.fullText) missing.push('full_text');
  if (!article.article && !article.annex) missing.push('article_or_annex');
  if (missing.length) {
    throw new Error(`campos obrigatorios ausentes na linha ${lineNumber}: ${missing.join(', ')}`);
  }
  return article;
}

async function backupArticles(client, backupPath) {
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  const result = await client.query(`
    SELECT *
    FROM contran_normative_articles
    ORDER BY resolution_number, resolution_year, article, paragraph, item, subitem, annex
  `);
  const content = result.rows.map((row) => JSON.stringify(row)).join('\n') + (result.rows.length ? '\n' : '');
  await fs.writeFile(backupPath, content, 'utf8');
}

async function countArticles(client) {
  const result = await client.query('SELECT COUNT(*)::int AS total FROM contran_normative_articles');
  return result.rows[0]?.total || 0;
}

async function upsertArticles(client, articles) {
  let changed = 0;
  for (const article of articles) {
    const result = await client.query(`
      INSERT INTO contran_normative_articles (
        resolution,
        resolution_number,
        resolution_year,
        article,
        paragraph,
        item,
        subitem,
        annex,
        title,
        full_text,
        plain_text,
        source_url,
        source_name,
        source_version_date,
        is_current,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP
      )
      ON CONFLICT (resolution_number, resolution_year, article, paragraph, item, subitem, annex)
      DO UPDATE SET
        resolution = excluded.resolution,
        title = excluded.title,
        full_text = excluded.full_text,
        plain_text = excluded.plain_text,
        source_url = excluded.source_url,
        source_name = excluded.source_name,
        source_version_date = excluded.source_version_date,
        is_current = excluded.is_current,
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
      article.sourceUrl,
      article.sourceName,
      article.sourceVersionDate,
      article.isCurrent
    ]);
    changed += result.rowCount || 0;
  }
  return changed;
}

async function validateExplicitReferences(client) {
  const expected = [
    ['882', '2021', '11'],
    ['882', '2021', '18'],
    ['882', '2021', '19'],
    ['882', '2021', '24'],
    ['882', '2021', '60'],
    ['882', '2021', '64']
  ];
  const result = {};
  for (const [number, year, article] of expected) {
    const rows = await client.query(`
      SELECT id, title, left(plain_text, 160) AS preview
      FROM contran_normative_articles
      WHERE resolution_number = $1
        AND resolution_year = $2
        AND article = $3
        AND paragraph = ''
        AND item = ''
        AND subitem = ''
        AND annex = ''
      LIMIT 1
    `, [number, year, article]);
    result[`Res.${number}/${year} Art.${article}`] = rows.rows[0] || null;
  }
  return result;
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

function articleKey(article) {
  return [
    article.resolutionNumber,
    article.resolutionYear,
    article.article,
    article.paragraph,
    article.item,
    article.subitem,
    article.annex
  ].join('|');
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
}

function timestampForFile(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
