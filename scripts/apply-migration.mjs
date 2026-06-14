#!/usr/bin/env node
/**
 * Aplica a migração SQL do pacote via node-postgres.
 * Útil quando o ambiente não tem psql instalado.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, warnIfPooledForAdmin } from './lib/db.mjs';
import { packageRoot } from './lib/env.mjs';

const migrationPath = process.argv.find((arg) => !arg.startsWith('--') && arg.endsWith('.sql'))
  || path.join(packageRoot, 'migrations', '20260614_contran_prf_2021_current_map.sql');

const { client, selected } = createClient({ preferDirect: true, applicationName: 'contran-prf-2021-migration' });
warnIfPooledForAdmin(selected, 'migração DDL');

try {
  const sql = await fs.readFile(migrationPath, 'utf8');
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(`
    select
      to_regclass('public.contran_prf_2021_current_map') is not null as current_map_table,
      to_regclass('public.contran_prf_2021_import_runs') is not null as import_runs_table,
      to_regclass('public.legal_norm_aliases') is not null as aliases_table
  `);
  console.log(JSON.stringify({
    ok: true,
    migration: path.relative(packageRoot, migrationPath),
    connection_source: selected.sourceName,
    using_neon_pooler: selected.pooledNeon,
    objects: rows[0],
  }, null, 2));
} finally {
  try { await client.end(); } catch {}
}
