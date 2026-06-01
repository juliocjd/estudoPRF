import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BATCH_SIZE = 500;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
  const outDir = path.resolve(ROOT_DIR, args.out || 'postgres-export');
  const batchSize = Math.max(50, Number(args['batch-size'] || DEFAULT_BATCH_SIZE));
  await exportSqliteForPostgres({ dbPath, outDir, batchSize });
}

export async function exportSqliteForPostgres({ dbPath, outDir, batchSize = DEFAULT_BATCH_SIZE }) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    await fsp.rm(outDir, { recursive: true, force: true });
    await fsp.mkdir(path.join(outDir, 'tables'), { recursive: true });

    const tables = getTables(db);
    const tableMeta = tables.map((table) => inspectTable(db, table));
    const schemaSql = buildSchemaSql(tableMeta);
    const indexesSql = buildIndexesSql(tableMeta);
    const manifest = {
      generatedAt: new Date().toISOString(),
      sourceDb: dbPath,
      format: 'jsonl',
      tableCount: tableMeta.length,
      tables: []
    };

    await fsp.writeFile(path.join(outDir, 'schema.sql'), schemaSql, 'utf8');
    await fsp.writeFile(path.join(outDir, 'indexes.sql'), indexesSql, 'utf8');

    for (const meta of tableMeta) {
      const fileName = `${safeFileName(meta.name)}.jsonl`;
      const filePath = path.join(outDir, 'tables', fileName);
      const exported = await exportTable(db, meta, filePath, batchSize);
      manifest.tables.push({
        name: meta.name,
        file: `tables/${fileName}`,
        count: exported.count,
        columns: meta.columns.map((column) => column.name),
        columnTypes: Object.fromEntries(meta.columns.map((column) => [column.name, postgresType(column.type, column.name)])),
        identityColumn: meta.identityColumn || null,
        primaryKey: meta.primaryKey
      });
      console.log(`${meta.name}: ${exported.count} linhas exportadas`);
    }

    await fsp.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Exportacao concluida em: ${outDir}`);
    console.log('O SQLite original foi aberto em modo somente leitura.');
  } finally {
    db.close();
  }
}

function getTables(db) {
  return db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
}

function inspectTable(db, tableName) {
  const quoted = quoteSqliteIdentifier(tableName);
  const createSql = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `).get(tableName)?.sql || '';
  const columns = db.prepare(`PRAGMA table_info(${quoted})`).all();
  const primaryKey = columns
    .filter((column) => Number(column.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((column) => column.name);
  const identityColumn = findIdentityColumn(createSql, columns, primaryKey);
  const indexes = inspectIndexes(db, tableName);
  return {
    name: tableName,
    createSql,
    columns,
    primaryKey,
    identityColumn,
    indexes
  };
}

function findIdentityColumn(createSql, columns, primaryKey) {
  if (primaryKey.length !== 1) return '';
  const column = columns.find((item) => item.name === primaryKey[0]);
  if (!column || !/INT/i.test(column.type || '')) return '';
  const escapedName = column.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const autoincrementPattern = new RegExp(`["'\`\\[]?${escapedName}["'\`\\]]?\\s+INTEGER\\s+PRIMARY\\s+KEY\\s+AUTOINCREMENT`, 'i');
  return autoincrementPattern.test(createSql) ? column.name : '';
}

function inspectIndexes(db, tableName) {
  const quoted = quoteSqliteIdentifier(tableName);
  return db.prepare(`PRAGMA index_list(${quoted})`).all()
    .filter((index) => index.origin !== 'pk')
    .map((index) => {
      const info = db.prepare(`PRAGMA index_info(${quoteSqliteIdentifier(index.name)})`).all();
      return {
        name: index.name,
        unique: Number(index.unique) === 1,
        origin: index.origin,
        columns: info.map((column) => column.name).filter(Boolean)
      };
    })
    .filter((index) => index.columns.length > 0);
}

function buildSchemaSql(tables) {
  const lines = [
    '-- Gerado por scripts/export-sqlite-postgres.mjs',
    '-- Cria tabelas equivalentes ao SQLite local para importacao no Postgres.',
    'BEGIN;'
  ];

  for (const table of tables) {
    lines.push('');
    lines.push(`CREATE TABLE IF NOT EXISTS ${quotePgIdentifier(table.name)} (`);
    const columnLines = table.columns.map((column) => `  ${postgresColumnDefinition(column, table)}`);
    if (table.primaryKey.length > 1) {
      columnLines.push(`  PRIMARY KEY (${table.primaryKey.map(quotePgIdentifier).join(', ')})`);
    }
    lines.push(columnLines.join(',\n'));
    lines.push(');');
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

function buildIndexesSql(tables) {
  const lines = [
    '-- Gerado por scripts/export-sqlite-postgres.mjs',
    '-- Execute depois de importar os dados.',
    'BEGIN;'
  ];

  for (const table of tables) {
    for (const index of table.indexes) {
      const name = index.name.startsWith('sqlite_autoindex')
        ? generatedIndexName(table.name, index)
        : index.name;
      lines.push(
        `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quotePgIdentifier(name)} ` +
        `ON ${quotePgIdentifier(table.name)} (${index.columns.map(quotePgIdentifier).join(', ')});`
      );
    }
  }

  lines.push('COMMIT;');
  lines.push('');
  return lines.join('\n');
}

function postgresColumnDefinition(column, table) {
  const pieces = [quotePgIdentifier(column.name)];
  const isSinglePrimaryKey = table.primaryKey.length === 1 && table.primaryKey[0] === column.name;
  if (table.identityColumn === column.name) {
    pieces.push(`${postgresType(column.type, column.name)} GENERATED BY DEFAULT AS IDENTITY`);
  } else {
    pieces.push(postgresType(column.type, column.name));
  }
  if (isSinglePrimaryKey) pieces.push('PRIMARY KEY');
  if (Number(column.notnull) === 1 && !isSinglePrimaryKey) pieces.push('NOT NULL');
  const defaultValue = postgresDefault(column.dflt_value);
  if (defaultValue) pieces.push(`DEFAULT ${defaultValue}`);
  return pieces.join(' ');
}

function postgresType(sqliteType = '', columnName = '') {
  if (isTimestampColumn(columnName)) return 'timestamptz';
  const normalized = String(sqliteType || '').toUpperCase();
  if (normalized.includes('INT')) return 'integer';
  if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) return 'double precision';
  if (normalized.includes('BLOB')) return 'bytea';
  if (normalized.includes('NUM')) return 'numeric';
  return 'text';
}

function isTimestampColumn(columnName) {
  return /(^|_)(at|due_at|seen_at|opened_at|answered_at)$/i.test(columnName)
    || /^(created_at|updated_at|collected_at|checked_at|downloaded_at|applied_at|imported_at|reviewed_at|started_at|finished_at|ended_at|answered_at|last_seen_at|next_due_at|last_opened_at|last_answered_at|ai_generated_at)$/i.test(columnName);
}

function postgresDefault(value) {
  if (value == null || value === '') return '';
  const trimmed = String(value).trim();
  if (/^CURRENT_TIMESTAMP$/i.test(trimmed)) return 'CURRENT_TIMESTAMP';
  if (/^\(-?\d+(\.\d+)?\)$/.test(trimmed)) return trimmed.slice(1, -1);
  return trimmed;
}

async function exportTable(db, meta, filePath, batchSize) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
  const orderBy = meta.primaryKey.length
    ? meta.primaryKey.map(quoteSqliteIdentifier).join(', ')
    : 'rowid';
  const tableName = quoteSqliteIdentifier(meta.name);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${tableName}`).get().n;
  try {
    for (let offset = 0; offset < count; offset += batchSize) {
      const rows = db.prepare(`
        SELECT *
        FROM ${tableName}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(batchSize, offset);
      for (const row of rows) {
        stream.write(`${JSON.stringify(encodeRow(row))}\n`);
      }
    }
  } finally {
    await new Promise((resolve, reject) => {
      stream.end((error) => error ? reject(error) : resolve());
    });
  }
  return { count };
}

function encodeRow(row) {
  const encoded = {};
  for (const [key, value] of Object.entries(row)) {
    if (Buffer.isBuffer(value)) {
      encoded[key] = { __pgByteaBase64: value.toString('base64') };
    } else {
      encoded[key] = value;
    }
  }
  return encoded;
}

function generatedIndexName(tableName, index) {
  return `idx_${tableName}_${index.unique ? 'uniq' : 'idx'}_${index.columns.join('_')}`
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .slice(0, 62);
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function quotePgIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function quoteSqliteIdentifier(identifier) {
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
