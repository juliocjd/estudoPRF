#!/usr/bin/env node
/**
 * Diagnóstico rápido pós-importação.
 * Exibe alvos de estudo, escopos excluídos e referências antigas resolvidas.
 */
import { createClient } from './lib/db.mjs';

const { client, selected } = createClient({ preferDirect: false, applicationName: 'contran-prf-2021-diagnose' });
await client.connect();
try {
  const { rows: totals } = await client.query(`
    select
      count(*)::int as mappings,
      count(distinct target_organ || ':' || target_number || '/' || target_year)::int as unique_current_targets,
      count(*) filter (where old_norm_allowed_only_as_alias = true)::int as old_alias_only_rows,
      count(*) filter (where scope_policy ? 'exclude_annexes_from_original_edital' and (scope_policy->>'exclude_annexes_from_original_edital')::boolean = true)::int as annex_exclusion_rows,
      count(*) filter (where scope_policy ? 'exclude_fichas_from_original_edital' and (scope_policy->>'exclude_fichas_from_original_edital')::boolean = true)::int as ficha_exclusion_rows,
      count(*) filter (where scope_policy->>'include_only_current_equivalent' is not null and scope_policy->>'include_only_current_equivalent' <> '')::int as current_equivalent_only_rows
    from contran_prf_2021_current_map
    where show_in_current_study_filter = true
  `);

  const { rows: targets } = await client.query(`
    select target_organ, target_number, target_year, min(target_title) as title, count(*)::int as mapped_sources
    from contran_prf_2021_current_map
    where show_in_current_study_filter = true
    group by target_organ, target_number, target_year
    order by target_year::text, target_number::text
  `);

  const { rows: excluded } = await client.query(`
    select source_number, source_year, edital_scope, target_number, target_year, relation, scope_policy
    from contran_prf_2021_current_map
    where (scope_policy ? 'exclude_annexes_from_original_edital' and (scope_policy->>'exclude_annexes_from_original_edital')::boolean = true)
       or (scope_policy ? 'exclude_fichas_from_original_edital' and (scope_policy->>'exclude_fichas_from_original_edital')::boolean = true)
       or (scope_policy->>'include_only_current_equivalent' is not null and scope_policy->>'include_only_current_equivalent' <> '')
    order by source_year::text, source_number::text
  `);

  const { rows: smokeTests } = await client.query(`
    with refs(number, year) as (
      values ('552','2015'), ('561','2015'), ('349','2010'), ('740','2018'), ('789','2020'), ('806','2020')
    )
    select r.number || '/' || r.year as source_ref,
           m.target_number || '/' || m.target_year as target_ref,
           m.relation,
           m.scope_policy
    from refs r
    left join lateral resolve_contran_prf_2021_norm(r.number, r.year, 'CONTRAN') m on true
    order by r.year, r.number
  `);

  console.log(JSON.stringify({
    ok: true,
    connection_source: selected.sourceName,
    using_neon_pooler: selected.pooledNeon,
    totals: totals[0],
    smoke_tests: smokeTests,
    excluded_scope_rules: excluded,
    current_targets: targets,
  }, null, 2));
} finally {
  await client.end();
}
