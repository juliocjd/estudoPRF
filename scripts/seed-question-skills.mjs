import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');
const limit = Math.max(0, Number(args.limit || 0));
const dryRun = Boolean(args['dry-run']);

const db = new DatabaseSync(dbPath);

try {
  ensureSkillTable(db);
  const questions = db.prepare(`
    SELECT id_question, materia, assunto
    FROM questions
    WHERE COALESCE(materia, '') != ''
      AND COALESCE(assunto, '') != ''
    ORDER BY id_question
    ${limit > 0 ? 'LIMIT ?' : ''}
  `).all(...(limit > 0 ? [limit] : []));

  const exists = db.prepare(`
    SELECT 1
    FROM question_skill_tags
    WHERE question_id = ? AND skill_key = ?
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT INTO question_skill_tags (
      question_id, materia, assunto, skill_key, skill_label, source, confidence, created_at
    )
    VALUES (?, ?, ?, ?, ?, 'matter_subject_seed', 1, CURRENT_TIMESTAMP)
  `);

  let inserted = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    for (const question of questions) {
      const skillKey = buildSkillKey(question.materia, question.assunto);
      if (!skillKey) {
        skipped += 1;
        continue;
      }

      if (exists.get(question.id_question, skillKey)) {
        skipped += 1;
        continue;
      }

      inserted += 1;
      if (!dryRun) {
        insert.run(
          question.id_question,
          question.materia || '',
          question.assunto || '',
          skillKey,
          `${question.materia || ''} > ${question.assunto || ''}`
        );
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log(`Questoes analisadas: ${questions.length}`);
  console.log(`${dryRun ? 'Inseriria' : 'Inseridos'}: ${inserted}`);
  console.log(`Ignorados: ${skipped}`);
  console.log(`Banco: ${dbPath}`);
} finally {
  db.close();
}

function ensureSkillTable(database) {
  database.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_question_skill_tags_question ON question_skill_tags(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_skill_tags_skill ON question_skill_tags(skill_key);
  `);
}

function buildSkillKey(materia, assunto) {
  const matter = slugify(materia);
  const subject = slugify(assunto);
  return matter && subject ? `${matter}::${subject}` : '';
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
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
