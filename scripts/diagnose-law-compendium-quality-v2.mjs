import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  openLawCompendiumDatabase,
  parseArgs,
  writeJson,
  writeText
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);
const outJson = args.json || 'data/law_compendium_quality_v2_report.json';
const outMd = args.md || 'data/law_compendium_quality_v2_report.md';

try {
  const report = buildReport();
  writeJson(outJson, report);
  writeText(outMd, renderMarkdown(report));
  console.log('# Diagnóstico de qualidade da Apostila da Lei v2');
  console.log(`Banco: ${client}`);
  console.log(`JSON: ${path.relative(ROOT_DIR, path.resolve(ROOT_DIR, outJson))}`);
  console.log(`MD: ${path.relative(ROOT_DIR, path.resolve(ROOT_DIR, outMd))}`);
  console.log(`Bloqueadores: ${report.blockers.length}`);
} finally {
  db.close();
}

function buildReport() {
  const counts = {
    sourcesTotal: scalar('SELECT COUNT(*) FROM law_compendium_sources'),
    currentStudentSources: scalar("SELECT COUNT(*) FROM law_compendium_sources WHERE status = 'validated_current' AND show_in_student_compendium = TRUE"),
    historicalSources: scalar("SELECT COUNT(*) FROM law_compendium_sources WHERE status = 'historical_revoked'"),
    pendingSources: scalar("SELECT COUNT(*) FROM law_compendium_sources WHERE status NOT IN ('validated_current', 'historical_revoked')"),
    sections: scalar('SELECT COUNT(*) FROM law_compendium_sections'),
    visibleCrossRefs: scalar("SELECT COUNT(*) FROM law_compendium_cross_references WHERE display_policy = 'show_in_article'"),
    hiddenCrossRefs: scalar("SELECT COUNT(*) FROM law_compendium_cross_references WHERE display_policy <> 'show_in_article'"),
    visibleQuestionLinks: scalar("SELECT COUNT(*) FROM law_section_question_links WHERE display_policy = 'show_in_article'"),
    visibleCommentLinks: scalar("SELECT COUNT(*) FROM law_section_comment_links WHERE display_policy = 'show_in_article'")
  };

  const blockers = [];
  addRows(blockers, 'current_without_sections', query(`
    SELECT slug, title, status, import_quality, validation_notes
    FROM law_compendium_sources
    WHERE status = 'validated_current'
      AND NOT EXISTS (SELECT 1 FROM law_compendium_sections s WHERE s.source_slug = law_compendium_sources.slug)
    ORDER BY slug
  `));
  addRows(blockers, 'self_cross_reference_displayed', query(`
    SELECT cr.id, cr.source_slug, cr.section_id, cr.ref_text, cr.target_locator, cr.reason
    FROM law_compendium_cross_references cr
    WHERE cr.display_policy = 'show_in_article'
      AND (cr.is_self_reference = TRUE OR cr.resolved_section_id = cr.section_id)
    ORDER BY cr.id
  `));
  addRows(blockers, 'legacy_or_unverified_question_link_visible', query(`
    SELECT l.id, l.section_id, l.question_id, l.link_kind, l.evidence, l.confidence, l.link_status, l.display_policy
    FROM law_section_question_links l
    WHERE l.display_policy = 'show_in_article'
      AND (l.link_status <> 'verified_exact_locator' OR l.confidence < 0.90)
    ORDER BY l.id
    LIMIT 200
  `));
  addRows(blockers, 'comment_link_without_verified_question_link', query(`
    SELECT c.id, c.section_id, c.question_id, c.evidence, c.confidence
    FROM law_section_comment_links c
    WHERE c.display_policy = 'show_in_article'
      AND NOT EXISTS (
        SELECT 1 FROM law_section_question_links q
        WHERE q.section_id = c.section_id
          AND q.question_id = c.question_id
          AND q.display_policy = 'show_in_article'
          AND q.link_status = 'verified_exact_locator'
      )
    ORDER BY c.id
    LIMIT 200
  `));
  addRows(blockers, 'dirty_section_trailing_paragraph_symbol', query(`
    SELECT id, source_slug, display_ref, text
    FROM law_compendium_sections
    WHERE text ~ '\\s§\\s*$'
    ORDER BY source_slug, order_index
    LIMIT 200
  `));
  addRows(blockers, 'art_1_prefix_false_positive_risk', query(`
    SELECT l.id, l.section_id, s.source_slug, s.display_ref, l.question_id, l.evidence
    FROM law_section_question_links l
    JOIN law_compendium_sections s ON s.id = l.section_id
    WHERE s.display_ref IN ('Art. 1º', 'Art. 1', 'Art 1º', 'Art 1')
      AND l.display_policy = 'show_in_article'
      AND COALESCE(l.evidence, '') ~ '13[0-9]|14[0-9]|15[0-9]|16[0-9]|17[0-9]|18[0-9]|19[0-9]|20[0-9]|21[0-9]|22[0-9]|23[0-9]|24[0-9]'
    ORDER BY l.id
  `));

  const statusBreakdown = query(`
    SELECT status, current_status, import_quality, COUNT(*) AS total
    FROM law_compendium_sources
    GROUP BY status, current_status, import_quality
    ORDER BY status, current_status, import_quality
  `);
  const currentSources = query(`
    SELECT slug, title, number, year, sections_count
    FROM (
      SELECT src.slug, src.title, src.number, src.year, COUNT(sec.id) AS sections_count
      FROM law_compendium_sources src
      LEFT JOIN law_compendium_sections sec ON sec.source_slug = src.slug
      WHERE src.status = 'validated_current'
        AND src.show_in_student_compendium = TRUE
      GROUP BY src.slug, src.title, src.number, src.year
    ) rows
    ORDER BY title
  `);
  const sampleVisibleLinks = query(`
    SELECT s.source_slug, s.display_ref, l.question_id, l.evidence, l.confidence
    FROM law_section_question_links l
    JOIN law_compendium_sections s ON s.id = l.section_id
    WHERE l.display_policy = 'show_in_article'
    ORDER BY l.confidence DESC, l.id
    LIMIT 50
  `);

  return {
    generatedAt: new Date().toISOString(),
    dbClient: client,
    counts,
    statusBreakdown,
    currentSources,
    sampleVisibleLinks,
    blockers
  };
}

