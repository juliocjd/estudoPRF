import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const db = new DatabaseSync(dbPath);

try {
  ensureFlowTables(db);
  const report = buildReport(db);
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}

function buildReport(database) {
  const flow = database.prepare('SELECT * FROM study_flow_state WHERE id = 1').get() || null;
  const lastOpen = flow?.last_open_question_id
    ? getQuestionSummary(database, Number(flow.last_open_question_id))
    : null;
  const lastAnswered = flow?.last_answered_question_id
    ? getQuestionSummary(database, Number(flow.last_answered_question_id))
    : null;
  const lastOpenAnsweredAfterOpen = flow?.last_open_question_id
    ? wasQuestionAnsweredAfter(database, Number(flow.last_open_question_id), flow.last_opened_at)
    : false;
  const servedRecent = database.prepare(`
    SELECT question_id, mode, source, reason, served_at
    FROM study_served_questions
    WHERE served_at >= datetime('now', '-10 minutes')
    ORDER BY served_at DESC
    LIMIT 20
  `).all();
  const answeredRecent = database.prepare(`
    SELECT question_id, answer_letter, expected_answer, is_correct, confidence, answered_at
    FROM study_answers
    WHERE answered_at >= datetime('now', '-30 minutes')
    ORDER BY answered_at DESC, id DESC
    LIMIT 20
  `).all();
  const next = getNextRecommendation(database);

  return {
    generatedAt: new Date().toISOString(),
    dbPath,
    flowState: flow,
    lastOpen,
    lastAnswered,
    lastOpenAnsweredAfterOpen,
    resumeDecision: decideResume(flow, lastOpenAnsweredAfterOpen, next),
    nextRecommendation: next,
    servedLast10Minutes: servedRecent,
    answeredLast30Minutes: answeredRecent
  };
}

function decideResume(flow, lastOpenAnsweredAfterOpen, next) {
  if (flow?.last_open_question_id && !lastOpenAnsweredAfterOpen) {
    return {
      reason: 'resume_unanswered_open_question',
      questionId: Number(flow.last_open_question_id),
      message: 'Retomaria a ultima questao aberta e ainda nao respondida.'
    };
  }
  if (next?.questionId) {
    return {
      reason: flow?.last_answered_question_id ? 'last_answered_skipped' : 'next_adaptive',
      questionId: next.questionId,
      message: 'Abriria a proxima recomendada pelo fluxo adaptativo.'
    };
  }
  return {
    reason: 'no_question_available',
    questionId: null,
    message: 'Nenhuma questao disponivel.'
  };
}

function getNextRecommendation(database) {
  const bestAnswer = bestAnswerSql('q', 'c');
  const row = database.prepare(`
    SELECT
      q.id_question AS questionId,
      q.materia,
      q.assunto,
      COALESCE(qm.mastery_score, 0) AS mastery,
      qm.next_due_at,
      last_answer.is_correct AS last_result,
      CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 1 ELSE 0 END AS recent_wrong,
      CASE WHEN answers.question_id IS NULL THEN 1 ELSE 0 END AS never_answered,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      CASE WHEN ${bestAnswer} != '' THEN 1 ELSE 0 END AS has_answer,
      CASE WHEN qcm.role = 'representative' THEN 1 ELSE 0 END AS representative,
      qc.id AS cluster_id,
      qc.size AS cluster_size
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN (
      SELECT question_id, MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    ) answers ON answers.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = answers.last_id
    LEFT JOIN question_cluster_members qcm ON qcm.question_id = q.id_question AND qcm.role = 'representative'
    LEFT JOIN question_clusters qc ON qc.id = qcm.cluster_id AND qc.status = 'active'
    WHERE COALESCE(q.anulada, 0) = 0
      AND ${bestAnswer} != ''
      AND (
        NOT EXISTS (
          SELECT 1 FROM study_answers sa_recent
          WHERE sa_recent.question_id = q.id_question
            AND sa_recent.answered_at >= datetime('now', '-30 minutes')
        )
        OR qm.next_due_at <= CURRENT_TIMESTAMP
      )
      AND NOT EXISTS (
        SELECT 1 FROM study_served_questions ss_recent
        WHERE ss_recent.question_id = q.id_question
          AND ss_recent.served_at >= datetime('now', '-10 minutes')
      )
    ORDER BY
      CASE WHEN qm.next_due_at <= CURRENT_TIMESTAMP THEN 150 ELSE 0 END
      + CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 130 ELSE 0 END
      + CASE WHEN answers.question_id IS NULL THEN 90 ELSE 0 END
      + CASE WHEN COALESCE(qm.mastery_score, 0) < 0.35 THEN 80 ELSE 0 END
      + CASE WHEN qcm.role = 'representative' THEN 50 ELSE 0 END
      + CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 35 ELSE 0 END
      + CASE WHEN ${bestAnswer} != '' THEN 35 ELSE 0 END DESC,
      q.materia,
      q.assunto,
      q.id_question
    LIMIT 1
  `).get();
  if (!row) return null;
  return {
    ...row,
    reason: buildReason(row)
  };
}

function buildReason(row) {
  const reasons = [];
  if (row.next_due_at && row.next_due_at <= nowSql()) reasons.push('revisao_vencida');
  if (Number(row.recent_wrong)) reasons.push('erro_recente');
  if (Number(row.never_answered)) reasons.push('nunca_resolvida');
  if (Number(row.mastery || 0) < 0.35) reasons.push('baixo_dominio');
  if (Number(row.representative)) reasons.push('representante');
  if (Number(row.has_comment)) reasons.push('tem_comentario');
  if (Number(row.has_answer)) reasons.push('tem_gabarito');
  return reasons;
}

function getQuestionSummary(database, questionId) {
  const row = database.prepare(`
    SELECT id_question AS questionId, materia, assunto, banca, concurso_ano AS ano, anulada, desatualizada
    FROM questions
    WHERE id_question = ?
  `).get(questionId);
  if (!row) return null;
  const lastAnswer = database.prepare(`
    SELECT answer_letter, expected_answer, is_correct, confidence, answered_at
    FROM study_answers
    WHERE question_id = ?
    ORDER BY answered_at DESC, id DESC
    LIMIT 1
  `).get(questionId) || null;
  return { ...row, lastAnswer };
}

function wasQuestionAnsweredAfter(database, questionId, openedAt) {
  if (!openedAt) return false;
  return Boolean(database.prepare(`
    SELECT 1 AS n
    FROM study_answers
    WHERE question_id = ?
      AND answered_at >= ?
    LIMIT 1
  `).get(questionId, openedAt));
}

function ensureFlowTables(database) {
  database.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_study_served_questions_question
      ON study_served_questions(question_id, served_at);
  `);
}

function bestAnswerSql(questionAlias, commentAlias) {
  return `COALESCE(NULLIF(${questionAlias}.official_answer, ''), NULLIF((
    SELECT nq.answer
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), '')`;
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
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
