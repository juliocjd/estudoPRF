import {
  jsonValue,
  normalizeSearchText,
  normalizeWhitespace,
  openLawCompendiumDatabase,
  parseArgs,
  tableExists
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);

try {
  db.prepare('DELETE FROM law_section_comment_links').run();
  db.prepare('DELETE FROM law_section_question_links').run();

  const sectionsByLocator = buildSectionIndex();
  let questionLinks = 0;
  let relatedQuestionLinks = 0;
  let commentLinks = 0;
  const seenQuestionsBySection = new Map();

  for (const row of readQuestionCurrentLawRows()) {
    questionLinks += linkQuestionFromText(row.question_id, row.legal_basis, 'current_law_answer', 'question_current_law_answers', 'legal_basis', sectionsByLocator, seenQuestionsBySection);
    questionLinks += linkQuestionFromText(row.question_id, row.article_excerpt, 'current_law_answer', 'question_current_law_answers', 'article_excerpt', sectionsByLocator, seenQuestionsBySection);
  }

  for (const row of readAppliedTheoryRows()) {
    const fields = [
      ['legal_basis', row.legal_basis],
      ['article_excerpt', row.article_excerpt],
      ['exact_legal_locator', row.exact_legal_locator],
      ['legal_locator', row.legal_locator]
    ];
    for (const [field, value] of fields) {
      questionLinks += linkQuestionFromText(row.question_id, value, 'applied_theory', 'question_applied_theory_cards', field, sectionsByLocator, seenQuestionsBySection);
    }
  }

  if (tableExists(db, 'comments')) {
    commentLinks += linkCommentsDerivedFromVerifiedQuestions(seenQuestionsBySection);
  }

  relatedQuestionLinks += linkQuestionsByContent(seenQuestionsBySection);

  console.log('# Vínculos estritos Apostila da Lei -> questões/comentários v2');
  console.log(`Banco: ${client}`);
  console.log(`Seções indexadas: ${sectionsByLocator.size}`);
  console.log(`Vínculos de questões verificados: ${questionLinks}`);
  console.log(`Questões relacionadas por conteúdo: ${relatedQuestionLinks}`);
  console.log(`Comentários derivados de questão verificada: ${commentLinks}`);
} finally {
  db.close();
}

function buildSectionIndex() {
  const rows = db.prepare(`
    SELECT s.id, s.source_slug, s.display_ref, s.hierarchy_level, s.text,
      src.source_type, src.number, src.year, src.status
    FROM law_compendium_sections s
    JOIN law_compendium_sources src ON src.slug = s.source_slug
    WHERE src.status = 'validated_current'
      AND COALESCE(s.is_current, TRUE) != FALSE
      AND s.hierarchy_level IN ('artigo', 'anexo', 'inciso', 'alinea', 'paragrafo')
    ORDER BY s.source_slug, s.order_index, s.id
  `).all();
  const index = new Map();
  for (const row of rows) {
    const locators = sectionLocators(row);
    for (const locator of locators) {
      if (!index.has(locator.key)) index.set(locator.key, { ...row, locator });
    }
  }
  return index;
}

function sectionLocators(section) {
  const locators = [];
  const sourceType = section.source_type;
  const number = String(Number(section.number || 0));
  const year = String(section.year || '');
  const ref = String(section.display_ref || '');
  const article = extractArticleNumber(ref);
  const annex = extractAnnex(ref);
  if (sourceType === 'lei' && number === '9503' && article) {
    locators.push({ sourceSlug: section.source_slug, ref, key: keyFor('ctb', '9503', '1997', article) });
  }
  if (sourceType === 'lei' && number === '5970' && article) {
    locators.push({ sourceSlug: section.source_slug, ref, key: keyFor('lei', number, year, article) });
  }
  if (sourceType === 'resolucao' && article) {
    locators.push({ sourceSlug: section.source_slug, ref, key: keyFor('resolucao', number, year, article) });
  }
  if (sourceType === 'resolucao' && annex) {
    locators.push({ sourceSlug: section.source_slug, ref, key: keyFor('resolucao_anexo', number, year, annex) });
  }
  return locators;
}

