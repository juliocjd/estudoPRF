import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OFFICIAL_RESOLUTIONS_INDEX = 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/resolucoes-contran';

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

export function openLawCompendiumDatabase(args = {}) {
  const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
  const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
  const client = args['db-client'] || process.env.DB_CLIENT || '';
  const opened = openStudyDatabase({ dbPath, databaseUrl, client });
  initLawCompendiumSchema(opened.db, opened.client);
  return opened;
}

export function initLawCompendiumSchema(db, client = 'sqlite') {
  if (client === 'postgres') {
    const migrationPath = path.join(ROOT_DIR, 'migrations', 'migration_law_compendium_prf_postgres_v1.sql');
    const hasSourcesTable = db.prepare(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'law_compendium_sources'
    `).get();
    if (!hasSourcesTable && fs.existsSync(migrationPath)) db.exec(fs.readFileSync(migrationPath, 'utf8'));
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS law_compendium_sources (
      slug TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      number TEXT,
      year INTEGER,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT DEFAULT 'draft',
      current_status TEXT,
      official_url TEXT,
      official_index_url TEXT,
      source_hash TEXT,
      raw_text TEXT,
      raw_html TEXT,
      raw_pdf_path TEXT,
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
      official_checked_at TEXT,
      effective_at TEXT,
      revoked_at TEXT,
      replaces TEXT DEFAULT '[]',
      replaced_by TEXT DEFAULT '[]',
      edital_origin TEXT DEFAULT '[]',
      validation_notes TEXT,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS law_compendium_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_slug TEXT NOT NULL,
      section_key TEXT NOT NULL,
      parent_section_key TEXT,
      hierarchy_level TEXT NOT NULL,
      display_ref TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      normalized_text TEXT,
      order_index INTEGER DEFAULT 0,
      is_revoked INTEGER DEFAULT 0,
      is_current INTEGER DEFAULT 1,
      extraction_confidence REAL DEFAULT 1,
      raw_fragment TEXT,
      UNIQUE(source_slug, section_key)
    );

    CREATE INDEX IF NOT EXISTS idx_law_sections_source_order
      ON law_compendium_sections(source_slug, order_index);
    CREATE INDEX IF NOT EXISTS idx_law_sections_display_ref
      ON law_compendium_sections(source_slug, display_ref);
    CREATE INDEX IF NOT EXISTS idx_law_sections_normalized_text
      ON law_compendium_sections(normalized_text);

    CREATE TABLE IF NOT EXISTS law_compendium_cross_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_slug TEXT NOT NULL,
      section_id INTEGER,
      ref_text TEXT NOT NULL,
      target_source_slug TEXT,
      target_locator TEXT,
      resolved_section_id INTEGER,
      quoted_target_text TEXT,
      resolution_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_law_cross_refs_section
      ON law_compendium_cross_references(section_id);
    CREATE INDEX IF NOT EXISTS idx_law_cross_refs_target
      ON law_compendium_cross_references(target_source_slug, target_locator);

    CREATE TABLE IF NOT EXISTS law_compendium_study_summaries (
      source_slug TEXT PRIMARY KEY,
      top_summary TEXT NOT NULL,
      what_it_covers TEXT DEFAULT '[]',
      high_yield_points TEXT DEFAULT '[]',
      common_traps TEXT DEFAULT '[]',
      related_ctb_articles TEXT DEFAULT '[]',
      generated_by TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS law_section_question_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      link_kind TEXT NOT NULL DEFAULT 'tested_by',
      evidence TEXT,
      confidence REAL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(section_id, question_id, link_kind)
    );

    CREATE INDEX IF NOT EXISTS idx_law_question_links_question
      ON law_section_question_links(question_id);
    CREATE INDEX IF NOT EXISTS idx_law_question_links_section
      ON law_section_question_links(section_id);

    CREATE TABLE IF NOT EXISTS law_section_comment_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      question_id INTEGER,
      comment_source TEXT DEFAULT 'tec',
      excerpt TEXT,
      evidence TEXT,
      confidence REAL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_law_comment_links_section
      ON law_section_comment_links(section_id);
    CREATE INDEX IF NOT EXISTS idx_law_comment_links_question
      ON law_section_comment_links(question_id);

    CREATE TABLE IF NOT EXISTS law_compendium_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_key TEXT UNIQUE,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      status TEXT DEFAULT 'running',
      sources_total INTEGER DEFAULT 0,
      sources_imported INTEGER DEFAULT 0,
      sections_imported INTEGER DEFAULT 0,
      cross_refs_found INTEGER DEFAULT 0,
      cross_refs_resolved INTEGER DEFAULT 0,
      errors TEXT DEFAULT '[]',
      report TEXT DEFAULT '{}'
    );
  `);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, filePath), 'utf8'));
}

