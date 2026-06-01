import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BATCH_SIZE = 250;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const exportDir = path.resolve(ROOT_DIR, args.dir || 'postgres-export');
  const databaseUrl = args['database-url'] || process.env.DATABASE_URL;
  const batchSize = Math.max(25, Number(args['batch-size'] || DEFAULT_BATCH_SIZE));
  if (!databaseUrl) {
    console.error('Defina DATABASE_URL ou passe --database-url para importar no Postgres.');
    process.exit(1);
  }
  await importPostgresExport({
    exportDir,
    databaseUrl,
    batchSize,
    reset: Boolean(args.reset),
    schemaOnly: Boolean(args['schema-only']),
    dataOnly: Boolean(args['data-only']),
    skipIndexes: Boolean(args['skip-indexes'])
  });
}

export async function importPostgresExport({
  exportDir,
  databaseUrl,
  batchSize = DEFAULT_BATCH_SIZE,
  reset = false,
  schemaOnly = false,
  dataOnly = false,
  skipIndexes = false
}) {
  const manifestPath = path.join(exportDir, 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30
  });

  try {
    if (reset) {
      await dropTables(sql, manifest.tables.map((table) => table.name));
    }

    if (!dataOnly) {
      await executeSqlFile(sql, path.join(exportDir, 'schema.sql'));
    }

    if (!schemaOnly) {
      for (const table of manifest.tables) {
        const imported = await importTable(sql, exportDir, table, batchSize);
        console.log(`${table.name}: ${imported} linhas importadas`);
      }
      await syncIdentitySequences(sql, manifest.tables);
      if (!skipIndexes) {
        await executeSqlFile(sql, path.join(exportDir, 'indexes.sql'));
      }
      await validateCounts(sql, manifest.tables);
    }

    console.log('Importacao no Postgres concluida.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function dropTables(sql, tableNames) {
  const reversed = [...tableNames].reverse();
  for (const tableName of reversed) {
    await sql.unsafe(`DROP TABLE IF EXISTS ${quotePgIdentifier(tableName)} CASCADE`);
  }
}

async function executeSqlFile(sql, filePath) {
  const contents = await fsp.readFile(filePath, 'utf8');
  const statements = splitSqlStatements(stripLineComments(contents));
  for (const statement of statements) {
    if (statement.trim()) await sql.unsafe(statement);
  }
}

async function importTable(sql, exportDir, table, batchSize) {
  const filePath = path.join(exportDir, table.file);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let batch = [];
  let imported = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(decodeRow(JSON.parse(line), table));
    if (batch.length >= batchSize) {
      await insertBatch(sql, table.name, table.columns, batch);
      imported += batch.length;
      batch = [];
    }
  }

  if (batch.length) {
    await insertBatch(sql, table.name, table.columns, batch);
    imported += batch.length;
  }

  return imported;
}

async function insertBatch(sql, tableName, columns, rows) {
  if (!rows.length) return;
  const values = [];
  const groups = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  const query = `
    INSERT INTO ${quotePgIdentifier(tableName)}
      (${columns.map(quotePgIdentifier).join(', ')})
    VALUES ${groups.join(', ')}
  `;
  await sql.unsafe(query, values);
}

function decodeRow(row, table) {
  const decoded = {};
  for (const column of table.columns) {
    const value = row[column];
    if (value && typeof value === 'object' && typeof value.__pgByteaBase64 === 'string') {
      decoded[column] = Buffer.from(value.__pgByteaBase64, 'base64');
    } else if (table.columnTypes?.[column] === 'timestamptz' && value === '') {
      decoded[column] = null;
    } else {
      decoded[column] = value;
    }
  }
  return decoded;
}

async function syncIdentitySequences(sql, tables) {
  for (const table of tables) {
    if (!table.identityColumn) continue;
    await sql.unsafe(`
      SELECT setval(
        pg_get_serial_sequence($1, $2),
        COALESCE((SELECT MAX(${quotePgIdentifier(table.identityColumn)}) FROM ${quotePgIdentifier(table.name)}), 1),
        true
      )
    `, [table.name, table.identityColumn]);
  }
}

async function validateCounts(sql, tables) {
  const mismatches = [];
  for (const table of tables) {
    const result = await sql.unsafe(`SELECT COUNT(*)::integer AS n FROM ${quotePgIdentifier(table.name)}`);
    const actual = Number(result[0]?.n || 0);
    if (actual !== Number(table.count)) {
      mismatches.push({ table: table.name, expected: table.count, actual });
    }
  }
  if (mismatches.length) {
    throw new Error(`Importacao com contagens divergentes: ${JSON.stringify(mismatches, null, 2)}`);
  }
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let quote = '';
  let previous = '';
  for (const char of sqlText) {
    current += char;
    if (quote) {
      if (char === quote && previous !== '\\') quote = '';
    } else if (char === '\'' || char === '"') {
      quote = char;
    } else if (char === ';') {
      statements.push(current.slice(0, -1).trim());
      current = '';
    }
    previous = char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function stripLineComments(sqlText) {
  return sqlText
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function quotePgIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}