function readQuestionCurrentLawRows() {
  if (!tableExists(db, 'question_current_law_answers')) return [];
  return queryOptional(`
    SELECT question_id, legal_basis, article_excerpt
    FROM question_current_law_answers
    WHERE COALESCE(legal_basis, '') <> '' OR COALESCE(article_excerpt, '') <> ''
  `);
}

function readAppliedTheoryRows() {
  if (!tableExists(db, 'question_applied_theory_cards')) return [];
  const rows = queryOptional(`SELECT * FROM question_applied_theory_cards WHERE question_id IS NOT NULL`);
  return rows.map((row) => ({
    question_id: row.question_id,
    legal_basis: row.legal_basis || '',
    article_excerpt: row.article_excerpt || row.exact_excerpt || '',
    exact_legal_locator: row.exact_legal_locator || row.legal_locator || '',
    legal_locator: row.legal_locator || ''
  }));
}

function linkQuestionFromText(questionId, text, linkKind, sourceTable, sourceField, sectionsByLocator, seenQuestionsBySection) {
  if (!questionId || !text) return 0;
  const locators = extractExactLocators(text);
  let linked = 0;
  for (const locator of locators) {
    const target = sectionsByLocator.get(locator.key);
    if (!target) continue;
    const key = `${target.id}:${questionId}:${linkKind}`;
    if (seenQuestionsBySection.has(key)) continue;
    seenQuestionsBySection.set(key, { sectionId: target.id, questionId, target, locator });
    upsertQuestionLink({
      sectionId: target.id,
      questionId,
      linkKind,
      evidence: `Localizador exato em ${sourceTable}.${sourceField}: ${locator.label}`,
      confidence: locator.confidence,
      target,
      locator,
      sourceTable,
      sourceField
    });
    linked += 1;
  }
  return linked;
}

function extractExactLocators(text) {
  const clean = normalizeWhitespace(text);
  const locators = [];
  const add = (locator) => {
    if (!locator?.key) return;
    if (!locators.some((item) => item.key === locator.key && item.label === locator.label)) locators.push(locator);
  };

  // CTB: art. 168 do CTB; CTB, arts. 136 a 139-B; Lei nº 9.503/1997, art. 240.
  for (const match of clean.matchAll(/(?:CTB|C[oó]digo\s+de\s+Tr[aâ]nsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)[,\s]*(?:arts?\.|artigos?)\s*([0-9A-Za-zº°-]+)(?:\s*a\s*([0-9A-Za-zº°-]+))?/gi)) {
    for (const article of expandArticleRange(match[1], match[2])) add({ key: keyFor('ctb', '9503', '1997', article), label: `CTB, art. ${article}`, confidence: 0.96 });
  }
  for (const match of clean.matchAll(/(?:arts?\.|artigos?)\s*([0-9A-Za-zº°-]+)(?:\s*a\s*([0-9A-Za-zº°-]+))?\s+(?:do|da)\s+(?:CTB|C[oó]digo\s+de\s+Tr[aâ]nsito\s+Brasileiro|Lei\s+n?[ºo°.]?\s*9\.503(?:\/1997)?)/gi)) {
    for (const article of expandArticleRange(match[1], match[2])) add({ key: keyFor('ctb', '9503', '1997', article), label: `CTB, art. ${article}`, confidence: 0.96 });
  }
  for (const match of clean.matchAll(/Lei\s+n?[ºo°.]?\s*5\.970\/1973[,\s]*(?:arts?\.|artigos?)\s*([0-9A-Za-zº°-]+)/gi)) {
    add({ key: keyFor('lei', '5970', '1973', match[1]), label: `Lei 5.970/1973, art. ${match[1]}`, confidence: 0.96 });
  }

  // Resolução: Resolução CONTRAN nº 819/2021, art. 2º; art. 5º da Res. 967/2022; Anexo I da Res. 819/2021.
  for (const match of clean.matchAll(/Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*(\d+)\/(\d{4})[,\s]*(?:arts?\.|artigos?)\s*([0-9A-Za-zº°-]+)/gi)) {
    add({ key: keyFor('resolucao', match[1], match[2], match[3]), label: `Res. ${match[1]}/${match[2]}, art. ${match[3]}`, confidence: 0.96 });
  }
  for (const match of clean.matchAll(/(?:arts?\.|artigos?)\s*([0-9A-Za-zº°-]+)\s+(?:da|do)\s+Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*(\d+)\/(\d{4})/gi)) {
    add({ key: keyFor('resolucao', match[2], match[3], match[1]), label: `Res. ${match[2]}/${match[3]}, art. ${match[1]}`, confidence: 0.96 });
  }
  for (const match of clean.matchAll(/(?:Anexo)\s+([IVXLCDM\d]+)\s+(?:da|do)\s+Resolu[cç][aã]o\s+(?:CONTRAN\s+)?n?[ºo°.]?\s*(\d+)\/(\d{4})/gi)) {
    add({ key: keyFor('resolucao_anexo', match[2], match[3], match[1]), label: `Res. ${match[2]}/${match[3]}, Anexo ${match[1]}`, confidence: 0.93 });
  }

  return locators;
}

