import fs from 'node:fs';
import { workerData } from 'node:worker_threads';
import postgres from 'postgres';

const control = new Int32Array(workerData.control);
const requestPath = workerData.requestPath;
const responsePath = workerData.responsePath;
const sql = postgres(workerData.databaseUrl, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 30
});
let busy = false;

setInterval(async () => {
  if (busy) return;
  const state = Atomics.load(control, 0);
  if (state === 3) {
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(0);
  }
  if (state !== 1) return;
  busy = true;
  let request = null;
  try {
    request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    const value = await executeRequest(request);
    fs.writeFileSync(responsePath, JSON.stringify({ ok: true, value }), 'utf8');
  } catch (error) {
    fs.writeFileSync(responsePath, JSON.stringify({
      ok: false,
      error: `${error.message || String(error)}${request?.sql ? `\nSQL: ${request.sql}` : ''}`,
      stack: error.stack || ''
    }), 'utf8');
  }

  Atomics.store(control, 0, 2);
  Atomics.notify(control, 0, 1);
  busy = false;
}, 1);

async function executeRequest(request) {
  if (request.op === 'all') {
    return await sql.unsafe(request.sql, request.params || []);
  }
  if (request.op === 'get') {
    const rows = await sql.unsafe(request.sql, request.params || []);
    return rows[0] || null;
  }
  if (request.op === 'run') {
    const rows = await sql.unsafe(request.sql, request.params || []);
    return { changes: rows.count || 0 };
  }
  if (request.op === 'exec') {
    for (const statement of request.statements || []) {
      if (statement.trim()) await sql.unsafe(statement);
    }
    return { ok: true };
  }
  if (request.op === 'pragma_table_info') {
    return await sql.unsafe(`
      SELECT
        ordinal_position - 1 AS cid,
        column_name AS name,
        data_type AS type,
        CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
        column_default AS dflt_value,
        0 AS pk
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [request.tableName]);
  }
  throw new Error(`Operacao Postgres desconhecida: ${request.op}`);
}
