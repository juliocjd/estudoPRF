import {
  jsonValue,
  normalizeSearchText,
  openLawCompendiumDatabase,
  parseArgs
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);

try {
  db.prepare('DELETE FROM law_compendium_cross_references').run();
  const sections = db.prepare(`
    SELECT s.id, s.source_slug, s.display_ref, s.hierarchy_level, s.text, src.source_type, src.number, src.year
    FROM law_compendium_sections s
    JOIN law_compendium_sources src ON src.slug = s.source_slug
    WHERE src.status = 'validated_current'
    ORDER BY s.source_slug, s.order_index
  `).all();

  let found = 0;
  let resolved = 0;
  const insert = db.prepare(`
    INSERT INTO law_compendium_cross_references (
      source_slug, section_id, ref_text, target_source_slug, target_locator,
      resolved_section_id, quoted_target_text, resolution_status, metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const section of sections) {
    const refs = extractReferences(section.text);
    for (const ref of refs) {
      const target = resolveReference(section, ref);
      found += 1;
      if (target.status === 'resolved') resolved += 1;
      insert.run(
        section.source_slug,
        section.id,
        ref.text,
        target.sourceSlug || '',
        target.locator || '',
        target.sectionId || null,
        target.quotedText || '',
        target.status,
        jsonValue({ kind: ref.kind, parsed: ref })
      );
    }
  }

  console.log('# Remissoes da Apostila da Lei');
  console.log(`Banco: ${client}`);
  console.log(`Encontradas: ${found}`);
  console.log(`Resolvidas: ${resolved}`);
} finally {
  db.close();
}

function extractReferences(text) {
  const refs = [];
  addMatches(refs, text, /\barts?\.\s*\d+[A-Za-zº°-]*(?:\s*,\s*\d+[A-Za-zº°-]*)*(?:\s*e\s*\d+[A-Za-zº°-]*)?\s+do\s+CTB\b/gi, 'ctb_article');
  addMatches(refs, text, /\barts?\.\s*\d+[A-Za-zº°-]*/gi, 'article');
  addMatches(refs, text, /§\s*\d+[º°]?/gi, 'paragraph');
  addMatches(refs, text, /\binciso\s+[IVXLCDM]+\b/gi, 'inciso');
  addMatches(refs, text, /\bAnexo\s+[IVXLCDM\d]+\b/gi, 'annex');
  addMatches(refs, text, /\bResolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo.]?\s*\d+\/\d{4}\b/gi, 'resolution');
  addMatches(refs, text, /\bLei\s+n?[ºo.]?\s*\d+(?:\.\d+)*\/\d{4}\b/gi, 'law');
  return dedupe(refs);
}

function addMatches(refs, text, pattern, kind) {
  let match = null;
  while ((match = pattern.exec(String(text || '')))) {
    refs.push({ text: match[0], kind });
  }
}

function dedupe(refs) {
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
    const article = ref.text.match(/\d+[A-Za-zº°-]*/)?.[0] || '';
    return findSection('lei_9503_1997_ctb_compilado', `Art. ${article}`);
  }
  if (ref.kind === 'article') {
    const article = ref.text.match(/\d+[A-Za-zº°-]*/)?.[0] || '';
    return findSection(section.source_slug, `Art. ${article}`);
  }
  if (ref.kind === 'annex') {
    return findSection(section.source_slug, ref.text);
  }
  if (ref.kind === 'paragraph' || ref.kind === 'inciso') {
    return {
      sourceSlug: section.source_slug,
      locator: ref.text,
      status: 'pending'
    };
  }
  if (ref.kind === 'law') {
    const lawNumber = normalizeSearchText(ref.text).match(/lei n?o? ?(\d+)/)?.[1] || '';
    const year = ref.text.match(/\/(\d{4})/)?.[1] || '';
    const source = findSourceByNumber('lei', lawNumber, year);
    return source ? { sourceSlug: source.slug, locator: ref.text, status: 'resolved' } : { locator: ref.text, status: 'unresolved' };
  }
  if (ref.kind === 'resolution') {
    const number = ref.text.match(/(\d+)\/\d{4}/)?.[1] || '';
    const year = ref.text.match(/\/(\d{4})/)?.[1] || '';
    const source = findSourceByNumber('resolucao', number, year);
    return source ? { sourceSlug: source.slug, locator: ref.text, status: 'resolved' } : { locator: ref.text, status: 'unresolved' };
  }
  return { locator: ref.text, status: 'unresolved' };
}

function findSection(sourceSlug, displayRef) {
  const normalized = normalizeSearchText(displayRef);
  const row = db.prepare(`
    SELECT id, source_slug, display_ref, text
    FROM law_compendium_sections
    WHERE source_slug = ?
      AND normalized_text LIKE ?
    ORDER BY order_index
    LIMIT 1
  `).get(sourceSlug, `%${normalized}%`);
  if (!row) {
    return { sourceSlug, locator: displayRef, status: 'unresolved' };
  }
  return {
    sourceSlug: row.source_slug,
    locator: row.display_ref,
    sectionId: row.id,
    quotedText: row.text,
    status: 'resolved'
  };
}

function findSourceByNumber(sourceType, number, year) {
  const normalizedNumber = String(Number(number || 0));
  return db.prepare(`
    SELECT slug
    FROM law_compendium_sources
    WHERE source_type = ?
      AND CAST(number AS TEXT) = ?
      AND (? = '' OR CAST(year AS TEXT) = ?)
      AND status = 'validated_current'
    LIMIT 1
  `).get(sourceType, normalizedNumber, String(year || ''), String(year || ''));
}
