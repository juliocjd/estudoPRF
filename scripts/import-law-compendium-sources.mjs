import path from 'node:path';
import {
  ROOT_DIR,
  extractLawSections,
  fetchOfficialText,
  jsonValue,
  normalizeWhitespace,
  openLawCompendiumDatabase,
  parseArgs,
  readJson,
  replaceLawSections,
  sha256,
  sourceFromSeed,
  upsertLawSource
} from './law-compendium-utils.mjs';

const args = parseArgs();
const seedPath = args.seed || 'data/traffic_law_current_sources_seed_v1.json';
const validationReportPath = args['validation-report'] || 'data/prf_traffic_norms_validation_report.json';
const onlyValidated = Boolean(args['only-validated']);
const { db, client } = openLawCompendiumDatabase(args);

try {
  const seed = readJson(seedPath);
  const validationReport = loadValidationReport();
  const validationBySlug = new Map((validationReport.sources || []).map((source) => [source.slug, source]));
  const sources = (seed.sources || []).map(sourceFromSeed);
  const runKey = `law_compendium_import_${Date.now()}`;
  db.prepare(`
    INSERT INTO law_compendium_import_runs (run_key, sources_total, report)
    VALUES (?, ?, ?)
  `).run(runKey, sources.length, jsonValue({ seedPath, validationReportPath, onlyValidated }));

  let imported = 0;
  let sectionsImported = 0;
  const historicalInserted = upsertHistoricalRevokedItems(validationReport);
  const errors = [];

  for (const source of sources) {
    const validation = validationBySlug.get(source.slug);
    if (onlyValidated && validation?.validationStatus !== 'current_validated') {
      upsertLawSource(db, {
        ...source,
        status: 'needs_verification',
        currentStatus: validation?.validationStatus || 'not_validated',
        officialUrl: validation?.officialUrl || source.officialUrl || '',
        officialIndexUrl: seed.official_resolutions_index || '',
        editalOrigin: source.relatedEditalItems,
        validationNotes: validation?.notes || 'Fonte nao importada: nao validada como vigente.',
        metadata: { seed: source.metadata, validation }
      });
      continue;
    }

    const officialUrl = validation?.officialUrl || source.officialUrl;
    if (!officialUrl) {
      upsertLawSource(db, {
        ...source,
        status: 'needs_verification',
        currentStatus: 'missing_official_url',
        officialIndexUrl: seed.official_resolutions_index || '',
        editalOrigin: source.relatedEditalItems,
        validationNotes: 'Sem URL oficial resolvida; bloqueada para apostila vigente.',
        metadata: { seed: source.metadata, validation }
      });
      continue;
    }

    try {
      const fetched = await fetchOfficialText(officialUrl);
      const rawText = normalizeWhitespace(fetched.rawText);
      const sections = extractLawSections(source.slug, rawText);
      const canPublish = rawText.length > 200 && sections.length > 0 && sections.some((section) => section.hierarchyLevel === 'artigo' || section.hierarchyLevel === 'anexo');
      upsertLawSource(db, {
        ...source,
        status: canPublish ? 'validated_current' : 'needs_verification',
        currentStatus: validation?.validationStatus || 'current_validated',
        officialUrl,
        officialIndexUrl: seed.official_resolutions_index || '',
        sourceHash: sha256(rawText),
        rawText,
        rawHtml: fetched.rawHtml || '',
        officialCheckedAt: new Date().toISOString(),
        editalOrigin: source.relatedEditalItems,
        validationNotes: canPublish
          ? 'Fonte oficial importada e seccionada automaticamente.'
          : 'Fonte baixada, mas extracao de artigos/anexos precisa revisao antes de publicar.',
        metadata: {
          seed: source.metadata,
          validation,
          contentType: fetched.contentType,
          extraction: { sections: sections.length, canPublish }
        }
      });
      if (canPublish) {
        replaceLawSections(db, source.slug, sections);
        imported += 1;
        sectionsImported += sections.length;
      }
    } catch (error) {
      errors.push({ slug: source.slug, error: error.message || String(error) });
      upsertLawSource(db, {
        ...source,
        status: 'import_error',
        currentStatus: validation?.validationStatus || 'download_error',
        officialUrl,
        officialIndexUrl: seed.official_resolutions_index || '',
        editalOrigin: source.relatedEditalItems,
        validationNotes: error.message || String(error),
        metadata: { seed: source.metadata, validation }
      });
    }
  }

  db.prepare(`
    UPDATE law_compendium_import_runs
    SET finished_at = CURRENT_TIMESTAMP,
        status = ?,
        sources_imported = ?,
        sections_imported = ?,
        errors = ?
    WHERE run_key = ?
  `).run(errors.length ? 'finished_with_errors' : 'finished', imported, sectionsImported, jsonValue(errors), runKey);

  console.log('# Importacao da Apostila da Lei');
  console.log(`Banco: ${client}`);
  console.log(`Seed: ${path.relative(ROOT_DIR, path.resolve(ROOT_DIR, seedPath))}`);
  console.log(`Fontes importadas como vigentes: ${imported}`);
  console.log(`Itens historicos/revogados registrados: ${historicalInserted}`);
  console.log(`Secoes importadas: ${sectionsImported}`);
  console.log(`Erros: ${errors.length}`);
} finally {
  db.close();
}

function loadValidationReport() {
  try {
    return readJson(validationReportPath);
  } catch (error) {
    if (onlyValidated) {
      throw new Error(`--only-validated exige relatorio de validacao: ${validationReportPath}`);
    }
    return { sources: [] };
  }
}

function upsertHistoricalRevokedItems(validationReport) {
  let inserted = 0;
  for (const item of validationReport.items || []) {
    if (item.validationStatus !== 'revoked_without_current_study_value') continue;
    const parsed = parseHistoricalNorm(item.originalLabel || '');
    if (!parsed) continue;
    upsertLawSource(db, {
      slug: `historico_${parsed.type}_${parsed.number}_${parsed.year}`,
      sourceType: parsed.type,
      number: parsed.number,
      year: parsed.year,
      title: item.originalLabel,
      status: 'historical_revoked',
      currentStatus: item.validationStatus,
      officialUrl: '',
      officialIndexUrl: '',
      editalOrigin: [item.originalLabel],
      validationNotes: `${item.notes || 'Norma revogada.'} Mantida apenas no historico; nao publicar na apostila vigente.`,
      metadata: { validationItem: item }
    });
    inserted += 1;
  }
  return inserted;
}

function parseHistoricalNorm(label) {
  const text = String(label || '');
  const match = text.match(/(Resolucao|Resolu[cç][aã]o|Lei)\s+(?:CONTRAN\s+)?(?:n[ºo°.]*)?\s*(\d+)\/(\d{4})/i);
  if (!match) return null;
  return {
    type: /^lei$/i.test(match[1]) ? 'lei' : 'resolucao',
    number: match[2],
    year: Number(match[3])
  };
}
