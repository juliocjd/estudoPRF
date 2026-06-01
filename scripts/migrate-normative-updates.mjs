import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION_ID = '002_normative_updates';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Banco nao encontrado: ${dbPath}`);
  }

  const db = new DatabaseSync(dbPath);
  try {
    const backupPath = args['skip-backup'] ? '' : createBackup(db, dbPath);
    const report = migrateNormativeUpdates(db);
    if (backupPath) console.log(`Backup criado: ${backupPath}`);
    console.log(`Migracao aplicada: ${MIGRATION_ID}`);
    console.log(`Tabelas criadas/verificadas: ${report.tables}`);
    console.log(`Indices criados/verificados: ${report.indexes}`);
  } finally {
    db.close();
  }
}

export function migrateNormativeUpdates(database) {
  const report = { tables: 0, indexes: 0 };

  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS study_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_normative_updates (
      question_id INTEGER PRIMARY KEY,

      source_file TEXT,
      source_version TEXT,
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP,

      gabarito_banco TEXT,
      resposta_extraida_historica TEXT,

      classificacao_normativa TEXT,
      por_que_desatualizada TEXT,
      fundamento_juridico_atual TEXT,
      nova_regra_estado_atual TEXT,
      gabarito_atualizado_provavel TEXT,
      observacao_enunciado_literal TEXT,

      mudanca_gabarito TEXT,
      recomendacao TEXT,
      nivel_seguranca TEXT,
      fonte_base TEXT,

      review_status TEXT DEFAULT 'pending',
      reviewed_at TEXT,
      reviewed_by TEXT,
      reviewer_notes TEXT,

      raw_json TEXT,

      FOREIGN KEY (question_id) REFERENCES questions(id_question)
    );

    CREATE INDEX IF NOT EXISTS idx_qnu_recomendacao
    ON question_normative_updates(recomendacao);

    CREATE INDEX IF NOT EXISTS idx_qnu_nivel_seguranca
    ON question_normative_updates(nivel_seguranca);

    CREATE INDEX IF NOT EXISTS idx_qnu_mudanca_gabarito
    ON question_normative_updates(mudanca_gabarito);

    CREATE INDEX IF NOT EXISTS idx_qnu_review_status
    ON question_normative_updates(review_status);

    INSERT INTO study_migrations (id, applied_at)
    VALUES ('${MIGRATION_ID}', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING;
  `);

  report.tables = 2;
  report.indexes = 4;
  return report;
}

export function createBackup(database, sourcePath, suffix = 'normative-updates') {
  const backupPath = `${sourcePath}.backup-${suffix}-${timestamp()}`;
  database.exec('PRAGMA wal_checkpoint(FULL);');
  database.exec(`VACUUM INTO '${escapeSqlString(backupPath)}';`);
  return backupPath;
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
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
