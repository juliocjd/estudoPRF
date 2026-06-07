import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const outMd = path.resolve(ROOT_DIR, args.md || 'data/diagnostico_question_applied_theory_v5.md');
const outJson = path.resolve(ROOT_DIR, args.json || 'data/diagnostico_question_applied_theory_v5.json');
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const byStatus = db.prepare(`
    SELECT card_status, source_mode, COUNT(*) AS n
    FROM question_applied_theory_cards
    GROUP BY card_status, source_mode
    ORDER BY card_status, source_mode
  `).all();
  const trafficTotal = db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions
    WHERE materia = 'Legislação de Trânsito e Transportes'
  `).get()?.n || 0;
  const trafficPublished = db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions q
    JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE q.materia = 'Legislação de Trânsito e Transportes'
      AND c.card_status IN ('published', 'no_valid_alternative')
  `).get()?.n || 0;
  const requiredCases = db.prepare(`
    SELECT q.id_question, q.desatualizada, c.card_status, c.source_mode, c.current_answer,
      c.no_valid_alternative, c.title
    FROM questions q
    LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE q.id_question IN (28259, 28260, 2002422, 1028008, 28104)
    ORDER BY q.id_question
  `).all();
  const jobs = db.prepare(`
    SELECT status, COUNT(*) AS n
    FROM question_applied_theory_generation_jobs
    GROUP BY status
    ORDER BY status
  `).all();
  const unsafeOutdated = db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions q
    JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE COALESCE(q.desatualizada, 0) = 1
      AND c.card_status = 'published'
      AND c.source_mode NOT IN ('current_law_verified', 'current_law_no_valid_alternative')
  `).get()?.n || 0;
  const report = {
    generatedAt: new Date().toISOString(),
    dbClient: client,
    trafficTotal,
    trafficPublished,
    byStatus,
    jobs,
    requiredCases,
    unsafeOutdated
  };
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(outMd, renderMarkdown(report), 'utf8');
  console.log('# Diagnostico de Teoria aplicada v5');
  console.log(`Banco: ${client}`);
  console.log(`Transito com card publicado/sem alternativa: ${trafficPublished}/${trafficTotal}`);
  console.log(`Desatualizadas publicadas inseguras: ${unsafeOutdated}`);
  console.log(`MD: ${path.relative(ROOT_DIR, outMd)}`);
  console.log(`JSON: ${path.relative(ROOT_DIR, outJson)}`);
} finally {
  db.close();
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Diagnóstico de Teoria aplicada à questão v5');
  lines.push('');
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`Banco: ${report.dbClient}`);
  lines.push(`Cobertura trânsito: ${report.trafficPublished}/${report.trafficTotal}`);
  lines.push(`Desatualizadas publicadas inseguras: ${report.unsafeOutdated}`);
  lines.push('');
  lines.push('## Status');
  for (const row of report.byStatus) {
    lines.push(`- ${row.card_status} / ${row.source_mode}: ${row.n}`);
  }
  lines.push('');
  lines.push('## Jobs');
  for (const row of report.jobs) {
    lines.push(`- ${row.status}: ${row.n}`);
  }
  lines.push('');
  lines.push('## Casos obrigatórios');
  for (const row of report.requiredCases) {
    lines.push(`- ${row.id_question}: ${row.card_status || 'missing'} / ${row.source_mode || '-'} / atual ${row.current_answer || '-'} / ${row.title || '-'}`);
  }
  return `${lines.join('\n')}\n`;
}
