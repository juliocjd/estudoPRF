import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT_DIR,
  excerpt,
  normalizeSearchText,
  normalizeWhitespace,
  openCliDatabase,
  parseArgs,
  sha256,
  upsertLegalArticle,
  upsertLegalSource
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const seedPath = path.resolve(ROOT_DIR, args.seed || 'data/traffic_legal_sources_seed_v1.json');
const shouldFetch = !args['no-fetch'];
const { db, client } = openCliDatabase(args);

try {
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  const sources = [
    ...(seed.canonical_sources || []),
    ...(seed.high_priority_resolution_examples || [])
  ];

  let imported = 0;
  let articleCount = 0;
  let errors = 0;

  console.log(`# Importacao de fontes legais`);
  console.log(`Banco: ${client}`);
  console.log(`Seed: ${seedPath}`);
  console.log(`Fontes no seed: ${sources.length}`);
  console.log(`Download de texto oficial: ${shouldFetch ? 'sim' : 'nao (--no-fetch)'}`);

  for (let index = 0; index < sources.length; index += 1) {
    const source = normalizeSeedSource(sources[index]);
    process.stdout.write(`[${index + 1}/${sources.length}] ${source.key}... `);
    try {
      let rawText = '';
      let importError = '';
      if (shouldFetch && source.url) {
        try {
          rawText = await fetchOfficialText(source.url);
        } catch (error) {
          importError = error.message || String(error);
          errors += 1;
        }
      }

      const row = upsertLegalSource(db, {
        ...source,
        raw_text: rawText,
        raw_hash: rawText ? sha256(rawText) : '',
        fetched_at: rawText ? nowSql() : null,
        indexed_at: rawText ? nowSql() : null,
        import_error: importError
      });
      imported += 1;

      const articles = rawText ? extractLegalArticles(rawText) : [];
      for (const article of articles) {
        upsertLegalArticle(db, row.id, article);
        articleCount += 1;
      }

      console.log(importError ? `fonte salva, erro ao baixar: ${importError}` : `ok (${articles.length} artigo(s))`);
    } catch (error) {
      errors += 1;
      console.log(`erro: ${error.message || error}`);
    }
  }

  console.log('');
  console.log(`# Resultado`);
  console.log(`Fontes importadas/atualizadas: ${imported}`);
  console.log(`Artigos extraidos: ${articleCount}`);
  console.log(`Erros: ${errors}`);
} finally {
  db.close();
}

function normalizeSeedSource(item = {}) {
  return {
    key: item.key,
    type: item.type || (item.resolution_number ? 'resolution_pdf' : 'official_source'),
    title: item.title || item.key,
    source_org: item.source_org || '',
    url: item.url || '',
    status: item.status || 'active',
    resolution_number: item.resolution_number || item.number || '',
    year: item.year || null,
    priority: item.priority || 50,
    notes: item.notes || ''
  };
}

async function fetchOfficialText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'prf-study-legal-importer/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (contentType.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
    return extractPdfText(bytes);
  }
  const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return htmlToText(html);
}

async function extractPdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || '').join(' '));
  }
  return normalizeWhitespace(pages.join('\n\n'));
}

function htmlToText(html) {
  return normalizeWhitespace(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'));
}

export function extractLegalArticles(rawText) {
  const text = normalizeWhitespace(rawText);
  const matches = [...text.matchAll(/\bArt\.?\s*(\d+[A-Zº°-]*)\s*[.\-–]/gi)];
  const articles = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index || 0;
    const end = matches[index + 1]?.index || text.length;
    const chunk = normalizeWhitespace(text.slice(start, end));
    if (chunk.length < 24) continue;
    const ref = `art. ${match[1]}`;
    articles.push({
      article_ref: ref,
      article_order: Number(String(match[1]).match(/\d+/)?.[0] || index + 1),
      heading: '',
      text: chunk,
      normalized_text: normalizeSearchText(chunk),
      excerpt: excerpt(chunk)
    });
  }
  return articles;
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
