// Oculta questões de trânsito de resoluções FORA das 34 do edital PRF 2021
// (confirmado pelo doc de vigência ago/2026). São ~138 questões que entraram
// pela coleta ampla do tec (provável de outros concursos). Reversível: apagar
// as linhas 'excluded' correspondentes.
//   node --experimental-sqlite --env-file=.env scripts/hide-offedital-transito.mjs            # dry-run
//   node --experimental-sqlite --env-file=.env scripts/hide-offedital-transito.mjs --apply    # local + prod
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const REASON = 'auto: fora do edital PRF 2021 (resolucao nao consta das 34) - off-scope';
// Resoluções fora do edital (por padrão no assunto).
const PATTERNS = ['623/2016', '957/2022', '927/2022', '300/2008', '965/2022', '514/2014', '26/1998', '573/2015', '351/2010'];
const like = PATTERNS.map(() => 'assunto LIKE ?').join(' OR ');
const params = PATTERNS.map((p) => `%${p}%`);

const local = new DatabaseSync('questoes-prf.sqlite');
const ids = local.prepare(
  `SELECT id_question FROM questions WHERE materia LIKE 'Legisla%o de Tr%nsito%' AND (${like})`
).all(...params).map((r) => r.id_question);
console.log('questões off-edital a ocultar:', ids.length);

try { mkdirSync('tmp', { recursive: true }); } catch {}
writeFileSync('tmp/hide-offedital-backup.json', JSON.stringify({ reason: REASON, patterns: PATTERNS, ids }, null, 1));

if (!apply) { console.log('DRY-RUN (use --apply). backup em tmp/hide-offedital-backup.json'); local.close(); process.exit(0); }

// LOCAL
const already = new Set(local.prepare("SELECT question_id FROM question_study_status WHERE status='excluded'").all().map((r) => r.question_id));
const toHideLocal = ids.filter((id) => !already.has(id));
const insL = local.prepare("INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at) VALUES (?, 'excluded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
local.exec('BEGIN');
for (const id of toHideLocal) insL.run(id, REASON);
local.exec('COMMIT');
console.log('LOCAL: ocultadas', toHideLocal.length);
local.close();

// PROD
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const exc = new Set((await sql`SELECT question_id FROM question_study_status WHERE status='excluded' AND question_id = ANY(${ids})`).map((r) => Number(r.question_id)));
  const toHideProd = ids.filter((id) => !exc.has(id));
  if (toHideProd.length) {
    await sql`INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at)
      SELECT unnest(${toHideProd}::bigint[]), 'excluded', ${REASON}, now(), now()`;
  }
  console.log('PROD: ocultadas', toHideProd.length);
} catch (e) { console.error('ERRO PROD:', e.message); process.exitCode = 1; } finally { await sql.end(); }
