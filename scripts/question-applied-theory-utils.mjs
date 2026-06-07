import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, normalizeSearchText, openCliDatabase, parseArgs } from './legal-knowledge-utils.mjs';

export { ROOT_DIR, normalizeSearchText, openCliDatabase, parseArgs };

export function initQuestionAppliedTheorySchema(db, client = 'sqlite') {
  if (client === 'postgres') {
    db.exec(fs.readFileSync(path.join(ROOT_DIR, 'migrations', '20260607_question_applied_theory_cards_v5.postgres.sql'), 'utf8'));
    db.exec(fs.readFileSync(path.join(ROOT_DIR, 'migrations', '20260607_question_applied_theory_exact_anchors_v6.postgres.sql'), 'utf8'));
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS question_applied_theory_cards (
      question_id INTEGER PRIMARY KEY,
      card_status TEXT NOT NULL,
      source_mode TEXT NOT NULL,
      historical_answer TEXT,
      current_answer TEXT,
      answer_changed INTEGER,
      no_valid_alternative INTEGER DEFAULT 0,
      title TEXT NOT NULL,
      question_focus TEXT NOT NULL,
      rule_that_solves_this_question TEXT NOT NULL,
      legal_basis TEXT NOT NULL,
      article_excerpt TEXT,
      applied_explanation TEXT NOT NULL,
      rule_summary_bullets TEXT NOT NULL DEFAULT '[]',
      professor_tip TEXT,
      common_traps TEXT NOT NULL DEFAULT '[]',
      study_conclusion TEXT NOT NULL,
      show_warning TEXT,
      show_before_answer INTEGER NOT NULL DEFAULT 0,
      show_after_answer INTEGER NOT NULL DEFAULT 1,
      source_urls TEXT NOT NULL DEFAULT '[]',
      teaching_card_md TEXT,
      teaching_card_html TEXT,
      generated_by TEXT,
      verified_status TEXT NOT NULL DEFAULT 'unverified',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_qatc_status ON question_applied_theory_cards(card_status);
    CREATE INDEX IF NOT EXISTS idx_qatc_source_mode ON question_applied_theory_cards(source_mode);
    CREATE INDEX IF NOT EXISTS idx_qatc_current_answer ON question_applied_theory_cards(current_answer);

    CREATE TABLE IF NOT EXISTS question_applied_theory_generation_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      generation_policy TEXT NOT NULL,
      job_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, generation_policy)
    );

    CREATE INDEX IF NOT EXISTS idx_qat_jobs_status_priority ON question_applied_theory_generation_jobs(status, priority);
    CREATE INDEX IF NOT EXISTS idx_qat_jobs_question ON question_applied_theory_generation_jobs(question_id);
  `);
  ensureSqliteExactAnchorSchema(db);
}

function ensureSqliteExactAnchorSchema(db) {
  const columns = [
    ['publish_status', "TEXT DEFAULT 'draft'"],
    ['answer_for_study', 'TEXT'],
    ['legal_anchor_quality', "TEXT DEFAULT 'missing'"],
    ['primary_legal_locator', 'TEXT'],
    ['primary_exact_excerpt', 'TEXT'],
    ['exact_excerpt_source_url', 'TEXT'],
    ['exact_anchor_verified', 'INTEGER DEFAULT 0'],
    ['exact_anchor_review_status', "TEXT DEFAULT 'missing'"],
    ['issue_mapping_json', "TEXT DEFAULT '[]'"],
    ['why_correct_json', "TEXT DEFAULT '[]'"],
    ['why_wrong_json', "TEXT DEFAULT '[]'"],
    ['should_show_as_applied_theory', 'INTEGER DEFAULT 0'],
    ['validation_errors_json', "TEXT DEFAULT '[]'"],
    ['validated_at', 'TEXT'],
    ['raw_json', "TEXT DEFAULT '{}'"]
  ];
  for (const [name, definition] of columns) {
    try {
      db.exec(`ALTER TABLE question_applied_theory_cards ADD COLUMN ${name} ${definition}`);
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column')) throw error;
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_article_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      source_title TEXT,
      source_url TEXT,
      source_version TEXT,
      segment_ref TEXT NOT NULL,
      parent_ref TEXT,
      segment_type TEXT,
      segment_text TEXT NOT NULL,
      normalized_text TEXT,
      page_start INTEGER,
      page_end INTEGER,
      is_current INTEGER DEFAULT 1,
      extraction_method TEXT,
      excerpt_hash TEXT,
      raw_context TEXT,
      extracted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_key, segment_ref, excerpt_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_legal_segments_source_ref ON legal_article_segments(source_key, segment_ref);
    CREATE INDEX IF NOT EXISTS idx_legal_segments_type ON legal_article_segments(segment_type);

    CREATE TABLE IF NOT EXISTS question_applied_theory_legal_anchors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      card_id INTEGER,
      anchor_role TEXT DEFAULT 'primary',
      source_key TEXT NOT NULL,
      source_title TEXT,
      source_url TEXT,
      legal_locator TEXT NOT NULL,
      exact_excerpt TEXT NOT NULL,
      segment_id INTEGER,
      applies_to_question_json TEXT DEFAULT '[]',
      applies_to_alternatives_json TEXT DEFAULT '[]',
      anchor_status TEXT DEFAULT 'verified',
      verification_method TEXT,
      verified_by TEXT,
      verified_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_qatla_question ON question_applied_theory_legal_anchors(question_id);
    CREATE INDEX IF NOT EXISTS idx_qatla_card ON question_applied_theory_legal_anchors(card_id);
    CREATE INDEX IF NOT EXISTS idx_qatla_status ON question_applied_theory_legal_anchors(anchor_status);
  `);
}

