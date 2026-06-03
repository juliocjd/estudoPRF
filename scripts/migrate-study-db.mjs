import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION_ID = '001_adaptive_study_schema';
const TARGET_USER_VERSION = 1;

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');

if (!fs.existsSync(dbPath)) {
  throw new Error(`Banco nao encontrado: ${dbPath}`);
}

const db = new DatabaseSync(dbPath);

try {
  const backupPath = createBackup(db, dbPath);
  const report = migrate(db);
  console.log(`Backup criado: ${backupPath}`);
  console.log(`Migracao aplicada: ${MIGRATION_ID}`);
  console.log(`Tabelas criadas/verificadas: ${report.tables}`);
  console.log(`Colunas criadas/verificadas: ${report.columns}`);
  console.log(`Indices criados/verificados: ${report.indexes}`);
  console.log(`PRAGMA user_version: ${report.userVersion}`);
} finally {
  db.close();
}

function migrate(database) {
  const report = {
    tables: 0,
    columns: 0,
    indexes: 0,
    userVersion: TARGET_USER_VERSION
  };

  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS study_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer_letter TEXT NOT NULL,
      answer_text TEXT,
      expected_answer TEXT,
      is_correct INTEGER,
      answered_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  report.tables += 2;

  const studyAnswerColumns = [
    ['confidence', 'TEXT'],
    ['error_type', 'TEXT'],
    ['elapsed_ms', 'INTEGER'],
    ['study_mode', 'TEXT'],
    ['saw_comment', 'INTEGER DEFAULT 0'],
    ['opened_theory', 'INTEGER DEFAULT 0'],
    ['session_id', 'TEXT'],
    ['created_at', 'TEXT'],
    ['correction_mode', 'TEXT'],
    ['expected_answer_source', 'TEXT'],
    ['non_scoring_reason', 'TEXT'],
    ['current_law_status_at_answer', 'TEXT'],
    ['scoring_version', 'TEXT']
  ];
  for (const [name, definition] of studyAnswerColumns) {
    if (ensureColumn(database, 'study_answers', name, definition)) {
      report.columns += 1;
    }
  }

  database.exec(`
    UPDATE study_answers
    SET created_at = COALESCE(NULLIF(created_at, ''), NULLIF(answered_at, ''), CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR created_at = '';

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT,
      ended_at TEXT,
      mode TEXT,
      materia TEXT,
      assunto TEXT,
      total_questions INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS question_mastery (
      question_id INTEGER PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      correct_streak INTEGER DEFAULT 0,
      wrong_streak INTEGER DEFAULT 0,
      last_result INTEGER,
      last_confidence TEXT,
      last_error_type TEXT,
      last_seen_at TEXT,
      next_due_at TEXT,
      mastery_score REAL DEFAULT 0,
      difficulty REAL DEFAULT 0.5,
      stability REAL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subject_mastery (
      materia TEXT NOT NULL,
      assunto TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      last_seen_at TEXT,
      next_due_at TEXT,
      mastery_score REAL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (materia, assunto)
    );

    CREATE TABLE IF NOT EXISTS study_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      event_type TEXT,
      event_value TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_answer_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      evidence_text TEXT,
      extractor_version TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_skill_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      materia TEXT,
      assunto TEXT,
      skill_key TEXT,
      skill_label TEXT,
      source TEXT,
      confidence REAL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS theory_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      materia TEXT,
      assunto TEXT,
      skill_key TEXT,
      pdf_path TEXT NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      confidence REAL DEFAULT 0.5,
      source TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  report.tables += 7;

  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_study_answers_question ON study_answers(question_id)',
    'CREATE INDEX IF NOT EXISTS idx_study_answers_created ON study_answers(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_study_answers_session ON study_answers(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_question_mastery_due ON question_mastery(next_due_at)',
    'CREATE INDEX IF NOT EXISTS idx_question_mastery_score ON question_mastery(mastery_score)',
    'CREATE INDEX IF NOT EXISTS idx_question_mastery_result ON question_mastery(last_result)',
    'CREATE INDEX IF NOT EXISTS idx_subject_mastery_score ON subject_mastery(mastery_score)',
    'CREATE INDEX IF NOT EXISTS idx_subject_mastery_due ON subject_mastery(next_due_at)',
    'CREATE INDEX IF NOT EXISTS idx_study_events_question ON study_events(question_id, event_type, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_question_answer_audit_question ON question_answer_audit(question_id, source)',
    'CREATE INDEX IF NOT EXISTS idx_question_skill_tags_question ON question_skill_tags(question_id)',
    'CREATE INDEX IF NOT EXISTS idx_question_skill_tags_skill ON question_skill_tags(skill_key)',
    'CREATE INDEX IF NOT EXISTS idx_theory_links_question ON theory_links(question_id)',
    'CREATE INDEX IF NOT EXISTS idx_theory_links_skill ON theory_links(skill_key)'
  ];
  for (const statement of indexStatements) {
    database.exec(`${statement};`);
    report.indexes += 1;
  }

  database.prepare(`
    INSERT INTO study_migrations (id, applied_at)
    VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING
  `).run(MIGRATION_ID);
  database.exec(`PRAGMA user_version = ${TARGET_USER_VERSION};`);

  return report;
}

function createBackup(database, sourcePath) {
  const backupPath = `${sourcePath}.backup-${timestamp()}`;
  database.exec('PRAGMA wal_checkpoint(FULL);');
  database.exec(`VACUUM INTO '${escapeSqlString(backupPath)}';`);
  return backupPath;
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return false;
  }
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  return true;
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
