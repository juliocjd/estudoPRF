import {
  openLawCompendiumDatabase,
  parseArgs,
  renderList,
  writeJson,
  writeText
} from './law-compendium-utils.mjs';

const args = parseArgs();
const outJson = args.json || 'data/law_compendium_diagnostico.json';
const outMd = args.md || 'data/law_compendium_diagnostico.md';
const { db, client } = openLawCompendiumDatabase(args);

try {
  const report = buildReport();
  writeJson(outJson, report);
  writeText(outMd, renderMarkdown(report));
  console.log('# Diagnostico da Apostila da Lei');
  console.log(`Banco: ${client}`);
  console.log(`Fontes: ${report.counts.sources}`);
  console.log(`Vigentes validadas: ${report.counts.validatedCurrent}`);
  console.log(`Pendentes/erros: ${report.counts.pendingOrError}`);
  console.log(`Secoes: ${report.counts.sections}`);
  console.log(`Remissoes resolvidas: ${report.counts.crossRefsResolved}/${report.counts.crossRefs}`);
  console.log(`MD: ${outMd}`);
  console.log(`JSON: ${outJson}`);
} finally {
  db.close();
}

function buildReport() {
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM law_compendium_sources
    GROUP BY status
    ORDER BY total DESC
  `).all();
  const sources = db.prepare(`
    SELECT slug, title, source_type, number, year, status, official_url, validation_notes
    FROM law_compendium_sources
    ORDER BY status, source_type, year, number, title
  `).all();
  const blockers = sources.filter((source) => !['validated_current', 'historical_revoked'].includes(source.status));
  const missingOfficial = sources.filter((source) => source.status === 'validated_current' && !source.official_url);
  const missingSummaries = db.prepare(`
    SELECT src.slug, src.title
    FROM law_compendium_sources src
    LEFT JOIN law_compendium_study_summaries s ON s.source_slug = src.slug
    WHERE src.status = 'validated_current'
      AND s.source_slug IS NULL
    ORDER BY src.slug
  `).all();
  const sectionsBySource = db.prepare(`
    SELECT src.slug, src.title, COUNT(sec.id) AS sections
    FROM law_compendium_sources src
    LEFT JOIN law_compendium_sections sec ON sec.source_slug = src.slug
    GROUP BY src.slug, src.title
    ORDER BY sections ASC, src.slug
  `).all();
  const crossRefs = db.prepare(`
    SELECT resolution_status, COUNT(*) AS total
    FROM law_compendium_cross_references
    GROUP BY resolution_status
    ORDER BY total DESC
  `).all();
  const questionLinks = db.prepare('SELECT COUNT(*) AS n FROM law_section_question_links').get()?.n || 0;
  const commentLinks = db.prepare('SELECT COUNT(*) AS n FROM law_section_comment_links').get()?.n || 0;
  const brokenQuestionLinks = db.prepare(`
    SELECT COUNT(*) AS n
    FROM law_section_question_links l
    LEFT JOIN questions q ON q.id_question = l.question_id
    WHERE q.id_question IS NULL
  `).get()?.n || 0;
  const brokenSectionLinks = db.prepare(`
    SELECT COUNT(*) AS n
    FROM law_section_question_links l
    LEFT JOIN law_compendium_sections s ON s.id = l.section_id
    WHERE s.id IS NULL
  `).get()?.n || 0;
  const counts = {
    sources: sources.length,
    validatedCurrent: sources.filter((source) => source.status === 'validated_current').length,
    historicalRevoked: sources.filter((source) => source.status === 'historical_revoked').length,
    pendingOrError: blockers.length,
    sections: db.prepare('SELECT COUNT(*) AS n FROM law_compendium_sections').get()?.n || 0,
    crossRefs: db.prepare('SELECT COUNT(*) AS n FROM law_compendium_cross_references').get()?.n || 0,
    crossRefsResolved: db.prepare("SELECT COUNT(*) AS n FROM law_compendium_cross_references WHERE resolution_status = 'resolved'").get()?.n || 0,
    questionLinks,
    commentLinks,
    brokenQuestionLinks,
    brokenSectionLinks
  };

  return {
    generatedAt: new Date().toISOString(),
    dbClient: client,
    counts,
    byStatus,
    blockers,
    missingOfficial,
    missingSummaries,
    sectionsBySource,
    crossRefs,
    linkHealth: { brokenQuestionLinks, brokenSectionLinks }
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Diagnóstico da Apostila da Lei PRF');
  lines.push('');
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`Banco: ${report.dbClient}`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- Fontes: ${report.counts.sources}`);
  lines.push(`- Vigentes validadas: ${report.counts.validatedCurrent}`);
  lines.push(`- Históricas/revogadas: ${report.counts.historicalRevoked}`);
  lines.push(`- Pendentes ou erro: ${report.counts.pendingOrError}`);
  lines.push(`- Seções extraídas: ${report.counts.sections}`);
  lines.push(`- Remissões resolvidas: ${report.counts.crossRefsResolved}/${report.counts.crossRefs}`);
  lines.push(`- Links com questões: ${report.counts.questionLinks}`);
  lines.push(`- Links com comentários: ${report.counts.commentLinks}`);
  lines.push('');
  lines.push('## Status das fontes');
  lines.push('');
  for (const row of report.byStatus) lines.push(`- ${row.status}: ${row.total}`);
  lines.push('');
  lines.push('## Bloqueios de publicação');
  lines.push('');
  lines.push(report.blockers.length
    ? renderList(report.blockers.map((source) => `${source.slug} - ${source.status} - ${source.validation_notes || ''}`))
    : '- Nenhum bloqueio encontrado.');
  lines.push('');
  lines.push('## Vigentes sem URL oficial');
  lines.push('');
  lines.push(report.missingOfficial.length
    ? renderList(report.missingOfficial.map((source) => `${source.slug} - ${source.title}`))
    : '- Nenhuma.');
  lines.push('');
  lines.push('## Vigentes sem resumo');
  lines.push('');
  lines.push(report.missingSummaries.length
    ? renderList(report.missingSummaries.map((source) => `${source.slug} - ${source.title}`))
    : '- Nenhuma.');
  lines.push('');
  lines.push('## Fontes com menos seções');
  lines.push('');
  lines.push(renderList(report.sectionsBySource.slice(0, 30).map((row) => `${row.slug}: ${row.sections} seção(ões)`)));
  lines.push('');
  lines.push('## Integridade de vínculos');
  lines.push('');
  lines.push(`- Links para questões quebrados: ${report.linkHealth.brokenQuestionLinks}`);
  lines.push(`- Links para seções quebrados: ${report.linkHealth.brokenSectionLinks}`);
  return `${lines.join('\n')}\n`;
}
