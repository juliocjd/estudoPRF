import { DatabaseSync } from 'node:sqlite';
import { PostgresSyncDatabase } from './postgres-sync-db.mjs';

export function openStudyDatabase({ dbPath, databaseUrl, client = '' }) {
  const resolvedClient = String(client || process.env.DB_CLIENT || '').trim().toLowerCase()
    || (databaseUrl || process.env.DATABASE_URL ? 'postgres' : 'sqlite');

  if (resolvedClient === 'postgres' || resolvedClient === 'pg') {
    return {
      client: 'postgres',
      db: new PostgresSyncDatabase(databaseUrl || process.env.DATABASE_URL)
    };
  }

  return {
    client: 'sqlite',
    db: new DatabaseSync(dbPath)
  };
}
