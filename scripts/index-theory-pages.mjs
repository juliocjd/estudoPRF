import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = await indexTheoryPages({
    dbPath: path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite'),
    databaseUrl: args['database-url'] || process.env.DATABASE_URL || '',
    dbClient: args['db-client'] || process.env.DB_CLIENT || '',
    pdfsDir: path.resolve(ROOT_DIR, args.pdfs || 'pdfs'),
    limit: args.limit ? Math.max(1, Number(args.limit)) : 0,
    force: Boolean(args.force),
    dryRun: Boolean(args['dry-run']),
    includeInternal: Boolean(args['include-internal']),
    match: args.match || ''
  });

  console.log(renderReport(report));
}

export async function indexTheoryPages({ dbPath, databaseUrl = '', dbClient = '', pdfsDir, limit = 0, force = false, dryRun = false, includeInternal = false, match = '', onProgress = null }) {
  const { db, client } = openStudyDatabase({ dbPath, databaseUrl: normalizeDatabaseUrl(databaseUrl), client: dbClient });
  const report = {
    dbClient: client,
    pdfsDir,
    dryRun,
    force,
    foundPdfs: 0,
    processedPdfs: 0,
    indexedPages: 0,
    skippedPdfs: 0,
    errors: []
  };

  try {
    initTheoryPagesSchema(db);
    const pdfs = await listPdfFiles(pdfsDir, { includeInternal });
    report.foundPdfs = pdfs.length;
    const matchedPdfs = filterPdfFiles(pdfs, pdfsDir, match);
    const selectedPdfs = limit ? matchedPdfs.slice(0, limit) : matchedPdfs;
    emitProgress(onProgress, {
      type: 'start',
      total: selectedPdfs.length,
      foundPdfs: pdfs.length,
      pdfsDir,
      dbClient: client
    });

    for (const [index, pdfPath] of selectedPdfs.entries()) {
      const relativePath = toPosixPath(path.relative(pdfsDir, pdfPath));
      emitProgress(onProgress, {
        type: 'pdf:start',
        index: index + 1,
        total: selectedPdfs.length,
        pdf: relativePath
      });
      try {
        const existing = db.prepare('SELECT COUNT(*) AS n FROM theory_pages WHERE pdf_path = ?').get(relativePath)?.n || 0;
        if (existing && !force) {
          report.skippedPdfs += 1;
          emitProgress(onProgress, {
            type: 'pdf:skip',
            index: index + 1,
            total: selectedPdfs.length,
            pdf: relativePath,
            existingPages: existing
          });
          continue;
        }

        const meta = pdfMetadata(pdfsDir, pdfPath);
        const pages = await extractPdfPages(pdfPath);
        report.processedPdfs += 1;

        if (dryRun) {
          report.indexedPages += pages.length;
          emitProgress(onProgress, {
            type: 'pdf:dry-run',
            index: index + 1,
            total: selectedPdfs.length,
            pdf: relativePath,
            pages: pages.length
          });
          continue;
        }

        db.exec('BEGIN');
        try {
          if (force) {
            db.prepare('DELETE FROM theory_pages WHERE pdf_path = ?').run(relativePath);
          }

          const upsert = db.prepare(`
            INSERT INTO theory_pages (
              pdf_path, page_number, page_count, materia, assunto, title, text, normalized_text, indexed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(pdf_path, page_number) DO UPDATE SET
              page_count = excluded.page_count,
              materia = excluded.materia,
              assunto = excluded.assunto,
              title = excluded.title,
              text = excluded.text,
              normalized_text = excluded.normalized_text,
              indexed_at = CURRENT_TIMESTAMP
          `);

          for (const page of pages) {
            upsert.run(
              relativePath,
              page.pageNumber,
              pages.length,
              meta.materia,
              meta.assunto,
              meta.title,
              page.text,
              normalizeSearchText(page.text)
            );
          }
          db.exec('COMMIT');
          report.indexedPages += pages.length;
          emitProgress(onProgress, {
            type: 'pdf:done',
            index: index + 1,
            total: selectedPdfs.length,
            pdf: relativePath,
            pages: pages.length,
            indexedPages: report.indexedPages
          });
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      } catch (error) {
        report.errors.push({
          pdf: relativePath,
          error: formatErrorMessage(error)
        });
        emitProgress(onProgress, {
          type: 'pdf:error',
          index: index + 1,
          total: selectedPdfs.length,
          pdf: relativePath,
          error: formatErrorMessage(error)
        });
      }
    }

    emitProgress(onProgress, { type: 'finish', report });
    return report;
  } finally {
    db.close();
  }
}

function filterPdfFiles(pdfs, pdfsDir, match) {
  const needle = normalizeSearchText(match);
  if (!needle) return pdfs;
  return pdfs.filter((pdfPath) => normalizeSearchText(toPosixPath(path.relative(pdfsDir, pdfPath))).includes(needle));
}

function formatErrorMessage(error) {
  return String(error?.message || error || '')
    .replace(/\nSQL:[\s\S]*$/i, '')
    .trim();
}

function emitProgress(onProgress, event) {
  if (typeof onProgress === 'function') {
    onProgress(event);
  }
}

function initTheoryPagesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS theory_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      page_count INTEGER,
      materia TEXT,
      assunto TEXT,
      title TEXT,
      text TEXT,
      normalized_text TEXT,
      indexed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pdf_path, page_number)
    );

    CREATE INDEX IF NOT EXISTS idx_theory_pages_pdf
      ON theory_pages(pdf_path, page_number);
    CREATE INDEX IF NOT EXISTS idx_theory_pages_subject
      ON theory_pages(materia, assunto);
  `);
}

async function listPdfFiles(baseDir, options = {}) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (!options.includeInternal && entry.name.startsWith('_')) {
        continue;
      }
      files.push(...await listPdfFiles(entryPath, options));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      files.push(entryPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function extractPdfPages(pdfPath) {
  const buffer = await fs.readFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    disableFontFace: true,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        text: normalizeWhitespace(content.items.map((item) => item.str || '').join(' '))
      });
    }
  } finally {
    if (typeof pdf.destroy === 'function') {
      await pdf.destroy();
    } else if (typeof loadingTask.destroy === 'function') {
      await loadingTask.destroy();
    }
  }

  return pages;
}

function pdfMetadata(baseDir, pdfPath) {
  const relative = toPosixPath(path.relative(baseDir, pdfPath));
  const parts = relative.split('/');
  const filename = parts.at(-1) || '';
  const title = stripPdfExtension(filename).replace(/^\d+\s*-\s*/, '').trim();
  return {
    materia: parts.length > 1 ? parts[0] : '',
    assunto: title,
    title
  };
}

function parseArgs(argv) {
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

function normalizeDatabaseUrl(value) {
  let url = String(value || '').trim();
  url = url.replace(/^\$env:DATABASE_URL\s*=\s*/i, '');
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '');
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

function renderReport(report) {
  const lines = [
    '# Indice de paginas de teoria',
    '',
    `Banco: ${report.dbClient}`,
    `Pasta de PDFs: ${report.pdfsDir}`,
    `PDFs encontrados: ${report.foundPdfs}`,
    `PDFs processados: ${report.processedPdfs}`,
    `PDFs pulados: ${report.skippedPdfs}`,
    `Paginas ${report.dryRun ? 'simuladas' : 'indexadas'}: ${report.indexedPages}`
  ];
  if (report.errors.length) {
    lines.push('', 'Erros:');
    for (const error of report.errors.slice(0, 20)) {
      lines.push(`- ${error.pdf}: ${error.error}`);
    }
    if (report.errors.length > 20) {
      lines.push(`- ... mais ${report.errors.length - 20} erro(s)`);
    }
  }
  return lines.join('\n');
}

function normalizeSearchText(value) {
  return normalizeWhitespace(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}

function stripPdfExtension(filename) {
  return String(filename || '').replace(/\.pdf$/i, '');
}

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}
