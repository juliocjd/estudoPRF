import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs,
  upsertAppliedTheoryJob
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const filePath = path.resolve(
  ROOT_DIR,
  args.file || 'data/question_applied_theory_v5/question_applied_theory_generation_jobs_desatualizadas_priority_v5.jsonl'
);
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let imported = 0;
  for (const line of lines) {
    const item = JSON.parse(line);
    upsertAppliedTheoryJob(db, {
      ...item,
      priority: item.priority || (item.desatualizada ? 10 : 100),
      generation_policy: item.generation_policy || (item.desatualizada ? 'question_applied_theory_v5_outdated_priority' : 'question_applied_theory_v5_traffic')
    });
    imported += 1;
  }
  console.log('# Importacao de jobs de Teoria aplicada v5');
  console.log(`Banco: ${client}`);
  console.log(`Arquivo: ${path.relative(ROOT_DIR, filePath)}`);
  console.log(`Jobs importados/atualizados: ${imported}`);
} finally {
  db.close();
}