export function normalizeAppliedTheoryCardItem(item = {}) {
  const card = item.card || item;
  const primaryAnchor = normalizePrimaryAnchor(card.primary_legal_anchor || card.primaryLegalAnchor || {});
  const legalBasis = card.legal_basis || card.legalBasis || primaryAnchor.legal_locator || '';
  const articleExcerpt = card.article_excerpt || card.articleExcerpt || primaryAnchor.exact_excerpt || '';
  const validation = validateAppliedTheoryCard({ ...card, legal_basis: legalBasis, article_excerpt: articleExcerpt, primary_legal_anchor: primaryAnchor });
  const publishStatus = card.publish_status || (card.card_status === 'published' ? 'published' : 'draft');
  const shouldShow = publishStatus === 'published' && validation.ok;
  return {
    ...card,
    question_id: item.question_id || card.question_id,
    card_status: normalizeCardStatus(card.card_status, publishStatus, validation),
    publish_status: shouldShow ? 'published' : (publishStatus === 'published' ? 'review_only' : publishStatus),
    source_mode: normalizeSourceMode(card.source_mode),
    current_answer: card.current_answer || parseAnswerForStudy(card.answer_for_study),
    historical_answer: card.historical_answer || null,
    answer_for_study: card.answer_for_study || card.current_answer || card.historical_answer || '',
    rule_that_solves_this_question: card.rule_that_solves_this_question || card.ruleThatSolvesThisQuestion || card.applied_explanation || '',
    legal_basis: primaryAnchor.legal_locator || legalBasis,
    article_excerpt: articleExcerpt,
    source_urls: card.source_urls || card.sourceUrls || [primaryAnchor.source_url].filter(Boolean),
    primary_legal_anchor: primaryAnchor,
    secondary_legal_anchors: (card.secondary_legal_anchors || card.secondaryLegalAnchors || []).map(normalizePrimaryAnchor),
    legal_anchor_quality: validation.ok ? 'exact' : 'missing',
    primary_legal_locator: primaryAnchor.legal_locator || '',
    primary_exact_excerpt: primaryAnchor.exact_excerpt || '',
    exact_excerpt_source_url: primaryAnchor.source_url || '',
    exact_anchor_verified: validation.ok,
    exact_anchor_review_status: validation.ok ? 'verified' : 'needs_exact_anchor',
    issue_mapping_json: card.issue_mapping || card.issueMapping || [],
    why_correct_json: card.why_correct || card.whyCorrect || [],
    why_wrong_json: card.why_wrong || card.whyWrong || [],
    should_show_as_applied_theory: shouldShow,
    validation_errors_json: validation.errors,
    validated_at: new Date().toISOString(),
    raw_json: item,
    verified_status: validation.ok ? 'verified_exact_anchor_v6' : (card.verified_status || 'needs_exact_anchor')
  };
}

