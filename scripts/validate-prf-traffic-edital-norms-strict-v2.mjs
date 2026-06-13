import path from 'node:path';
import {
  OFFICIAL_RESOLUTIONS_INDEX,
  ROOT_DIR,
  extractLinksFromHtml,
  fetchOfficialText,
  normalizeSearchText,
  parseArgs,
  readJson,
  writeJson,
  writeText
} from './law-compendium-utils.mjs';

const args = parseArgs();
const manifestPath = args.manifest || 'data/prf_2021_traffic_norms_current_manifest_v1.json';
const outJson = args.json || 'data/prf_traffic_norms_validation_report_v2.json';
const outMd = args.md || 'data/prf_traffic_norms_validation_report_v2.md';
const manifest = readJson(manifestPath);
const indexUrl = manifest.official_sources?.resolutions_index || OFFICIAL_RESOLUTIONS_INDEX;

const report = {
  generatedAt: new Date().toISOString(),
  manifest: path.relative(ROOT_DIR, path.resolve(ROOT_DIR, manifestPath)),
  officialIndexUrl: indexUrl,
  policy: {
    publishCurrentOnlyWhen: 'validationStatus=current_validated AND officialUrl resolved AND not revoked by official link text',
    historicalHandling: 'do not publish in student current compendium',
    uncertainHandling: 'admin_pending_only'
  },
  sources: [],
  items: [],
  counts: {}
};

let indexHtml = '';
let links = [];
try {
  const fetched = await fetchOfficialText(indexUrl);
  indexHtml = fetched.rawHtml || '';
  links = extractLinksFromHtml(indexHtml, indexUrl).map((link) => ({
    ...link,
    normalized: normalizeSearchText(`${link.text} ${link.href}`)
  }));
} catch (error) {
  report.indexFetchError = error.message || String(error);
}