function upsertQuestionLink({ sectionId, questionId, linkKind, evidence, confidence, target, locator, sourceTable, sourceField }) {
  db.prepare(`
    INSERT INTO law_section_question_links (
      section_id, question_id, link_kind, evidence, confidence,
      display_policy, link_status, matched_source_slug, matched_display_ref,
      matched_locator_json, material_match_status, review_status, source_table, source_field
    )
    VALUES (?, ?, ?, ?, ?, 'show_in_article', 'verified_exact_locator', ?, ?, ?, 'exact_locator_match', 'system_verified', ?, ?)
    ON CONFLICT(section_id, question_id, link_kind) DO UPDATE SET
      evidence = excluded.evidence,
      confidence = excluded.confidence,
      display_policy = excluded.display_policy,
      link_status = excluded.link_status,
      matched_source_slug = excluded.matched_source_slug,
      matched_display_ref = excluded.matched_display_ref,
      matched_locator_json = excluded.matched_locator_json,
      material_match_status = excluded.material_match_status,
      review_status = excluded.review_status,
      source_table = excluded.source_table,
      source_field = excluded.source_field
  `).run(
    sectionId,
    questionId,
    linkKind,
    evidence,
    confidence,
    target.source_slug,
    target.display_ref,
    jsonValue(locator),
    sourceTable,
    sourceField
  );
}

function linkCommentsDerivedFromVerifiedQuestions(seenQuestionsBySection) {
  const questionIds = [...new Set([...seenQuestionsBySection.values()].map((item) => item.questionId))];
  if (!questionIds.length) return 0;
  const rows = queryOptional(`
    SELECT question_id, text
    FROM comments
    WHERE question_id IN (${questionIds.map(() => '?').join(',')})
      AND COALESCE(text, '') <> ''
  `, questionIds);
  const commentsByQuestion = new Map(rows.map((row) => [Number(row.question_id), row.text]));
  const insert = db.prepare(`
    INSERT INTO law_section_comment_links (
      section_id, question_id, comment_source, excerpt, evidence, confidence,
      display_policy, link_status, matched_source_slug, matched_display_ref,
      matched_locator_json, material_match_status, review_status, source_table, source_field
    )
    VALUES (?, ?, 'professor_comment', ?, ?, ?, 'show_in_article', 'derived_from_verified_question', ?, ?, ?, 'derived_from_exact_question_link', 'system_verified', 'comments', 'text')
  `);
  let linked = 0;
  const inserted = new Set();
  for (const item of seenQuestionsBySection.values()) {
    const text = commentsByQuestion.get(Number(item.questionId));
    if (!text) continue;
    const key = `${item.sectionId}:${item.questionId}`;
    if (inserted.has(key)) continue;
    inserted.add(key);
    insert.run(
      item.sectionId,
      item.questionId,
      makeExcerpt(text),
      'Comentário vinculado porque a questão foi ligada por localizador legal exato a este dispositivo.',
      0.72,
      item.target.source_slug,
      item.target.display_ref,
      jsonValue(item.locator)
    );
    linked += 1;
  }
  return linked;
}