function normalizePrimaryAnchor(anchor = {}) {
  const sourceKey = anchor.source_key || anchor.sourceKey || '';
  const locator = normalizeExactLocator(sourceKey, anchor.legal_locator || anchor.legalLocator || '');
  return {
    source_key: sourceKey,
    source_title: anchor.source_title || anchor.sourceTitle || '',
    source_url: anchor.source_url || anchor.sourceUrl || '',
    legal_locator: locator,
    exact_excerpt: anchor.exact_excerpt || anchor.exactExcerpt || '',
    excerpt_role: anchor.excerpt_role || anchor.excerptRole || 'rule_that_solves',
    segment_id: anchor.segment_id || anchor.segmentId || null,
    applies_to_question_json: anchor.applies_to_question_json || anchor.appliesToQuestion || [],
    applies_to_alternatives_json: anchor.applies_to_alternatives_json || anchor.appliesToAlternatives || [],
    anchor_status: anchor.anchor_status || anchor.anchorStatus || 'verified',
    verification_method: anchor.verification_method || anchor.verificationMethod || 'exact_anchor_v6',
    verified_by: anchor.verified_by || anchor.verifiedBy || 'import_exact_v6',
    verified_at: anchor.verified_at || anchor.verifiedAt || new Date().toISOString()
  };
}

function normalizeExactLocator(sourceKey, locator) {
  const value = String(locator || '').trim();
  if (
    sourceKey === 'contran_819_2021'
    && /Anexo I, inciso II/i.test(value)
    && !/art\.\s*2/i.test(value)
  ) {
    return value.replace(/Resolução CONTRAN nº 819\/2021,\s*/i, 'Resolução CONTRAN nº 819/2021, art. 2º, ');
  }
  return value;
}

export function validateAppliedTheoryCard(card = {}) {
  const primaryAnchor = card.primary_legal_anchor || {};
  const locator = String(primaryAnchor.legal_locator || card.primary_legal_locator || card.legal_basis || '').trim();
  const excerpt = String(primaryAnchor.exact_excerpt || card.primary_exact_excerpt || card.article_excerpt || '').trim();
  const errors = [];
  if (!hasSpecificLegalLocator(locator)) errors.push('NO_PRECISE_LOCATOR');
  if (!excerpt) errors.push('NO_EXACT_EXCERPT');
  if (!String(card.question_focus || '').trim()) errors.push('NO_QUESTION_FOCUS');
  if (!String(card.applied_explanation || '').trim()) errors.push('NO_APPLIED_EXPLANATION');
  if (!String(card.study_conclusion || '').trim()) errors.push('NO_STUDY_CONCLUSION');
  if (!Array.isArray(card.rule_summary_bullets) || card.rule_summary_bullets.length === 0) errors.push('NO_RULE_SUMMARY');
  return { ok: errors.length === 0, errors };
}

export function hasSpecificLegalLocator(locator) {
  const value = String(locator || '').trim();
  if (!value) return false;
  if (/^(Resolução|Resolucao)\s+CONTRAN\s+n[ºo.]?\s*\d+\/\d{4}\.?$/i.test(value)) return false;
  if (/^(CTB|Código de Trânsito Brasileiro)$/i.test(value)) return false;
  return /\b(art\.|artigo|anexo|inciso|al[ií]nea|item|ficha|§)\b/i.test(value);
}

function normalizeCardStatus(status, publishStatus, validation) {
  if (status === 'ready') return publishStatus === 'published' && validation.ok ? 'published' : 'draft_needs_review';
  if (status === 'needs_exact_anchor') return 'draft_needs_review';
  return status || (validation.ok ? 'published' : 'draft_needs_review');
}

