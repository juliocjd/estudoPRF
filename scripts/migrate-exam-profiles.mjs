import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION_ID = '002_exam_profiles';
const TARGET_USER_VERSION = 2;

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');

if (!fs.existsSync(dbPath)) {
  throw new Error(`Banco nao encontrado: ${dbPath}`);
}

const db = new DatabaseSync(dbPath);

try {
  const backupPath = createBackup(db, dbPath);
  migrate(db);
  console.log(`Backup criado: ${backupPath}`);
  console.log(`Migracao aplicada/verificada: ${MIGRATION_ID}`);
  console.log(`PRAGMA user_version: ${db.prepare('PRAGMA user_version').get().user_version}`);
} finally {
  db.close();
}

function migrate(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS study_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exam_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT,
      source_url TEXT,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_subject_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      block_key TEXT,
      block_label TEXT,
      expected_items REAL,
      expected_pct REAL,
      min_score_cutoff REAL,
      importance_weight REAL DEFAULT 1,
      source_note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, subject_key)
    );

    CREATE TABLE IF NOT EXISTS subject_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_materia TEXT,
      raw_assunto TEXT,
      subject_key TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      confidence REAL DEFAULT 1,
      source TEXT DEFAULT 'manual',
      UNIQUE(raw_materia, raw_assunto, subject_key)
    );

    CREATE TABLE IF NOT EXISTS question_exam_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      profile_id TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      block_key TEXT,
      confidence REAL DEFAULT 1,
      source TEXT DEFAULT 'alias',
      UNIQUE(question_id, profile_id, subject_key)
    );

    CREATE TABLE IF NOT EXISTS exam_simulations (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      mode TEXT,
      total_items INTEGER DEFAULT 120,
      score_total REAL,
      score_block_1 REAL,
      score_block_2 REAL,
      score_block_3 REAL,
      blank_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      passed_cutoffs INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_simulation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simulation_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      block_key TEXT,
      subject_key TEXT,
      answer_letter TEXT,
      expected_answer TEXT,
      is_correct INTEGER,
      score REAL,
      confidence TEXT,
      elapsed_ms INTEGER,
      UNIQUE(simulation_id, position)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_subject_weights_profile ON exam_subject_weights(profile_id);
    CREATE INDEX IF NOT EXISTS idx_exam_subject_weights_subject ON exam_subject_weights(subject_key);
    CREATE INDEX IF NOT EXISTS idx_subject_aliases_raw ON subject_aliases(raw_materia, raw_assunto);
    CREATE INDEX IF NOT EXISTS idx_subject_aliases_subject ON subject_aliases(subject_key);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_question ON question_exam_subjects(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_profile ON question_exam_subjects(profile_id);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_subject ON question_exam_subjects(subject_key);
    CREATE INDEX IF NOT EXISTS idx_exam_simulation_items_simulation ON exam_simulation_items(simulation_id);
    CREATE INDEX IF NOT EXISTS idx_exam_simulation_items_question ON exam_simulation_items(question_id);

    INSERT INTO study_migrations (id, applied_at)
    VALUES ('${MIGRATION_ID}', CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING;

    PRAGMA user_version = ${TARGET_USER_VERSION};
  `);
}

function createBackup(database, sourcePath) {
  const backupPath = `${sourcePath}.backup-${timestamp()}`;
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
