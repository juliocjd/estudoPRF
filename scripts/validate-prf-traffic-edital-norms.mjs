import path from 'node:path';
import {
  OFFICIAL_RESOLUTIONS_INDEX,
  ROOT_DIR,
  fetchOfficialText,
  findResolutionLink,
  normalizeSearchText,
  parseArgs,
  readJson,
  renderList,
  writeJson,
  writeText
} from './law-compendium-utils.mjs';

const args = parseArgs();
const manifestPath = args.manifest || 'data/prf_2021_traffic_norms_current_manifest_v1.json';
const outJson = args.json || 'data/prf_traffic_norms_validation_report.json';
const outMd = args.md || 'data/prf_traffic_norms_validation_report.md';

const manifest = readJson(manifestPath);
const indexUrl = manifest.official_sources?.resolutions_index || OFFICIAL_RESOLUTIONS_INDEX;
const startedAt = new Date().toISOString();

const report = {
  generatedAt: startedAt,
  manifest: path.relative(ROOT_DIR, path.resolve(ROOT_DIR, manifestPath)),
  officialIndexUrl: indexUrl,
  statusPolicy: {
    publishAsCurrentOnlyWhen: 'source.validationStatus == current_validated',
    uncertainHandling: 'needs_manual_verification',
    revokedHandling: 'historical_revoked_only'
  },
  items: [],
  sources: [],
  counts: {}
};

let indexHtml = '';
try {
  indexHtml = (await fetchOfficialText(indexUrl)).rawHtml;
} catch (error) {
  report.indexFetchError = error.message || String(error);
}

const sourceMap = new Map();

for (const item of manifest.items || []) {
  const itemResult = validateManifestItem(item, indexHtml, indexUrl);
  report.items.push(itemResult);
  for (const source of itemResult.currentSources) {
    const previous = sourceMap.get(source.slug);
    if (!previous || source.validationStatus === 'current_validated') {
      sourceMap.set(source.slug, source);
    }
  }
}

for (const source of manifest.current_source_candidates || []) {
  const result = validateSourceCandidate(source, indexHtml, indexUrl);
  const previous = sourceMap.get(result.slug);
  if (!previous || result.validationStatus === 'current_validated') {
    sourceMap.set(result.slug, result);
  }
}

report.sources = [...sourceMap.values()].sort((a, b) => a.slug.localeCompare(b.slug));
report.counts = {
  items: report.items.length,
  currentValidatedSources: report.sources.filter((source) => source.validationStatus === 'current_validated').length,
  replacedItems: report.items.filter((item) => item.validationStatus === 'replaced_by_current_norm').length,
  historicalOnlyItems: report.items.filter((item) => item.validationStatus === 'revoked_without_current_study_value').length,
  needsManualVerification: report.items.filter((item) => item.validationStatus === 'needs_manual_verification').length,
  editalNumberInconsistent: report.items.filter((item) => item.validationStatus === 'edital_number_inconsistent').length
};

writeJson(outJson, report);
writeText(outMd, renderMarkdown(report));

console.log('# Validacao das normas PRF 2021');
console.log(`Manifesto: ${manifestPath}`);
console.log(`JSON: ${outJson}`);
console.log(`MD: ${outMd}`);
console.log(`Fontes validadas como atuais: ${report.counts.currentValidatedSources}`);
console.log(`Pendentes de verificacao manual: ${report.counts.needsManualVerification}`);
if (report.indexFetchError) console.log(`Erro ao baixar indice oficial: ${report.indexFetchError}`);

