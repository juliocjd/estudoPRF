import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs,
  upsertAppliedTheoryCard
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const filePath = path.resolve(
  ROOT_DIR,
  args.file || args.seed || 'data/question_applied_theory_v5/question_applied_theory_cards_golden_seed_v5.json'
);
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
  let imported = 0;
  for (const item of items) {
    upsertAppliedTheoryCard(db, item);
    imported += 1;
  }
  console.log('# Importacao de Teoria aplicada a questao v5');
  console.log(`Banco: ${client}`);
  console.log(`Arquivo: ${path.relative(ROOT_DIR, filePath)}`);
  console.log(`Cards importados/atualizados: ${imported}`);
} finally {
  db.close();
}
