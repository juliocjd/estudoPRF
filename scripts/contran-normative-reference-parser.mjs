export function parseContranNormativeReferences(value) {
  const text = cleanText(value);
  if (!text) {
    return { ok: false, references: [], needsReview: true, reason: 'empty_reference' };
  }

  const references = [];
  const resolution = parseResolution(text);
  if (resolution) {
    for (const annex of parseAnnexes(text)) {
      references.push(buildReference({ ...resolution, annex, rawText: text }));
    }
    for (const articleRef of parseArticles(stripCtbReferences(text))) {
      references.push(buildReference({ ...resolution, ...articleRef, rawText: text }));
    }
  }
  for (const lawRef of parseCtbReferences(text)) {
    references.push(buildReference({ ...lawRef, rawText: text }));
  }

  const unique = dedupeReferences(references);
  return {
    ok: unique.length > 0,
    references: unique,
    needsReview: unique.length === 0,
    reason: unique.length ? '' : (resolution ? 'article_or_annex_not_found' : 'resolution_not_found')
  };
}

export function normalizeResolution(value) {
  const resolution = parseResolution(value);
  return resolution ? resolution.resolution : cleanText(value);
}

export function normalizeArticleNumber(value) {
  const match = cleanText(value).match(/(?:art\.?\s*)?(\d{1,3}(?:-[A-Z])?)/i);
  return match ? normalizeArticleToken(match[1]) : '';
}

export function parseResolution(value) {
  const text = cleanText(value);
  const match = text.match(/(?:Res(?:olução)?\.?\s*(?:CONTRAN)?\s*)?n?[ºo°]?\s*(\d{3,4})\s*\/\s*(\d{4})/i);
  if (!match) return null;
  const resolutionNumber = String(Number(match[1]));
  const resolutionYear = String(Number(match[2]));
  return {
    type: 'resolution',
    resolution: `Res. CONTRAN ${resolutionNumber}/${resolutionYear}`,
    resolutionNumber,
    resolutionYear
  };
}

function parseAnnexes(text) {
  const annexes = [];
  const annexRegex = /Anexo\s+([IVXLCDM]+|\d+)/gi;
  let match;
  while ((match = annexRegex.exec(text))) {
    annexes.push(match[1].toUpperCase());
  }
  return annexes;
}

function parseArticles(text) {
  const refs = [];
  const articleRegex = /arts?\.?\s*([^.;]+)/gi;
  let match;
  while ((match = articleRegex.exec(text))) {
    const segment = stripResolution(match[1]);
    const articles = extractArticleNumbers(segment);
    const paragraphs = articles.length === 1 ? extractParagraphs(segment) : [];
    const items = articles.length === 1 ? extractRomanItems(segment) : [];
    for (const article of articles) {
      refs.push({
        article,
        paragraph: paragraphs.join(', '),
        item: items.join(', ')
      });
    }
  }
  return refs;
}

function stripResolution(value) {
  return cleanText(value)
    .replace(/\bda\s+Res(?:olução)?\.?\s*(?:CONTRAN)?\s*n?[ºo°]?\s*\d{3,4}\s*\/\s*\d{4}.*$/i, '')
    .replace(/\bde\s+Res(?:olução)?\.?\s*(?:CONTRAN)?\s*n?[ºo°]?\s*\d{3,4}\s*\/\s*\d{4}.*$/i, '');
}

function stripCtbReferences(value) {
  return cleanText(value)
    .replace(/\b(?:e\s+)?(?:CTB|Código\s+de\s+Trânsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)[,\s]*(?:arts?\.|artigos?)\s*\d{1,3}(?:-[A-Z])?(?:\s*,\s*§+\s*\d+[º°]?)?/gi, ' ')
    .replace(/\b(?:arts?\.|artigos?)\s*\d{1,3}(?:-[A-Z])?(?:\s*,\s*§+\s*\d+[º°]?)?\s+(?:do|da)\s+(?:CTB|Código\s+de\s+Trânsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)/gi, ' ');
}

