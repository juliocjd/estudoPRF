import {
  normalizeSearchText,
  openLawCompendiumDatabase,
  parseArgs,
  tableExists
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);

try {
  clearExistingLinks();
  const sections = db.prepare(`
    SELECT s.id, s.source_slug, s.display_ref, s.hierarchy_level, s.text,
      src.source_type, src.number, src.year, src.title
    FROM law_compendium_sections s
    JOIN law_compendium_sources src ON src.slug = s.source_slug
    WHERE src.status = 'validated_current'
      AND s.hierarchy_level IN ('artigo', 'anexo')
    ORDER BY s.source_slug, s.order_index
  `).all();

  let questionLinks = 0;
  let commentLinks = 0;
  for (const section of sections) {
    const terms = buildFocusedSectionTerms(section);
    if (!terms.length) continue;
    questionLinks += linkStructuredQuestions(section, terms);
    commentLinks += linkCommentsForLinkedQuestions(section);
  }

  console.log('# Vinculos Apostila da Lei -> questoes/comentarios');
  console.log(`Banco: ${client}`);
  console.log(`Secoes avaliadas: ${sections.length}`);
  console.log(`Vinculos com questoes: ${questionLinks}`);
  console.log(`Vinculos com comentarios: ${commentLinks}`);
} finally {
  db.close();
}

function clearExistingLinks() {
  db.prepare('DELETE FROM law_section_comment_links').run();
  db.prepare('DELETE FROM law_section_question_links').run();
}

function buildFocusedSectionTerms(section) {
  const terms = [];
  const ref = String(section.display_ref || '').trim();
  const number = String(section.number || '').trim();
  const year = String(section.year || '').trim();
  if (ref && /^Art/i.test(ref)) {
    const articleNumber = (ref.match(/\d+[A-Za-zº°-]*/) || [''])[0];
    const articleNumberPlain = articleNumber.replace(/[º°]$/, '');
    const articleWord = ref.replace(/^Art\.?\s*/i, 'artigo ');
    if (section.source_type === 'lei' && number === '9503') {
      terms.push(`${ref} do CTB`);
      terms.push(`${articleWord} do CTB`);
      terms.push(`${ref} da Lei 9.503`);
      if (articleNumberPlain) {
        terms.push(`CTB, art. ${articleNumberPlain}`);
        terms.push(`CTB, arts. ${articleNumberPlain}`);
        terms.push(`Lei 9.503/1997, art. ${articleNumberPlain}`);
      }
    }
    if (section.source_type === 'lei' && number === '5970') {
      terms.push(`${ref} da Lei 5.970`);
      terms.push(`${ref} da Lei 5.970/1973`);
      terms.push(`${articleWord} da Lei 5.970`);
      if (articleNumberPlain) {
        terms.push(`Lei 5.970/1973, art. ${articleNumberPlain}`);
        terms.push(`Lei nº 5.970/1973, art. ${articleNumberPlain}`);
      }
    }
    if (section.source_type === 'resolucao' && number && year) {
      terms.push(`${ref} da Resolucao ${number}/${year}`);
      terms.push(`${ref} da Resolução ${number}/${year}`);
      terms.push(`${ref} da Resolução CONTRAN ${number}/${year}`);
      terms.push(`${articleWord} da Resolução ${number}/${year}`);
      if (articleNumberPlain) {
        terms.push(`Resolução CONTRAN nº ${number}/${year}, art. ${articleNumberPlain}`);
        terms.push(`Resolução CONTRAN n° ${number}/${year}, art. ${articleNumberPlain}`);
        terms.push(`Resolução ${number}/${year}, art. ${articleNumberPlain}`);
      }
    }
  }
  if (/^Anexo/i.test(ref) && number && year) {
    if (section.source_type === 'resolucao') {
      terms.push(`${ref} da Resolucao ${number}/${year}`);
      terms.push(`${ref} da Resolução ${number}/${year}`);
    }
    if (section.source_type === 'lei') {
      terms.push(`${ref} da Lei ${number}/${year}`);
    }
  }
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 6))];
}

function buildSectionTerms(section) {
  const terms = [];
  const ref = String(section.display_ref || '').trim();
  const number = String(section.number || '').trim();
  const year = String(section.year || '').trim();
  if (ref && /^Art/i.test(ref)) {
    terms.push(ref);
    if (section.source_type === 'lei' && number === '9503') terms.push(`${ref} do CTB`);
    if (section.source_type === 'lei' && number === '5970') terms.push(`${ref} da Lei 5.970`);
    if (section.source_type === 'resolucao' && number && year) terms.push(`${ref} da Resolução ${number}/${year}`);
  }
  if (/^Anexo/i.test(ref)) terms.push(ref);
  if (number && year) {
    terms.push(`${number}/${year}`);
    if (section.source_type === 'resolucao') terms.push(`Resolução ${number}/${year}`);
    if (section.source_type === 'lei') terms.push(`Lei ${number}/${year}`);
  }
  return [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 4))];
}

