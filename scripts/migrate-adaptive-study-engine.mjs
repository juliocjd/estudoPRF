import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
  const db = new DatabaseSync(dbPath);

  try {
    let backupPath = '';
    if (!args['no-backup']) {
      backupPath = createBackup(db, dbPath);
    }
    migrateAdaptiveStudyEngine(db);
    console.log(`Migration adaptativa concluida. Banco: ${dbPath}`);
    if (backupPath) console.log(`Backup: ${backupPath}`);
  } finally {
    db.close();
  }
}

export function migrateAdaptiveStudyEngine(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_key TEXT UNIQUE,
      cluster_type TEXT NOT NULL CHECK (cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate', 'same_skill', 'manual')),
      profile_id TEXT,
      subject_key TEXT,
      subject_label TEXT,
      materia TEXT,
      assunto TEXT,
      skill_key TEXT,
      title TEXT,
      representative_question_id INTEGER,
      size INTEGER DEFAULT 0,
      confidence REAL DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS question_cluster_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      role TEXT DEFAULT 'variant' CHECK (role IN ('representative', 'variant', 'reinforcement', 'archive')),
      similarity REAL DEFAULT 1,
      representative_score REAL DEFAULT 0,
      reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cluster_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS cluster_mastery (
      cluster_id INTEGER PRIMARY KEY,
      attempts INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      wrong_count INTEGER DEFAULT 0,
      correct_streak INTEGER DEFAULT 0,
      wrong_streak INTEGER DEFAULT 0,
      last_result INTEGER,
      last_confidence TEXT,
      last_seen_at TEXT,
      next_due_at TEXT,
      mastery_score REAL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS study_strategy_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS study_session_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      question_id INTEGER NOT NULL,
      cluster_id INTEGER,
      plan_id TEXT,
      position INTEGER,
      priority_score REAL,
      reason_json TEXT,
      status TEXT DEFAULT 'planned',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_flow_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_mode TEXT,
      current_profile TEXT,
      current_materia TEXT,
      current_assunto TEXT,
      last_open_question_id INTEGER,
      last_opened_at TEXT,
      last_answered_question_id INTEGER,
      last_answered_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS study_served_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      mode TEXT,
      profile_id TEXT,
      served_at TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_question_clusters_key ON question_clusters(cluster_key);
    CREATE INDEX IF NOT EXISTS idx_question_clusters_type ON question_clusters(cluster_type, status);
    CREATE INDEX IF NOT EXISTS idx_question_clusters_profile ON question_clusters(profile_id, subject_key);
    CREATE INDEX IF NOT EXISTS idx_question_clusters_representative ON question_clusters(representative_question_id);
    CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster ON question_cluster_members(cluster_id, role);
    CREATE INDEX IF NOT EXISTS idx_cluster_members_question ON question_cluster_members(question_id);
    CREATE INDEX IF NOT EXISTS idx_cluster_mastery_due ON cluster_mastery(next_due_at);
    CREATE INDEX IF NOT EXISTS idx_cluster_mastery_score ON cluster_mastery(mastery_score);
    CREATE INDEX IF NOT EXISTS idx_strategy_profiles_default ON study_strategy_profiles(is_default);
    CREATE INDEX IF NOT EXISTS idx_session_items_session ON study_session_items(session_id, position);
    CREATE INDEX IF NOT EXISTS idx_session_items_question ON study_session_items(question_id);
    CREATE INDEX IF NOT EXISTS idx_session_items_cluster ON study_session_items(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_session_items_plan ON study_session_items(plan_id, status);
    CREATE INDEX IF NOT EXISTS idx_study_served_questions_question ON study_served_questions(question_id, served_at);
    CREATE INDEX IF NOT EXISTS idx_study_served_questions_mode ON study_served_questions(mode, served_at);
  `);

  const upsert = database.prepare(`
    INSERT INTO study_strategy_profiles (id, name, description, is_default, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      is_default = excluded.is_default,
      updated_at = CURRENT_TIMESTAMP
  `);

  const profiles = [
    ['prf_otimizado', 'PRF Otimizado', 'Fila adaptativa: representantes, revisoes vencidas, erros e peso do edital PRF.', 1],
    ['revisar_erros', 'Revisar erros', 'Prioriza questoes e clusters com erro recente.', 0],
    ['revisar_hoje', 'Revisar hoje', 'Prioriza revisoes vencidas pela agenda espacada.', 0],
    ['ver_todas', 'Ver todas', 'Mantem acesso completo ao banco, sem adiar variacoes semelhantes.', 0]
  ];

  database.exec('BEGIN');
  try {
    for (const profile of profiles) upsert.run(...profile);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function createBackup(database, sourcePath) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupPath = `${sourcePath}.backup-before-adaptive-engine-${stamp}`;
  const escaped = backupPath.replaceAll("'", "''");
  database.exec('PRAGMA wal_checkpoint(FULL);');
  database.exec(`VACUUM INTO '${escaped}'`);
  return backupPath;
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
