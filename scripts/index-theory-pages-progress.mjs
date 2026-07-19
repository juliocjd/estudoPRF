import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexTheoryPages } from './index-theory-pages.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const startedAt = Date.now();

const report = await indexTheoryPages({
  dbPath: path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite'),
  databaseUrl: args['database-url'] || process.env.DATABASE_URL || '',
  dbClient: args['db-client'] || process.env.DB_CLIENT || '',
  pdfsDir: path.resolve(ROOT_DIR, args.pdfs || 'public/pdfs'),
  limit: args.limit ? Math.max(1, Number(args.limit)) : 0,
  force: Boolean(args.force),
  dryRun: Boolean(args['dry-run']),
  includeInternal: Boolean(args['include-internal']),
  match: args.match || '',
  onProgress: printProgress
});

console.log('');
console.log('# Indice de paginas de teoria');
console.log(`Banco: ${report.dbClient}`);
console.log(`PDFs encontrados: ${report.foundPdfs}`);
console.log(`PDFs processados: ${report.processedPdfs}`);
console.log(`PDFs pulados: ${report.skippedPdfs}`);
console.log(`Paginas ${report.dryRun ? 'simuladas' : 'indexadas'}: ${report.indexedPages}`);
console.log(`Erros: ${report.errors.length}`);
console.log(`Tempo total: ${formatElapsed(Date.now() - startedAt)}`);

if (report.errors.length) {
  console.log('');
  console.log('Erros:');
  for (const error of report.errors.slice(0, 30)) {
    console.log(`- ${error.pdf}: ${error.error}`);
  }
  if (report.errors.length > 30) {
    console.log(`- ... mais ${report.errors.length - 30} erro(s)`);
  }
}

function printProgress(event) {
  if (event.type === 'start') {
    console.log(`Indexando ${event.total} PDF(s) de ${event.foundPdfs} encontrado(s). Banco: ${event.dbClient}`);
    console.log(`Pasta: ${event.pdfsDir}`);
    return;
  }

  if (event.type === 'pdf:start') {
    console.log(`[${event.index}/${event.total}] lendo ${event.pdf}`);
    return;
  }

  if (event.type === 'pdf:skip') {
    console.log(`[${event.index}/${event.total}] pulado, ja tinha ${event.existingPages} pagina(s): ${event.pdf}`);
    return;
  }

  if (event.type === 'pdf:dry-run') {
    console.log(`[${event.index}/${event.total}] simulado ${event.pages} pagina(s): ${event.pdf}`);
    return;
  }

  if (event.type === 'pdf:done') {
    console.log(`[${event.index}/${event.total}] indexado ${event.pages} pagina(s), total ${event.indexedPages}: ${event.pdf}`);
    return;
  }

  if (event.type === 'pdf:error') {
    console.log(`[${event.index}/${event.total}] ERRO ${event.pdf}: ${event.error}`);
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function formatElapsed(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}