function validateManifestItem(item, index, officialIndexUrl) {
  const handling = String(item.current_handling || '');
  const hasVerifyFlag = /verify|after_validation|in_force_after_validation/i.test(handling)
    || String(item.include_in_current_compendium) === 'after_validation_only';
  const numberInconsistent = /probable_typo|inconsistent/i.test(handling);
  const sources = (item.current_sources || []).map((source) => validateSourceCandidate({
    ...source,
    related_edital_items: [item.original_label || item.edital_item || item.normalized_original || '']
  }, index, officialIndexUrl));
  const anyCurrentSource = sources.some((source) => source.validationStatus === 'current_validated');
  const hasReplacement = Boolean(item.replacement_include) || /replaced/i.test(handling);

  let validationStatus = 'needs_manual_verification';
  if (numberInconsistent) {
    validationStatus = anyCurrentSource ? 'edital_number_inconsistent' : 'needs_manual_verification';
  } else if (hasReplacement && anyCurrentSource) {
    validationStatus = 'replaced_by_current_norm';
  } else if (item.include_in_current_compendium === false && !anyCurrentSource) {
    validationStatus = 'revoked_without_current_study_value';
  } else if (!hasVerifyFlag && item.include_in_current_compendium === true && anyCurrentSource) {
    validationStatus = 'current_validated';
  } else if (!hasVerifyFlag && anyCurrentSource && /in_force/i.test(handling)) {
    validationStatus = 'current_validated';
  }

  return {
    originalLabel: item.original_label || item.edital_item || '',
    normalizedOriginal: item.normalized_original || '',
    theme: item.theme || '',
    handling,
    includeInCurrentCompendium: item.include_in_current_compendium,
    validationStatus,
    currentSources: sources,
    notes: item.validation_notes || ''
  };
}

function validateSourceCandidate(source, index, officialIndexUrl) {
  const slug = String(source.slug || '').trim();
  const type = String(source.type || source.source_type || '').trim();
  const number = source.number == null ? '' : String(source.number);
  const year = source.year == null ? null : Number(source.year);
  const directUrl = String(source.url || source.official_url || '').trim();
  const officialLink = directUrl
    ? { href: directUrl, text: source.title || directUrl }
    : type === 'resolucao'
      ? findResolutionLink(index, number, year, officialIndexUrl)
      : null;
  const linkText = normalizeSearchText(`${officialLink?.text || ''} ${officialLink?.href || ''}`);
  const revokedSignal = /\brevogad[ao]s?\b|\brevoga\b/.test(linkText) && !/\baltera\b/.test(linkText);
  const validationStatus = officialLink && !revokedSignal
    ? 'current_validated'
    : officialLink && revokedSignal
      ? 'historical_revoked'
      : 'needs_manual_verification';

  return {
    slug,
    type,
    number,
    year,
    title: source.title || '',
    officialUrl: officialLink?.href || '',
    officialLinkText: officialLink?.text || '',
    validationStatus,
    relatedEditalItems: source.related_edital_items || [],
    notes: officialLink
      ? 'Link localizado em fonte oficial; conferir texto consolidado antes de estudo intensivo.'
      : 'Link oficial nao resolvido automaticamente; nao publicar como vigente.'
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Validação das normas de Legislação PRF');
  lines.push('');
  lines.push(`Gerado em: ${result.generatedAt}`);
  lines.push(`Índice oficial: ${result.officialIndexUrl}`);
  if (result.indexFetchError) lines.push(`Erro ao baixar índice: ${result.indexFetchError}`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- Itens do manifesto: ${result.counts.items}`);
  lines.push(`- Fontes atuais validadas por link oficial: ${result.counts.currentValidatedSources}`);
  lines.push(`- Itens substituídos por norma atual: ${result.counts.replacedItems}`);
  lines.push(`- Itens históricos sem valor vigente importável: ${result.counts.historicalOnlyItems}`);
  lines.push(`- Pendentes de verificação manual: ${result.counts.needsManualVerification}`);
  lines.push(`- Inconsistências de número no edital/triagem: ${result.counts.editalNumberInconsistent}`);
  lines.push('');
  lines.push('## Itens do edital');
  lines.push('');
  for (const item of result.items) {
    lines.push(`- **${item.originalLabel || item.normalizedOriginal || '(sem rótulo)'}**: ${item.validationStatus}`);
    if (item.theme) lines.push(`  - Tema: ${item.theme}`);
    if (item.currentSources?.length) {
      lines.push(`  - Fontes atuais: ${item.currentSources.map((source) => `${source.slug} (${source.validationStatus})`).join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## Fontes validadas como atuais');
  lines.push('');
  lines.push(renderList(result.sources
    .filter((source) => source.validationStatus === 'current_validated')
    .map((source) => `${source.slug} - ${source.title} - ${source.officialUrl}`)));
  lines.push('');
  lines.push('## Pendências');
  lines.push('');
  lines.push(renderList(result.sources
    .filter((source) => source.validationStatus !== 'current_validated')
    .map((source) => `${source.slug} - ${source.validationStatus} - ${source.notes}`)));
  return `${lines.join('\n')}\n`;
}
