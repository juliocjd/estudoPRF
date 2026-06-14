#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
const dbClient = args.client || process.env.DB_CLIENT || '';
const apply = Boolean(args.apply);
const dryRun = !apply || Boolean(args['dry-run']);
const { db, client } = openStudyDatabase({ dbPath, databaseUrl, client: dbClient });

try {
  const report = repairStudyScoringV10(db, { apply, dryRun, client });
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close?.();
}

function repairStudyScoringV10(database, options = {}) {
  const report = {
    client: options.client,
    mode: options.apply ? 'apply' : 'dry-run',
    outdatedAttempts: 0,
    repairedCurrentLaw: 0,
    repairedNonScoring: 0,
    invalidCurrentLawAnswer: 0,
    blockedQuestionIds: 0,
    mastery: {
      questionRows: 0,
      subjectRows: 0,
      clusterRows: 0
    },
    examples: []
  };

  if (!tableExists(database, 'study_answers') || !tableExists(database, 'questions')) {
    report.error = 'Tabelas study_answers/questions ausentes.';
    return report;
  }

  if (options.apply) {
    ensureStudyAnswerRepairColumns(database);
  }

  const hasCurrentLaw = tableExists(database, 'question_current_law_answers');
  const attempts = database.prepare(`
    SELECT
      sa.id,
      sa.question_id,
      sa.answer_letter,
      sa.answer_text,
      sa.expected_answer,
      sa.is_correct,
      q.type_question,
      q.anulada,
      q.desatualizada,
      ${hasCurrentLaw ? 'qcla.current_law_status, qcla.can_auto_score_current_law, qcla.current_answer' : "NULL AS current_law_status, NULL AS can_auto_score_current_law, NULL AS current_answer"}
    FROM study_answers sa
    JOIN questions q ON q.id_question = sa.question_id
    ${hasCurrentLaw ? 'LEFT JOIN question_current_law_answers qcla ON qcla.question_id = sa.question_id' : ''}
    WHERE COALESCE(q.desatualizada, 0) = 1
    ORDER BY sa.id
  `).all();

  report.outdatedAttempts = attempts.length;
  const alternativesByQuestion = new Map();
  const updates = [];
  const blockedQuestionIds = new Set();

  for (const attempt of attempts) {
    const alternatives = getAlternatives(database, alternativesByQuestion, attempt.question_id);
    const status = attempt.current_law_status || 'needs_audit';
    const canCurrentLawScore = status === 'verified'
      && truthy(attempt.can_auto_score_current_law)
      && String(attempt.current_answer || '').trim();
    let update;

    if (canCurrentLawScore) {
      const normalized = normalizeExpectedAnswerForScoring(attempt, alternatives, attempt.current_answer);
      if (normalized.answer && !Number(attempt.anulada || 0)) {
        const isCorrect = matchesExpectedAnswer(attempt, alternatives, normalized.answer) ? 1 : 0;
        update = {
          id: attempt.id,
          questionId: attempt.question_id,
          expectedAnswer: normalized.answer,
          isCorrect,
          correctionMode: 'current_law',
          expectedAnswerSource: 'current_law_verified',
          nonScoringReason: '',
          currentLawStatus: status,
          scoringVersion: 'v10_repaired_current_law'
        };
        report.repairedCurrentLaw += 1;
      } else {
        update = nonScoringUpdate(attempt, 'invalid_current_law_answer', status);
        report.invalidCurrentLawAnswer += 1;
      }
    } else {
      const reason = status === 'no_valid_alternative'
        ? 'no_valid_alternative'
        : status === 'discard'
          ? 'discard'
          : 'needs_audit';
      update = nonScoringUpdate(attempt, reason, status);
      blockedQuestionIds.add(Number(attempt.question_id));
      report.repairedNonScoring += 1;
    }

    updates.push(update);
    if (report.examples.length < 20 && changed(attempt, update)) {
      report.examples.push({
        answerId: Number(attempt.id),
        questionId: Number(attempt.question_id),
        before: {
          expectedAnswer: attempt.expected_answer || '',
          isCorrect: attempt.is_correct
        },
        after: {
          expectedAnswer: update.expectedAnswer,
          isCorrect: update.isCorrect,
          mode: update.correctionMode,
          reason: update.nonScoringReason
        }
      });
    }
  }

  report.blockedQuestionIds = blockedQuestionIds.size;

  if (!options.apply) {
    return report;
  }

  database.exec('BEGIN');
  try {
    const updateStatement = database.prepare(`
      UPDATE study_answers
      SET
        expected_answer = ?,
        is_correct = ?,
        correction_mode = ?,
        expected_answer_source = ?,
        non_scoring_reason = ?,
        current_law_status_at_answer = ?,
        scoring_version = ?
      WHERE id = ?
    `);
    for (const item of updates) {
      updateStatement.run(
        item.expectedAnswer,
        item.isCorrect,
        item.correctionMode,
        item.expectedAnswerSource,
        item.nonScoringReason,
        item.currentLawStatus,
        item.scoringVersion,
        item.id
      );
    }
    rebuildMastery(database, report);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return report;
}

function nonScoringUpdate(attempt, reason, status) {
  return {
    id: attempt.id,
    questionId: attempt.question_id,
    expectedAnswer: '',
    isCorrect: null,
    correctionMode: 'non_scoring',
    expectedAnswerSource: '',
    nonScoringReason: reason,
    currentLawStatus: status || reason,
    scoringVersion: 'v10_repaired_non_scoring'
  };
}

function rebuildMastery(database, report) {
  if (tableExists(database, 'question_mastery')) {
    database.exec('DELETE FROM question_mastery');
    const rows = database.prepare(`
      SELECT
        sa.question_id,
        sa.is_correct,
        sa.confidence,
        sa.error_type,
        sa.answered_at,
        sa.id
      FROM study_answers sa
      WHERE sa.is_correct IS NOT NULL
      ORDER BY sa.question_id, sa.answered_at, sa.id
    `).all();
    const grouped = groupBy(rows, (row) => row.question_id);
    const insert = database.prepare(`
      INSERT INTO question_mastery (
        question_id, attempts, correct_count, wrong_count, correct_streak, wrong_streak,
        last_result, last_confidence, last_error_type, last_seen_at, next_due_at,
        mastery_score, difficulty, stability, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const [questionId, attempts] of grouped.entries()) {
      const aggregate = aggregateAttempts(attempts);
      insert.run(
        questionId,
        aggregate.attempts,
        aggregate.correctCount,
        aggregate.wrongCount,
        aggregate.correctStreak,
        aggregate.wrongStreak,
        aggregate.lastResult,
        aggregate.lastConfidence,
        aggregate.lastErrorType,
        aggregate.lastSeenAt,
        aggregate.nextDueAt,
        aggregate.masteryScore,
        aggregate.difficulty,
        aggregate.stability
      );
      report.mastery.questionRows += 1;
    }
  }

  if (tableExists(database, 'subject_mastery')) {
    database.exec('DELETE FROM subject_mastery');
    const rows = database.prepare(`
      SELECT
        COALESCE(q.materia, '') AS materia,
        COALESCE(q.assunto, '') AS assunto,
        sa.is_correct,
        sa.answered_at,
        sa.id
      FROM study_answers sa
      JOIN questions q ON q.id_question = sa.question_id
      WHERE sa.is_correct IS NOT NULL
        AND COALESCE(q.materia, '') != ''
        AND COALESCE(q.assunto, '') != ''
      ORDER BY q.materia, q.assunto, sa.answered_at, sa.id
    `).all();
    const grouped = groupBy(rows, (row) => `${row.materia}\u0000${row.assunto}`);
    const insert = database.prepare(`
      INSERT INTO subject_mastery (
        materia, assunto, attempts, correct_count, wrong_count, last_seen_at,
        next_due_at, mastery_score, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const [key, attempts] of grouped.entries()) {
      const [materia, assunto] = key.split('\u0000');
      const aggregate = aggregateAttempts(attempts);
      insert.run(
        materia,
        assunto,
        aggregate.attempts,
        aggregate.correctCount,
        aggregate.wrongCount,
        aggregate.lastSeenAt,
        aggregate.nextDueAt,
        aggregate.masteryScore
      );
      report.mastery.subjectRows += 1;
    }
  }

  if (tableExists(database, 'cluster_mastery') && tableExists(database, 'question_cluster_members')) {
    database.exec('DELETE FROM cluster_mastery');
    const rows = database.prepare(`
      SELECT
        qcm.cluster_id,
        sa.is_correct,
        sa.confidence,
        sa.answered_at,
        sa.id
      FROM study_answers sa
      JOIN question_cluster_members qcm ON qcm.question_id = sa.question_id
      JOIN question_clusters qc ON qc.id = qcm.cluster_id
      WHERE sa.is_correct IS NOT NULL
        AND COALESCE(qc.status, 'active') = 'active'
      ORDER BY qcm.cluster_id, sa.answered_at, sa.id
    `).all();
    const grouped = groupBy(rows, (row) => row.cluster_id);
    const insert = database.prepare(`
      INSERT INTO cluster_mastery (
        cluster_id, attempts, correct_count, wrong_count, correct_streak, wrong_streak,
        last_result, last_confidence, last_seen_at, next_due_at, mastery_score, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const [clusterId, attempts] of grouped.entries()) {
      const aggregate = aggregateAttempts(attempts);
      insert.run(
        clusterId,
        aggregate.attempts,
        aggregate.correctCount,
        aggregate.wrongCount,
        aggregate.correctStreak,
        aggregate.wrongStreak,
        aggregate.lastResult,
        aggregate.lastConfidence,
        aggregate.lastSeenAt,
        aggregate.nextDueAt,
        aggregate.masteryScore
      );
      report.mastery.clusterRows += 1;
    }
  }
}

function aggregateAttempts(attempts) {
  let correctCount = 0;
  let wrongCount = 0;
  let correctStreak = 0;
  let wrongStreak = 0;
  for (const attempt of attempts) {
    if (Number(attempt.is_correct) === 1) {
      correctCount += 1;
      correctStreak += 1;
      wrongStreak = 0;
    } else {
      wrongCount += 1;
      wrongStreak += 1;
      correctStreak = 0;
    }
  }
  const last = attempts[attempts.length - 1] || {};
  const masteryScore = attempts.length ? round(correctCount / attempts.length, 4) : 0;
  const nextDueAt = Number(last.is_correct) === 1
    ? formatSqlDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    : formatSqlDate(new Date());
  return {
    attempts: attempts.length,
    correctCount,
    wrongCount,
    correctStreak,
    wrongStreak,
    lastResult: last.is_correct ?? null,
    lastConfidence: last.confidence || '',
    lastErrorType: last.error_type || '',
    lastSeenAt: last.answered_at || formatSqlDate(new Date()),
    nextDueAt,
    masteryScore,
    difficulty: round(1 - masteryScore, 4),
    stability: attempts.length
  };
}

function getAlternatives(database, cache, questionId) {
  const key = Number(questionId);
  if (!cache.has(key)) {
    cache.set(key, database.prepare(`
      SELECT letter, text
      FROM alternatives
      WHERE question_id = ?
      ORDER BY position
    `).all(questionId));
  }
  return cache.get(key);
}

function normalizeExpectedAnswerForScoring(question, alternatives = [], rawExpected = '') {
  const normalized = normalizeAnswer(rawExpected);
  if (!normalized) return { answer: '', reason: 'missing_answer' };

  const type = String(question?.type_question || '').toUpperCase();
  if (type === 'CERTO_ERRADO') {
    if (normalized === 'CERTO' || normalized === 'ERRADO') return { answer: normalized, reason: '' };
    if (normalized === 'C') return { answer: 'CERTO', reason: '' };
    if (normalized === 'E') return { answer: 'ERRADO', reason: '' };
    const alternative = alternatives.find((item) => normalizeAnswer(item.letter) === normalized);
    const alternativeText = normalizeAnswer(alternative?.text || '');
    if (alternativeText === 'CERTO' || alternativeText === 'ERRADO') return { answer: alternativeText, reason: '' };
    return { answer: '', reason: 'invalid_true_false_answer' };
  }

  if (/^[A-E]$/.test(normalized)) {
    return alternatives.length && !alternatives.some((item) => normalizeAnswer(item.letter) === normalized)
      ? { answer: '', reason: 'answer_alternative_not_found' }
      : { answer: normalized, reason: '' };
  }
  const alternative = alternatives.find((item) => normalizeAnswer(item.text) === normalized);
  return alternative
    ? { answer: normalizeAnswer(alternative.letter), reason: '' }
    : { answer: '', reason: 'invalid_multiple_choice_answer' };
}

function matchesExpectedAnswer(attempt, alternatives, expected) {
  const expectedAnswer = normalizeAnswer(expected);
  const letter = normalizeAnswer(attempt.answer_letter);
  const text = normalizeAnswer(attempt.answer_text);
  const alternative = alternatives.find((item) => normalizeAnswer(item.letter) === letter);
  const alternativeText = normalizeAnswer(alternative?.text || text);
  if (/^[A-E]$/.test(expectedAnswer)) {
    return expectedAnswer === letter;
  }
  if (expectedAnswer === 'CERTO' || expectedAnswer === 'ERRADO') {
    return expectedAnswer === alternativeText
      || (expectedAnswer === 'CERTO' && letter === 'C')
      || (expectedAnswer === 'ERRADO' && letter === 'E');
  }
  return expectedAnswer === letter
    || expectedAnswer === text
    || expectedAnswer === alternativeText;
}

function changed(before, after) {
  return normalizeAnswer(before.expected_answer) !== normalizeAnswer(after.expectedAnswer)
    || nullableNumber(before.is_correct) !== nullableNumber(after.isCorrect);
}

function ensureStudyAnswerRepairColumns(database) {
  const columns = new Set(database.prepare('PRAGMA table_info(study_answers)').all().map((column) => column.name));
  const wanted = [
    ['correction_mode', 'TEXT'],
    ['expected_answer_source', 'TEXT'],
    ['non_scoring_reason', 'TEXT'],
    ['current_law_status_at_answer', 'TEXT'],
    ['scoring_version', 'TEXT']
  ];
  for (const [name, definition] of wanted) {
    if (!columns.has(name)) database.exec(`ALTER TABLE study_answers ADD COLUMN ${name} ${definition}`);
  }
}

function tableExists(database, tableName) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function groupBy(rows, getKey) {
  const grouped = new Map();
  for (const row of rows) {
    const key = getKey(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function normalizeAnswer(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function truthy(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function formatSqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
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