function linkQuestionsByContent(seenQuestionsBySection) {
  if (!tableExists(db, 'questions')) return 0;
  const exactPairs = new Set([...seenQuestionsBySection.values()].map((item) => `${item.sectionId}:${item.questionId}`));
  const sections = readContentMatchSections();
  const questions = readContentMatchQuestions();
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const questionIndex = buildQuestionTokenIndex(questions);
  let linked = 0;

  for (const section of sections) {
    const sectionTokens = textTokens(section.text);
    if (sectionTokens.length < 8) continue;
    const candidateScores = new Map();
    for (const token of sectionTokens) {
      const rows = questionIndex.get(token);
      if (!rows) continue;
      for (const row of rows) candidateScores.set(row.id, (candidateScores.get(row.id) || 0) + 1);
    }
    const ranked = [...candidateScores]
      .map(([questionId, overlap]) => {
        const question = questionsById.get(questionId);
        if (!question) return null;
        const score = contentMatchScore(sectionTokens, question.tokens, overlap);
        return { question, score, overlap };
      })
      .filter(Boolean)
      .filter((item) => item.score >= 0.68 && item.overlap >= 6)
      .sort((a, b) => b.score - a.score || b.overlap - a.overlap)
      .slice(0, 5);

    for (const item of ranked) {
      if (exactPairs.has(`${section.id}:${item.question.id}`)) continue;
      upsertRelatedQuestionLink(section, item.question, item.score, item.overlap);
      linked += 1;
    }
  }

  return linked;
}

function readContentMatchSections() {
  return queryOptional(`
    SELECT s.id, s.source_slug, s.display_ref, s.hierarchy_level, s.text
    FROM law_compendium_sections s
    JOIN law_compendium_sources src ON src.slug = s.source_slug
    WHERE src.status = 'validated_current'
      AND COALESCE(s.is_current, TRUE) != FALSE
      AND s.hierarchy_level IN ('artigo', 'inciso', 'alinea', 'paragrafo')
      AND length(COALESCE(s.text, '')) >= 80
    ORDER BY s.source_slug, s.order_index, s.id
  `);
}

function readContentMatchQuestions() {
  return queryOptional(`
    SELECT id_question AS id, materia, assunto, statement_text
    FROM questions
    WHERE COALESCE(statement_text, '') <> ''
      AND COALESCE(anulada, 0) = 0
      AND COALESCE(desatualizada, 0) = 0
      AND (
        lower(COALESCE(materia, '')) LIKE '%trânsito%'
        OR lower(COALESCE(materia, '')) LIKE '%transito%'
        OR lower(COALESCE(materia, '')) LIKE '%legislação%'
        OR lower(COALESCE(materia, '')) LIKE '%legislacao%'
        OR lower(COALESCE(assunto, '')) LIKE '%trânsito%'
        OR lower(COALESCE(assunto, '')) LIKE '%transito%'
      )
  `).map((row) => ({
    ...row,
    tokens: textTokens(`${row.statement_text || ''} ${row.assunto || ''}`)
  })).filter((row) => row.tokens.length >= 6);
}

function buildQuestionTokenIndex(questions) {
  const index = new Map();
  for (const question of questions) {
    for (const token of new Set(question.tokens)) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(question);
    }
  }
  return index;
}

function contentMatchScore(sectionTokens, questionTokens, overlap) {
  const sectionUnique = new Set(sectionTokens);
  const questionUnique = new Set(questionTokens);
  const containment = overlap / Math.min(sectionUnique.size, questionUnique.size);
  const dice = (2 * overlap) / (sectionUnique.size + questionUnique.size);
  return Number((containment * 0.72 + dice * 0.28).toFixed(4));
}