export function writeJson(filePath, value) {
  const resolved = path.resolve(ROOT_DIR, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(filePath, value) {
  const resolved = path.resolve(ROOT_DIR, filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, String(value), 'utf8');
}

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\u0096/g, '–')
    .replace(/\u0097/g, '—')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function jsonValue(value) {
  return JSON.stringify(value ?? []);
}

export function safeJson(value, fallback = null) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

export async function fetchOfficialText(url, options = {}) {
  let contentType = '';
  let buffer;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PRF-Study-Law-Compendium/1.0',
        Accept: 'text/html,application/pdf,*/*'
      },
      redirect: 'follow'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao baixar ${url}`);
    }
    contentType = response.headers.get('content-type') || '';
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    const fallback = downloadViaPowerShell(url);
    contentType = fallback.contentType;
    buffer = fallback.buffer;
  }
  if (/pdf/i.test(contentType) || /\.pdf(?:$|\?)/i.test(url)) {
    const text = await extractPdfText(buffer);
    return { contentType, rawHtml: '', rawText: text, buffer };
  }
  const html = decodeBuffer(buffer);
  return { contentType, rawHtml: html, rawText: htmlToText(html), buffer };
}

function downloadViaPowerShell(url) {
  const outPath = path.join(ROOT_DIR, `.law-compendium-download-${sha256(url).slice(0, 16)}.bin`);
  const command = [
    '& { param([string]$Url, [string]$Out)',
    "$ProgressPreference = 'SilentlyContinue'",
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
    'Invoke-WebRequest -Uri $Url -UseBasicParsing -OutFile $Out -TimeoutSec 90',
    '}'
  ].join('; ');
  try {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
      url,
      outPath
    ], { timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return {
      contentType: /\.pdf(?:$|\?)/i.test(url) ? 'application/pdf' : 'text/html',
      buffer: fs.readFileSync(outPath)
    };
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
}

async function extractPdfText(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || '').join(' '));
  }
  return normalizeWhitespace(pages.join('\n\n'));
}

function decodeBuffer(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return buffer.toString('latin1');
}

export function htmlToText(html) {
  return normalizeWhitespace(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;/gi, "'"));
}

export function extractLinksFromHtml(html, baseUrl) {
  const links = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = null;
  while ((match = pattern.exec(String(html || '')))) {
    const text = htmlToText(match[2]).replace(/\s+/g, ' ').trim();
    let href = match[1].trim();
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    links.push({ href, text });
  }
  return links;
}

export function findResolutionLink(indexHtml, number, year, baseUrl = OFFICIAL_RESOLUTIONS_INDEX) {
  const normalizedNumber = String(Number(number || 0));
  const padded = normalizedNumber.padStart(3, '0');
  const yearText = String(year || '');
  const links = extractLinksFromHtml(indexHtml, baseUrl);
  const candidates = links
    .map((link) => ({ ...link, haystack: normalizeSearchText(`${link.text} ${link.href}`) }))
    .filter((link) => (
      (link.haystack.includes(`resolucao contran ${normalizedNumber}`) || link.haystack.includes(`resolucao ${normalizedNumber}`) || link.haystack.includes(` ${padded} `))
      && (!yearText || link.haystack.includes(yearText))
    ));
  return candidates[0] || null;
}

export function sourceFromSeed(raw) {
  return {
    slug: String(raw.slug || '').trim(),
    sourceType: String(raw.type || raw.source_type || '').trim(),
    number: raw.number == null ? '' : String(raw.number),
    year: raw.year == null ? null : Number(raw.year),
    title: String(raw.title || '').trim(),
    officialUrl: String(raw.url || raw.official_url || '').trim(),
    relatedEditalItems: raw.related_edital_items || raw.edital_origin || [],
    metadata: raw
  };
}

export function upsertLawSource(db, source) {
  db.prepare(`
    INSERT INTO law_compendium_sources (
      slug, source_type, number, year, title, summary, status, current_status,
      official_url, official_index_url, source_hash, raw_text, raw_html, raw_pdf_path,
      official_checked_at, effective_at, revoked_at, replaces, replaced_by,
      edital_origin, validation_notes, metadata, imported_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET
      source_type = excluded.source_type,
      number = excluded.number,
      year = excluded.year,
      title = excluded.title,
      summary = excluded.summary,
      status = excluded.status,
      current_status = excluded.current_status,
      official_url = excluded.official_url,
      official_index_url = excluded.official_index_url,
      source_hash = excluded.source_hash,
      raw_text = excluded.raw_text,
      raw_html = excluded.raw_html,
      raw_pdf_path = excluded.raw_pdf_path,
      official_checked_at = excluded.official_checked_at,
      effective_at = excluded.effective_at,
      revoked_at = excluded.revoked_at,
      replaces = excluded.replaces,
      replaced_by = excluded.replaced_by,
      edital_origin = excluded.edital_origin,
      validation_notes = excluded.validation_notes,
      metadata = excluded.metadata,
      imported_at = CURRENT_TIMESTAMP
  `).run(
    source.slug,
    source.sourceType,
    source.number || '',
    source.year || null,
    source.title,
    source.summary || '',
    source.status || 'draft',
    source.currentStatus || '',
    source.officialUrl || '',
    source.officialIndexUrl || '',
    source.sourceHash || '',
    source.rawText || '',
    source.rawHtml || '',
    source.rawPdfPath || '',
    source.officialCheckedAt || null,
    source.effectiveAt || null,
    source.revokedAt || null,
    jsonValue(source.replaces || []),
    jsonValue(source.replacedBy || []),
    jsonValue(source.editalOrigin || []),
    source.validationNotes || '',
    jsonValue(source.metadata || {})
  );
}

export function replaceLawSections(db, sourceSlug, sections) {
  db.prepare('DELETE FROM law_compendium_cross_references WHERE source_slug = ?').run(sourceSlug);
  db.prepare('DELETE FROM law_section_question_links WHERE section_id IN (SELECT id FROM law_compendium_sections WHERE source_slug = ?)').run(sourceSlug);
  db.prepare('DELETE FROM law_section_comment_links WHERE section_id IN (SELECT id FROM law_compendium_sections WHERE source_slug = ?)').run(sourceSlug);
  db.prepare('DELETE FROM law_compendium_sections WHERE source_slug = ?').run(sourceSlug);
  const insert = db.prepare(`
    INSERT INTO law_compendium_sections (
      source_slug, section_key, parent_section_key, hierarchy_level, display_ref,
      title, text, normalized_text, order_index, is_revoked, is_current,
      extraction_confidence, raw_fragment
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const section of sections) {
    insert.run(
      sourceSlug,
      section.sectionKey,
      section.parentSectionKey || '',
      section.hierarchyLevel,
      section.displayRef,
      section.title || '',
      section.text,
      normalizeSearchText(section.text),
      section.orderIndex,
      section.isRevoked ? 1 : 0,
      section.isCurrent === false ? 0 : 1,
      section.extractionConfidence ?? 1,
      section.rawFragment || section.text
    );
  }
}

export function extractLawSections(sourceSlug, rawText) {
  const preparedText = prepareLawTextForSectioning(rawText);
  const lines = preparedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sections = [];
  const usedSectionKeys = new Set();
  let orderIndex = 0;
  let currentArticleKey = '';

  for (const line of lines) {
    if (isOfficialFooterLine(line)) continue;
    const parsed = parseLawLineStable(line, currentArticleKey);
    if (!parsed) {
      if (sections.length && currentArticleKey) {
        const previous = sections[sections.length - 1];
        previous.text = normalizeWhitespace(`${previous.text} ${line}`);
        previous.rawFragment = normalizeWhitespace(`${previous.rawFragment || previous.text} ${line}`);
      }
      continue;
    }
    if (parsed.hierarchyLevel === 'item' && sections.length) {
      const previous = sections[sections.length - 1];
      previous.text = normalizeWhitespace(`${previous.text} ${line}`);
      previous.rawFragment = normalizeWhitespace(`${previous.rawFragment || previous.text} ${line}`);
      continue;
    }
    if (isNonPublishableLegalDevice(parsed)) continue;
    if (parsed.hierarchyLevel === 'artigo') currentArticleKey = parsed.sectionKey;
    const rawSectionKey = `${sourceSlug}:${parsed.sectionKey}`;
    const sectionKey = uniqueSectionKey(rawSectionKey, usedSectionKeys);
    sections.push({
      ...parsed,
      sectionKey,
      parentSectionKey: parsed.parentSectionKey ? `${sourceSlug}:${parsed.parentSectionKey}` : '',
      orderIndex: orderIndex += 10,
      extractionConfidence: parsed.hierarchyLevel === 'item' ? 0.72 : 0.9
    });
  }

  if (!sections.length && rawText) {
    sections.push({
      sectionKey: `${sourceSlug}:texto_integral`,
      parentSectionKey: '',
      hierarchyLevel: 'item',
      displayRef: 'Texto integral',
      title: '',
      text: normalizeWhitespace(rawText),
      rawFragment: normalizeWhitespace(rawText),
      orderIndex: 10,
      extractionConfidence: 0.3
    });
  }

  return sections.filter((section) => !isNonPublishableLegalDevice(section));
}

function prepareLawTextForSectioning(rawText) {
  return normalizeWhitespace(rawText)
    .replace(/§\s*\n+\s*(\d+[º°]?)/g, '§ $1')
    .replace(/§\s+(\d+[º°]?)/g, '§ $1')
    .replace(/\s+(Art\.?\s*\d+[A-Za-zº°-]*\.?)/g, '\n$1')
    .replace(/\s+((?:§\s*\d+[º°]?|Parágrafo\s+único)\.?\s*)/gi, '\n$1')
    .replace(/\s+((?:CAP[IÍ]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O)\s+[IVXLCDM\d]+\b)/gi, '\n$1')
    .replace(/\s+([IVXLCDM]+)\s*[-–—.]\s+/g, '\n$1 - ')
    .replace(/\s+([a-z]\)\s+)/g, '\n$1')
    .replace(/\s+(ANEXO\s+[IVXLCDM\d]+\b)/gi, '\n$1');
}

