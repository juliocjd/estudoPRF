import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

export function openCliDatabase(args = {}) {
  const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
  const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
  const client = args['db-client'] || process.env.DB_CLIENT || '';
  const opened = openStudyDatabase({ dbPath, databaseUrl, client });
  initLegalKnowledgeSchema(opened.db, opened.client);
  return opened;
}

export function initLegalKnowledgeSchema(db, client = 'sqlite') {
  if (client === 'postgres') {
    const migrationPath = path.join(ROOT_DIR, 'migrations', '20260605_legal_knowledge_layer.postgres.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT UNIQUE NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      source_org TEXT,
      url TEXT NOT NULL,
      status TEXT,
      number TEXT,
      year INTEGER,
      published_at TEXT,
      effective_at TEXT,
      revoked_by TEXT,
      priority INTEGER DEFAULT 50,
      raw_text TEXT,
      raw_hash TEXT,
      fetched_at TEXT,
      indexed_at TEXT,
      import_error TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS legal_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      article_ref TEXT NOT NULL,
      article_order INTEGER,
      heading TEXT,
      text TEXT NOT NULL,
      normalized_text TEXT,
      excerpt TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, article_ref)
    );

    CREATE TABLE IF NOT EXISTS legal_topic_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      materia TEXT,
      assunto TEXT,
      microtema TEXT,
      level TEXT DEFAULT 'beginner',
      answer_summary TEXT,
      rule_summary TEXT,
      professor_note TEXT,
      common_traps TEXT,
      memory_hook TEXT,
      example_text TEXT,
      source_refs TEXT DEFAULT '[]',
      verified_status TEXT DEFAULT 'draft',
      generated_by TEXT DEFAULT 'system',
      reviewed_at TEXT,
      reviewed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_legal_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      legal_article_id INTEGER,
      legal_card_id INTEGER,
      relation_type TEXT DEFAULT 'supports_answer',
      relevance_score REAL DEFAULT 0,
      reason TEXT,
      source TEXT DEFAULT 'auto',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, legal_article_id, legal_card_id, relation_type)
    );

    CREATE TABLE IF NOT EXISTS legal_change_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER,
      change_key TEXT UNIQUE,
      title TEXT NOT NULL,
      previous_rule TEXT,
      current_rule TEXT,
      affected_topics TEXT DEFAULT '[]',
      affected_question_count INTEGER DEFAULT 0,
      effective_at TEXT,
      source_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_study_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER,
      legal_card_id INTEGER,
      lesson_type TEXT NOT NULL DEFAULT 'error_remedy',
      title TEXT NOT NULL,
      short_text TEXT NOT NULL,
      created_from TEXT DEFAULT 'system',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_legal_sources_type_number
      ON legal_sources(source_type, number, year);
    CREATE INDEX IF NOT EXISTS idx_legal_articles_source_ref
      ON legal_articles(source_id, article_ref);
    CREATE INDEX IF NOT EXISTS idx_legal_articles_normalized_text
      ON legal_articles(normalized_text);
    CREATE INDEX IF NOT EXISTS idx_legal_cards_materia_assunto
      ON legal_topic_cards(materia, assunto, microtema);
    CREATE INDEX IF NOT EXISTS idx_question_legal_links_question
      ON question_legal_links(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_legal_links_card
      ON question_legal_links(legal_card_id);
  `);
}

export function normalizeSearchText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function slugify(value) {
  return normalizeSearchText(value).replace(/\s+/g, '_').slice(0, 120) || 'item';
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function excerpt(value, maxLength = 520) {
  const text = normalizeWhitespace(value).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

export function upsertLegalSource(db, source = {}) {
  const key = String(source.key || source.source_key || '').trim();
  if (!key) throw new Error('Fonte legal sem key.');
  const sourceType = source.type || source.source_type || 'official_source';
  const number = source.resolution_number || source.number || '';
  const year = source.year ? Number(source.year) : null;
  db.prepare(`
    INSERT INTO legal_sources (
      source_key, source_type, title, source_org, url, status, number, year,
      priority, raw_text, raw_hash, fetched_at, indexed_at, import_error, notes, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_key) DO UPDATE SET
      source_type = excluded.source_type,
      title = excluded.title,
      source_org = excluded.source_org,
      url = excluded.url,
      status = excluded.status,
      number = excluded.number,
      year = excluded.year,
      priority = excluded.priority,
      raw_text = COALESCE(NULLIF(excluded.raw_text, ''), legal_sources.raw_text),
      raw_hash = COALESCE(NULLIF(excluded.raw_hash, ''), legal_sources.raw_hash),
      fetched_at = COALESCE(excluded.fetched_at, legal_sources.fetched_at),
      indexed_at = COALESCE(excluded.indexed_at, legal_sources.indexed_at),
      import_error = excluded.import_error,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    key,
    sourceType,
    source.title || key,
    source.source_org || source.org || '',
    source.url || '',
    source.status || 'active',
    number,
    year,
    Number(source.priority || 50),
    source.raw_text || '',
    source.raw_hash || '',
    source.fetched_at || null,
    source.indexed_at || null,
    source.import_error || '',
    source.notes || ''
  );
  return db.prepare('SELECT * FROM legal_sources WHERE source_key = ?').get(key);
}

