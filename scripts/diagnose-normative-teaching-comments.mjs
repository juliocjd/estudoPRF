import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { normalizeAnswerForQuestionType } from '../src/normative-teaching-utils.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = args.db || args['database-url'] || process.env.DATABASE_URL;
  const sqlitePath = args.sqlite ? path.resolve(ROOT_DIR, args.sqlite) : '';
  const outMd = args.md ? path.resolve(ROOT_DIR, args.md) : '';
  const outJson = args.json ? path.resolve(ROOT_DIR, args.json) : '';

  const report = databaseUrl
    ? await diagnosePostgres(databaseUrl)
    : await diagnoseSqlite(sqlitePath || path.resolve(ROOT_DIR, 'questoes-prf.sqlite'));

  const md = renderMarkdown(report);
  console.log(md);
  if (outMd) await fsp.writeFile(outMd, md, 'utf8');
  if (outJson) await fsp.writeFile(outJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function diagnosePostgres(databaseUrl) {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  try {
    const tables = {
      questions: await tableExists(sql, 'questions'),
      alternatives: await tableExists(sql, 'alternatives'),
      comments: await tableExists(sql, 'comments'),
      normativeUpdates: await tableExists(sql, 'question_normative_updates'),
      teachingComments: await tableExists(sql, 'question_normative_teaching_comments')
    };
    const commentsQuestionIdPrimaryKey = tables.comments
      ? await isPrimaryKey(sql, 'comments', 'question_id')
      : false;

    const counts = {
      questions: tables.questions ? await scalar(sql, 'SELECT COUNT(*)::int AS n FROM questions') : 0,
      commentsTec: tables.comments ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') != 'ai'
      `) : 0,
      commentsAiLocal: tables.comments ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') = 'ai'
      `) : 0,
      normativeUpdates: tables.normativeUpdates ? await scalar(sql, 'SELECT COUNT(*)::int AS n FROM question_normative_updates') : 0,
      teachingComments: tables.teachingComments ? await scalar(sql, 'SELECT COUNT(*)::int AS n FROM question_normative_teaching_comments') : 0,
      teachingManualReview: tables.teachingComments ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM question_normative_teaching_comments
        WHERE answer_policy = 'manual_review'
          OR study_recommendation = 'manual_review'
      `) : 0,
      teachingDiscard: tables.teachingComments ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM question_normative_teaching_comments
        WHERE answer_policy = 'discard'
          OR study_recommendation = 'discard'
      `) : 0,
      teachingChangedAnswer: tables.teachingComments ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM question_normative_teaching_comments
        WHERE answer_changed = true
      `) : 0
    };
    counts.normativeWithoutTeaching = tables.normativeUpdates && tables.teachingComments
      ? await scalar(sql, `
        SELECT COUNT(*)::int AS n
        FROM question_normative_updates qnu
        LEFT JOIN question_normative_teaching_comments qntc
          ON qntc.question_id = qnu.question_id
        WHERE qntc.id IS NULL
      `)
      : counts.normativeUpdates;

    const validation = tables.teachingComments
      ? await validateTeachingAnswersPostgres(sql)
      : emptyValidation();

    return {
      generatedAt: new Date().toISOString(),
      database: 'postgres',
      tables,
      commentsQuestionIdPrimaryKey,
      counts: { ...counts, ...validation }
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function diagnoseSqlite(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const tables = {
      questions: sqliteTableExists(db, 'questions'),
      alternatives: sqliteTableExists(db, 'alternatives'),
      comments: sqliteTableExists(db, 'comments'),
      normativeUpdates: sqliteTableExists(db, 'question_normative_updates'),
      teachingComments: sqliteTableExists(db, 'question_normative_teaching_comments')
    };
    const counts = {
      questions: tables.questions ? db.prepare('SELECT COUNT(*) AS n FROM questions').get().n : 0,
      commentsTec: tables.comments ? db.prepare(`
        SELECT COUNT(*) AS n
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') != 'ai'
      `).get().n : 0,
      commentsAiLocal: tables.comments ? db.prepare(`
        SELECT COUNT(*) AS n
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') = 'ai'
      `).get().n : 0,
      normativeUpdates: tables.normativeUpdates ? db.prepare('SELECT COUNT(*) AS n FROM question_normative_updates').get().n : 0,
      teachingComments: tables.teachingComments ? db.prepare('SELECT COUNT(*) AS n FROM question_normative_teaching_comments').get().n : 0
    };
    counts.normativeWithoutTeaching = Math.max(0, counts.normativeUpdates - counts.teachingComments);
    return {
      generatedAt: new Date().toISOString(),
      database: 'sqlite',
      sqlitePath,
      tables,
      commentsQuestionIdPrimaryKey: tables.comments ? sqliteColumnPrimaryKey(db, 'comments', 'question_id') : false,
      counts: { ...counts, ...emptyValidation() }
    };
  } finally {
    db.close();
  }
}

async function validateTeachingAnswersPostgres(sql) {
  const rows = await sql.unsafe(`
    SELECT
      qntc.question_id,
      q.type_question,
      qntc.current_answer,
      COALESCE(
        json_agg(
          json_build_object('letter', a.letter, 'text', a.text)
          ORDER BY a.position
        ) FILTER (WHERE a.letter IS NOT NULL),
        '[]'::json
      ) AS alternatives
    FROM question_normative_teaching_comments qntc
    JOIN questions q ON q.id_question = qntc.question_id
    LEFT JOIN alternatives a ON a.question_id = q.id_question
    GROUP BY qntc.question_id, q.type_question, qntc.current_answer
  `);

  const result = emptyValidation();
  for (const row of rows) {
    const validation = normalizeAnswerForQuestionType(row.current_answer, row.type_question, row.alternatives || []);
    if (validation.answer) result.teachingValidCurrentAnswer += 1;
    if (row.current_answer && !validation.valid) result.teachingInvalidCurrentAnswer += 1;
    const type = String(row.type_question || '').toUpperCase();
    if (type.includes('CERTO_ERRADO') && /^[A-E]$/.test(String(row.current_answer || ''))) {
      result.trueFalseWithLetterAnswer += 1;
    }
    if (!type.includes('CERTO_ERRADO') && ['CERTO', 'ERRADO'].includes(String(row.current_answer || '').toUpperCase())) {
      result.multipleChoiceWithTrueFalseAnswer += 1;
    }
  }
  return result;
}

function emptyValidation() {
  return {
    teachingValidCurrentAnswer: 0,
    teachingInvalidCurrentAnswer: 0,
    trueFalseWithLetterAnswer: 0,
    multipleChoiceWithTrueFalseAnswer: 0
  };
}

async function tableExists(sql, tableName) {
  const rows = await sql`
    SELECT 1 AS exists
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

async function isPrimaryKey(sql, tableName, columnName) {
  const rows = await sql`
    SELECT 1 AS exists
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = ${tableName}
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = ${columnName}
    LIMIT 1
  `;
  return Boolean(rows[0]);
}

async function scalar(sql, sqlText) {
  const rows = await sql.unsafe(sqlText);
  return Number(rows[0]?.n || 0);
}

function sqliteTableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function sqliteColumnPrimaryKey(db, tableName, columnName) {
  return Boolean(db.prepare(`PRAGMA table_info(${quoteSqliteIdentifier(tableName)})`).all()
    .find((column) => column.name === columnName && Number(column.pk) > 0));
}

function renderMarkdown(report) {
  const rows = [
    ['Banco', report.database],
    ['questions', report.tables.questions ? 'sim' : 'nao'],
    ['comments', report.tables.comments ? 'sim' : 'nao'],
    ['comments.question_id PK', report.commentsQuestionIdPrimaryKey ? 'sim' : 'nao'],
    ['question_normative_updates', report.tables.normativeUpdates ? 'sim' : 'nao'],
    ['question_normative_teaching_comments', report.tables.teachingComments ? 'sim' : 'nao'],
    ['Questoes', report.counts.questions],
    ['Comentarios Tec/professor', report.counts.commentsTec],
    ['Comentarios IA locais', report.counts.commentsAiLocal],
    ['Analises normativas', report.counts.normativeUpdates],
    ['Comentarios normativos atualizados', report.counts.teachingComments],
    ['Normativas sem comentario atualizado', report.counts.normativeWithoutTeaching],
    ['Resposta atual valida', report.counts.teachingValidCurrentAnswer],
    ['Resposta atual invalida', report.counts.teachingInvalidCurrentAnswer],
    ['Revisao manual', report.counts.teachingManualReview || 0],
    ['Descartar', report.counts.teachingDiscard || 0],
    ['Gabarito historico diferente do atual', report.counts.teachingChangedAnswer || 0],
    ['CERTO_ERRADO com A/B/C/D/E', report.counts.trueFalseWithLetterAnswer],
    ['Multipla escolha com CERTO/ERRADO', report.counts.multipleChoiceWithTrueFalseAnswer]
  ];

  return [
    '# Diagnostico de comentarios normativos didaticos',
    '',
    `Gerado em: ${report.generatedAt}`,
    '',
    '| Item | Valor |',
    '|---|---:|',
    ...rows.map(([label, value]) => `| ${label} | ${value} |`),
    ''
  ].join('\n');
}

function quoteSqliteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
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