function isNonPublishableLegalDevice(section) {
  if (!section || !/\b(revogado|revogada|vetado)\b/i.test(section.text || '')) return false;
  if (!['artigo', 'paragrafo', 'inciso', 'alinea'].includes(section.hierarchyLevel)) return false;
  const displayRef = String(section.displayRef || '').trim();
  let body = String(section.text || '').trim();
  if (displayRef) {
    const escapedRef = displayRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`^${escapedRef}\\s*[-–—.]?\\s*`, 'i'), '').trim();
  }
  return /^(?:[º°o]\s+)?(?:§\s*\d+\s*[º°o]?\s*)?\(?\s*(?:vetado|revogado|revogada)(?:\s+pela\b[^)]*)?\s*\)?\s*[.;]?\s*(?:e)?(?:\s*\([^)]*\))*\s*$/i.test(body);
}

function isOfficialFooterLine(line) {
  return /^(Bras[ií]lia,|Independ[eê]ncia\b|Este texto n[aã]o substitui|DOU de\b|Di[aá]rio Oficial|EM[IÍ]LIO\b|Presid[eê]ncia da Rep[uú]blica)/i.test(String(line || '').trim());
}

function uniqueSectionKey(baseKey, usedKeys) {
  if (!usedKeys.has(baseKey)) {
    usedKeys.add(baseKey);
    return baseKey;
  }
  let suffix = 2;
  let nextKey = `${baseKey}_${suffix}`;
  while (usedKeys.has(nextKey)) {
    suffix += 1;
    nextKey = `${baseKey}_${suffix}`;
  }
  usedKeys.add(nextKey);
  return nextKey;
}

