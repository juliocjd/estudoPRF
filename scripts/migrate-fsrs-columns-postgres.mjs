#!/usr/bin/env node
/** Migração FSRS no Postgres com timeout de lock e diagnóstico.
 *  Uso:
 *    node scripts/migrate-fsrs-columns-postgres.mjs            → tenta migrar
 *    node scripts/migrate-fsrs-columns-postgres.mjs --kill-idle → mata conexões ociosas antes
 */
import { createClient } from './lib/db.mjs';

const killIdle = process.argv.includes('--kill-idle');
const { client } = createClient({ preferDirect: true, applicationName: 'migrate-fsrs-columns' });

const COLUMNS = [
  ['fsrs_stability', 'REAL'],
  ['fsrs_difficulty', 'REAL'],
  ['fsrs_reps', 'INTEGER DEFAULT 0'],
  ['fsrs_lapses', 'INTEGER DEFAULT 0'],
  ['fsrs_last_review', 'TEXT'],
  ['fsrs_retrievability', 'REAL'],
  ['fsrs_version', 'TEXT']
];

try {
  await client.connect();

  if (killIdle) {
    const { rows } = await client.query(`
      SELECT pg_terminate_backend(pid) AS killed, pid
      FROM pg_stat_activity
      WHERE state LIKE 'idle%' AND pid <> pg_backend_pid()
    `);
    console.log(`Conexões ociosas encerradas: ${rows.length}`);
  }

  // Não espera lock para sempre: falha em 8s com diagnóstico.
  await client.query(`SET lock_timeout = '8s'`);

  for (const [name, definition] of COLUMNS) {
    process.stdout.write(`ALTER question_mastery ADD ${name}... `);
    try {
      await client.query(`ALTER TABLE question_mastery ADD COLUMN IF NOT EXISTS ${name} ${definition}`);
      console.log('ok');
    } catch (error) {
      console.log(`FALHOU: ${error.message}`);
      if (String(error.message).includes('lock timeout')) {
        const { rows } = await client.query(`
          SELECT pid, state, wait_event_type,
            now() - query_start AS ha_quanto_tempo, LEFT(query, 90) AS query
          FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          ORDER BY query_start
        `);
        console.log('\nConexões ativas segurando o banco:');
        console.table(rows);
        console.log('\nRode de novo com --kill-idle para encerrar as ociosas e tentar novamente.');
        process.exit(1);
      }
      throw error;
    }
  }

  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'question_mastery' AND column_name LIKE 'fsrs%'
    ORDER BY column_name
  `);
  console.log(`\nColunas FSRS presentes (${rows.length}/7):`, rows.map((row) => row.column_name).join(', '));
  console.log('Migração concluída. Pode subir o servidor.');
} finally {
  try { await client.end(); } catch {}
}