export function upsertLegalArticle(db, sourceId, article = {}) {
  const ref = String(article.article_ref || article.ref || '').trim();
  if (!sourceId || !ref) throw new Error('Artigo legal sem sourceId/ref.');
  const text = normalizeWhitespace(article.text || article.official_text || article.excerpt || '');
  db.prepare(`
    INSERT INTO legal_articles (
      source_id, article_ref, article_order, heading, text, normalized_text, excerpt, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_id, article_ref) DO UPDATE SET
      article_order = excluded.article_order,
      heading = excluded.heading,
      text = excluded.text,
      normalized_text = excluded.normalized_text,
      excerpt = excluded.excerpt,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    sourceId,
    ref,
    article.article_order ?? article.order ?? null,
    article.heading || article.title || '',
    text,
    normalizeSearchText(text),
    article.excerpt || excerpt(text)
  );
  return db.prepare('SELECT * FROM legal_articles WHERE source_id = ? AND article_ref = ?').get(sourceId, ref);
}

export function upsertLegalCard(db, card = {}) {
  const key = String(card.card_key || '').trim();
  if (!key) throw new Error('Card legal sem card_key.');
  db.prepare(`
    INSERT INTO legal_topic_cards (
      card_key, title, materia, assunto, microtema, level, answer_summary,
      rule_summary, professor_note, common_traps, memory_hook, example_text,
      source_refs, verified_status, generated_by, reviewed_at, reviewed_by, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(card_key) DO UPDATE SET
      title = excluded.title,
      materia = excluded.materia,
      assunto = excluded.assunto,
      microtema = excluded.microtema,
      level = excluded.level,
      answer_summary = excluded.answer_summary,
      rule_summary = excluded.rule_summary,
      professor_note = excluded.professor_note,
      common_traps = excluded.common_traps,
      memory_hook = excluded.memory_hook,
      example_text = excluded.example_text,
      source_refs = excluded.source_refs,
      verified_status = excluded.verified_status,
      generated_by = excluded.generated_by,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    key,
    card.title || key,
    card.materia || '',
    card.assunto || '',
    card.microtema || '',
    card.level || 'beginner',
    card.answer_summary || '',
    card.rule_summary || '',
    card.professor_note || '',
    card.common_traps || '',
    card.memory_hook || '',
    card.example_text || '',
    JSON.stringify(card.source_refs || []),
    card.verified_status || 'draft',
    card.generated_by || 'system',
    card.reviewed_at || null,
    card.reviewed_by || ''
  );
  return db.prepare('SELECT * FROM legal_topic_cards WHERE card_key = ?').get(key);
}

export function linkQuestionToLegalCard(db, { questionId, articleId, cardId, relationType = 'supports_answer', relevanceScore = 1, reason = '', source = 'manual' }) {
  if (!questionId || (!articleId && !cardId)) return;
  db.prepare(`
    INSERT INTO question_legal_links (
      question_id, legal_article_id, legal_card_id, relation_type, relevance_score, reason, source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(question_id, legal_article_id, legal_card_id, relation_type) DO UPDATE SET
      relevance_score = excluded.relevance_score,
      reason = excluded.reason,
      source = excluded.source
  `).run(
    Number(questionId),
    articleId ? Number(articleId) : null,
    cardId ? Number(cardId) : null,
    relationType,
    Number(relevanceScore || 0),
    reason,
    source
  );
}
