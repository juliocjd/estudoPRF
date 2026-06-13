import { createRequire } from 'node:module';
import '../load-env.mjs';
import { PostgresSyncDatabase } from './postgres-sync-db.mjs';

const require = createRequire(import.meta.url);

export function openStudyDatabase({ dbPath, databaseUrl, client = '' }) {
  const resolvedClient = String(client || process.env.DB_CLIENT || '').trim().toLowerCase()
    || (databaseUrl || process.env.DATABASE_URL ? 'postgres' : 'sqlite');

  if (resolvedClient === 'postgres' || resolvedClient === 'pg') {
    return {
      client: 'postgres',
      db: new PostgresSyncDatabase(databaseUrl || process.env.DATABASE_URL)
    };
  }

  const { DatabaseSync } = require('node:sqlite');
  return {
    client: 'sqlite',
    db: new DatabaseSync(dbPath)
  };
}