function linkStructuredQuestions(section, terms) {
  let linked = 0;
  if (tableExists(db, 'question_current_law_answers')) {
    const basisRows = queryOptional(`
      SELECT question_id, legal_basis
      FROM question_current_law_answers
      WHERE ${terms.map(() => "COALESCE(legal_basis, '') LIKE ?").join(' OR ')}
      LIMIT 120
    `, terms.map((term) => `%${term}%`));
    for (const row of basisRows) {
      upsertQuestionLink(section.id, row.question_id, 'current_law_answer', `Base legal atual: ${bestMatchedTerm(row.legal_basis, terms)}`, 0.9);
      linked += 1;
    }
  }

  if (tableExists(db, 'question_applied_theory_cards')) {
    const theoryRows = queryOptional(`
      SELECT question_id, legal_basis
      FROM question_applied_theory_cards
      WHERE ${terms.map(() => "COALESCE(legal_basis, '') LIKE ?").join(' OR ')}
      LIMIT 120
    `, terms.map((term) => `%${term}%`));
    for (const row of theoryRows) {
      upsertQuestionLink(section.id, row.question_id, 'applied_theory', `Teoria aplicada: ${bestMatchedTerm(row.legal_basis, terms)}`, 0.84);
      linked += 1;
    }
  }

  return linked;
}

function linkCommentsForLinkedQuestions(section) {
  if (!tableExists(db, 'comments')) return 0;
  const rows = queryOptional(`
    SELECT DISTINCT c.question_id, c.text
    FROM comments c
    JOIN law_section_question_links l ON l.question_id = c.question_id
    WHERE l.section_id = ?
      AND COALESCE(c.text, '') <> ''
    LIMIT 40
  `, [section.id]);
  let linked = 0;
  const insert = db.prepare(`
    INSERT INTO law_section_comment_links (
      section_id, question_id, comment_source, excerpt, evidence, confidence
    )
    VALUES (?, ?, 'professor_comment', ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(
      section.id,
      row.question_id || null,
      makeExcerpt(row.text, []),
      'Comentario de professor vinculado por questao relacionada ao dispositivo.',
      0.66
    );
    linked += 1;
  }
  return linked;
}

function linkQuestions(section, terms) {
  if (!tableExists(db, 'questions')) return 0;
  const rows = db.prepare(`
    SELECT DISTINCT q.id_question, q.statement_text, q.materia, q.assunto
    FROM questions q
    LEFT JOIN alternatives a ON a.question_id = q.id_question
    WHERE q.materia = 'Legislação de Trânsito e Transportes'
      AND (${terms.map(() => "(COALESCE(q.statement_text, '') LIKE ? OR COALESCE(a.text, '') LIKE ?)").join(' OR ')})
    LIMIT 80
  `).all(...terms.flatMap((term) => [`%${term}%`, `%${term}%`]));
  let linked = 0;
  for (const row of rows) {
    upsertQuestionLink(section.id, row.id_question, 'tested_by', `Referencia textual: ${bestMatchedTerm(row.statement_text, terms)}`, 0.62);
    linked += 1;
  }

  if (tableExists(db, 'question_current_law_answers')) {
    const basisRows = queryOptional(`
      SELECT question_id, legal_basis
      FROM question_current_law_answers
      WHERE ${terms.map(() => "COALESCE(legal_basis, '') LIKE ?").join(' OR ')}
      LIMIT 80
    `, terms.map((term) => `%${term}%`));
    for (const row of basisRows) {
      upsertQuestionLink(section.id, row.question_id, 'current_law_answer', `Base legal atual: ${bestMatchedTerm(row.legal_basis, terms)}`, 0.9);
      linked += 1;
    }
  }

  if (tableExists(db, 'question_applied_theory_cards')) {
    const theoryRows = queryOptional(`
      SELECT question_id, legal_basis
      FROM question_applied_theory_cards
      WHERE ${terms.map(() => "COALESCE(legal_basis, '') LIKE ?").join(' OR ')}
      LIMIT 80
    `, terms.map((term) => `%${term}%`));
    for (const row of theoryRows) {
      upsertQuestionLink(section.id, row.question_id, 'applied_theory', `Teoria aplicada: ${bestMatchedTerm(row.legal_basis, terms)}`, 0.84);
      linked += 1;
    }
  }

  return linked;
}

function linkComments(section, terms) {
  if (!tableExists(db, 'comments')) return 0;
  const rows = db.prepare(`
    SELECT question_id, text
    FROM comments
    WHERE ${terms.map(() => "COALESCE(text, '') LIKE ?").join(' OR ')}
    LIMIT 80
  `).all(...terms.map((term) => `%${term}%`));
  let linked = 0;
  const insert = db.prepare(`
    INSERT INTO law_section_comment_links (
      section_id, question_id, comment_source, excerpt, evidence, confidence
    )
    VALUES (?, ?, 'professor_comment', ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(
      section.id,
      row.question_id || null,
      makeExcerpt(row.text, terms),
      `Comentario menciona: ${bestMatchedTerm(row.text, terms)}`,
      0.58
    );
    linked += 1;
  }
  return linked;
}

function upsertQuestionLink(sectionId, questionId, linkKind, evidence, confidence) {
  if (!sectionId || !questionId) return;
  db.prepare(`
    INSERT INTO law_section_question_links (
      section_id, question_id, link_kind, evidence, confidence
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(section_id, question_id, link_kind) DO UPDATE SET
      evidence = excluded.evidence,
      confidence = excluded.confidence
  `).run(sectionId, questionId, linkKind, evidence, confidence);
}

function queryOptional(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function bestMatchedTerm(text, terms) {
  const normalized = normalizeSearchText(text);
  return terms.find((term) => normalized.includes(normalizeSearchText(term))) || terms[0] || '';
}

function makeExcerpt(text, terms) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const term = bestMatchedTerm(clean, terms);
  const index = normalizeSearchText(clean).indexOf(normalizeSearchText(term));
  if (index < 0) return clean.slice(0, 500);
  return clean.slice(Math.max(0, index - 180), index + 320).trim();
}
