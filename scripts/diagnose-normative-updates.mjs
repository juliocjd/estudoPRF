import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const mdPath = args.md ? path.resolve(ROOT_DIR, args.md) : '';
const jsonPath = args.json ? path.resolve(ROOT_DIR, args.json) : '';

if (!fs.existsSync(dbPath)) {
  throw new Error(`Banco nao encontrado: ${dbPath}`);
}

const db = new DatabaseSync(dbPath);
try {
  const report = diagnose(db);
  printSummary(report);
  if (jsonPath) {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Relatorio JSON: ${jsonPath}`);
  }
  if (mdPath) {
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, toMarkdown(report), 'utf8');
    console.log(`Relatorio MD: ${mdPath}`);
  }
} finally {
  db.close();
}

function diagnose(database) {
  const hasTable = tableExists(database, 'question_normative_updates');
  const report = {
    hasTable,
    totalOutdatedInBank: database.prepare('SELECT COUNT(*) AS n FROM questions WHERE COALESCE(desatualizada, 0) = 1').get().n,
    totalImported: 0,
    outdatedWithoutNormativeUpdate: [],
    normativeUpdatesWithoutQuestion: [],
    byRecommendation: [],
    bySecurity: [],
    byChangedAnswer: [],
    topDiscardSubjects: [],
    topManualReviewSubjects: [],
    changedAnswerQuestions: []
  };

  if (!hasTable) {
    return report;
  }

  report.totalImported = database.prepare('SELECT COUNT(*) AS n FROM question_normative_updates').get().n;
  report.outdatedWithoutNormativeUpdate = database.prepare(`
    SELECT q.id_question, q.materia, q.assunto, q.banca, q.concurso_ano
    FROM questions q
    LEFT JOIN question_normative_updates qnu ON qnu.question_id = q.id_question
    WHERE COALESCE(q.desatualizada, 0) = 1
      AND qnu.question_id IS NULL
    ORDER BY q.materia, q.assunto, q.id_question
  `).all();
  report.normativeUpdatesWithoutQuestion = database.prepare(`
    SELECT qnu.question_id, qnu.recomendacao, qnu.nivel_seguranca
    FROM question_normative_updates qnu
    LEFT JOIN questions q ON q.id_question = qnu.question_id
    WHERE q.id_question IS NULL
    ORDER BY qnu.question_id
  `).all();
  report.byRecommendation = grouped(database, 'recomendacao');
  report.bySecurity = grouped(database, 'nivel_seguranca');
  report.byChangedAnswer = grouped(database, 'mudanca_gabarito');
  report.topDiscardSubjects = subjectCounts(database, "LOWER(COALESCE(qnu.recomendacao, '')) LIKE '%descartar%'");
  report.topManualReviewSubjects = subjectCounts(database, "LOWER(COALESCE(qnu.recomendacao, '')) LIKE '%revisão manual%' OR LOWER(COALESCE(qnu.nivel_seguranca, '')) = 'baixo'");
  report.changedAnswerQuestions = database.prepare(`
    SELECT
      q.id_question,
      q.materia,
      q.assunto,
      q.banca,
      q.concurso_ano,
      qnu.gabarito_banco,
      qnu.gabarito_atualizado_provavel,
      qnu.mudanca_gabarito,
      qnu.recomendacao,
      qnu.nivel_seguranca
    FROM question_normative_updates qnu
    JOIN questions q ON q.id_question = qnu.question_id
    WHERE LOWER(COALESCE(qnu.mudanca_gabarito, '')) LIKE 'sim%'
    ORDER BY q.materia, q.assunto, q.id_question
  `).all();

  return report;
}

function grouped(database, column) {
  return database.prepare(`
    SELECT COALESCE(NULLIF(${column}, ''), 'sem valor') AS value, COUNT(*) AS total
    FROM question_normative_updates
    GROUP BY COALESCE(NULLIF(${column}, ''), 'sem valor')
    ORDER BY total DESC, value
  `).all();
}

function subjectCounts(database, condition) {
  return database.prepare(`
    SELECT q.materia, q.assunto, COUNT(*) AS total
    FROM question_normative_updates qnu
    JOIN questions q ON q.id_question = qnu.question_id
    WHERE ${condition}
    GROUP BY q.materia, q.assunto
    ORDER BY total DESC, q.materia, q.assunto
    LIMIT 40
  `).all();
}

function printSummary(report) {
  console.log('Diagnostico normativo');
  console.log(`Tabela existente: ${report.hasTable ? 'sim' : 'nao'}`);
  console.log(`Questoes desatualizadas no banco: ${report.totalOutdatedInBank}`);
  console.log(`Analises normativas importadas: ${report.totalImported}`);
  console.log(`Desatualizadas sem analise: ${report.outdatedWithoutNormativeUpdate.length}`);
  console.log(`Analises sem questao no banco: ${report.normativeUpdatesWithoutQuestion.length}`);
  console.log(`Questoes com provavel mudanca de gabarito: ${report.changedAnswerQuestions.length}`);
}

function toMarkdown(report) {
  return [
    '# Diagnostico normativo',
    '',
    `- Tabela existente: ${report.hasTable ? 'sim' : 'nao'}`,
    `- Questoes desatualizadas no banco: ${report.totalOutdatedInBank}`,
    `- Analises normativas importadas: ${report.totalImported}`,
    `- Desatualizadas sem analise: ${report.outdatedWithoutNormativeUpdate.length}`,
    `- Analises sem questao no banco: ${report.normativeUpdatesWithoutQuestion.length}`,
    `- Questoes com provavel mudanca de gabarito: ${report.changedAnswerQuestions.length}`,
    '',
    '## Por recomendacao',
    table(report.byRecommendation, ['value', 'total']),
    '',
    '## Por nivel de seguranca',
    table(report.bySecurity, ['value', 'total']),
    '',
    '## Por mudanca de gabarito',
    table(report.byChangedAnswer, ['value', 'total']),
    '',
    '## Assuntos com mais descarte',
    table(report.topDiscardSubjects, ['materia', 'assunto', 'total']),
    '',
    '## Assuntos com mais revisao manual',
    table(report.topManualReviewSubjects, ['materia', 'assunto', 'total']),
    '',
    '## Questoes com provavel mudanca de gabarito',
    table(report.changedAnswerQuestions.slice(0, 200), [
      'id_question',
      'materia',
      'assunto',
      'gabarito_banco',
      'gabarito_atualizado_provavel',
      'recomendacao',
      'nivel_seguranca'
    ]),
    ''
  ].join('\n');
}

function table(rows, columns) {
  if (!rows.length) return '_Nenhum registro._';
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => mdCell(row[column])).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function mdCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function tableExists(database, tableName) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
