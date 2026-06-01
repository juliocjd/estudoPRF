import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const db = new DatabaseSync(dbPath);

try {
  const diagnostics = diagnose(db, dbPath);
  printConsole(diagnostics);

  if (args.json) {
    await fs.writeFile(path.resolve(args.json), `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
    console.log(`JSON gravado: ${path.resolve(args.json)}`);
  }

  if (args.md) {
    await fs.writeFile(path.resolve(args.md), buildMarkdown(diagnostics), 'utf8');
    console.log(`Markdown gravado: ${path.resolve(args.md)}`);
  }
} finally {
  db.close();
}

function diagnose(database, databasePath) {
  const questionTotal = scalar(database, 'SELECT COUNT(*) FROM questions');
  const answeredQuestions = hasTable(database, 'study_answers')
    ? scalar(database, 'SELECT COUNT(DISTINCT question_id) FROM study_answers')
    : 0;

  const diagnostics = {
    dbPath: databasePath,
    generatedAt: new Date().toISOString(),
    totals: {
      questions: questionTotal,
      realComments: scalar(database, `
        SELECT COUNT(*)
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') != 'ai'
      `),
      aiComments: hasColumn(database, 'comments', 'source_type') ? scalar(database, `
        SELECT COUNT(*)
        FROM comments
        WHERE COALESCE(html_local, html, text, '') != ''
          AND COALESCE(source_type, '') = 'ai'
      `) : 0,
      markedCommentMissing: scalar(database, `
        SELECT COUNT(*)
        FROM questions q
        LEFT JOIN comments c ON c.question_id = q.id_question
        WHERE COALESCE(q.possui_comentario, 0) = 1
          AND COALESCE(c.html_local, c.html, c.text, '') = ''
      `),
      officialAnswers: scalar(database, "SELECT COUNT(*) FROM questions WHERE COALESCE(official_answer, '') != ''"),
      notebookAnswers: scalar(database, "SELECT COUNT(DISTINCT question_id) FROM notebook_questions WHERE COALESCE(answer, '') != ''"),
      commentExtractedAnswers: scalar(database, "SELECT COUNT(*) FROM comments WHERE COALESCE(extracted_answer, '') != ''"),
      noKnownAnswer: scalar(database, `
        SELECT COUNT(*)
        FROM questions q
        LEFT JOIN comments c ON c.question_id = q.id_question
        WHERE COALESCE(q.official_answer, '') = ''
          AND COALESCE(c.extracted_answer, '') = ''
          AND NOT EXISTS (
            SELECT 1
            FROM notebook_questions nq
            WHERE nq.question_id = q.id_question
              AND COALESCE(nq.answer, '') != ''
          )
      `),
      canceled: scalar(database, 'SELECT COUNT(*) FROM questions WHERE COALESCE(anulada, 0) = 1'),
      outdated: scalar(database, 'SELECT COUNT(*) FROM questions WHERE COALESCE(desatualizada, 0) = 1'),
      answeredQuestions,
      answeredPercent: questionTotal ? round((answeredQuestions / questionTotal) * 100, 2) : 0
    },
    duplicates: getDuplicateStats(database),
    byMatter: all(database, `
      SELECT materia, COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
        SUM(CASE WHEN COALESCE(anulada, 0) = 1 THEN 1 ELSE 0 END) AS canceled
      FROM questions
      GROUP BY materia
      ORDER BY total DESC, materia
    `),
    bySubjectTop: all(database, `
      SELECT materia, assunto, COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
        SUM(CASE WHEN COALESCE(anulada, 0) = 1 THEN 1 ELSE 0 END) AS canceled
      FROM questions
      WHERE COALESCE(assunto, '') != ''
      GROUP BY materia, assunto
      ORDER BY total DESC, materia, assunto
      LIMIT 100
    `),
    weakCommentSubjects: all(database, `
      SELECT q.materia, q.assunto, COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END) AS comments,
        ROUND(100.0 * SUM(CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END) / COUNT(*), 2) AS comment_percent
      FROM questions q
      LEFT JOIN comments c ON c.question_id = q.id_question
      WHERE COALESCE(q.assunto, '') != ''
      GROUP BY q.materia, q.assunto
      HAVING total >= 20 AND comment_percent < 80
      ORDER BY total DESC, comment_percent ASC
      LIMIT 50
    `),
    outdatedSubjects: all(database, `
      SELECT materia, assunto, COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
        ROUND(100.0 * SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS outdated_percent
      FROM questions
      WHERE COALESCE(assunto, '') != ''
      GROUP BY materia, assunto
      HAVING total >= 10 AND outdated > 0
      ORDER BY outdated DESC, outdated_percent DESC
      LIMIT 50
    `),
    mastery: getMasteryDiagnostics(database)
  };

  return diagnostics;
}

function getDuplicateStats(database) {
  const content = scalar(database, `
    SELECT COALESCE(SUM(total - 1), 0)
    FROM (
      SELECT content_hash, COUNT(*) AS total
      FROM questions
      WHERE COALESCE(content_hash, '') != ''
      GROUP BY content_hash
      HAVING total > 1
    )
  `);
  const statement = scalar(database, `
    SELECT COALESCE(SUM(total - 1), 0)
    FROM (
      SELECT statement_hash, COUNT(*) AS total
      FROM questions
      WHERE COALESCE(statement_hash, '') != ''
      GROUP BY statement_hash
      HAVING total > 1
    )
  `);
  const groups = all(database, `
    SELECT
      CASE
        WHEN COALESCE(content_hash, '') != '' THEN 'content:' || content_hash
        ELSE 'statement:' || statement_hash
      END AS duplicate_key,
      COUNT(*) AS total,
      MIN(id_question) AS representative_id
    FROM questions
    WHERE COALESCE(NULLIF(content_hash, ''), NULLIF(statement_hash, ''), '') != ''
    GROUP BY duplicate_key
    HAVING total > 1
    ORDER BY total DESC
    LIMIT 50
  `);

  return {
    extraByContentHash: content,
    extraByStatementHash: statement,
    topGroups: groups
  };
}

function getMasteryDiagnostics(database) {
  if (!hasTable(database, 'question_mastery')) {
    return {
      available: false
    };
  }

  return {
    available: true,
    questionMasteryRows: scalar(database, 'SELECT COUNT(*) FROM question_mastery'),
    averageMastery: round(scalar(database, 'SELECT COALESCE(AVG(mastery_score), 0) FROM question_mastery'), 4),
    dueReviews: scalar(database, "SELECT COUNT(*) FROM question_mastery WHERE COALESCE(next_due_at, '') != '' AND next_due_at <= datetime('now')"),
    repairCandidates: scalar(database, 'SELECT COUNT(*) FROM question_mastery WHERE COALESCE(wrong_streak, 0) > 0 OR COALESCE(mastery_score, 0) < 0.35')
  };
}

function printConsole(diagnostics) {
  console.log(`Banco: ${diagnostics.dbPath}`);
  console.log(`Gerado em: ${diagnostics.generatedAt}`);
  console.log('');
  console.log('Totais');
  for (const [key, value] of Object.entries(diagnostics.totals)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('');
  console.log(`Duplicadas extras por content_hash: ${diagnostics.duplicates.extraByContentHash}`);
  console.log(`Duplicadas extras por statement_hash: ${diagnostics.duplicates.extraByStatementHash}`);
  console.log('');
  console.log('Top materias');
  for (const row of diagnostics.byMatter.slice(0, 12)) {
    console.log(`  ${row.total} - ${row.materia || '<sem materia>'}`);
  }
  console.log('');
  console.log(`Dominio disponivel: ${diagnostics.mastery.available ? 'sim' : 'nao'}`);
  if (diagnostics.mastery.available) {
    console.log(`  linhas: ${diagnostics.mastery.questionMasteryRows}`);
    console.log(`  dominio medio: ${diagnostics.mastery.averageMastery}`);
    console.log(`  revisoes vencidas: ${diagnostics.mastery.dueReviews}`);
    console.log(`  reparo: ${diagnostics.mastery.repairCandidates}`);
  }
}

function buildMarkdown(diagnostics) {
  const lines = [
    '# Diagnostico da Base PRF',
    '',
    `- Banco: \`${diagnostics.dbPath}\``,
    `- Gerado em: \`${diagnostics.generatedAt}\``,
    '',
    '## Totais',
    '',
    '| Metrica | Valor |',
    '|---|---:|',
    ...Object.entries(diagnostics.totals).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Duplicadas',
    '',
    `- Extras por content_hash: ${diagnostics.duplicates.extraByContentHash}`,
    `- Extras por statement_hash: ${diagnostics.duplicates.extraByStatementHash}`,
    '',
    '## Materias',
    '',
    '| Materia | Questoes | Desatualizadas | Anuladas |',
    '|---|---:|---:|---:|',
    ...diagnostics.byMatter.map((row) => `| ${escapeMd(row.materia || '')} | ${row.total} | ${row.outdated || 0} | ${row.canceled || 0} |`),
    '',
    '## Top Assuntos',
    '',
    '| Materia | Assunto | Questoes | Desatualizadas | Anuladas |',
    '|---|---|---:|---:|---:|',
    ...diagnostics.bySubjectTop.map((row) => `| ${escapeMd(row.materia || '')} | ${escapeMd(row.assunto || '')} | ${row.total} | ${row.outdated || 0} | ${row.canceled || 0} |`),
    '',
    '## Assuntos Com Poucos Comentarios',
    '',
    '| Materia | Assunto | Questoes | Comentarios | % comentarios |',
    '|---|---|---:|---:|---:|',
    ...diagnostics.weakCommentSubjects.map((row) => `| ${escapeMd(row.materia || '')} | ${escapeMd(row.assunto || '')} | ${row.total} | ${row.comments || 0} | ${row.comment_percent || 0} |`),
    '',
    '## Assuntos Desatualizados',
    '',
    '| Materia | Assunto | Questoes | Desatualizadas | % desatualizadas |',
    '|---|---|---:|---:|---:|',
    ...diagnostics.outdatedSubjects.map((row) => `| ${escapeMd(row.materia || '')} | ${escapeMd(row.assunto || '')} | ${row.total} | ${row.outdated || 0} | ${row.outdated_percent || 0} |`),
    '',
    '## Dominio',
    '',
    diagnostics.mastery.available
      ? [
          `- Questoes com dominio: ${diagnostics.mastery.questionMasteryRows}`,
          `- Dominio medio: ${diagnostics.mastery.averageMastery}`,
          `- Revisoes vencidas: ${diagnostics.mastery.dueReviews}`,
          `- Candidatas a reparo: ${diagnostics.mastery.repairCandidates}`
        ].join('\n')
      : '- Tabelas de dominio ainda nao existem.'
  ];

  return `${lines.join('\n')}\n`;
}

function scalar(database, sql, ...values) {
  const row = database.prepare(sql).get(...values);
  if (!row) {
    return 0;
  }
  return Object.values(row)[0] ?? 0;
}

function all(database, sql, ...values) {
  return database.prepare(sql).all(...values);
}

function hasTable(database, tableName) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(tableName));
}

function hasColumn(database, tableName, columnName) {
  if (!hasTable(database, tableName)) {
    return false;
  }
  return database.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function escapeMd(value) {
  return String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
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