function normalizeSourceMode(sourceMode) {
  if (sourceMode === 'current_law') return 'current_law_verified';
  return sourceMode || 'historical_law';
}

function parseAnswerForStudy(value) {
  const text = String(value || '').toUpperCase();
  const letter = text.match(/\b(ALTERNATIVA|LETRA)?\s*([A-E])\b/);
  if (letter) return letter[2];
  if (/\bCERTO\b/.test(text)) return 'CERTO';
  if (/\bERRADO\b/.test(text)) return 'ERRADO';
  return '';
}

export function upsertAppliedTheoryCard(db, item = {}) {
  const normalized = normalizeAppliedTheoryCardItem(item);
  const isPostgres = Boolean(db.databaseUrl);
  const json = (value) => JSON.stringify(Array.isArray(value) ? value : []);
  const jsonObject = (value) => JSON.stringify(value || {});
  const bool = (value) => (isPostgres ? Boolean(value) : (value ? 1 : 0));
  const nullableBool = (value) => {
    if (value === null || value === undefined) return null;
    return isPostgres ? Boolean(value) : (value ? 1 : 0);
  };
  db.prepare(`
    INSERT INTO question_applied_theory_cards (
      question_id, card_status, source_mode, historical_answer, current_answer,
      answer_changed, no_valid_alternative, title, question_focus,
      rule_that_solves_this_question, legal_basis, article_excerpt,
      applied_explanation, rule_summary_bullets, professor_tip, common_traps,
      study_conclusion, show_warning, show_before_answer, show_after_answer,
      source_urls, teaching_card_md, teaching_card_html, generated_by,
      verified_status, reviewed_by, reviewed_at, publish_status, answer_for_study,
      legal_anchor_quality, primary_legal_locator, primary_exact_excerpt,
      exact_excerpt_source_url, exact_anchor_verified, exact_anchor_review_status,
      issue_mapping_json, why_correct_json, why_wrong_json, should_show_as_applied_theory,
      validation_errors_json, validated_at, raw_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      card_status = excluded.card_status,
      source_mode = excluded.source_mode,
      historical_answer = excluded.historical_answer,
      current_answer = excluded.current_answer,
      answer_changed = excluded.answer_changed,
      no_valid_alternative = excluded.no_valid_alternative,
      title = excluded.title,
      question_focus = excluded.question_focus,
      rule_that_solves_this_question = excluded.rule_that_solves_this_question,
      legal_basis = excluded.legal_basis,
      article_excerpt = excluded.article_excerpt,
      applied_explanation = excluded.applied_explanation,
      rule_summary_bullets = excluded.rule_summary_bullets,
      professor_tip = excluded.professor_tip,
      common_traps = excluded.common_traps,
      study_conclusion = excluded.study_conclusion,
      show_warning = excluded.show_warning,
      show_before_answer = excluded.show_before_answer,
      show_after_answer = excluded.show_after_answer,
      source_urls = excluded.source_urls,
      teaching_card_md = excluded.teaching_card_md,
      teaching_card_html = excluded.teaching_card_html,
      generated_by = excluded.generated_by,
      verified_status = excluded.verified_status,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      publish_status = excluded.publish_status,
      answer_for_study = excluded.answer_for_study,
      legal_anchor_quality = excluded.legal_anchor_quality,
      primary_legal_locator = excluded.primary_legal_locator,
      primary_exact_excerpt = excluded.primary_exact_excerpt,
      exact_excerpt_source_url = excluded.exact_excerpt_source_url,
      exact_anchor_verified = excluded.exact_anchor_verified,
      exact_anchor_review_status = excluded.exact_anchor_review_status,
      issue_mapping_json = excluded.issue_mapping_json,
      why_correct_json = excluded.why_correct_json,
      why_wrong_json = excluded.why_wrong_json,
      should_show_as_applied_theory = excluded.should_show_as_applied_theory,
      validation_errors_json = excluded.validation_errors_json,
      validated_at = excluded.validated_at,
      raw_json = excluded.raw_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    Number(normalized.question_id),
    normalized.card_status,
    normalized.source_mode,
    normalized.historical_answer || null,
    normalized.current_answer || null,
    nullableBool(normalized.answer_changed),
    bool(normalized.no_valid_alternative),
    normalized.title,
    normalized.question_focus,
    normalized.rule_that_solves_this_question,
    normalized.legal_basis,
    normalized.article_excerpt || null,
    normalized.applied_explanation,
    json(normalized.rule_summary_bullets),
    normalized.professor_tip || '',
    json(normalized.common_traps),
    normalized.study_conclusion,
    normalized.show_warning || null,
    bool(normalized.show_before_answer),
    normalized.show_after_answer === false ? bool(false) : bool(true),
    json(normalized.source_urls),
    normalized.teaching_card_md || null,
    normalized.teaching_card_html || null,
    normalized.generated_by || 'import',
    normalized.verified_status || 'unverified',
    normalized.reviewed_by || null,
    normalized.reviewed_at || null,
    normalized.publish_status || 'draft',
    normalized.answer_for_study || null,
    normalized.legal_anchor_quality || 'missing',
    normalized.primary_legal_locator || null,
    normalized.primary_exact_excerpt || null,
    normalized.exact_excerpt_source_url || null,
    bool(normalized.exact_anchor_verified),
    normalized.exact_anchor_review_status || 'missing',
    json(normalized.issue_mapping_json),
    json(normalized.why_correct_json),
    json(normalized.why_wrong_json),
    bool(normalized.should_show_as_applied_theory),
    json(normalized.validation_errors_json),
    normalized.validated_at || null,
    jsonObject(normalized.raw_json)
  );
  upsertAppliedTheoryAnchors(db, normalized);
}

function upsertAppliedTheoryAnchors(db, item = {}) {
  if (!item.question_id) return;
  const anchors = [
    { ...(item.primary_legal_anchor || {}), anchor_role: 'primary' },
    ...(item.secondary_legal_anchors || []).map((anchor) => ({ ...anchor, anchor_role: anchor.excerpt_role || 'supporting' }))
  ].filter((anchor) => anchor.source_key && anchor.legal_locator && anchor.exact_excerpt);
  db.prepare('DELETE FROM question_applied_theory_legal_anchors WHERE question_id = ?').run(Number(item.question_id));
  for (const anchor of anchors) {
    db.prepare(`
      INSERT INTO question_applied_theory_legal_anchors (
        question_id, card_id, anchor_role, source_key, source_title, source_url,
        legal_locator, exact_excerpt, segment_id, applies_to_question_json,
        applies_to_alternatives_json, anchor_status, verification_method,
        verified_by, verified_at, updated_at
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      Number(item.question_id),
      anchor.anchor_role || 'primary',
      anchor.source_key,
      anchor.source_title || '',
      anchor.source_url || '',
      anchor.legal_locator,
      anchor.exact_excerpt,
      anchor.segment_id || null,
      JSON.stringify(anchor.applies_to_question_json || []),
      JSON.stringify(anchor.applies_to_alternatives_json || []),
      anchor.anchor_status || 'verified',
      anchor.verification_method || 'exact_anchor_v6',
      anchor.verified_by || 'import_exact_v6',
      anchor.verified_at || null
    );
  }
}

export function upsertAppliedTheoryJob(db, item = {}) {
  const payload = JSON.stringify(item);
  db.prepare(`
    INSERT INTO question_applied_theory_generation_jobs (
      question_id, priority, generation_policy, job_payload, status, updated_at
    )
    VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    ON CONFLICT(question_id, generation_policy) DO UPDATE SET
      priority = excluded.priority,
      job_payload = excluded.job_payload,
      status = CASE
        WHEN question_applied_theory_generation_jobs.status IN ('generated', 'imported') THEN question_applied_theory_generation_jobs.status
        ELSE 'pending'
      END,
      error = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    Number(item.question_id),
    Number(item.priority || 100),
    item.generation_policy || item.policy || 'question_applied_theory_v5',
    payload
  );
}
