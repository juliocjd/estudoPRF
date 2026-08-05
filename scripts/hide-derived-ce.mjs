// Oculta as questões CE DERIVADAS (id>=910000000) do estudo. Defeito: usam o
// comentário do MC-pai (que explica todas as alternativas), vazando a resposta
// das assertivas-irmãs. Há 8.309 CE reais com comentário próprio — não fazem
// falta. Reversível: apagar as linhas 'excluded' correspondentes.
//   node --experimental-sqlite --env-file=.env scripts/hide-derived-ce.mjs            # dry-run
//   node --experimental-sqlite --env-file=.env scripts/hide-derived-ce.mjs --apply    # local + prod
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const REASON = 'auto: CE derivada (comentario do pai vaza irmas) - fora do estudo';
const local = new DatabaseSync('questoes-prf.sqlite');
const derivIds = local.prepare(
  "SELECT id_question FROM questions WHERE id_question >= 910000000 AND type_question = 'CERTO_ERRADO'"
).all().map((r) => r.id_question);
console.log('CE derivadas (id>=910M):', derivIds.length);

try { mkdirSync('tmp', { recursive: true }); } catch {}
writeFileSync('tmp/hide-derived-backup.json', JSON.stringify({ reason: REASON, ids: derivIds }, null, 1));

if (!apply) { console.log('DRY-RUN (use --apply). backup em tmp/hide-derived-backup.json'); local.close(); process.exit(0); }

// LOCAL
const already = new Set(local.prepare("SELECT question_id FROM question_study_status WHERE status='excluded'").all().map((r) => r.question_id));
const toHideLocal = derivIds.filter((id) => !already.has(id));
const insL = local.prepare("INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at) VALUES (?, 'excluded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
local.exec('BEGIN');
for (const id of toHideLocal) insL.run(id, REASON);
local.exec('COMMIT');
console.log('LOCAL: ocultadas', toHideLocal.length);
local.close();

// PROD
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const exc = new Set((await sql`SELECT question_id FROM question_study_status WHERE status='excluded' AND question_id = ANY(${derivIds})`).map((r) => Number(r.question_id)));
  const toHideProd = derivIds.filter((id) => !exc.has(id));
  if (toHideProd.length) {
    await sql`INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at)
      SELECT unnest(${toHideProd}::bigint[]), 'excluded', ${REASON}, now(), now()`;
  }
  console.log('PROD: ocultadas', toHideProd.length);
} catch (e) { console.error('ERRO PROD:', e.message); process.exitCode = 1; } finally { await sql.end(); }
