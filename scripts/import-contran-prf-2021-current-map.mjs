#!/usr/bin/env node
/**
 * Importa data/contran_prf_2021_current_resolution_map.json para PostgreSQL.
 * - Idempotente.
 * - Não apaga resoluções antigas; grava-as como alias histórico.
 * - Lê .env/.env.local automaticamente, mas secrets do shell têm prioridade.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, warnIfPooledForAdmin } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mapPath = args.find((arg) => !arg.startsWith('--')) || path.join(packageRoot, 'data', 'contran_prf_2021', 'contran_prf_2021_current_resolution_map.json');

const { client, selected } = createClient({ preferDirect: true, applicationName: 'contran-prf-2021-import' });
warnIfPooledForAdmin(selected, 'importação/seed');

function parseAliasKey(value) {
  const match = String(value || '').match(/(\d{1,4}(?:\.\d{3})?)\s*\/\s*(\d{2,4})/);
  if (!match) return null;
  let year = match[2];
  if (year.length === 2) year = Number(year) > 80 ? `19${year}` : `20${year}`;
  return { number: match[1], canonicalNumber: match[1].replace(/^0+(?=\d)/, ''), year };
}

async function tableExists(name) {
  const { rows } = await client.query(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = $1
     ) as exists`,
    [name],
  );
  return rows[0]?.exists === true;
}

async function main() {
  const raw = await fs.readFile(mapPath, 'utf8');
  const data = JSON.parse(raw);
  const mappings = data.mappings || [];
  if (mappings.length !== 39) {
    throw new Error(`Mapa deveria ter 39 itens do edital; recebido: ${mappings.length}`);
  }

  await client.connect();
  await client.query('begin');

  const run = await client.query(
    `insert into contran_prf_2021_import_runs(run_label, status, report)
     values ($1, 'started', $2::jsonb) returning id`,
    [
      `contran-prf-2021-current-map-${data.metadata?.reviewed_at || data.metadata?.generated_at || new Date().toISOString().slice(0, 10)}`,
      JSON.stringify({ source: path.relative(packageRoot, mapPath), dry_run: dryRun, connection_source: selected.sourceName, using_neon_pooler: selected.pooledNeon }),
    ],
  );
  const runId = run.rows[0].id;

  let upserted = 0;
  let aliasAttempts = 0;
  let aliasesInserted = 0;
  let aliasesTouched = 0;

  for (const m of mappings) {
    const s = m.source_edital;
    const t = m.current_target;
    await client.query(
      `insert into contran_prf_2021_current_map (
        source_organ, source_number, source_year, source_title_hint, edital_scope, source_aliases,
        target_organ, target_number, target_year, target_title, target_official_url,
        relation, scope_policy, old_norm_allowed_only_as_alias, show_in_current_study_filter,
        notes, confidence, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,now()
      )
      on conflict (source_organ, source_number, source_year)
      do update set
        source_title_hint = excluded.source_title_hint,
        edital_scope = excluded.edital_scope,
        source_aliases = excluded.source_aliases,
        target_organ = excluded.target_organ,
        target_number = excluded.target_number,
        target_year = excluded.target_year,
        target_title = excluded.target_title,
        target_official_url = excluded.target_official_url,
        relation = excluded.relation,
        scope_policy = excluded.scope_policy,
        old_norm_allowed_only_as_alias = excluded.old_norm_allowed_only_as_alias,
        show_in_current_study_filter = excluded.show_in_current_study_filter,
        notes = excluded.notes,
        confidence = excluded.confidence,
        updated_at = now()`,
      [
        s.organ || 'CONTRAN', String(s.number), String(s.year), s.title_hint || null,
        s.edital_scope || 'texto integral', JSON.stringify(s.aliases || []),
        t.organ || 'CONTRAN', String(t.number), String(t.year), t.title, t.official_url,
        m.relation, JSON.stringify(m.scope_policy || {}),
        Boolean(m.implementation?.old_norm_allowed_only_as_alias ?? true),
        Boolean(m.implementation?.show_in_current_study_filter ?? true),
        m.notes || null, m.confidence || 'high',
      ],
    );
    upserted += 1;

    const aliasKeys = new Set([`${s.number}/${s.year}`, ...(s.aliases || [])]);
    for (const alias of Array.from(aliasKeys)) {
      const parsed = parseAliasKey(alias);
      if (!parsed) continue;
      const numbersToStore = new Set([parsed.number, parsed.canonicalNumber].filter(Boolean));
      for (const oldNumber of numbersToStore) {
        aliasAttempts += 1;
        const result = await client.query(
          `insert into legal_norm_aliases (old_organ, old_number, old_year, current_organ, current_number, current_year, alias_reason)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (old_organ, old_number, old_year, current_organ, current_number, current_year)
           do update set alias_reason = excluded.alias_reason
           returning (xmax = 0) as inserted`,
          ['CONTRAN', String(oldNumber), String(parsed.year), t.organ || 'CONTRAN', String(t.number), String(t.year), 'PRF_2021_current_resolution_map'],
        );
        aliasesTouched += result.rowCount;
        if (result.rows[0]?.inserted) aliasesInserted += 1;
      }
    }
  }

  // Integração opcional: se a tabela question_normative_updates existir, adiciona coluna JSONB para metadados atuais.
  if (await tableExists('question_normative_updates')) {
    await client.query(`alter table question_normative_updates add column if not exists contran_current_map jsonb`);
  }

  const { rows: counts } = await client.query(`
    select
      (select count(*)::int from contran_prf_2021_current_map) as total_map_rows,
      (select count(distinct target_organ || ':' || target_number || '/' || target_year)::int from contran_prf_2021_current_map where show_in_current_study_filter = true) as unique_current_targets,
      (select count(*)::int from legal_norm_aliases where alias_reason = 'PRF_2021_current_resolution_map') as alias_rows
  `);

  const report = {
    upserted,
    alias_attempts: aliasAttempts,
    aliases_inserted: aliasesInserted,
    aliases_touched: aliasesTouched,
    dry_run: dryRun,
    counts: counts[0],
  };

  await client.query(
    `update contran_prf_2021_import_runs set finished_at = now(), status = $2, report = $3::jsonb where id = $1`,
    [runId, dryRun ? 'dry_run' : 'ok', JSON.stringify(report)],
  );

  if (dryRun) {
    await client.query('rollback');
  } else {
    await client.query('commit');
  }

  console.log(JSON.stringify({ ok: true, connection_source: selected.sourceName, using_neon_pooler: selected.pooledNeon, ...report }, null, 2));
}

main().catch(async (err) => {
  try { await client.query('rollback'); } catch {}
  console.error(err);
  process.exit(1);
}).finally(async () => {
  try { await client.end(); } catch {}
});