function addRows(blockers, category, rows) {
  for (const row of rows) blockers.push({ category, ...row });
}

function scalar(sql) {
  try {
    const row = db.prepare(sql).get();
    return Number(Object.values(row || { n: 0 })[0] || 0);
  } catch {
    return 0;
  }
}

function query(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (error) {
    return [{ diagnosticError: error.message || String(error), sql: sql.slice(0, 200) }];
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Diagnóstico de qualidade — Apostila da Lei v2');
  lines.push('');
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`Banco: ${report.dbClient}`);
  lines.push('');
  lines.push('## Contadores');
  lines.push('');
  for (const [key, value] of Object.entries(report.counts)) lines.push(`- ${key}: ${value}`);
  lines.push('');
  lines.push('## Bloqueadores');
  lines.push('');
  if (!report.blockers.length) {
    lines.push('Nenhum bloqueador crítico encontrado.');
  } else {
    const groups = groupBy(report.blockers, 'category');
    for (const [category, rows] of Object.entries(groups)) {
      lines.push(`### ${category} (${rows.length})`);
      for (const row of rows.slice(0, 20)) lines.push(`- ${JSON.stringify(row)}`);
      if (rows.length > 20) lines.push(`- ... mais ${rows.length - 20}`);
      lines.push('');
    }
  }
  lines.push('## Fontes vigentes publicáveis');
  lines.push('');
  for (const row of report.currentSources || []) {
    lines.push(`- ${row.slug} — ${row.title} — ${row.sections_count} seções`);
  }
  return `${lines.join('\n')}\n`;
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || 'outros';
    (acc[value] ||= []).push(row);
    return acc;
  }, {});
}
