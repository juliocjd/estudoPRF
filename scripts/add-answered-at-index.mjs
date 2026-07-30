// Índice study_answers(question_id, answered_at). answered_at é filtrado por
// vários caminhos quentes (cooldown de resposta, contagem de novas/revisões do
// dia, computeDueReviewGoal, getTodaySummary) e não tinha índice — cada um fazia
// scan. Idempotente (IF NOT EXISTS). Vercel pula manutenção de schema no boot.
//
//   node scripts/add-answered-at-index.mjs                 # PROD
//   node scripts/add-answered-at-index.mjs --db questoes-prf.sqlite  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const { db, client } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_study_answers_answered ON study_answers(question_id, answered_at)').run();
  console.log(`[${client}] idx_study_answers_answered garantido.`);
} finally {
  db.close();
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
