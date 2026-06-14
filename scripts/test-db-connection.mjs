#!/usr/bin/env node
/** Testa a conexão sem expor credenciais. */
import { createClient } from './lib/db.mjs';

const { client, selected } = createClient({ preferDirect: false, applicationName: 'contran-prf-2021-connection-test' });
try {
  await client.connect();
  const { rows } = await client.query(`
    select
      current_database() as database,
      current_user as user,
      version() as postgres_version,
      now() as server_time
  `);
  console.log(JSON.stringify({
    ok: true,
    connection_source: selected.sourceName,
    using_neon_pooler: selected.pooledNeon,
    connection: selected.redactedConnectionString,
    database: rows[0],
  }, null, 2));
} finally {
  try { await client.end(); } catch {}
}
