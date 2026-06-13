import {
  jsonValue,
  openLawCompendiumDatabase,
  parseArgs,
  safeJson
} from './law-compendium-utils.mjs';

const args = parseArgs();
const { db, client } = openLawCompendiumDatabase(args);

try {
  const sources = db.prepare(`
    SELECT slug, source_type, number, year, title, summary, edital_origin, replaces, metadata
    FROM law_compendium_sources
    WHERE status = 'validated_current'
    ORDER BY source_type, year, number, title
  `).all();
  const upsert = db.prepare(`
    INSERT INTO law_compendium_study_summaries (
      source_slug, top_summary, what_it_covers, high_yield_points,
      common_traps, related_ctb_articles, generated_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'system_heuristic_no_ai', CURRENT_TIMESTAMP)
    ON CONFLICT(source_slug) DO UPDATE SET
      top_summary = excluded.top_summary,
      what_it_covers = excluded.what_it_covers,
      high_yield_points = excluded.high_yield_points,
      common_traps = excluded.common_traps,
      related_ctb_articles = excluded.related_ctb_articles,
      generated_by = excluded.generated_by,
      created_at = CURRENT_TIMESTAMP
  `);

  let generated = 0;
  for (const source of sources) {
    const metadata = safeJson(source.metadata, {});
    const editalOrigin = safeJson(source.edital_origin, []);
    const articles = findCtbArticlesForSource(source.slug);
    const topic = metadata?.seed?.title || source.title;
    const replaced = Array.isArray(editalOrigin) && editalOrigin.length
      ? ` Substitui ou atualiza no estudo: ${editalOrigin.join('; ')}.`
      : '';
    const topSummary = `${source.title}. Norma vigente importada de fonte oficial para estudo da Legislação PRF.${replaced}`;
    const covers = [
      topic,
      metadata?.seed?.theme || '',
      source.source_type === 'lei' ? 'Texto legal em vigor' : 'Resolução vigente ou substituta atual'
    ].filter(Boolean);
    const highYield = [
      'Leia a literalidade dos artigos e anexos vinculados.',
      'Confira remissões exibidas abaixo dos dispositivos.',
      'Priorize dispositivos com questões relacionadas.'
    ];
    const traps = [
      'Não confundir norma histórica do edital com norma vigente.',
      'Comentários de professor são explicações relacionadas, não texto legal.',
      'Dispositivo revogado deve ser tratado apenas em histórico.'
    ];
    upsert.run(
      source.slug,
      topSummary,
      jsonValue(covers),
      jsonValue(highYield),
      jsonValue(traps),
      jsonValue(articles)
    );
    generated += 1;
  }

  console.log('# Resumos da Apostila da Lei');
  console.log(`Banco: ${client}`);
  console.log(`Resumos criados/atualizados: ${generated}`);
} finally {
  db.close();
}

function findCtbArticlesForSource(sourceSlug) {
  const rows = db.prepare(`
    SELECT DISTINCT target_locator
    FROM law_compendium_cross_references
    WHERE source_slug = ?
      AND target_source_slug = 'lei_9503_1997_ctb_compilado'
      AND resolution_status = 'resolved'
    ORDER BY target_locator
    LIMIT 30
  `).all(sourceSlug);
  return rows.map((row) => row.target_locator).filter(Boolean);
}
