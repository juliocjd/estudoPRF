import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MIGRATION = path.join(ROOT_DIR, 'data', 'migration_comentarios_normativos_professor_v3_postgres.sql');
const FALLBACK_MIGRATION = path.join(ROOT_DIR, 'migrations', '20260601_question_normative_teaching_comments_professor_v3.postgres.sql');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = normalizeDatabaseUrl(args['database-url'] || args.db || process.env.DATABASE_URL);
  const migrationPath = path.resolve(ROOT_DIR, args.sql || DEFAULT_MIGRATION);
  const dryRun = Boolean(args['dry-run']);

  if (!databaseUrl && !dryRun) {
    console.error('Defina DATABASE_URL ou passe --db para aplicar a migration v3 no Postgres.');
    process.exit(1);
  }

  await migrateNormativeTeachingCommentsV3({ databaseUrl, migrationPath, dryRun });
}

export async function migrateNormativeTeachingCommentsV3({ databaseUrl, migrationPath = DEFAULT_MIGRATION, dryRun = false }) {
  const resolvedMigrationPath = await fileExists(migrationPath) ? migrationPath : FALLBACK_MIGRATION;
  const sqlText = await fsp.readFile(resolvedMigrationPath, 'utf8');
  if (dryRun) {
    console.log(sqlText);
    console.log('Dry-run: migration v3 nao aplicada.');
    return;
  }

  const sql = postgres(normalizeDatabaseUrl(databaseUrl), {
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
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'question_normative_teaching_comments'
        AND column_name IN ('display_version', 'main_legal_basis', 'technical_details_json')
    `;
    console.log(Number(rows[0]?.n || 0) >= 3
      ? 'Migration v3 aplicada: question_normative_teaching_comments pronta.'
      : 'Migration v3 executada, mas faltam colunas esperadas.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
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
