function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function safeError(error) {
  const raw = error?.message || String(error || 'Erro desconhecido');
  return raw
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://***@')
    .replace(/DATABASE_URL=([^\s]+)/gi, 'DATABASE_URL=***');
}

function runtimeDiagnostics() {
  return {
    node: process.version,
    vercel: Boolean(process.env.VERCEL),
    region: process.env.VERCEL_REGION || '',
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    dbClient: process.env.DB_CLIENT || '',
    databaseUrlHost: safeDatabaseHost(process.env.DATABASE_URL || '')
  };
}

function safeDatabaseHost(value) {
  try {
    return value ? new URL(value).host : '';
  } catch {
    return 'invalid_url';
  }
}

async function handleHealth(response) {
  const diagnostics = runtimeDiagnostics();
  const checks = {
    env: diagnostics.hasDatabaseUrl && String(diagnostics.dbClient || '').toLowerCase() === 'postgres',
    postgres: false,
    tables: false
  };
  const details = {};

  if (!diagnostics.hasDatabaseUrl) {
    sendJson(response, 500, {
      ok: false,
      error: 'DATABASE_URL nao esta definida no ambiente do Vercel.',
      diagnostics,
      checks
    });
    return;
  }

  try {
    const postgres = (await import('postgres')).default;
    const sql = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10
    });
    const ping = await sql`SELECT 1 AS ok`;
    checks.postgres = Number(ping?.[0]?.ok || 0) === 1;
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('questions', 'comments', 'study_settings', 'exam_profiles')
      ORDER BY table_name
    `;
    details.tables = rows.map((row) => row.table_name);
    checks.tables = details.tables.length === 4;
    await sql.end({ timeout: 5 });
  } catch (error) {
    details.postgresError = safeError(error);
  }

  const ok = checks.env && checks.postgres && checks.tables;
  sendJson(response, ok ? 200 : 500, {
    ok,
    diagnostics,
    checks,
    details
  });
}

export default async function handler(request, response) {
  const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' || url.pathname === '/api/_health') {
    await handleHealth(response);
    return;
  }

  try {
    const { handleStudyRequest } = await import('../src/study-server.mjs');
    await handleStudyRequest(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: 'Falha ao inicializar API.',
      message: safeError(error),
      diagnostics: runtimeDiagnostics()
    });
  }
}