function extractArticleNumbers(segment) {
  const output = [];
  let text = cleanText(segment).replace(/§\s*(?:\d+[ºª]?|único)/gi, '');
  text = text.replace(/\bcaput\b/gi, '');

  text = text.replace(/(\d{1,3})\s*[ºªo]?\s+a\s+(\d{1,3})\s*[ºªo]?/gi, (_, start, end) => {
    const first = Number(start);
    const last = Number(end);
    if (Number.isInteger(first) && Number.isInteger(last) && first <= last && last - first <= 80) {
      for (let n = first; n <= last; n += 1) output.push(String(n));
    }
    return ' ';
  });

  for (const match of text.matchAll(/\b(\d{1,3}(?:-[A-Z])?)\s*[ºªo]?\b/gi)) {
    output.push(normalizeArticleToken(match[1]));
  }
  return [...new Set(output)];
}

function parseCtbReferences(text) {
  const refs = [];
  const patterns = [
    /\b(?:CTB|Código\s+de\s+Trânsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)[,\s]*(?:arts?\.|artigos?)\s*(\d{1,3}(?:-[A-Z])?)([^.;]*)/gi,
    /\b(?:arts?\.|artigos?)\s*(\d{1,3}(?:-[A-Z])?)([^.;]*?)\s+(?:do|da)\s+(?:CTB|Código\s+de\s+Trânsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const segment = `${match[1]} ${match[2] || ''}`;
      refs.push({
        type: 'law',
        resolution: 'CTB - Lei nº 9.503/1997',
        resolutionNumber: '9503',
        resolutionYear: '1997',
        article: normalizeArticleToken(match[1]),
        paragraph: extractParagraphs(segment).join(', '),
        item: '',
        subitem: '',
        annex: '',
        lawName: 'CTB - Lei nº 9.503/1997',
        lawNumber: '9503',
        lawYear: '1997'
      });
    }
  }
  return refs;
}

function extractParagraphs(segment) {
  const paragraphs = [];
  for (const match of cleanText(segment).matchAll(/§\s*(\d+[ºª]?|único)/gi)) {
    paragraphs.push(match[1].replace(/[ºª]/g, '').toLowerCase());
  }
  return [...new Set(paragraphs)];
}

function extractRomanItems(segment) {
  const withoutArticle = cleanText(segment)
    .replace(/arts?\.?\s*\d{1,3}(?:-[A-Z])?\s*[ºªo]?/gi, '')
    .replace(/§\s*(?:\d+[ºª]?|único)/gi, '')
    .replace(/\bcaput\b/gi, '');
  const items = [];
  for (const match of withoutArticle.matchAll(/\b([IVXLCDM]{1,8})\b/g)) {
    items.push(match[1].toUpperCase());
  }
  return [...new Set(items)];
}

function buildReference(input) {
  const article = input.article ? normalizeArticleToken(input.article) : '';
  const annex = cleanText(input.annex);
  return {
    type: input.type || 'resolution',
    resolution: input.resolution,
    resolutionNumber: input.resolutionNumber,
    resolutionYear: input.resolutionYear,
    article,
    paragraph: cleanText(input.paragraph),
    item: cleanText(input.item),
    subitem: cleanText(input.subitem),
    annex,
    rawText: input.rawText,
    lawName: cleanText(input.lawName),
    lawNumber: cleanText(input.lawNumber),
    lawYear: cleanText(input.lawYear)
  };
}

function dedupeReferences(references) {
  const seen = new Set();
  const output = [];
  for (const ref of references) {
    const key = [
      ref.type || 'resolution',
      ref.resolutionNumber,
      ref.resolutionYear,
      ref.article,
      ref.paragraph,
      ref.item,
      ref.subitem,
      ref.annex
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(ref);
  }
  return output;
}

function normalizeArticleToken(value) {
  const token = cleanText(value).toUpperCase();
  const match = token.match(/^(\d{1,3})(?:-([A-Z]))?$/);
  if (!match) return '';
  return `${Number(match[1])}${match[2] ? `-${match[2]}` : ''}`;
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}