function upsertRelatedQuestionLink(section, question, score, overlap) {
  db.prepare(`
    INSERT INTO law_section_question_links (
      section_id, question_id, link_kind, evidence, confidence,
      display_policy, link_status, matched_source_slug, matched_display_ref,
      matched_locator_json, material_match_status, review_status, source_table, source_field
    )
    VALUES (?, ?, 'content_related', ?, ?, 'show_related', 'inferred_content_match', ?, ?, ?, 'lexical_content_match', 'needs_review', 'questions', 'statement_text')
    ON CONFLICT(section_id, question_id, link_kind) DO UPDATE SET
      evidence = excluded.evidence,
      confidence = excluded.confidence,
      display_policy = excluded.display_policy,
      link_status = excluded.link_status,
      matched_source_slug = excluded.matched_source_slug,
      matched_display_ref = excluded.matched_display_ref,
      matched_locator_json = excluded.matched_locator_json,
      material_match_status = excluded.material_match_status,
      review_status = excluded.review_status,
      source_table = excluded.source_table,
      source_field = excluded.source_field
  `).run(
    section.id,
    question.id,
    `Correspondência lexical com o texto do dispositivo (${overlap} termos relevantes em comum).`,
    score,
    section.source_slug,
    section.display_ref,
    jsonValue({ method: 'lexical_content_match', overlap, score })
  );
}

function textTokens(value) {
  const stopwords = new Set([
    'ainda', 'alem', 'ante', 'apos', 'aquela', 'aquelas', 'aquele', 'aqueles',
    'cada', 'caso', 'como', 'contra', 'cujo', 'cujos', 'dada', 'dado', 'deste',
    'desta', 'desses', 'devera', 'devem', 'deve', 'direito', 'dispoe', 'este',
    'esta', 'estes', 'estas', 'forma', 'foram', 'havera', 'inciso', 'incisos',
    'mediante', 'nao', 'para', 'pela', 'pelo', 'pelos', 'perante', 'podera',
    'podem', 'quando', 'quanto', 'sobre', 'todos', 'trata', 'transito',
    'veiculo', 'veiculos', 'codigo', 'previstas', 'previsto'
  ]);
  return [...new Set(normalizeSearchText(value)
    .split(' ')
    .filter((token) => token.length >= 4 && !stopwords.has(token) && !/^\d+$/.test(token)))];
}

function expandArticleRange(start, end) {
  const s = normalizeArticleNumber(start);
  const e = normalizeArticleNumber(end || '');
  if (!e || s === e) return [s];
  const sNum = Number(String(s).match(/^\d+/)?.[0] || 0);
  const eNum = Number(String(e).match(/^\d+/)?.[0] || 0);
  if (!sNum || !eNum || eNum < sNum || eNum - sNum > 20) return [s, e];
  const rows = [];
  for (let n = sNum; n <= eNum; n += 1) rows.push(String(n));
  return rows;
}

function keyFor(kind, number, year, locator) {
  return `${kind}:${String(Number(number || 0))}:${String(year || '')}:${normalizeLocator(locator)}`;
}

function normalizeLocator(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^art\.?\s*/i, '')
    .replace(/^anexo\s*/i, '')
    .replace(/[º°]/g, '')
    .replace(/[^0-9a-z-]/g, '')
    .trim();
}

function normalizeArticleNumber(value) {
  return normalizeLocator(value);
}

function extractArticleNumber(displayRef) {
  return String(displayRef || '').match(/(?:art\.?\s*)?(\d+[A-Za-zº°-]*)/i)?.[1] || '';
}

function extractAnnex(displayRef) {
  return String(displayRef || '').match(/Anexo\s+([IVXLCDM\d]+)/i)?.[1] || '';
}

function queryOptional(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function makeExcerpt(text) {
  const clean = normalizeWhitespace(text).replace(/\s+/g, ' ');
  return clean.length > 650 ? `${clean.slice(0, 650)}...` : clean;
}