const sourcesBySlug = new Map();
for (const item of manifest.items || []) {
  const itemResult = validateItem(item);
  report.items.push(itemResult);
  for (const source of itemResult.currentSources) {
    const previous = sourcesBySlug.get(source.slug);
    if (!previous || scoreSource(source) > scoreSource(previous)) sourcesBySlug.set(source.slug, source);
  }
}
for (const source of manifest.current_source_candidates || []) {
  const result = validateSourceCandidate(source);
  const previous = sourcesBySlug.get(result.slug);
  if (!previous || scoreSource(result) > scoreSource(previous)) sourcesBySlug.set(result.slug, result);
}
report.sources = [...sourcesBySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
report.counts = {
  sources: report.sources.length,
  currentValidatedSources: report.sources.filter((s) => s.validationStatus === 'current_validated').length,
  needsManualVerification: report.sources.filter((s) => s.validationStatus === 'needs_manual_verification').length,
  historicalRevoked: report.sources.filter((s) => s.validationStatus === 'historical_revoked').length,
  manifestItems: report.items.length
};
writeJson(outJson, report);
writeText(outMd, renderMarkdown(report));
console.log('# Validação estrita das normas PRF v2');
console.log(`Manifesto: ${manifestPath}`);
console.log(`Links no índice oficial: ${links.length}`);
console.log(`Fontes atuais validadas: ${report.counts.currentValidatedSources}`);
console.log(`Pendentes: ${report.counts.needsManualVerification}`);
if (report.indexFetchError) console.log(`Erro no índice oficial: ${report.indexFetchError}`);

function validateItem(item) {
  const currentSources = (item.current_sources || []).map((source) => validateSourceCandidate({
    ...source,
    related_edital_items: [item.original_label || item.edital_item || item.normalized_original || '']
  }));
  const hasCurrent = currentSources.some((source) => source.validationStatus === 'current_validated');
  let validationStatus = 'needs_manual_verification';
  if (item.include_in_current_compendium === false && !hasCurrent) validationStatus = 'historical_only';
  else if (hasCurrent && /replaced|current|in_force|verify/i.test(String(item.current_handling || ''))) validationStatus = 'has_current_replacement';
  return {
    originalLabel: item.original_label || item.edital_item || '',
    theme: item.theme || '',
    handling: item.current_handling || '',
    validationStatus,
    currentSources,
    notes: item.validation_notes || ''
  };
}

function validateSourceCandidate(source) {
  const slug = String(source.slug || '').trim();
  const type = String(source.type || source.source_type || '').trim();
  const number = source.number == null ? '' : String(source.number);
  const year = source.year == null ? '' : String(source.year);
  const directUrl = String(source.url || source.official_url || '').trim();
  let officialLink = directUrl ? { href: directUrl, text: source.title || directUrl, matchReason: 'direct_url_in_seed' } : null;
  if (!officialLink && type === 'resolucao') officialLink = findResolutionLinkV2(number, year);
  const linkText = normalizeSearchText(`${officialLink?.text || ''} ${officialLink?.href || ''}`);
  const revokedSignal = /\brevogad[ao]s?\b|\brevoga\b/.test(linkText) && !/altera|alterada|alteracoes|alteracoes posteriores/.test(linkText);
  const validationStatus = officialLink && !revokedSignal
    ? 'current_validated'
    : officialLink && revokedSignal
      ? 'historical_revoked'
      : 'needs_manual_verification';
  return {
    slug,
    type,
    number,
    year: year ? Number(year) : null,
    title: source.title || '',
    officialUrl: officialLink?.href || '',
    officialLinkText: officialLink?.text || '',
    matchReason: officialLink?.matchReason || '',
    validationStatus,
    relatedEditalItems: source.related_edital_items || [],
    notes: officialLink
      ? `Link localizado por ${officialLink.matchReason || 'índice oficial'}; conferir antes de publicação intensiva.`
      : 'Link oficial não resolvido automaticamente; manter como pendente/admin.'
  };
}

function findResolutionLinkV2(number, year) {
  const n = String(Number(number || 0));
  const nPadded = n.padStart(3, '0');
  const y = String(year || '');
  const patterns = [
    new RegExp(`\\b${n}\\b.*\\b${y}\\b`),
    new RegExp(`\\b${nPadded}\\b.*\\b${y}\\b`),
    new RegExp(`resolu(?:cao|o|ucao|coes)?.{0,40}${n}.{0,80}${y}`),
    new RegExp(`${n}[._-]${y}`),
    new RegExp(`${n}${y}`)
  ];
  const candidates = links.filter((link) => patterns.some((pattern) => pattern.test(link.normalized)));
  const pdfFirst = candidates.sort((a, b) => Number(/\.pdf/i.test(b.href)) - Number(/\.pdf/i.test(a.href)))[0];
  return pdfFirst ? { ...pdfFirst, matchReason: 'official_index_number_year_v2' } : null;
}

function scoreSource(source) {
  return source.validationStatus === 'current_validated' ? 3 : source.validationStatus === 'historical_revoked' ? 2 : 1;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Validação estrita das normas PRF v2');
  lines.push('');
  lines.push(`Gerado em: ${result.generatedAt}`);
  lines.push(`Índice oficial: ${result.officialIndexUrl}`);
  if (result.indexFetchError) lines.push(`Erro ao baixar índice: ${result.indexFetchError}`);
  lines.push('');
  lines.push('## Resumo');
  lines.push(`- Fontes: ${result.counts.sources}`);
  lines.push(`- Fontes atuais validadas: ${result.counts.currentValidatedSources}`);
  lines.push(`- Pendentes: ${result.counts.needsManualVerification}`);
  lines.push(`- Históricas/revogadas: ${result.counts.historicalRevoked}`);
  lines.push('');
  lines.push('## Fontes atuais validadas');
  for (const source of result.sources.filter((s) => s.validationStatus === 'current_validated')) {
    lines.push(`- ${source.slug} — ${source.title} — ${source.officialUrl}`);
  }
  lines.push('');
  lines.push('## Pendentes/admin');
  for (const source of result.sources.filter((s) => s.validationStatus !== 'current_validated')) {
    lines.push(`- ${source.slug} — ${source.validationStatus} — ${source.notes}`);
  }
  return `${lines.join('\n')}\n`;
}
