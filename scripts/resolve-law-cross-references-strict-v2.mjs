import {
  jsonValue,
  normalizeSearchText,
  normalizeWhitespace,
  openLawCompendiumDatabase,
  parseArgs
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);

try {
  db.prepare('DELETE FROM law_compendium_cross_references').run();

  const sections = db.prepare(`
    SELECT s.id, s.source_slug, s.display_ref, s.hierarchy_level, s.text,
      src.source_type, src.number, src.year, src.status
    FROM law_compendium_sections s
    JOIN law_compendium_sources src ON src.slug = s.source_slug
    WHERE src.status = 'validated_current'
      AND COALESCE(s.is_current, TRUE) != FALSE
    ORDER BY s.source_slug, s.order_index, s.id
  `).all();

  let found = 0;
  let shown = 0;
  let hiddenSelf = 0;
  let unresolved = 0;

  const insert = db.prepare(`
    INSERT INTO law_compendium_cross_references (
      source_slug, section_id, ref_text, target_source_slug, target_locator,
      resolved_section_id, quoted_target_text, resolution_status, metadata,
      display_policy, confidence, reason, source_locator, target_display_ref,
      target_text_excerpt, is_self_reference, extracted_context
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const section of sections) {
    const refs = extractStrictReferences(section);
    for (const ref of refs) {
      found += 1;
      const target = resolveReference(section, ref);
      const isSelf = Boolean(target.sectionId && Number(target.sectionId) === Number(section.id));
      const canDisplay = target.status === 'resolved' && !isSelf && target.quotedText;
      if (isSelf) hiddenSelf += 1;
      if (target.status !== 'resolved') unresolved += 1;
      if (canDisplay) shown += 1;
      insert.run(
        section.source_slug,
        section.id,
        ref.text,
        target.sourceSlug || '',
        target.locator || ref.locator || '',
        target.sectionId || null,
        target.quotedText || '',
        target.status,
        jsonValue({ kind: ref.kind, parsed: ref }),
        canDisplay ? 'show_in_article' : 'hide',
        canDisplay ? ref.confidence : 0,
        canDisplay ? 'Remissão externa ou interna explícita resolvida por localizador exato.' : buildHiddenReason(target, isSelf),
        section.display_ref || '',
        target.displayRef || '',
        makeExcerpt(target.quotedText || ''),
        isSelf,
        ref.context || ''
      );
    }
  }

  console.log('# Remissões estritas da Apostila da Lei v2');
  console.log(`Banco: ${client}`);
  console.log(`Seções avaliadas: ${sections.length}`);
  console.log(`Remissões encontradas: ${found}`);
  console.log(`Remissões exibíveis: ${shown}`);
  console.log(`Auto-remissões ocultadas: ${hiddenSelf}`);
  console.log(`Não resolvidas/pendentes: ${unresolved}`);
} finally {
  db.close();
}

function buildHiddenReason(target, isSelf) {
  if (isSelf) return 'Auto-remissão ou repetição do próprio cabeçalho do dispositivo; não exibir ao aluno.';
  if (target.status === 'unresolved') return 'Remissão não resolvida por localizador exato; ocultada até revisão.';
  if (target.status === 'ambiguous') return 'Remissão ambígua; ocultada até revisão.';
  return 'Remissão sem texto alvo confiável; ocultada.';
}

function extractStrictReferences(section) {
  const text = stripSelfHeading(section.text, section.display_ref);
  const refs = [];
  const push = (match, kind, confidence = 0.92) => {
    refs.push({
      text: normalizeWhitespace(match[0]),
      kind,
      confidence,
      context: contextAround(text, match.index, match[0].length)
    });
  };

  // Ex.: art. 168 do CTB; arts. 136 a 139-B da Lei nº 9.503/1997.
  addMatches(text, /\b(?:arts?\.|artigos?)\s*\d+[A-Za-zº°-]*(?:\s*(?:,|e|a)\s*\d+[A-Za-zº°-]*)*\s+(?:do|da)\s+(?:CTB|C[oó]digo\s+de\s+Tr[aâ]nsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)\b/gi, 'ctb_article', push);
  // Ex.: inciso II do art. 5º da Resolução CONTRAN nº 967/2022.
  addMatches(text, /\b(?:inciso|inc\.)\s+[IVXLCDM]+\s+do\s+art\.?\s*\d+[A-Za-zº°-]*\s+da\s+Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*\d+\/\d{4}\b/gi, 'resolution_article_inciso', push);
  // Ex.: art. 5º da Resolução CONTRAN nº 967/2022.
  addMatches(text, /\b(?:art\.|artigo)\s*\d+[A-Za-zº°-]*\s+da\s+Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*\d+\/\d{4}\b/gi, 'resolution_article', push);
  // Ex.: Resolução CONTRAN nº 960/2022; Lei nº 5.970/1973.
  addMatches(text, /\bResolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*\d+\/\d{4}\b/gi, 'resolution_source', push, 0.78);
  addMatches(text, /\bLei\s+n?[ºo°.]?\s*\d+(?:\.\d+)*\/\d{4}\b/gi, 'law_source', push, 0.78);
  // Ex.: Anexo I da Resolução CONTRAN nº 819/2021.
  addMatches(text, /\bAnexo\s+[IVXLCDM\d]+\s+da\s+Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*\d+\/\d{4}\b/gi, 'resolution_annex', push);

  return dedupeReferences(refs)
    .filter((ref) => !isSelfOnlyReference(section, ref));
}

function addMatches(text, pattern, kind, push, confidence) {
  let match;
  while ((match = pattern.exec(String(text || '')))) {
    push(match, kind, confidence);
  }
}

function stripSelfHeading(text, displayRef) {
  let clean = normalizeWhitespace(text).replace(/\s+§\s*$/g, '');
  const ref = String(displayRef || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (ref) {
    clean = clean.replace(new RegExp(`^${ref}\\s*`, 'i'), '');
  }
  return clean;
}

function isSelfOnlyReference(section, ref) {
  const normalizedRef = normalizeSearchText(ref.text);
  const normalizedDisplay = normalizeSearchText(section.display_ref || '');
  if (!normalizedDisplay) return false;
  // Não tratar o próprio cabeçalho "Art. 1º" como remissão.
  return normalizedRef === normalizedDisplay || normalizedRef === normalizeSearchText(`${section.display_ref} do ctb`);
}

function dedupeReferences(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${normalizeSearchText(ref.text)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveReference(section, ref) {
  if (ref.kind === 'ctb_article') {
    const article = firstArticleNumber(ref.text);
    return findSectionByArticle('lei_9503_1997_ctb_compilado', article);
  }
  if (ref.kind === 'resolution_article' || ref.kind === 'resolution_article_inciso') {
    const resolution = parseResolution(ref.text);
    const source = resolution ? findSourceByNumber('resolucao', resolution.number, resolution.year) : null;
    if (!source) return { locator: ref.text, status: 'unresolved' };
    return findSectionByArticle(source.slug, firstArticleNumber(ref.text));
  }
  if (ref.kind === 'resolution_annex') {
    const resolution = parseResolution(ref.text);
    const source = resolution ? findSourceByNumber('resolucao', resolution.number, resolution.year) : null;
    if (!source) return { locator: ref.text, status: 'unresolved' };
    const annex = ref.text.match(/Anexo\s+([IVXLCDM\d]+)/i)?.[1] || '';
    return findSectionByDisplayRef(source.slug, `Anexo ${annex}`);
  }
  if (ref.kind === 'resolution_source') {
    const resolution = parseResolution(ref.text);
    const source = resolution ? findSourceByNumber('resolucao', resolution.number, resolution.year) : null;
    return source ? { sourceSlug: source.slug, locator: ref.text, displayRef: '', sectionId: null, quotedText: '', status: 'resolved' } : { locator: ref.text, status: 'unresolved' };
  }
  if (ref.kind === 'law_source') {
    const law = parseLaw(ref.text);
    const source = law ? findSourceByNumber('lei', law.number, law.year) : null;
    return source ? { sourceSlug: source.slug, locator: ref.text, displayRef: '', sectionId: null, quotedText: '', status: 'resolved' } : { locator: ref.text, status: 'unresolved' };
  }
  return { locator: ref.text, status: 'unresolved' };
}

function firstArticleNumber(text) {
  return String(text || '').match(/(?:arts?\.|artigos?)\s*(\d+[A-Za-zº°-]*)/i)?.[1]
    || String(text || '').match(/art\.?\s*(\d+[A-Za-zº°-]*)/i)?.[1]
    || '';
}

function parseResolution(text) {
  const match = String(text || '').match(/(\d+)\/(\d{4})/);
  return match ? { number: String(Number(match[1])), year: String(match[2]) } : null;
}

function parseLaw(text) {
  const match = String(text || '').match(/(\d+(?:\.\d+)*)\/(\d{4})/);
  if (!match) return null;
  return { number: match[1].replace(/\./g, ''), year: match[2] };
}

function findSourceByNumber(sourceType, number, year) {
  return db.prepare(`
    SELECT slug
    FROM law_compendium_sources
    WHERE source_type = ?
      AND CAST(number AS TEXT) = ?
      AND (? = '' OR CAST(year AS TEXT) = ?)
      AND status = 'validated_current'
    ORDER BY slug
    LIMIT 1
  `).get(sourceType, String(Number(number || 0)), String(year || ''), String(year || ''));
}

function findSectionByArticle(sourceSlug, articleNumber) {
  if (!sourceSlug || !articleNumber) return { sourceSlug, locator: `Art. ${articleNumber}`, status: 'unresolved' };
  const normalizedWanted = normalizeArticleNumber(articleNumber);
  const rows = db.prepare(`
    SELECT id, source_slug, display_ref, text
    FROM law_compendium_sections
    WHERE source_slug = ?
      AND hierarchy_level = 'artigo'
    ORDER BY order_index, id
  `).all(sourceSlug);
  const row = rows.find((candidate) => normalizeArticleNumber(candidate.display_ref) === normalizedWanted);
  if (!row) return { sourceSlug, locator: `Art. ${articleNumber}`, status: 'unresolved' };
  return {
    sourceSlug: row.source_slug,
    locator: row.display_ref,
    displayRef: row.display_ref,
    sectionId: row.id,
    quotedText: normalizeWhitespace(row.text).replace(/\s+§\s*$/g, ''),
    status: 'resolved'
  };
}

function findSectionByDisplayRef(sourceSlug, displayRef) {
  const normalizedWanted = normalizeSearchText(displayRef);
  const rows = db.prepare(`
    SELECT id, source_slug, display_ref, text
    FROM law_compendium_sections
    WHERE source_slug = ?
    ORDER BY order_index, id
  `).all(sourceSlug);
  const row = rows.find((candidate) => normalizeSearchText(candidate.display_ref) === normalizedWanted);
  if (!row) return { sourceSlug, locator: displayRef, status: 'unresolved' };
  return {
    sourceSlug: row.source_slug,
    locator: row.display_ref,
    displayRef: row.display_ref,
    sectionId: row.id,
    quotedText: normalizeWhitespace(row.text),
    status: 'resolved'
  };
}

function normalizeArticleNumber(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^art\.?\s*/i, '')
    .replace(/[º°]/g, '')
    .replace(/[^0-9a-z-]/g, '')
    .trim();
}

function contextAround(text, index, length) {
  const start = Math.max(0, index - 120);
  const end = Math.min(String(text || '').length, index + length + 120);
  return normalizeWhitespace(String(text || '').slice(start, end));
}

function makeExcerpt(text) {
  return normalizeWhitespace(text).slice(0, 1200);
}
