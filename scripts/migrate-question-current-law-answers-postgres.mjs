#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_PATH = path.join(ROOT_DIR, 'migrations', '20260602_question_current_law_answers.postgres.sql');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = normalizeDatabaseUrl(args['database-url'] || args.db || process.env.DATABASE_URL);
  const dryRun = Boolean(args['dry-run']);
  if (!databaseUrl && !dryRun) {
    console.error('Defina DATABASE_URL ou passe --database-url para aplicar a migration no Postgres.');
    process.exit(1);
  }
  await migrateQuestionCurrentLawAnswersPostgres({ databaseUrl, dryRun });
}

export async function migrateQuestionCurrentLawAnswersPostgres({ databaseUrl, dryRun = false }) {
  databaseUrl = normalizeDatabaseUrl(databaseUrl);
  const sqlText = await fsp.readFile(MIGRATION_PATH, 'utf8');
  if (dryRun) {
    console.log(sqlText);
    console.log('Dry-run: migration nao aplicada.');
    return;
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  try {
    for (const statement of splitSqlStatements(sqlText)) {
      if (statement.trim()) await sql.unsafe(statement);
    }
    const rows = await sql`
      SELECT COUNT(*)::int AS n
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'question_current_law_answers'
    `;
    console.log(rows[0]?.n ? 'Migration aplicada: question_current_law_answers pronta.' : 'Migration executada, mas a tabela nao foi encontrada.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function normalizeDatabaseUrl(value) {
  let url = String(value || '').trim();
  url = url.replace(/^\$env:DATABASE_URL\s*=\s*/i, '');
  url = url.replace(/^DATABASE_URL\s*=\s*/i, '');
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  }
  return url.trim();
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let quote = '';
  let dollarTag = '';

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const rest = sqlText.slice(index);

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = '';
      } else {
        current += char;
      }
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote && sqlText[index - 1] !== '\\') quote = '';
      continue;
    }

    const dollar = rest.match(/^\$[A-Za-z0-9_]*\$/);
    if (dollar) {
      dollarTag = dollar[0];
      current += dollarTag;
      index += dollarTag.length - 1;
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
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
