// Adiciona study_answers.was_due_review (0/1): marca se a resposta era de uma
// revisão VENCIDA no momento. Usado pela meta de revisão para contar só reduções
// reais do backlog (monotônica, sem zerar quando novos cartões vencem no dia).
// Idempotente. Vercel pula a manutenção de schema no boot, então rode aqui.
//
//   node scripts/add-was-due-review-column.mjs                 # PROD
//   node scripts/add-was-due-review-column.mjs --db questoes-prf.sqlite  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const { db, client } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

try {
  const exists = columnExists('study_answers', 'was_due_review');
  if (exists) {
    console.log(`[${client}] was_due_review já existe.`);
  } else if (client === 'postgres') {
    db.prepare('ALTER TABLE study_answers ADD COLUMN IF NOT EXISTS was_due_review INTEGER DEFAULT 0').run();
    console.log('[postgres] was_due_review adicionada.');
  } else {
    db.prepare('ALTER TABLE study_answers ADD COLUMN was_due_review INTEGER DEFAULT 0').run();
    console.log('[sqlite] was_due_review adicionada.');
  }
} finally {
  db.close();
}

function columnExists(table, column) {
  if (client === 'postgres') {
    return Boolean(db.prepare(
      "SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?"
    ).get(table, column));
  }
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) { parsed[key] = true; continue; }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