function parseLawLineStable(line, currentArticleKey) {
  const revoked = /\b(revogado|revogada|vetado)\b/i.test(line);
  const annex = line.match(/^(ANEXO|Anexo)\s+([IVXLCDM\d]+)?\b(.*)$/i);
  if (annex) {
    const ref = `Anexo ${annex[2] || ''}`.trim();
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: 'anexo',
      displayRef: ref,
      title: annex[3]?.trim() || '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const article = line.match(/^(Art\.?\s*\d+[A-Za-zº°-]*\.?)(.*)$/);
  if (article) {
    const ref = normalizeDisplayRef(article[1]);
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: 'artigo',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const paragraph = line.match(/^((?:§\s*\d+[º°]?|Parágrafo\s+único)\.?\s*)(.*)$/i);
  if (paragraph && currentArticleKey) {
    const ref = normalizeDisplayRef(paragraph[1]);
    return {
      sectionKey: `${currentArticleKey}:${slugKey(ref)}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'paragrafo',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const annexHeading = line.match(/^([IVXLCDM]+)\s*[-–—.]\s+((?:CAP[IÍ]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O)\b.*)$/i);
  if (annexHeading) {
    const ref = `Anexo ${annexHeading[1]}`;
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: 'anexo',
      displayRef: ref,
      title: annexHeading[2]?.trim() || '',
      text: `${ref} - ${annexHeading[2]}`,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const inciso = line.match(/^([IVXLCDM]+)\s*[-–—.]\s+(.*)$/);
  if (inciso && currentArticleKey) {
    const ref = inciso[1];
    return {
      sectionKey: `${currentArticleKey}:inciso_${ref.toLowerCase()}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'inciso',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const alinea = line.match(/^([a-z])\)\s+(.*)$/i);
  if (alinea && currentArticleKey) {
    const ref = `${alinea[1].toLowerCase()})`;
    return {
      sectionKey: `${currentArticleKey}:alinea_${alinea[1].toLowerCase()}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'alinea',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  if (/^(CAP[IÍ]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O)\b/i.test(line)) {
    const ref = line.slice(0, 80);
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: /^T/i.test(line) ? 'titulo' : /^CAP/i.test(line) ? 'capitulo' : 'secao',
      displayRef: ref,
      title: line,
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  if (currentArticleKey && line.length > 15 && line.length < 1200) {
    return {
      sectionKey: `${currentArticleKey}:item_${sha256(line).slice(0, 10)}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'item',
      displayRef: 'Item',
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  return null;
}

function parseLawLine(line, currentArticleKey) {
  const revoked = /\b(revogado|revogada)\b/i.test(line);
  const annex = line.match(/^(ANEXO|Anexo)\s+([IVXLCDM\d]+)?\b(.*)$/i);
  if (annex) {
    const ref = `Anexo ${annex[2] || ''}`.trim();
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: 'anexo',
      displayRef: ref,
      title: annex[3]?.trim() || '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const article = line.match(/^(Art\.?\s*\d+[A-Za-zº°-]*\.?)(.*)$/i);
  if (article) {
    const ref = normalizeDisplayRef(article[1]);
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: 'artigo',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const paragraph = line.match(/^((?:§\s*\d+[º°]?|Parágrafo\s+único)\.?\s*)(.*)$/i);
  if (paragraph && currentArticleKey) {
    const ref = normalizeDisplayRef(paragraph[1]);
    return {
      sectionKey: `${currentArticleKey}:${slugKey(ref)}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'paragrafo',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const inciso = line.match(/^([IVXLCDM]+)\s*[-–—.]\s+(.*)$/);
  if (inciso && currentArticleKey) {
    const ref = inciso[1];
    return {
      sectionKey: `${currentArticleKey}:inciso_${ref.toLowerCase()}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'inciso',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  const alinea = line.match(/^([a-z])\)\s+(.*)$/i);
  if (alinea && currentArticleKey) {
    const ref = `${alinea[1].toLowerCase()})`;
    return {
      sectionKey: `${currentArticleKey}:alinea_${alinea[1].toLowerCase()}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'alinea',
      displayRef: ref,
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  if (/^(CAP[IÍ]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O)\b/i.test(line)) {
    const ref = line.slice(0, 80);
    return {
      sectionKey: slugKey(ref),
      parentSectionKey: '',
      hierarchyLevel: /^T/i.test(line) ? 'titulo' : /^CAP/i.test(line) ? 'capitulo' : 'secao',
      displayRef: ref,
      title: line,
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  if (currentArticleKey && line.length > 15 && line.length < 1200) {
    return {
      sectionKey: `${currentArticleKey}:item_${sha256(line).slice(0, 10)}`,
      parentSectionKey: currentArticleKey,
      hierarchyLevel: 'item',
      displayRef: 'Item',
      title: '',
      text: line,
      rawFragment: line,
      isRevoked: revoked
    };
  }

  return null;
}

function normalizeDisplayRef(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\.$/, '').trim();
}

function slugKey(value) {
  return normalizeSearchText(value).replace(/\s+/g, '_').slice(0, 90) || 'secao';
}

export function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

export function columnExists(db, tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

export function renderList(items) {
  return (items || []).map((item) => `- ${item}`).join('\n');
}
