import pg from 'pg';
import { loadEnvFiles, redactDatabaseUrl } from './env.mjs';

function isNeonPooledUrl(value) {
  try {
    return new URL(value).hostname.includes('-pooler.');
  } catch {
    return false;
  }
}

function isNeonHost(value) {
  try {
    return new URL(value).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

export function selectDatabaseUrl({ preferDirect = true } = {}) {
  loadEnvFiles();
  const direct = process.env.DATABASE_DIRECT_URL || process.env.DIRECT_URL;
  const pooledOrDefault = process.env.DATABASE_URL;

  if (preferDirect && direct) {
    return { connectionString: direct, sourceName: process.env.DATABASE_DIRECT_URL ? 'DATABASE_DIRECT_URL' : 'DIRECT_URL' };
  }
  if (pooledOrDefault) {
    return { connectionString: pooledOrDefault, sourceName: 'DATABASE_URL' };
  }
  if (direct) {
    return { connectionString: direct, sourceName: process.env.DATABASE_DIRECT_URL ? 'DATABASE_DIRECT_URL' : 'DIRECT_URL' };
  }
  throw new Error('Defina DATABASE_URL. Para Neon, prefira também DATABASE_DIRECT_URL/DIRECT_URL sem "-pooler" para migração/importação.');
}

export function buildPgConfig({ preferDirect = true, applicationName = 'contran-prf-2021-map' } = {}) {
  const selected = selectDatabaseUrl({ preferDirect });
  const connectionString = selected.connectionString;
  const config = {
    connectionString,
    application_name: applicationName,
    connectionTimeoutMillis: Number(process.env.PGCONNECT_TIMEOUT_MS || 15000),
    statement_timeout: Number(process.env.PGSTATEMENT_TIMEOUT_MS || 120000),
  };

  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get('sslmode');
    const channelBinding = url.searchParams.get('channel_binding');
    if (channelBinding && channelBinding !== 'disable') {
      config.enableChannelBinding = true;
    }
    if (!sslmode && isNeonHost(connectionString)) {
      config.ssl = true;
    }
  } catch {
    // A validação final será feita pelo pg.Client.
  }

  return {
    ...selected,
    redactedConnectionString: redactDatabaseUrl(connectionString),
    pooledNeon: isNeonPooledUrl(connectionString),
    config,
  };
}

export function createClient(options = {}) {
  const selected = buildPgConfig(options);
  return { client: new pg.Client(selected.config), selected };
}

export function warnIfPooledForAdmin(selected, task = 'esta tarefa administrativa') {
  if (selected?.pooledNeon) {
    console.warn(`AVISO: ${selected.sourceName} aponta para endpoint Neon com -pooler. Para ${task}, prefira DATABASE_DIRECT_URL/DIRECT_URL sem -pooler.`);
  }
}
