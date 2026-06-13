import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from './db/open-study-database.mjs';
import { safeJsonParse } from './normative-teaching-utils.mjs';

const CURRENT_FILE = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public', 'study');
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.pdf', 'application/pdf']
]);
const PRF_BLOCK_TARGETS = new Map([
  ['bloco_1', 45.83],
  ['bloco_2', 25],
  ['bloco_3', 29.17]
]);
const ADAPTIVE_ANSWER_COOLDOWN_MINUTES = 30;
const ADAPTIVE_SERVED_COOLDOWN_MINUTES = 10;
const SCORING_VERSION = 'scoring-v9-current-law-canonical';
const configuredStudyTimeMaxAttemptMinutes = Number(process.env.STUDY_TIME_MAX_ATTEMPT_MINUTES || 30);
const STUDY_TIME_MAX_ATTEMPT_MINUTES = Number.isFinite(configuredStudyTimeMaxAttemptMinutes)
  ? Math.max(1, configuredStudyTimeMaxAttemptMinutes)
  : 30;
const STUDY_TIME_MAX_ATTEMPT_MS = STUDY_TIME_MAX_ATTEMPT_MINUTES * 60 * 1000;
const STUDY_TIME_ZONE = process.env.STUDY_TIME_ZONE || 'America/Sao_Paulo';
const THEORY_DIRECTORY_MIN_SCORE = 0.3;
const THEORY_PAGE_MIN_SCORE = 0.12;
const THEORY_CONTENT_FALLBACK_MIN_SCORE = 0.18;
const THEORY_SEARCH_STOPWORDS = new Set([
  'acerca', 'acima', 'agora', 'ainda', 'alem', 'algo', 'algum', 'alguma', 'algumas', 'alguns',
  'ante', 'apos', 'aquele', 'aquela', 'aquelas', 'aqueles', 'assim', 'cada', 'caso', 'com',
  'como', 'contra', 'cujo', 'cujos', 'dado', 'dada', 'das', 'de', 'dele', 'dela', 'desde',
  'desse', 'dessa', 'deste', 'desta', 'disso', 'disto', 'dos', 'durante', 'ela', 'elas',
  'ele', 'eles', 'entre', 'essa', 'esse', 'esta', 'estao', 'este', 'estes', 'foi', 'foram',
  'item', 'itens', 'julgue', 'mais', 'mas', 'mesmo', 'mesma', 'nas', 'nesse', 'nessa',
  'neste', 'nesta', 'nos', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'pois', 'por',
  'porque', 'qual', 'quando', 'quanto', 'que', 'quem', 'sao', 'seja', 'ser', 'sobre',
  'sua', 'suas', 'tais', 'tambem', 'tem', 'tendo', 'todo', 'toda', 'todos', 'todas',
  'uma', 'umas', 'uns', 'verifique', 'voce'
]);

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig(args.config);
const dbPath = path.resolve(ROOT_DIR, args.db || config.prf?.questionsDb || 'questoes-prf.sqlite');
const assetsDir = path.resolve(ROOT_DIR, args.assets || config.prf?.assetsDir || 'assets');
const pdfsDir = path.resolve(ROOT_DIR, args.pdfs || config.outputDir || 'pdfs');
const port = Number(args.port || 4173);
const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
const dbClient = args['db-client'] || process.env.DB_CLIENT || '';

const { db, client: activeDbClient } = openStudyDatabase({ dbPath, databaseUrl, client: dbClient });
if (activeDbClient === 'sqlite') {
  initStudySchema(db);
}
ensureStudyTimeColumns(db);
initHistoricalCommentEditSchema(db);
initQuestionStudyStatusSchema(db);
initTheoryPagesSchema(db);
initNormativeTeachingStudentEditsSchema(db);
initQuestionCurrentLawAnswersSchema(db, activeDbClient);
initLegalKnowledgeSchema(db, activeDbClient);
initQuestionAppliedTheorySchema(db, activeDbClient);

export async function handleStudyRequest(request, response) {
  try {
    await routeRequest(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || 'Erro interno' });
  }
}

const isCliRun = process.argv[1] && path.resolve(process.argv[1]) === CURRENT_FILE;

if (isCliRun) {
  const server = http.createServer(handleStudyRequest);

  server.listen(port, '127.0.0.1', () => {
    console.log(`Site de estudo: http://127.0.0.1:${port}`);
    console.log(activeDbClient === 'postgres' ? 'Banco: Postgres (DATABASE_URL)' : `Banco: ${dbPath}`);
  });

  process.on('SIGINT', () => {
    db.close();
    server.close(() => process.exit(0));
  });
}

async function routeRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);

  if (url.pathname === '/api/stats' && request.method === 'GET') {
    sendJson(response, 200, getStats());
    return;
  }

  if (url.pathname === '/api/study-time/daily' && request.method === 'GET') {
    sendJson(response, 200, getStudyTimeDaily(url.searchParams));
    return;
  }

  if (url.pathname === '/api/normative-updates' && request.method === 'GET') {
    sendJson(response, 200, getNormativeUpdates(url.searchParams));
    return;
  }

  if (url.pathname === '/api/normative-updates/stats' && request.method === 'GET') {
    sendJson(response, 200, getNormativeUpdateStats());
    return;
  }

  if (url.pathname === '/api/normative-teaching-comments/stats' && request.method === 'GET') {
    sendJson(response, 200, getNormativeTeachingStats());
    return;
  }

  if (url.pathname === '/api/normative-teaching-comments' && request.method === 'GET') {
    sendJson(response, 200, getNormativeTeachingComments(url.searchParams));
    return;
  }

  if (url.pathname === '/api/filters' && request.method === 'GET') {
    sendJson(response, 200, getFilters());
    return;
  }

  if (url.pathname === '/api/theory/page' && request.method === 'GET') {
    sendJson(response, 200, getTheoryPage(url.searchParams));
    return;
  }

  if (url.pathname === '/api/exam-profiles' && request.method === 'GET') {
    sendJson(response, 200, getExamProfiles());
    return;
  }

  if (url.pathname === '/api/exam-profiles/active' && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, setActiveExamProfile(body));
    return;
  }

  if (url.pathname === '/api/exam-coverage' && request.method === 'GET') {
    sendJson(response, 200, getExamCoverage(url.searchParams));
    return;
  }

  if (url.pathname === '/api/legal-dashboard' && request.method === 'GET') {
    sendJson(response, 200, getLegalDashboard());
    return;
  }

  if (url.pathname === '/api/legal-search' && request.method === 'GET') {
    sendJson(response, 200, getLegalSearch(url.searchParams));
    return;
  }

  if (url.pathname === '/api/questions' && request.method === 'GET') {
    sendJson(response, 200, getQuestions(url.searchParams));
    return;
  }

  if (url.pathname === '/api/subjects-ranking' && request.method === 'GET') {
    sendJson(response, 200, getSubjectsRanking(url.searchParams));
    return;
  }

  if (url.pathname === '/api/smart-queue' && request.method === 'GET') {
    sendJson(response, 200, getSmartQueue(url.searchParams));
    return;
  }

  if (url.pathname === '/api/smart-queue-v2' && request.method === 'GET') {
    sendJson(response, 200, getSmartQueueV2(url.searchParams));
    return;
  }

  if (url.pathname === '/api/session-plan' && request.method === 'GET') {
    sendJson(response, 200, getSessionPlan(url.searchParams));
    return;
  }

  if (url.pathname === '/api/adaptive-study/next' && request.method === 'GET') {
    sendJson(response, 200, getAdaptiveStudyNext(url.searchParams));
    return;
  }

  if (url.pathname === '/api/adaptive-study/session' && request.method === 'GET') {
    sendJson(response, 200, getAdaptiveStudySession(url.searchParams));
    return;
  }

  if (url.pathname === '/api/adaptive-study/stats' && request.method === 'GET') {
    sendJson(response, 200, getAdaptiveStudyStats());
    return;
  }

  if (url.pathname === '/api/repair-queue' && request.method === 'GET') {
    sendJson(response, 200, await getRepairQueue(url.searchParams));
    return;
  }

  if (url.pathname === '/api/cebraspe-risk-report' && request.method === 'GET') {
    sendJson(response, 200, getCebraspeRiskReport());
    return;
  }

  if (url.pathname === '/api/mastery/subjects' && request.method === 'GET') {
    sendJson(response, 200, getSubjectMasteryRanking(url.searchParams));
    return;
  }

  if (url.pathname === '/api/navigate' && request.method === 'GET') {
    sendJson(response, 200, getNavigationTarget(url.searchParams));
    return;
  }

  if (url.pathname === '/api/study-resume-target' && request.method === 'GET') {
    sendJson(response, 200, getStudyResumeTarget(url.searchParams));
    return;
  }

  if (url.pathname === '/api/study-state' && request.method === 'GET') {
    sendJson(response, 200, getStudyState());
    return;
  }

  if (url.pathname === '/api/study-state' && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveStudyState(body));
    return;
  }

  const questionMatch = url.pathname.match(/^\/api\/questions\/(\d+)$/);
  if (questionMatch && request.method === 'GET') {
    sendJson(response, 200, await getQuestion(Number(questionMatch[1])));
    return;
  }

  const questionLegalStudyMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/legal-study$/);
  if (questionLegalStudyMatch && request.method === 'GET') {
    sendJson(response, 200, getQuestionLegalStudy(Number(questionLegalStudyMatch[1])));
    return;
  }

  const legalCardMatch = url.pathname.match(/^\/api\/legal-cards\/(\d+)$/);
  if (legalCardMatch && request.method === 'GET') {
    sendJson(response, 200, getLegalCard(Number(legalCardMatch[1])));
    return;
  }

  const similarMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/similar$/);
  if (similarMatch && request.method === 'GET') {
    sendJson(response, 200, getQuestionSimilar(Number(similarMatch[1]), url.searchParams));
    return;
  }

  const clusterMatch = url.pathname.match(/^\/api\/question-clusters\/(\d+)$/);
  if (clusterMatch && request.method === 'GET') {
    sendJson(response, 200, getQuestionCluster(Number(clusterMatch[1])));
    return;
  }

  const answerMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/answer$/);
  if (answerMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveAnswer(Number(answerMatch[1]), body));
    return;
  }

  const studyStatusMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/study-status$/);
  if (studyStatusMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveQuestionStudyStatus(Number(studyStatusMatch[1]), body));
    return;
  }

  const historicalCommentMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/historical-comment$/);
  if (historicalCommentMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    const result = saveHistoricalCommentEdit(Number(historicalCommentMatch[1]), body);
    sendJson(response, result?.error ? 400 : 200, result);
    return;
  }

  const normativeReviewMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/normative-review$/);
  if (normativeReviewMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveNormativeReview(Number(normativeReviewMatch[1]), body));
    return;
  }

  const normativeTeachingReviewMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/normative-teaching-review$/);
  if (normativeTeachingReviewMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveNormativeTeachingReview(Number(normativeTeachingReviewMatch[1]), body));
    return;
  }

  const normativeTeachingEditMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/normative-teaching-edit$/);
  if (normativeTeachingEditMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveNormativeTeachingStudentEdit(Number(normativeTeachingEditMatch[1]), body));
    return;
  }

  const currentLawAnswerEditMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/current-law-answer$/);
  if (currentLawAnswerEditMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    const result = saveCurrentLawAnswerEdit(Number(currentLawAnswerEditMatch[1]), body);
    sendJson(response, result?.error ? 400 : 200, result);
    return;
  }

  if (url.pathname === '/api/exam-simulations/start' && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, startExamSimulation(body));
    return;
  }

  const simulationAnswerMatch = url.pathname.match(/^\/api\/exam-simulations\/([^/]+)\/answer$/);
  if (simulationAnswerMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveExamSimulationAnswer(simulationAnswerMatch[1], body));
    return;
  }

  const simulationFinishMatch = url.pathname.match(/^\/api\/exam-simulations\/([^/]+)\/finish$/);
  if (simulationFinishMatch && request.method === 'POST') {
    sendJson(response, 200, finishExamSimulation(simulationFinishMatch[1]));
    return;
  }

  const eventMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/event$/);
  if (eventMatch && request.method === 'POST') {
    const body = await readJsonBody(request);
    sendJson(response, 200, saveQuestionEvent(Number(eventMatch[1]), body));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    await serveFile(response, assetsDir, url.pathname.replace(/^\/assets\//, ''));
    return;
  }

  if (url.pathname.startsWith('/pdfs/')) {
    await serveFile(response, pdfsDir, url.pathname.replace(/^\/pdfs\//, ''));
    return;
  }

  const staticPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  await serveFile(response, PUBLIC_DIR, staticPath);
}

function getStats() {
  const attempts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
      SUM(CASE WHEN is_correct = 1 AND confidence = 'guess' THEN 1 ELSE 0 END) AS correct_guess,
      SUM(CASE WHEN is_correct = 1 AND confidence = 'doubt' THEN 1 ELSE 0 END) AS correct_doubt
    FROM study_answers
  `).get();
  const errorsByType = db.prepare(`
    SELECT COALESCE(NULLIF(error_type, ''), 'sem_tipo') AS type, COUNT(*) AS total
    FROM study_answers
    WHERE is_correct = 0
    GROUP BY COALESCE(NULLIF(error_type, ''), 'sem_tipo')
    ORDER BY total DESC
  `).all();
  const masteryByMatter = db.prepare(`
    SELECT q.materia, ROUND(CAST(AVG(qm.mastery_score) AS NUMERIC), 4) AS mastery_score
    FROM question_mastery qm
    JOIN questions q ON q.id_question = qm.question_id
    WHERE COALESCE(q.materia, '') != ''
    GROUP BY q.materia
    ORDER BY mastery_score ASC, q.materia
  `).all();
  const studyTime = getStudyTimeSummary();

  return {
    questions: db.prepare('SELECT COUNT(*) AS n FROM questions').get().n,
    comments: db.prepare(`
      SELECT COUNT(*) AS n
      FROM comments
      WHERE COALESCE(html_local, html, text, '') != ''
        AND COALESCE(source_type, '') != 'ai'
    `).get().n,
    aiComments: db.prepare(`
      SELECT COUNT(*) AS n
      FROM comments
      WHERE COALESCE(html_local, html, text, '') != ''
        AND COALESCE(source_type, '') = 'ai'
    `).get().n,
    aiLocalComments: db.prepare(`
      SELECT COUNT(*) AS n
      FROM comments
      WHERE COALESCE(html_local, html, text, '') != ''
        AND COALESCE(source_type, '') = 'ai'
    `).get().n,
    questionsWithTecAiFlag: getQuestionsAiFlagCount(),
    answered: db.prepare('SELECT COUNT(DISTINCT question_id) AS n FROM study_answers').get().n,
    matters: db.prepare("SELECT COUNT(DISTINCT materia) AS n FROM questions WHERE COALESCE(materia, '') != ''").get().n,
    subjects: db.prepare("SELECT COUNT(DISTINCT assunto) AS n FROM questions WHERE COALESCE(assunto, '') != ''").get().n,
    knownAnswers: db.prepare(`
      SELECT COUNT(*) AS n
      FROM questions q
      LEFT JOIN comments c ON c.question_id = q.id_question
      WHERE ${currentLawStudyAnswerSql('q', 'c')} != ''
    `).get().n,
    readyToStudy: db.prepare(`
      SELECT COUNT(*) AS n
      FROM questions q
      LEFT JOIN comments c ON c.question_id = q.id_question
      LEFT JOIN question_study_status qss ON qss.question_id = q.id_question
      WHERE ${currentLawStudyAnswerSql('q', 'c')} != ''
        AND COALESCE(q.anulada, 0) = 0
        AND COALESCE(qss.status, 'active') != 'excluded'
    `).get().n,
    normativeUpdates: getNormativeUpdateCount(),
    currentLawAnswers: getCurrentLawAnswerStats(),
    normativeTeachingComments: getNormativeTeachingReadyCount(),
    normativeTeachingTotal: getNormativeTeachingCount(),
    normativeTeachingPending: getNormativeTeachingManualReviewCount(),
    normativeTeachingDiscard: getNormativeTeachingDiscardCount(),
    outOfStudyQuestions: getQuestionStudyStatusCount('excluded'),
    reviewLaterQuestions: getQuestionStudyStatusCount('review_later'),
    missingAnswers: db.prepare(`
      SELECT COUNT(*) AS n
      FROM questions q
      LEFT JOIN comments c ON c.question_id = q.id_question
      WHERE ${currentLawStudyAnswerSql('q', 'c')} = ''
    `).get().n,
    dueReviews: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_mastery
      WHERE next_due_at IS NOT NULL
        AND CAST(next_due_at AS TEXT) != ''
        AND next_due_at <= datetime('now')
    `).get().n,
    repairQuestions: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_mastery
      WHERE COALESCE(wrong_streak, 0) > 0
        OR COALESCE(mastery_score, 0) < 0.35
    `).get().n,
    averageMastery: db.prepare('SELECT ROUND(CAST(COALESCE(AVG(mastery_score), 0) AS NUMERIC), 4) AS n FROM question_mastery').get().n,
    attempts: attempts.total || 0,
    correctAttempts: attempts.correct || 0,
    wrongAttempts: attempts.wrong || 0,
    correctGuessAttempts: attempts.correct_guess || 0,
    correctDoubtAttempts: attempts.correct_doubt || 0,
    studyTime,
    errorsByType,
    masteryByMatter
  };
}

function getStudyTimeDaily(searchParams = new URLSearchParams()) {
  const limit = clamp(Number(searchParams.get('limit') || 30), 1, 366);
  const daily = getStudyTimeDailyRows().slice(0, limit);
  return {
    timeZone: STUDY_TIME_ZONE,
    maxAttemptMinutes: STUDY_TIME_MAX_ATTEMPT_MINUTES,
    daily
  };
}

function getStudyTimeSummary() {
  const rows = getStudyAnswerTimeRows();
  const today = getLocalDateKey(new Date());
  let totalMs = 0;
  let rawTotalMs = 0;
  let todayMs = 0;
  let rawTodayMs = 0;
  let timedAttempts = 0;
  let todayAttempts = 0;
  let cappedAttempts = 0;
  let todayCappedAttempts = 0;

  for (const row of rows) {
    const rawMs = normalizeStoredElapsedMs(row.elapsed_ms);
    if (rawMs <= 0) continue;
    const adjustedMs = normalizeStudyElapsedMs(rawMs);
    const day = getLocalDateKey(row.created_at || row.answered_at);
    timedAttempts += 1;
    rawTotalMs += rawMs;
    totalMs += adjustedMs;
    if (adjustedMs < rawMs) cappedAttempts += 1;
    if (day === today) {
      rawTodayMs += rawMs;
      todayMs += adjustedMs;
      todayAttempts += 1;
      if (adjustedMs < rawMs) todayCappedAttempts += 1;
    }
  }

  return {
    totalMs,
    rawTotalMs,
    todayMs,
    rawTodayMs,
    timedAttempts,
    todayAttempts,
    cappedAttempts,
    todayCappedAttempts,
    maxAttemptMs: STUDY_TIME_MAX_ATTEMPT_MS,
    maxAttemptMinutes: STUDY_TIME_MAX_ATTEMPT_MINUTES,
    timeZone: STUDY_TIME_ZONE
  };
}

function getStudyTimeDailyRows() {
  const byDay = new Map();
  for (const row of getStudyAnswerTimeRows()) {
    const rawMs = normalizeStoredElapsedMs(row.elapsed_ms);
    if (rawMs <= 0) continue;
    const day = getLocalDateKey(row.created_at || row.answered_at);
    if (!day) continue;
    const adjustedMs = normalizeStudyElapsedMs(rawMs);
    const current = byDay.get(day) || {
      day,
      totalMs: 0,
      rawTotalMs: 0,
      attempts: 0,
      cappedAttempts: 0
    };
    current.attempts += 1;
    current.rawTotalMs += rawMs;
    current.totalMs += adjustedMs;
    if (adjustedMs < rawMs) current.cappedAttempts += 1;
    byDay.set(day, current);
  }
  return [...byDay.values()].sort((a, b) => String(b.day).localeCompare(String(a.day)));
}

function getStudyAnswerTimeRows() {
  return db.prepare(`
    SELECT elapsed_ms, created_at, answered_at
    FROM study_answers
    WHERE elapsed_ms IS NOT NULL
      AND elapsed_ms > 0
  `).all();
}

function normalizeStoredElapsedMs(value) {
  const elapsedMs = Number(value);
  return Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.round(elapsedMs) : 0;
}

function normalizeStudyElapsedMs(value) {
  return Math.min(normalizeStoredElapsedMs(value), STUDY_TIME_MAX_ATTEMPT_MS);
}

function getLocalDateKey(value) {
  const date = parseSqlDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function parseSqlDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getFilters() {
  const matters = db.prepare(`
    SELECT materia AS name, COUNT(*) AS count
    FROM questions
    WHERE COALESCE(materia, '') != ''
    GROUP BY materia
    ORDER BY materia
  `).all();

  const subjects = db.prepare(`
    SELECT materia, assunto AS name, COUNT(*) AS count
    FROM questions
    WHERE COALESCE(assunto, '') != ''
    GROUP BY materia, assunto
    ORDER BY materia, assunto
  `).all();

  return { matters, subjects };
}

function getTheoryPage(searchParams) {
  if (!hasTheoryPagesTable()) {
    return { available: false, reason: 'Indice de teoria nao criado.' };
  }

  const pdfPath = normalizePath(searchParams.get('pdfPath') || '');
  const pageNumber = Number(searchParams.get('page') || 0);
  if (!pdfPath || !pageNumber) {
    return { available: false, reason: 'Informe pdfPath e page.' };
  }

  const row = db.prepare(`
    SELECT pdf_path, page_number, page_count, materia, assunto, title, text
    FROM theory_pages
    WHERE pdf_path = ? AND page_number = ?
  `).get(pdfPath, pageNumber);

  if (!row) {
    return { available: false, reason: 'Pagina nao indexada.' };
  }

  return {
    available: true,
    pdfPath: row.pdf_path || '',
    pageNumber: row.page_number || pageNumber,
    pageCount: row.page_count || null,
    materia: row.materia || '',
    assunto: row.assunto || '',
    title: row.title || '',
    text: row.text || ''
  };
}

function hasNormativeUpdateTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_normative_updates'").get());
}

function hasNormativeTeachingTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_normative_teaching_comments'").get());
}

function hasCurrentLawAnswerTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_current_law_answers'").get());
}

function hasQuestionStudyStatusTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_study_status'").get());
}

function hasNormativeTeachingStudentEditsTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_normative_teaching_student_edits'").get());
}

function hasTheoryPagesTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'theory_pages'").get());
}

function hasLegalKnowledgeTables() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legal_topic_cards'").get())
    && Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_legal_links'").get());
}

function hasQuestionAppliedTheoryTable() {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_applied_theory_cards'").get());
}

function getQuestionAppliedTheoryCard(questionId) {
  if (!hasQuestionAppliedTheoryTable()) {
    return { available: false, reason: 'Camada de teoria aplicada ainda nao criada.' };
  }
  const row = db.prepare(`
    SELECT *
    FROM question_applied_theory_cards
    WHERE question_id = ?
    LIMIT 1
  `).get(questionId);
  if (!row) {
    return { available: false, reason: 'Teoria aplicada individual ainda nao disponivel para esta questao.' };
  }
  if (!isExactAppliedTheoryRow(row)) {
    return { available: false, reason: 'Ainda nao ha teoria aplicada validada com dispositivo exato para esta questao.' };
  }
  return {
    available: true,
    questionId: row.question_id,
    cardStatus: row.card_status || '',
    publishStatus: row.publish_status || '',
    sourceMode: row.source_mode || '',
    historicalAnswer: row.historical_answer || '',
    currentAnswer: row.current_answer || '',
    answerForStudy: row.answer_for_study || '',
    answerChanged: row.answer_changed === null || row.answer_changed === undefined ? null : dbBoolean(row.answer_changed),
    noValidAlternative: dbBoolean(row.no_valid_alternative),
    title: row.title || '',
    questionFocus: row.question_focus || '',
    ruleThatSolvesThisQuestion: row.rule_that_solves_this_question || '',
    legalBasis: row.legal_basis || '',
    articleExcerpt: row.article_excerpt || '',
    legalAnchorQuality: row.legal_anchor_quality || '',
    primaryLegalLocator: row.primary_legal_locator || '',
    primaryExactExcerpt: row.primary_exact_excerpt || '',
    exactExcerptSourceUrl: row.exact_excerpt_source_url || '',
    exactAnchorVerified: dbBoolean(row.exact_anchor_verified),
    exactAnchorReviewStatus: row.exact_anchor_review_status || '',
    issueMapping: safeJsonParse(row.issue_mapping_json, []),
    appliedExplanation: row.applied_explanation || '',
    ruleSummaryBullets: safeJsonParse(row.rule_summary_bullets, []),
    professorTip: row.professor_tip || '',
    commonTraps: safeJsonParse(row.common_traps, []),
    studyConclusion: row.study_conclusion || '',
    showWarning: row.show_warning || '',
    showBeforeAnswer: dbBoolean(row.show_before_answer),
    showAfterAnswer: dbBoolean(row.show_after_answer),
    sourceUrls: safeJsonParse(row.source_urls, []),
    teachingCardMd: row.teaching_card_md || '',
    generatedBy: row.generated_by || '',
    verifiedStatus: row.verified_status || ''
  };
}

function isExactAppliedTheoryRow(row = {}) {
  const status = row.publish_status || row.card_status || '';
  if (status !== 'published') return false;
  if (!dbBoolean(row.should_show_as_applied_theory) && !dbBoolean(row.exact_anchor_verified)) return false;
  if (!hasSpecificAppliedTheoryLocator(row.primary_legal_locator || row.legal_basis)) return false;
  if (!String(row.primary_exact_excerpt || row.article_excerpt || '').trim()) return false;
  return true;
}

function hasSpecificAppliedTheoryLocator(locator) {
  const value = String(locator || '').trim();
  if (!value) return false;
  if (/^(Resolução|Resolucao)\s+CONTRAN\s+n[ºo.]?\s*\d+\/\d{4}\.?$/i.test(value)) return false;
  if (/^(CTB|Código de Trânsito Brasileiro)$/i.test(value)) return false;
  return /\b(art\.|artigo|anexo|inciso|al[ií]nea|item|ficha|§)\b/i.test(value);
}

function getQuestionLegalStudy(questionId) {
  if (!hasLegalKnowledgeTables()) {
    return { available: false, reason: 'Camada de teoria rapida ainda nao criada.' };
  }

  const rows = db.prepare(`
    SELECT
      qll.question_id,
      qll.relation_type,
      qll.relevance_score,
      qll.reason,
      qll.source AS link_source,
      qll.display_mode,
      qll.auto_show_as_primary,
      qll.needs_human_review,
      qll.precision_level,
      qll.matched_terms,
      qll.matched_terms_in_statement,
      qll.evidence,
      qll.current_law_status,
      qll.current_law_can_auto_score,
      qll.current_law_answer,
      qll.warning,
      c.id AS card_id,
      c.card_key,
      c.title AS card_title,
      c.materia,
      c.assunto,
      c.microtema,
      c.level,
      c.answer_summary,
      c.rule_summary,
      c.professor_note,
      c.common_traps,
      c.memory_hook,
      c.example_text,
      c.source_refs,
      c.verified_status,
      a.id AS article_id,
      a.article_ref,
      a.heading,
      a.text AS article_text,
      a.excerpt AS article_excerpt,
      s.source_key,
      s.title AS source_title,
      s.url AS source_url,
      s.source_org
    FROM question_legal_links qll
    LEFT JOIN legal_topic_cards c ON c.id = qll.legal_card_id
    LEFT JOIN legal_articles a ON a.id = qll.legal_article_id
    LEFT JOIN legal_sources s ON s.id = a.source_id
    WHERE qll.question_id = ?
      AND qll.source = 'chatgpt_traffic_v4'
    ORDER BY
      CASE
        WHEN qll.display_mode = 'rule_that_solves_or_clarifies_question'
          AND qll.auto_show_as_primary = TRUE
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE) THEN 1
        WHEN qll.display_mode = 'general_orientation_only'
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE) THEN 2
        ELSE 9
      END,
      qll.relevance_score DESC,
      c.verified_status = 'reviewed' DESC,
      c.id
    LIMIT 8
  `).all(questionId);

  const specificRow = rows.find((row) => isSpecificLegalTheoryLink(row));
  const overviewRow = rows.find((row) => isPanoramaLegalTheoryLink(row));
  const primaryRow = specificRow || overviewRow;
  if (!primaryRow?.card_id) {
    return { available: false, reason: 'Teoria rapida ainda nao disponivel para este ponto.' };
  }

  const primaryCard = legalCardPayload(primaryRow, rows);
  const relatedCards = rows
    .filter((row) => row.card_id && row.card_id !== primaryCard.id && (isSpecificLegalTheoryLink(row) || isPanoramaLegalTheoryLink(row)))
    .map((row) => legalCardPayload(row, [row]));

  return {
    available: true,
    mode: primaryCard.displayMode === 'general_orientation_only' ? 'panorama' : 'specific',
    warning: primaryCard.displayMode === 'general_orientation_only'
      ? 'Este e um panorama geral. Ainda nao ha microcard especifico validado para esta questao.'
      : '',
    primaryCard,
    relatedCards,
    officialText: {
      collapsedByDefault: true,
      articles: buildOfficialArticles(rows)
    }
  };
}

function isSpecificLegalTheoryLink(row) {
  return row?.display_mode === 'rule_that_solves_or_clarifies_question'
    && dbBoolean(row.auto_show_as_primary)
    && !dbBoolean(row.needs_human_review);
}

function isPanoramaLegalTheoryLink(row) {
  return row?.display_mode === 'general_orientation_only'
    && !dbBoolean(row.needs_human_review);
}

function getLegalCard(cardId) {
  if (!hasLegalKnowledgeTables()) {
    return { available: false, reason: 'Camada de teoria rapida ainda nao criada.' };
  }
  const rows = db.prepare(`
    SELECT
      c.id AS card_id,
      c.card_key,
      c.title AS card_title,
      c.materia,
      c.assunto,
      c.microtema,
      c.level,
      c.answer_summary,
      c.rule_summary,
      c.professor_note,
      c.common_traps,
      c.memory_hook,
      c.example_text,
      c.source_refs,
      c.verified_status,
      a.id AS article_id,
      a.article_ref,
      a.heading,
      a.text AS article_text,
      a.excerpt AS article_excerpt,
      s.source_key,
      s.title AS source_title,
      s.url AS source_url,
      s.source_org
    FROM legal_topic_cards c
    LEFT JOIN question_legal_links qll ON qll.legal_card_id = c.id
    LEFT JOIN legal_articles a ON a.id = qll.legal_article_id
    LEFT JOIN legal_sources s ON s.id = a.source_id
    WHERE c.id = ?
    ORDER BY a.article_order, a.id
    LIMIT 8
  `).all(cardId);
  if (!rows.length) {
    return { available: false, reason: 'Card nao encontrado.' };
  }
  return {
    available: true,
    primaryCard: legalCardPayload(rows[0], rows),
    officialText: {
      collapsedByDefault: true,
      articles: buildOfficialArticles(rows)
    }
  };
}

function getLegalSearch(searchParams) {
  if (!hasLegalKnowledgeTables()) {
    return { available: false, rows: [] };
  }
  const query = String(searchParams.get('q') || '').trim();
  if (query.length < 2) {
    return { available: true, rows: [] };
  }
  const like = `%${query}%`;
  const rows = db.prepare(`
    SELECT id, card_key, title, materia, assunto, microtema, answer_summary, verified_status
    FROM legal_topic_cards
    WHERE title LIKE ?
       OR materia LIKE ?
       OR assunto LIKE ?
       OR microtema LIKE ?
       OR answer_summary LIKE ?
       OR rule_summary LIKE ?
       OR common_traps LIKE ?
    ORDER BY verified_status = 'reviewed' DESC, title
    LIMIT 30
  `).all(like, like, like, like, like, like, like);

  return {
    available: true,
    rows: rows.map((row) => ({
      id: row.id,
      title: row.title || '',
      materia: row.materia || '',
      assunto: row.assunto || '',
      microtema: row.microtema || '',
      answerSummary: row.answer_summary || '',
      verifiedStatus: row.verified_status || ''
    }))
  };
}

function getLegalDashboard() {
  if (!hasLegalKnowledgeTables()) {
    return { available: false, reason: 'Camada de teoria rapida ainda nao criada.' };
  }

  const totalQuestions = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE COALESCE(anulada, 0) = 0').get().n || 0;
  const legalSource = 'chatgpt_traffic_v4';
  const withQuickTheory = db.prepare(`
    SELECT COUNT(DISTINCT qll.question_id) AS n
    FROM question_legal_links qll
    JOIN questions q ON q.id_question = qll.question_id
    WHERE COALESCE(q.anulada, 0) = 0
      AND qll.source = ?
      AND (
        (
          qll.display_mode = 'rule_that_solves_or_clarifies_question'
          AND qll.auto_show_as_primary = TRUE
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE)
        )
        OR (
          qll.display_mode = 'general_orientation_only'
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE)
        )
      )
  `).get(legalSource).n || 0;
  const stats = {
    sources: db.prepare('SELECT COUNT(*) AS n FROM legal_sources').get().n || 0,
    articles: db.prepare('SELECT COUNT(*) AS n FROM legal_articles').get().n || 0,
    cards: db.prepare('SELECT COUNT(*) AS n FROM legal_topic_cards').get().n || 0,
    links: db.prepare('SELECT COUNT(*) AS n FROM question_legal_links WHERE source = ?').get(legalSource).n || 0,
    totalQuestions,
    withQuickTheory,
    withoutQuickTheory: Math.max(0, totalQuestions - withQuickTheory),
    specificQuickTheory: db.prepare(`
      SELECT COUNT(DISTINCT question_id) AS n
      FROM question_legal_links
      WHERE source = ?
        AND display_mode = 'rule_that_solves_or_clarifies_question'
        AND auto_show_as_primary = TRUE
        AND (needs_human_review IS NULL OR needs_human_review = FALSE)
    `).get(legalSource).n || 0,
    panoramaOnly: db.prepare(`
      SELECT COUNT(DISTINCT question_id) AS n
      FROM question_legal_links
      WHERE source = ?
        AND display_mode = 'general_orientation_only'
        AND (needs_human_review IS NULL OR needs_human_review = FALSE)
    `).get(legalSource).n || 0,
    needsTheoryReview: db.prepare(`
      SELECT COUNT(DISTINCT question_id) AS n
      FROM question_legal_links
      WHERE source = ?
        AND (needs_human_review = TRUE OR display_mode = 'suggested_card_needs_review')
    `).get(legalSource).n || 0,
    currentLawReferenceOnly: db.prepare(`
      SELECT COUNT(DISTINCT question_id) AS n
      FROM question_legal_links
      WHERE source = ?
        AND display_mode = 'theory_reference_only__not_solution_current_law'
    `).get(legalSource).n || 0,
    pendingReview: db.prepare(`
      SELECT COUNT(*) AS n
      FROM legal_topic_cards
      WHERE COALESCE(verified_status, '') NOT IN ('reviewed', 'verified')
    `).get().n || 0,
    importErrors: db.prepare(`
      SELECT COUNT(*) AS n
      FROM legal_sources
      WHERE COALESCE(import_error, '') != ''
    `).get().n || 0
  };

  const bySubject = db.prepare(`
    SELECT
      q.materia,
      q.assunto,
      COUNT(DISTINCT q.id_question) AS total,
      COUNT(DISTINCT qll.question_id) AS covered,
      SUM(CASE WHEN sa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_attempts
    FROM questions q
    LEFT JOIN question_legal_links qll ON qll.question_id = q.id_question
      AND qll.source = ?
      AND (
        (
          qll.display_mode = 'rule_that_solves_or_clarifies_question'
          AND qll.auto_show_as_primary = TRUE
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE)
        )
        OR (
          qll.display_mode = 'general_orientation_only'
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE)
        )
      )
    LEFT JOIN study_answers sa ON sa.question_id = q.id_question
    WHERE COALESCE(q.anulada, 0) = 0
    GROUP BY q.materia, q.assunto
    ORDER BY (COUNT(*) - COUNT(DISTINCT qll.question_id)) DESC, wrong_attempts DESC
    LIMIT 40
  `).all(legalSource);

  const sourcesWithErrors = db.prepare(`
    SELECT source_key, title, import_error
    FROM legal_sources
    WHERE COALESCE(import_error, '') != ''
    ORDER BY updated_at DESC
    LIMIT 20
  `).all();

  return {
    available: true,
    stats,
    bySubject: bySubject.map((row) => ({
      materia: row.materia || '',
      assunto: row.assunto || '',
      total: row.total || 0,
      covered: row.covered || 0,
      missing: Math.max(0, Number(row.total || 0) - Number(row.covered || 0)),
      wrongAttempts: row.wrong_attempts || 0
    })),
    sourcesWithErrors: sourcesWithErrors.map((row) => ({
      sourceKey: row.source_key || '',
      title: row.title || '',
      error: row.import_error || ''
    }))
  };
}

function legalCardPayload(row, sourceRows = []) {
  const displayMode = row.display_mode || '';
  return {
    id: row.card_id,
    cardKey: row.card_key || '',
    title: row.card_title || '',
    materia: row.materia || '',
    assunto: row.assunto || '',
    microtema: row.microtema || '',
    level: row.level || 'beginner',
    answerSummary: row.answer_summary || '',
    ruleSummary: row.rule_summary || '',
    professorNote: row.professor_note || '',
    commonTraps: row.common_traps || '',
    memoryHook: row.memory_hook || '',
    exampleText: row.example_text || '',
    bullets: buildLegalBullets(row),
    sourceRefs: buildSourceRefs(row, sourceRows),
    verifiedStatus: row.verified_status || '',
    displayMode,
    displayKind: displayMode === 'general_orientation_only' ? 'panorama' : 'specific',
    autoShowAsPrimary: dbBoolean(row.auto_show_as_primary),
    needsHumanReview: dbBoolean(row.needs_human_review),
    precisionLevel: row.precision_level || '',
    matchedTerms: safeJsonParse(row.matched_terms, []),
    matchedTermsInStatement: safeJsonParse(row.matched_terms_in_statement, []),
    linkReason: row.reason || '',
    linkWarning: row.warning || ''
  };
}

function buildLegalBullets(row) {
  const chunks = [
    row.answer_summary || '',
    row.rule_summary || '',
    row.common_traps || ''
  ].flatMap((text) => String(text || '').split(/;|\.\s+(?=[A-ZÁÉÍÓÚÀÃÕÇ])/));
  const seen = new Set();
  return chunks
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12)
    .filter((item) => {
      const key = normalizeTheoryTitle(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function buildSourceRefs(row, sourceRows = []) {
  const refs = safeJsonParse(row.source_refs, []);
  const explicitRefs = Array.isArray(refs) ? refs : [];
  const articleRefs = buildOfficialArticles(sourceRows);
  if (articleRefs.length) {
    return articleRefs.map((item) => ({
      label: item.label,
      excerpt: item.excerpt,
      sourceUrl: item.sourceUrl
    }));
  }
  return explicitRefs.map((item) => ({
    label: item.label || [item.source_key, item.article_ref].filter(Boolean).join(', '),
    excerpt: item.excerpt || '',
    sourceUrl: item.source_url || item.sourceUrl || ''
  }));
}

function buildOfficialArticles(rows = []) {
  const seen = new Set();
  const articles = [];
  for (const row of rows) {
    if (!row.article_id && !row.article_ref) continue;
    const key = `${row.source_key || ''}:${row.article_ref || ''}:${row.article_id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    articles.push({
      id: row.article_id || null,
      label: [row.source_title || '', row.article_ref || ''].filter(Boolean).join(', '),
      articleRef: row.article_ref || '',
      heading: row.heading || '',
      text: row.article_text || '',
      excerpt: row.article_excerpt || trimPreview(row.article_text || '', 420),
      sourceTitle: row.source_title || '',
      sourceUrl: row.source_url || ''
    });
  }
  return articles;
}

function columnExists(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function tableColumnExists(tableName, columnName) {
  try {
    return columnExists(tableName, columnName);
  } catch {
    return false;
  }
}

function qntcColumn(columnName, fallback = "''") {
  return tableColumnExists('question_normative_teaching_comments', columnName)
    ? columnName
    : `${fallback} AS ${columnName}`;
}

function getQuestionsAiFlagCount() {
  if (!columnExists('questions', 'possui_comentario_ia')) {
    return 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions
    WHERE COALESCE(possui_comentario_ia, 0) = 1
  `).get().n || 0;
}

function getNormativeUpdateCount() {
  if (!hasNormativeUpdateTable()) {
    return 0;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM question_normative_updates').get().n || 0;
}

function getNormativeTeachingCount() {
  if (!hasNormativeTeachingTable()) {
    return 0;
  }
  return db.prepare('SELECT COUNT(*) AS n FROM question_normative_teaching_comments').get().n || 0;
}

function getNormativeTeachingReadyCount() {
  if (!hasNormativeTeachingTable()) {
    return 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_teaching_comments
    WHERE status = 'ready'
  `).get().n || 0;
}

function getNormativeTeachingManualReviewCount() {
  if (!hasNormativeTeachingTable()) {
    return 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_teaching_comments
    WHERE status = 'needs_manual_review'
      OR review_status = 'needs_manual_review'
      OR answer_policy = 'not_assertive_manual_review'
  `).get().n || 0;
}

function getNormativeTeachingDiscardCount() {
  if (!hasNormativeTeachingTable()) {
    return 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_teaching_comments
    WHERE status = 'discard'
      OR answer_policy = 'discard_original'
  `).get().n || 0;
}

function getNormativeTeachingPendingCount() {
  if (!hasNormativeUpdateTable()) {
    return hasNormativeTeachingTable()
      ? db.prepare("SELECT COUNT(*) AS n FROM question_normative_teaching_comments WHERE COALESCE(status, '') != 'ready'").get().n || 0
      : 0;
  }
  if (!hasNormativeTeachingTable()) {
    return getNormativeUpdateCount();
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_updates qnu
    LEFT JOIN question_normative_teaching_comments qntc ON qntc.question_id = qnu.question_id
    WHERE qntc.question_id IS NULL
      OR COALESCE(qntc.status, '') != 'ready'
  `).get().n || 0;
}

function getQuestionStudyStatusCount(status) {
  if (!hasQuestionStudyStatusTable()) {
    return 0;
  }
  return db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_study_status
    WHERE status = ?
  `).get(status).n || 0;
}

function getNormativeUpdateStats() {
  if (!hasNormativeUpdateTable()) {
    return {
      exists: false,
      total: 0,
      byRecommendation: [],
      bySecurity: [],
      byChangedAnswer: [],
      changedAnswer: 0,
      manualReview: 0,
      discardable: 0,
      adaptable: 0,
      reviewed: 0,
      teachingComments: 0,
      teachingMissing: 0,
      teachingCurrentAnswer: 0,
      teachingManualReview: 0,
      teachingDiscard: 0,
      teachingChangedAnswer: 0,
      teachingReady: 0,
      teachingPendingReview: 0
    };
  }
  const hasTeaching = hasNormativeTeachingTable();

  return {
    exists: true,
    total: db.prepare('SELECT COUNT(*) AS n FROM question_normative_updates').get().n || 0,
    byRecommendation: normativeGroupedCounts('recomendacao'),
    bySecurity: normativeGroupedCounts('nivel_seguranca'),
    byChangedAnswer: normativeGroupedCounts('mudanca_gabarito'),
    changedAnswer: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates qnu
      WHERE LOWER(COALESCE(qnu.mudanca_gabarito, '')) LIKE 'sim%'
    `).get().n || 0,
    manualReview: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates qnu
      WHERE ${normativeManualCondition('qnu')}
    `).get().n || 0,
    discardable: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates qnu
      WHERE ${normativeDiscardCondition('qnu')}
    `).get().n || 0,
    adaptable: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates qnu
      WHERE LOWER(COALESCE(qnu.recomendacao, '')) LIKE '%adaptar%'
    `).get().n || 0,
    reviewed: db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates
      WHERE COALESCE(review_status, 'pending') != 'pending'
    `).get().n || 0,
    teachingComments: hasTeaching ? db.prepare('SELECT COUNT(*) AS n FROM question_normative_teaching_comments').get().n || 0 : 0,
    teachingMissing: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_updates qnu
      LEFT JOIN question_normative_teaching_comments qntc ON qntc.question_id = qnu.question_id
      WHERE qntc.question_id IS NULL
    `).get().n || 0 : db.prepare('SELECT COUNT(*) AS n FROM question_normative_updates').get().n || 0,
    teachingCurrentAnswer: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_teaching_comments
      WHERE COALESCE(current_answer, '') != ''
    `).get().n || 0 : 0,
    teachingReady: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_teaching_comments
      WHERE status = 'ready'
    `).get().n || 0 : 0,
    teachingPendingReview: getNormativeTeachingPendingCount(),
    teachingManualReview: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_teaching_comments
      WHERE status = 'needs_manual_review'
        OR review_status = 'needs_manual_review'
        OR answer_policy = 'not_assertive_manual_review'
    `).get().n || 0 : 0,
    teachingDiscard: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_teaching_comments
      WHERE status = 'discard'
        OR answer_policy = 'discard_original'
    `).get().n || 0 : 0,
    teachingChangedAnswer: hasTeaching ? db.prepare(`
      SELECT COUNT(*) AS n
      FROM question_normative_teaching_comments
      WHERE (current_answer IS NOT NULL AND historical_answer IS NOT NULL AND current_answer != historical_answer)
        OR LOWER(COALESCE(changed_answer, '')) LIKE 'sim%'
    `).get().n || 0 : 0
  };
}

function getNormativeTeachingStats() {
  if (!hasNormativeTeachingTable()) {
    return {
      exists: false,
      total: 0,
      ready: 0,
      needsManualReview: 0,
      discard: 0,
      pending: getNormativeUpdateCount(),
      withCurrentAnswer: 0,
      withoutSafeAnswer: 0
    };
  }

  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status = 'needs_manual_review' THEN 1 ELSE 0 END) AS needs_manual_review,
      SUM(CASE WHEN status = 'discard' THEN 1 ELSE 0 END) AS discard,
      SUM(CASE WHEN COALESCE(current_answer, '') != '' THEN 1 ELSE 0 END) AS with_current_answer,
      SUM(CASE WHEN COALESCE(current_answer, '') = '' OR status != 'ready' THEN 1 ELSE 0 END) AS without_safe_answer
    FROM question_normative_teaching_comments
  `).get();

  return {
    exists: true,
    total: row.total || 0,
    ready: row.ready || 0,
    needsManualReview: row.needs_manual_review || 0,
    discard: row.discard || 0,
    pending: getNormativeTeachingPendingCount(),
    withCurrentAnswer: row.with_current_answer || 0,
    withoutSafeAnswer: row.without_safe_answer || 0
  };
}

function getCurrentLawAnswerStats() {
  if (!hasCurrentLawAnswerTable()) {
    return {
      exists: false,
      total: 0,
      verified: 0,
      needsAudit: 0,
      noValidAlternative: 0,
      discard: 0
    };
  }

  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN current_law_status = 'verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN current_law_status = 'needs_audit' THEN 1 ELSE 0 END) AS needs_audit,
      SUM(CASE WHEN current_law_status = 'no_valid_alternative' THEN 1 ELSE 0 END) AS no_valid_alternative,
      SUM(CASE WHEN current_law_status = 'discard' THEN 1 ELSE 0 END) AS discard
    FROM question_current_law_answers
  `).get();

  return {
    exists: true,
    total: row.total || 0,
    verified: row.verified || 0,
    needsAudit: row.needs_audit || 0,
    noValidAlternative: row.no_valid_alternative || 0,
    discard: row.discard || 0
  };
}

function getNormativeTeachingComments(searchParams) {
  if (!hasNormativeTeachingTable()) {
    return { total: 0, limit: 50, offset: 0, rows: [] };
  }

  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 80)));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const where = [];
  const values = [];
  const status = String(searchParams.get('status') || '').trim();
  const answerPolicy = String(searchParams.get('answerPolicy') || '').trim();
  const q = String(searchParams.get('q') || '').trim();

  if (status) {
    where.push('qntc.status = ?');
    values.push(status);
  }
  if (answerPolicy) {
    where.push('qntc.answer_policy = ?');
    values.push(answerPolicy);
  }
  if (q) {
    where.push(`(
      CAST(qntc.question_id AS TEXT) LIKE ?
      OR q.materia LIKE ?
      OR q.assunto LIKE ?
      OR qntc.title LIKE ?
      OR qntc.teaching_comment_md LIKE ?
    )`);
    values.push(...Array(5).fill(`%${q}%`));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_teaching_comments qntc
    LEFT JOIN questions q ON q.id_question = qntc.question_id
    ${whereSql}
  `).get(...values).n || 0;

  const rows = db.prepare(`
    SELECT
      qntc.question_id,
      qntc.status,
      qntc.answer_policy,
      qntc.current_answer,
      qntc.current_answer_confidence,
      qntc.historical_answer,
      qntc.safety_level,
      qntc.recommendation,
      qntc.review_status,
      qntc.title,
      q.materia,
      q.assunto,
      q.type_question
    FROM question_normative_teaching_comments qntc
    LEFT JOIN questions q ON q.id_question = qntc.question_id
    ${whereSql}
    ORDER BY
      CASE qntc.status
        WHEN 'needs_manual_review' THEN 0
        WHEN 'discard' THEN 1
        ELSE 2
      END,
      q.materia,
      q.assunto,
      qntc.question_id
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset).map((row) => ({
    questionId: row.question_id,
    status: row.status || '',
    answerPolicy: row.answer_policy || '',
    currentAnswer: row.current_answer || '',
    currentAnswerConfidence: Number(row.current_answer_confidence || 0),
    historicalAnswer: row.historical_answer || '',
    safetyLevel: row.safety_level || '',
    recommendation: row.recommendation || '',
    reviewStatus: row.review_status || '',
    title: row.title || '',
    materia: row.materia || '',
    assunto: row.assunto || '',
    tipo: row.type_question || ''
  }));

  return { total, limit, offset, rows };
}

function normativeGroupedCounts(column) {
  return db.prepare(`
    SELECT COALESCE(NULLIF(${column}, ''), 'sem valor') AS value, COUNT(*) AS total
    FROM question_normative_updates
    GROUP BY COALESCE(NULLIF(${column}, ''), 'sem valor')
    ORDER BY total DESC, value
  `).all();
}

function getNormativeUpdates(searchParams) {
  if (!hasNormativeUpdateTable()) {
    return { total: 0, limit: 50, offset: 0, rows: [] };
  }

  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 80)));
  const offset = Math.max(0, Number(searchParams.get('offset') || 0));
  const where = [];
  const values = [];
  const q = String(searchParams.get('q') || '').trim();
  const materia = String(searchParams.get('materia') || '').trim();
  const excludedMaterias = getExcludedMaterias(searchParams);
  const assunto = String(searchParams.get('assunto') || '').trim();
  const recomendacao = String(searchParams.get('recomendacao') || '').trim();
  const nivelSeguranca = String(searchParams.get('nivelSeguranca') || '').trim();
  const mudancaGabarito = String(searchParams.get('mudancaGabarito') || '').trim();
  const reviewStatus = String(searchParams.get('reviewStatus') || '').trim();
  const teachingStatus = String(searchParams.get('teachingStatus') || '').trim();
  const hasTeaching = hasNormativeTeachingTable();

  if (q) {
    where.push(`(
      CAST(q.id_question AS TEXT) LIKE ?
      OR q.statement_text LIKE ?
      OR q.materia LIKE ?
      OR q.assunto LIKE ?
      OR qnu.por_que_desatualizada LIKE ?
      OR qnu.fundamento_juridico_atual LIKE ?
    )`);
    values.push(...Array(6).fill(`%${q}%`));
  }
  if (materia) {
    where.push('q.materia = ?');
    values.push(materia);
  }
  applyExcludedMateriasFilter(where, values, excludedMaterias);
  if (assunto) {
    where.push('q.assunto = ?');
    values.push(assunto);
  }
  if (recomendacao) {
    where.push('qnu.recomendacao = ?');
    values.push(recomendacao);
  }
  if (nivelSeguranca) {
    where.push('qnu.nivel_seguranca = ?');
    values.push(nivelSeguranca);
  }
  if (mudancaGabarito) {
    where.push('qnu.mudanca_gabarito = ?');
    values.push(mudancaGabarito);
  }
  if (reviewStatus) {
    where.push("COALESCE(qnu.review_status, 'pending') = ?");
    values.push(reviewStatus);
  }
  if (teachingStatus) {
    if (!hasTeaching) {
      where.push(teachingStatus === 'missing' ? '1 = 1' : '1 = 0');
    } else if (teachingStatus === 'missing') {
      where.push('qntc.question_id IS NULL');
    } else if (teachingStatus === 'exists') {
      where.push('qntc.question_id IS NOT NULL');
    } else if (teachingStatus === 'current_missing') {
      where.push("qntc.question_id IS NOT NULL AND COALESCE(qntc.current_answer, '') = ''");
    } else if (teachingStatus === 'invalid') {
      where.push(`qntc.question_id IS NOT NULL AND (
        (q.type_question = 'CERTO_ERRADO' AND qntc.current_answer IN ('A', 'B', 'C', 'D', 'E'))
        OR (q.type_question != 'CERTO_ERRADO' AND qntc.current_answer IN ('CERTO', 'ERRADO'))
      )`);
    } else if (teachingStatus === 'manual_review') {
      where.push("(qntc.status = 'needs_manual_review' OR qntc.review_status = 'needs_manual_review' OR qntc.answer_policy = 'not_assertive_manual_review')");
    } else if (teachingStatus === 'discard') {
      where.push("(qntc.status = 'discard' OR qntc.answer_policy = 'discard_original')");
    } else if (teachingStatus === 'changed') {
      where.push("((qntc.current_answer IS NOT NULL AND qntc.historical_answer IS NOT NULL AND qntc.current_answer != qntc.historical_answer) OR LOWER(COALESCE(qntc.changed_answer, '')) LIKE 'sim%')");
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const teachingJoin = hasTeaching
    ? 'LEFT JOIN question_normative_teaching_comments qntc ON qntc.question_id = qnu.question_id'
    : '';
  const teachingSelect = hasTeaching
    ? `CASE WHEN qntc.question_id IS NULL THEN 0 ELSE 1 END AS teaching_exists,
      qntc.current_answer AS teaching_current_answer,
      CASE
        WHEN qntc.current_answer IS NOT NULL AND qntc.historical_answer IS NOT NULL AND qntc.current_answer != qntc.historical_answer THEN 1
        WHEN LOWER(COALESCE(qntc.changed_answer, '')) LIKE 'sim%' THEN 1
        ELSE 0
      END AS teaching_answer_changed,
      qntc.status AS teaching_status,
      qntc.answer_policy AS teaching_answer_policy,
      qntc.adaptation_status AS teaching_adaptation_status,
      qntc.study_recommendation AS teaching_study_recommendation,
      qntc.safety_level AS teaching_safety_level,
      qntc.review_status AS teaching_review_status`
    : `0 AS teaching_exists,
      '' AS teaching_current_answer,
      0 AS teaching_answer_changed,
      '' AS teaching_answer_policy,
      '' AS teaching_adaptation_status,
      '' AS teaching_study_recommendation,
      '' AS teaching_safety_level,
      '' AS teaching_review_status`;
  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_normative_updates qnu
    JOIN questions q ON q.id_question = qnu.question_id
    ${teachingJoin}
    ${whereSql}
  `).get(...values).n || 0;

  const rows = db.prepare(`
    SELECT
      qnu.question_id,
      q.materia,
      q.assunto,
      q.banca,
      q.concurso_ano AS ano,
      qnu.gabarito_banco,
      qnu.gabarito_atualizado_provavel,
      qnu.mudanca_gabarito,
      qnu.recomendacao,
      qnu.nivel_seguranca,
      COALESCE(qnu.review_status, 'pending') AS review_status,
      qnu.por_que_desatualizada,
      qnu.fundamento_juridico_atual,
      qnu.nova_regra_estado_atual,
      q.statement_text,
      q.type_question,
      ${teachingSelect}
    FROM question_normative_updates qnu
    JOIN questions q ON q.id_question = qnu.question_id
    ${teachingJoin}
    ${whereSql}
    ORDER BY
      CASE WHEN ${normativeManualCondition('qnu')} THEN 0 ELSE 1 END,
      CASE WHEN LOWER(COALESCE(qnu.mudanca_gabarito, '')) LIKE 'sim%' THEN 0 ELSE 1 END,
      q.materia,
      q.assunto,
      qnu.question_id
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset).map((row) => ({
    questionId: row.question_id,
    materia: row.materia || '',
    assunto: row.assunto || '',
    banca: row.banca || '',
    ano: row.ano || '',
    tipo: row.type_question || '',
    statementPreview: trimPreview(row.statement_text, 180),
    gabaritoBanco: row.gabarito_banco || '',
    gabaritoAtualizadoProvavel: row.gabarito_atualizado_provavel || '',
    mudancaGabarito: row.mudanca_gabarito || '',
    recomendacao: row.recomendacao || '',
    nivelSeguranca: row.nivel_seguranca || '',
    reviewStatus: row.review_status || 'pending',
    porQueDesatualizada: row.por_que_desatualizada || '',
    fundamentoJuridicoAtual: row.fundamento_juridico_atual || '',
    novaRegraEstadoAtual: row.nova_regra_estado_atual || '',
    teachingExists: Boolean(row.teaching_exists),
    teachingStatus: row.teaching_status || '',
    teachingCurrentAnswer: row.teaching_current_answer || '',
    teachingAnswerChanged: Boolean(row.teaching_answer_changed),
    teachingAnswerPolicy: row.teaching_answer_policy || '',
    teachingAdaptationStatus: row.teaching_adaptation_status || '',
    teachingStudyRecommendation: row.teaching_study_recommendation || '',
    teachingSafetyLevel: row.teaching_safety_level || '',
    teachingReviewStatus: row.teaching_review_status || ''
  }));

  return { total, limit, offset, rows };
}

function getExamProfiles() {
  const profiles = db.prepare(`
    SELECT id, name, description, source, source_url, is_active, updated_at
    FROM exam_profiles
    ORDER BY is_active DESC, name
  `).all();
  return {
    active: profiles.find((profile) => Number(profile.is_active))?.id || '',
    profiles
  };
}

function setActiveExamProfile(body) {
  const profileId = String(body?.profile || body?.id || '').trim();
  if (!profileId || !db.prepare('SELECT 1 FROM exam_profiles WHERE id = ?').get(profileId)) {
    return { error: 'Perfil invalido' };
  }

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE exam_profiles SET is_active = 0, updated_at = CURRENT_TIMESTAMP').run();
    db.prepare('UPDATE exam_profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(profileId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getExamProfiles();
}

function getExamCoverage(searchParams) {
  const profileId = resolveProfileId(searchParams.get('profile'));
  const rows = getExamCoverageRows(profileId);
  const alerts = buildExamCoverageAlerts(rows);
  return {
    profile: getExamProfile(profileId),
    rows,
    alerts
  };
}

function getExamCoverageRows(profileId) {
  const totalValidMapped = db.prepare(`
    SELECT COUNT(DISTINCT q.id_question) AS n
    FROM question_exam_subjects qes
    JOIN questions q ON q.id_question = qes.question_id
    WHERE qes.profile_id = ?
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
  `).get(profileId).n;

  return db.prepare(`
    SELECT
      w.subject_key,
      w.subject_label,
      w.block_key,
      w.block_label,
      COALESCE(w.expected_items, 0) AS expected_items,
      COALESCE(w.expected_pct, 0) AS expected_pct,
      COUNT(DISTINCT q.id_question) AS local_questions,
      COUNT(DISTINCT CASE
        WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0
        THEN q.id_question END
      ) AS valid_questions,
      COUNT(DISTINCT CASE
        WHEN COALESCE(q.anulada, 0) = 0
          AND COALESCE(q.desatualizada, 0) = 0
          AND ${currentLawStudyAnswerSql('q', 'c')} != ''
        THEN q.id_question END
      ) AS valid_with_answer,
      COUNT(DISTINCT CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN q.id_question END) AS comments,
      COUNT(sa.id) AS attempts,
      ROUND(CAST(COALESCE(AVG(qm.mastery_score), 0) AS NUMERIC), 4) AS mastery_score,
      SUM(CASE WHEN qm.next_due_at IS NOT NULL AND CAST(qm.next_due_at AS TEXT) != '' AND qm.next_due_at <= datetime('now') THEN 1 ELSE 0 END) AS due_reviews,
      COUNT(DISTINCT CASE WHEN COALESCE(q.anulada, 0) = 1 THEN q.id_question END) AS canceled,
      COUNT(DISTINCT CASE WHEN COALESCE(q.desatualizada, 0) = 1 THEN q.id_question END) AS outdated
    FROM exam_subject_weights w
    LEFT JOIN question_exam_subjects qes
      ON qes.profile_id = w.profile_id
      AND qes.subject_key = w.subject_key
    LEFT JOIN questions q ON q.id_question = qes.question_id
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN study_answers sa ON sa.question_id = q.id_question
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    WHERE w.profile_id = ?
    GROUP BY
      w.subject_key,
      w.subject_label,
      w.block_key,
      w.block_label,
      w.expected_items,
      w.expected_pct
    ORDER BY w.expected_pct DESC, w.subject_label
  `).all(profileId).map((row) => enrichExamCoverageRow(row, totalValidMapped));
}

function enrichExamCoverageRow(row, totalValidMapped) {
  const valid = Number(row.valid_questions || 0);
  const localPct = totalValidMapped ? round((valid / totalValidMapped) * 100, 2) : 0;
  const expectedPct = Number(row.expected_pct || 0);
  const answerCoverage = valid ? round((Number(row.valid_with_answer || 0) / valid) * 100, 2) : 0;
  const masteryScore = Number(row.mastery_score || 0);
  const coverageGap = round(Math.max(0, expectedPct - localPct), 2);
  const excessCoverage = round(Math.max(0, localPct - expectedPct), 2);
  const outdatedPct = Number(row.local_questions || 0)
    ? round((Number(row.outdated || 0) / Number(row.local_questions || 0)) * 100, 2)
    : 0;
  const noAnswerGap = Math.max(0, 80 - answerCoverage);
  const strategicPriority = round(
    expectedPct + coverageGap * 2 + (1 - masteryScore) * expectedPct + noAnswerGap * 0.25 + Number(row.due_reviews || 0) * 0.5 + outdatedPct * 0.2,
    2
  );

  return {
    ...row,
    local_pct: localPct,
    answer_coverage_pct: answerCoverage,
    coverage_gap_pct: coverageGap,
    excess_coverage_pct: excessCoverage,
    outdated_pct: outdatedPct,
    strategic_priority: strategicPriority,
    status: examCoverageStatus(expectedPct, valid, excessCoverage, answerCoverage, masteryScore)
  };
}

function examCoverageStatus(expectedPct, valid, excessCoverage, answerCoverage, masteryScore) {
  if (expectedPct >= 8 && masteryScore < 0.35) return 'alta_prioridade';
  if (expectedPct >= 5 && valid < 50) return 'sub-representada';
  if (expectedPct >= 5 && answerCoverage < 65) return 'sem_gabarito_suficiente';
  if (excessCoverage >= 5 && expectedPct <= 6) return 'super-representada';
  return 'ok';
}

function buildExamCoverageAlerts(rows) {
  const alerts = [];
  for (const row of rows) {
    if (row.excess_coverage_pct >= 5 && Number(row.expected_pct) <= 6) {
      alerts.push(`Atencao: ${row.subject_label} representa ${row.local_pct}% da base valida mapeada, mas pesa ${row.expected_pct}% no perfil.`);
    }
    if (Number(row.expected_pct) >= 8 && Number(row.valid_questions) < 80) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo e poucas questoes validas mapeadas.`);
    }
    if (Number(row.expected_pct) >= 8 && Number(row.answer_coverage_pct) < 70) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo, mas pouco gabarito aproveitavel.`);
    }
    if (Number(row.expected_pct) >= 8 && Number(row.attempts) === 0) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo e ainda nao recebeu tentativas.`);
    }
  }
  return alerts;
}

function getQuestions(searchParams) {
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(5, Number(searchParams.get('limit') || 20)));
  let currentPage = page;
  const { whereSql, values } = buildQuestionWhere(searchParams);

  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${whereSql}
  `).get(...values).n;

  const targetId = Number(searchParams.get('targetId') || 0);
  let targetIndex = -1;
  if (targetId) {
    const ids = getQuestionIds(searchParams);
    targetIndex = ids.indexOf(targetId);
    if (targetIndex >= 0) {
      currentPage = Math.floor(targetIndex / limit) + 1;
    }
  }

  const offset = (currentPage - 1) * limit;
  const rows = db.prepare(`
    SELECT
      q.id_question AS id,
      q.statement_text,
      q.type_question,
      q.format_question,
      q.banca,
      q.cargo,
      q.concurso_ano,
      q.materia,
      q.assunto,
      q.anulada,
      q.desatualizada,
      ${currentLawStudyAnswerSql('q', 'c')} AS extracted_answer,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      CASE WHEN a.question_id IS NULL THEN 0 ELSE 1 END AS answered
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN (
      SELECT question_id, MAX(answered_at) AS answered_at
      FROM study_answers
      GROUP BY question_id
    ) a ON a.question_id = q.id_question
    ${whereSql}
    ORDER BY COALESCE(q.materia, ''), COALESCE(q.assunto, ''), q.id_question
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset);

  return {
    page: currentPage,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    targetIndex: targetIndex >= 0 ? targetIndex % limit : -1,
    rows: rows.map((row) => ({
      ...row,
      statement_preview: trimPreview(row.statement_text, 220)
    }))
  };
}

function buildQuestionWhere(searchParams, extra = {}) {
  const where = [];
  const values = [];

  const q = String(searchParams.get('q') || '').trim();
  const materia = String(searchParams.get('materia') || '').trim();
  const excludedMaterias = getExcludedMaterias(searchParams, extra);
  const assunto = String(searchParams.get('assunto') || '').trim();
  const commented = searchParams.get('commented') === '1';
  const unanswered = searchParams.get('unanswered') === '1' || extra.unanswered;
  const lastWrong = searchParams.get('lastWrong') === '1' || extra.lastWrong;
  const hideOutdated = searchParams.get('hideOutdated') === '1' || extra.hideOutdated;
  const hideDuplicates = searchParams.get('hideDuplicates') === '1' || extra.hideDuplicates;
  const representative = searchParams.get('representative') === '1' || extra.representative;
  const normative = String(searchParams.get('normative') || extra.normative || '').trim();
  const hideDiscarded = searchParams.get('hideDiscarded') === '1' || extra.hideDiscarded;
  const hideManualReview = searchParams.get('hideManualReview') === '1' || extra.hideManualReview;
  const onlyChangedAnswer = searchParams.get('onlyChangedAnswer') === '1' || extra.onlyChangedAnswer;
  const hideStudyExcluded = searchParams.get('hideStudyExcluded') === '1' || extra.hideStudyExcluded;

  if (q) {
    where.push('(q.statement_text LIKE ? OR q.materia LIKE ? OR q.assunto LIKE ? OR CAST(q.id_question AS TEXT) LIKE ?)');
    values.push(...Array(4).fill(`%${q}%`));
  }
  if (materia) {
    where.push('q.materia = ?');
    values.push(materia);
  }
  applyExcludedMateriasFilter(where, values, excludedMaterias);
  if (assunto) {
    where.push('q.assunto = ?');
    values.push(assunto);
  }
  if (commented) {
    where.push("COALESCE(c.html_local, c.html, c.text, '') != ''");
  }
  if (hideOutdated) {
    where.push('COALESCE(q.desatualizada, 0) = 0');
  }
  if (unanswered) {
    where.push('NOT EXISTS (SELECT 1 FROM study_answers sa WHERE sa.question_id = q.id_question)');
  }
  if (lastWrong) {
    where.push(`EXISTS (
      SELECT 1
      FROM study_answers sa
      WHERE sa.question_id = q.id_question
        AND sa.is_correct = 0
        AND sa.id = (
          SELECT sa2.id
          FROM study_answers sa2
          WHERE sa2.question_id = q.id_question
          ORDER BY sa2.answered_at DESC, sa2.id DESC
          LIMIT 1
        )
    )`);
  }
  if (hideDuplicates) {
    where.push(`q.id_question IN (
      SELECT MIN(qd.id_question)
      FROM questions qd
      GROUP BY ${duplicateKeySql('qd')}
    )`);
  }
  if (representative) {
    where.push(`q.id_question IN (
      SELECT ranked.id_question
      FROM (
        SELECT
          qr.id_question,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(qr.materia, ''), COALESCE(qr.assunto, '')
            ORDER BY
              CASE WHEN COALESCE(qr.desatualizada, 0) = 0 THEN 0 ELSE 1 END,
              CASE WHEN COALESCE(qr.anulada, 0) = 0 THEN 0 ELSE 1 END,
              qr.id_question
          ) AS row_number
        FROM questions qr
        WHERE COALESCE(qr.assunto, '') != ''
      ) ranked
      WHERE ranked.row_number <= 25
    )`);
  }
  if (hideStudyExcluded) {
    applyQuestionStudyStatusFilter(where);
    applyNormativeTeachingDiscardFilter(where);
    applyCurrentLawMainStudyFilter(where);
  }
  applyNormativeQuestionFilters(where, normative, { hideDiscarded, hideManualReview, onlyChangedAnswer });

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    values
  };
}

function getExcludedMaterias(searchParams, extra = {}) {
  const repeated = typeof searchParams.getAll === 'function'
    ? searchParams.getAll('excludeMateria')
    : [];
  const csv = String(searchParams.get('excludeMaterias') || '').split(',');
  const extraValues = Array.isArray(extra.excludeMaterias) ? extra.excludeMaterias : [];
  return [...new Set([...repeated, ...csv, ...extraValues]
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function applyExcludedMateriasFilter(where, values, materias, alias = 'q') {
  if (!materias.length) return;
  where.push(`COALESCE(${alias}.materia, '') NOT IN (${materias.map(() => '?').join(', ')})`);
  values.push(...materias);
}

function applyQuestionStudyStatusFilter(where) {
  if (!hasQuestionStudyStatusTable()) {
    return;
  }
  where.push(`NOT EXISTS (
    SELECT 1
    FROM question_study_status qss
    WHERE qss.question_id = q.id_question
      AND qss.status IN ('excluded', 'review_later')
  )`);
}

function applyNormativeTeachingDiscardFilter(where) {
  if (!hasNormativeTeachingTable()) {
    return;
  }
  where.push(`NOT EXISTS (
    SELECT 1
    FROM question_normative_teaching_comments qntc_excluded
    WHERE qntc_excluded.question_id = q.id_question
      AND (
        qntc_excluded.status = 'discard'
        OR qntc_excluded.answer_policy = 'discard_original'
      )
  )`);
}

function applyCurrentLawMainStudyFilter(where) {
  if (!hasCurrentLawAnswerTable()) {
    where.push('COALESCE(q.desatualizada, 0) = 0');
    return;
  }
  where.push(`(
    COALESCE(q.desatualizada, 0) = 0
    OR EXISTS (
      SELECT 1
      FROM question_current_law_answers qcla_main
      WHERE qcla_main.question_id = q.id_question
        AND qcla_main.current_law_status = 'verified'
        AND qcla_main.can_auto_score_current_law IS TRUE
        AND COALESCE(qcla_main.current_answer, '') != ''
        AND qcla_main.should_discard_from_current_law_study IS NOT TRUE
        AND qcla_main.hide_from_main_study_until_verified IS NOT TRUE
    )
  )`);
}

function applyNormativeQuestionFilters(where, normative, options = {}) {
  const hasTable = hasNormativeUpdateTable();
  const normalized = String(normative || '').trim();
  const hideDiscarded = options.hideDiscarded || normalized === 'hide-discarded';
  const hideManualReview = options.hideManualReview || normalized === 'hide-manual';
  const onlyChangedAnswer = options.onlyChangedAnswer || normalized === 'changed';

  if (!hasTable) {
    if (normalized === 'exists' || normalized === 'safe' || onlyChangedAnswer) {
      where.push('0 = 1');
    }
    return;
  }

  if (normalized === 'exists') {
    where.push('EXISTS (SELECT 1 FROM question_normative_updates qnu WHERE qnu.question_id = q.id_question)');
  }
  if (normalized === 'safe') {
    where.push(`EXISTS (
      SELECT 1
      FROM question_normative_updates qnu
      WHERE qnu.question_id = q.id_question
        AND NOT (${normativeDiscardCondition('qnu')})
        AND NOT (${normativeManualCondition('qnu')})
        AND LOWER(COALESCE(qnu.nivel_seguranca, '')) IN ('alto', 'medio', 'médio')
    )`);
  }
  if (hideDiscarded) {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM question_normative_updates qnu
      WHERE qnu.question_id = q.id_question
        AND (${normativeDiscardCondition('qnu')})
    )`);
  }
  if (hideManualReview) {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM question_normative_updates qnu
      WHERE qnu.question_id = q.id_question
        AND (${normativeManualCondition('qnu')})
    )`);
  }
  if (onlyChangedAnswer) {
    where.push(`EXISTS (
      SELECT 1
      FROM question_normative_updates qnu
      WHERE qnu.question_id = q.id_question
        AND LOWER(COALESCE(qnu.mudanca_gabarito, '')) LIKE 'sim%'
    )`);
  }
}

function normativeDiscardCondition(alias) {
  return `LOWER(COALESCE(${alias}.recomendacao, '')) LIKE '%descartar%'`;
}

function normativeManualCondition(alias) {
  return `(LOWER(COALESCE(${alias}.recomendacao, '')) LIKE '%revisão manual%'
    OR LOWER(COALESCE(${alias}.recomendacao, '')) LIKE '%revisao manual%'
    OR LOWER(COALESCE(${alias}.mudanca_gabarito, '')) LIKE '%revisão manual%'
    OR LOWER(COALESCE(${alias}.mudanca_gabarito, '')) LIKE '%revisao manual%'
    OR LOWER(COALESCE(${alias}.nivel_seguranca, '')) IN ('baixo', 'manual'))`;
}

function duplicateKeySql(alias) {
  return `CASE
    WHEN COALESCE(${alias}.content_hash, '') != '' THEN 'c:' || ${alias}.content_hash
    WHEN COALESCE(${alias}.statement_hash, '') != '' THEN 's:' || ${alias}.statement_hash
    ELSE 'id:' || ${alias}.id_question
  END`;
}

function bestAnswerSql(questionAlias, commentAlias) {
  return `CASE
    WHEN COALESCE(${questionAlias}.desatualizada, 0) = 1 THEN ''
    ELSE COALESCE(NULLIF(${questionAlias}.official_answer, ''), NULLIF((
    SELECT nq.answer
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), NULLIF(${commentAlias}.extracted_answer, ''), '')
  END`;
}

function historicalAnswerSql(questionAlias, commentAlias) {
  return `COALESCE(NULLIF(${questionAlias}.official_answer, ''), NULLIF((
    SELECT nq.answer
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), NULLIF(${commentAlias}.extracted_answer, ''), '')`;
}

function historicalAnswerSourceSql(questionAlias, commentAlias) {
  return `COALESCE(NULLIF(${questionAlias}.official_answer_source, ''), NULLIF((
    SELECT nq.answer_source
    FROM notebook_questions nq
    WHERE nq.question_id = ${questionAlias}.id_question
      AND COALESCE(nq.answer, '') != ''
    ORDER BY nq.notebook_id, nq.position
    LIMIT 1
  ), ''), CASE
    WHEN COALESCE(${commentAlias}.extracted_answer, '') != '' THEN 'comment_extracted'
    ELSE ''
  END)`;
}

function currentLawVerifiedAnswerSql(questionAlias) {
  if (!hasCurrentLawAnswerTable()) {
    return "''";
  }
  return `(
    SELECT qcla_answer.current_answer
    FROM question_current_law_answers qcla_answer
    WHERE qcla_answer.question_id = ${questionAlias}.id_question
      AND qcla_answer.current_law_status = 'verified'
      AND qcla_answer.can_auto_score_current_law IS TRUE
      AND COALESCE(qcla_answer.current_answer, '') != ''
    LIMIT 1
  )`;
}

function currentLawStudyAnswerSql(questionAlias, commentAlias) {
  const historicalAnswerSql = bestAnswerSql(questionAlias, commentAlias);
  return `CASE
    WHEN COALESCE(${questionAlias}.desatualizada, 0) = 1 THEN COALESCE(NULLIF(${currentLawVerifiedAnswerSql(questionAlias)}, ''), '')
    ELSE ${historicalAnswerSql}
  END`;
}

function currentLawQueueSelect(alias = 'qcla') {
  if (!hasCurrentLawAnswerTable()) {
    return `'' AS current_law_status,
      0 AS can_auto_score_current_law,
      '' AS current_answer,
      0 AS should_discard_from_current_law_study,
      0 AS no_valid_alternative`;
  }

  return `COALESCE(${alias}.current_law_status, '') AS current_law_status,
      ${alias}.can_auto_score_current_law AS can_auto_score_current_law,
      COALESCE(${alias}.current_answer, '') AS current_answer,
      ${alias}.should_discard_from_current_law_study AS should_discard_from_current_law_study,
      ${alias}.no_valid_alternative AS no_valid_alternative`;
}

function currentLawQueueJoin(questionAlias = 'q') {
  return hasCurrentLawAnswerTable()
    ? `LEFT JOIN question_current_law_answers qcla ON qcla.question_id = ${questionAlias}.id_question`
    : '';
}

function currentLawVerifiedRowSql(alias = 'qcla') {
  if (!hasCurrentLawAnswerTable()) {
    return '0 = 1';
  }

  return `${alias}.current_law_status = 'verified'
    AND ${alias}.can_auto_score_current_law IS TRUE
    AND COALESCE(${alias}.current_answer, '') != ''
    AND ${alias}.should_discard_from_current_law_study IS NOT TRUE
    AND ${alias}.no_valid_alternative IS NOT TRUE`;
}

function appendWhere(whereSql, condition) {
  if (!condition) {
    return whereSql;
  }
  return whereSql ? `${whereSql} AND ${condition}` : `WHERE ${condition}`;
}

function smartReasons(row) {
  const reasons = [];
  if (isDue(row.next_due_at)) reasons.push('revisao_vencida');
  if (Number(row.recent_wrong)) reasons.push('ultimo_erro');
  if (Number(row.never_answered)) reasons.push('nunca_resolvida');
  if (Number(row.mastery_score || 0) < 0.4) reasons.push('baixa_consolidacao');
  if (Number(row.has_comment)) reasons.push('tem_comentario');
  if (Number(row.has_answer)) reasons.push('tem_gabarito');
  if (Number(row.anulada)) reasons.push('anulada');
  if (Number(row.desatualizada)) {
    reasons.push(isCurrentLawVerifiedRow(row) ? 'lei_atual_verificada' : 'desatualizada');
  }
  if (Number(row.mastery_score || 0) >= 0.85) reasons.push('dominada');
  return reasons;
}

function getQuestionIds(searchParams, extra = {}) {
  const { whereSql, values } = buildQuestionWhere(searchParams, extra);
  return db.prepare(`
    SELECT q.id_question AS id
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${whereSql}
    ORDER BY COALESCE(q.materia, ''), COALESCE(q.assunto, ''), q.id_question
  `).all(...values).map((row) => row.id);
}

function getNavigationTarget(searchParams) {
  const mode = String(searchParams.get('mode') || '');
  const currentId = Number(searchParams.get('currentId') || 0);

  if (mode === 'unanswered') {
    const ids = getQuestionIds(searchParams, { unanswered: true });
    if (!ids.length) {
      return { id: null, reason: 'Nenhuma questao nao resolvida encontrada.' };
    }

    const currentIndex = ids.indexOf(currentId);
    const nextId = currentIndex >= 0 && currentIndex < ids.length - 1
      ? ids[currentIndex + 1]
      : ids[0];
    return { id: nextId, mode };
  }

  if (mode === 'subject') {
    return getNextSubjectTarget(currentId);
  }

  if (mode === 'smart') {
    return getSmartTarget(searchParams, currentId);
  }

  if (mode === 'due') {
    return getSmartTarget(searchParams, currentId, { dueOnly: true });
  }

  return { id: null, reason: 'Modo de navegacao invalido.' };
}

function getSmartTarget(searchParams, currentId, options = {}) {
  const ids = getSmartQuestionIds(searchParams, options);
  if (!ids.length) {
    return { id: null, reason: 'Nenhuma questao encontrada para a fila inteligente.' };
  }

  const currentIndex = ids.indexOf(currentId);
  const nextId = currentIndex >= 0 && currentIndex < ids.length - 1
    ? ids[currentIndex + 1]
    : ids[0];
  return { id: nextId, mode: options.dueOnly ? 'due' : 'smart' };
}

function getSmartQuestionIds(searchParams, options = {}) {
  return getSmartQueueRows(searchParams, { limit: 10000, dueOnly: options.dueOnly }).map((row) => row.id);
}

function getSmartQueue(searchParams) {
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)));
  const rows = getSmartQueueRows(searchParams, {
    limit,
    dueOnly: searchParams.get('dueOnly') === '1'
  });
  return { rows };
}

function getSmartQueueV2(searchParams) {
  const profileId = resolveProfileId(searchParams.get('profile'));
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') || 50)));
  const mode = String(searchParams.get('mode') || 'study');
  const rows = getSmartQueueV2Rows(searchParams, { profileId, limit, mode });
  return {
    profile: profileId,
    rows: rows.slice(0, limit)
  };
}

function getSmartQueueV2Rows(searchParams, { profileId, limit = 50, mode = 'study' } = {}) {
  const { whereSql, values } = buildQuestionWhere(searchParams, {
    hideStudyExcluded: !['all', 'ver_todas'].includes(String(mode || '').trim())
  });
  const finalWhere = appendWhere(whereSql, 'qes.profile_id = ?');
  const coverage = new Map(getExamCoverageRows(profileId).map((row) => [row.subject_key, row]));
  const answerSql = currentLawStudyAnswerSql('q', 'c');
  const hasNormative = hasNormativeUpdateTable();
  const normativeSelect = hasNormative
    ? `COALESCE(qnu.recomendacao, '') AS normative_recomendacao,
      COALESCE(qnu.nivel_seguranca, '') AS normative_nivel_seguranca,
      COALESCE(qnu.mudanca_gabarito, '') AS normative_mudanca_gabarito`
    : `'' AS normative_recomendacao,
      '' AS normative_nivel_seguranca,
      '' AS normative_mudanca_gabarito`;
  const normativeJoin = hasNormative
    ? 'LEFT JOIN question_normative_updates qnu ON qnu.question_id = q.id_question'
    : '';
  const rows = db.prepare(`
    SELECT
      q.id_question AS id,
      q.materia,
      q.assunto,
      q.anulada,
      q.desatualizada,
      qes.subject_key,
      qes.subject_label,
      qes.block_key,
      COALESCE(w.expected_pct, 0) AS expected_pct,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      qm.next_due_at,
      qm.last_result,
      COALESCE(qm.wrong_streak, 0) AS wrong_streak,
      CASE WHEN s.question_id IS NULL THEN 1 ELSE 0 END AS never_answered,
      CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 1 ELSE 0 END AS recent_wrong,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      CASE WHEN ${answerSql} != '' THEN 1 ELSE 0 END AS has_answer,
      ${currentLawQueueSelect('qcla')},
      ${normativeSelect},
      CASE WHEN EXISTS (
        SELECT 1
        FROM study_events se
        WHERE se.question_id = q.id_question
          AND se.event_type = 'opened_theory'
      ) THEN 1 ELSE 0 END AS opened_theory
    FROM questions q
    JOIN question_exam_subjects qes ON qes.question_id = q.id_question
    JOIN exam_subject_weights w
      ON w.profile_id = qes.profile_id
      AND w.subject_key = qes.subject_key
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${currentLawQueueJoin('q')}
    ${normativeJoin}
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN (
      SELECT question_id, COUNT(*) AS total, MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    ) s ON s.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = s.last_id
    ${finalWhere}
    LIMIT ?
  `).all(...values, profileId, Math.max(limit * 20, 1000));

  return rows
    .map((row) => scoreSmartQueueV2Row(row, coverage.get(row.subject_key), mode))
    .sort((left, right) => right.score - left.score || left.subjectLabel.localeCompare(right.subjectLabel) || left.id - right.id);
}

function scoreSmartQueueV2Row(row, coverageRow, mode) {
  const due = isDue(row.next_due_at);
  const mastery = Number(row.mastery_score || 0);
  const expectedPct = Number(row.expected_pct || 0);
  const coverageGap = Number(coverageRow?.coverage_gap_pct || 0);
  const lowMastery = mastery < 0.35;
  const dominant = mastery >= 0.85 && !due;
  let score = 0;

  if (due) score += 120;
  if (Number(row.recent_wrong)) score += mode === 'post_error_repair' ? 130 : 100;
  if (Number(row.never_answered)) score += 80;
  if (lowMastery) score += 70;
  score += Math.min(80, expectedPct * 3.2);
  score += Math.min(60, coverageGap * 4);
  if (Number(row.has_comment)) score += 25;
  if (Number(row.has_answer)) score += 25;
  if (!Number(row.opened_theory)) score += 15;
  if (Number(row.anulada)) score -= 100;
  const currentLawVerified = Number(row.desatualizada) && isCurrentLawVerifiedRow(row);
  if (currentLawVerified) {
    score += 20;
  } else {
    if (Number(row.desatualizada)) score -= 80;
    if (normalizePlain(row.normative_recomendacao).includes('descartar')) score -= 220;
    if (normativeTextHasManual(row.normative_recomendacao) || normativeTextHasManual(row.normative_mudanca_gabarito) || ['baixo', 'manual'].includes(normalizePlain(row.normative_nivel_seguranca))) score -= 160;
    if (normalizePlain(row.normative_recomendacao).includes('adaptar') && normalizePlain(row.normative_nivel_seguranca) === 'alto') score += 8;
    if (normalizePlain(row.normative_mudanca_gabarito).startsWith('sim')) score -= 45;
  }
  if (dominant) score -= 70;
  if (mode === 'weakness') score += (1 - mastery) * 40;

  return {
    id: row.id,
    score: round(score, 2),
    subjectKey: row.subject_key,
    subjectLabel: row.subject_label,
    blockKey: row.block_key || '',
    expectedPct,
    masteryScore: mastery,
    nextDueAt: row.next_due_at || '',
    hasComment: Boolean(row.has_comment),
    hasAnswer: Boolean(row.has_answer),
    normativeRecommendation: row.normative_recomendacao || '',
    normativeSecurity: row.normative_nivel_seguranca || '',
    normativeChangedAnswer: currentLawVerified ? '' : (row.normative_mudanca_gabarito || ''),
    currentLawStatus: row.current_law_status || '',
    reasons: smartQueueV2Reasons(row, { due, lowMastery, dominant, coverageGap, expectedPct, currentLawVerified })
  };
}

function smartQueueV2Reasons(row, flags) {
  const reasons = [];
  if (flags.due) reasons.push('revisao_vencida');
  if (Number(row.recent_wrong)) reasons.push('ultimo_erro');
  if (Number(row.never_answered)) reasons.push('nunca_resolvida');
  if (flags.expectedPct >= 8) reasons.push('alto_peso_no_edital');
  if (flags.coverageGap >= 3) reasons.push('lacuna_de_cobertura');
  if (flags.lowMastery) reasons.push('baixo_dominio');
  if (Number(row.has_comment)) reasons.push('tem_comentario');
  if (Number(row.has_answer)) reasons.push('tem_gabarito');
  if (!Number(row.opened_theory)) reasons.push('teoria_nao_aberta');
  if (Number(row.anulada)) reasons.push('anulada');
  if (flags.currentLawVerified) {
    reasons.push('lei_atual_verificada');
  } else {
    if (Number(row.desatualizada)) reasons.push('desatualizada');
    if (normalizePlain(row.normative_recomendacao).includes('descartar')) reasons.push('normativa_descartar');
    if (normativeTextHasManual(row.normative_recomendacao) || normativeTextHasManual(row.normative_mudanca_gabarito)) reasons.push('revisao_normativa_manual');
    if (normalizePlain(row.normative_mudanca_gabarito).startsWith('sim')) reasons.push('gabarito_normativo_alterado');
  }
  if (flags.dominant) reasons.push('dominada');
  return reasons;
}

function getSessionPlan(searchParams) {
  const profileId = resolveProfileId(searchParams.get('profile'));
  const mode = String(searchParams.get('mode') || 'balanced');
  const size = Math.min(120, Math.max(5, Number(searchParams.get('size') || 30)));
  const weights = db.prepare(`
    SELECT subject_key, subject_label, expected_pct, expected_items
    FROM exam_subject_weights
    WHERE profile_id = ?
    ORDER BY expected_pct DESC
  `).all(profileId);
  const targets = distributeItems(weights, size);
  const queueParams = new URLSearchParams(searchParams);
  queueParams.delete('limit');
  queueParams.set('profile', profileId);
  queueParams.set('mode', mode === 'post_error_repair' ? 'post_error_repair' : mode);
  const queue = getSmartQueueV2Rows(queueParams, { profileId, limit: Math.max(size * 20, 200), mode });
  const selected = [];
  const distribution = [];

  for (const target of targets) {
    const candidates = queue.filter((row) => row.subjectKey === target.subjectKey && !selected.includes(row.id));
    const picked = candidates.slice(0, target.targetItems);
    selected.push(...picked.map((row) => row.id));
    distribution.push({
      subjectKey: target.subjectKey,
      subjectLabel: target.subjectLabel,
      targetItems: target.targetItems,
      availableItems: candidates.length,
      selectedItems: picked.length
    });
  }

  if (selected.length < size) {
    for (const row of queue) {
      if (selected.length >= size) break;
      if (!selected.includes(row.id)) selected.push(row.id);
    }
  }

  return {
    size,
    profile: profileId,
    mode,
    distribution,
    questionIds: selected.slice(0, size)
  };
}

function getAdaptiveStudyNext(searchParams) {
  const plan = resolveStudyPlan(searchParams.get('plan'));
  const profileId = resolveProfileId(searchParams.get('profile'));
  const flow = getStudyFlowState();
  const lastAnsweredId = Number(flow?.last_answered_question_id || 0);
  const rows = getAdaptiveQueueRows(searchParams, {
    plan,
    profileId,
    limit: 80,
    excludeQuestionId: lastAnsweredId || null
  });
  const target = rows[0];
  if (!target) {
    return {
      error: 'Nenhuma questao disponivel para este plano.',
      plan,
      profile: profileId
    };
  }
  recordServedQuestion(target.id, {
    mode: plan,
    profileId,
    source: 'adaptive_next',
    reason: target.reasonText,
    clusterId: target.clusterId,
    servedContext: {
      score: target.score,
      reasons: target.reasons,
      clusterPolicy: target.clusterPolicy
    }
  });
  return adaptiveTargetPayload(target, plan, profileId);
}

function getAdaptiveStudySession(searchParams) {
  const plan = resolveStudyPlan(searchParams.get('plan'));
  const profileId = resolveProfileId(searchParams.get('profile'));
  const size = Math.min(25, Math.max(5, Number(searchParams.get('size') || 20)));
  const rows = getAdaptiveQueueRows(searchParams, { plan, profileId, limit: Math.max(size * 60, 600) });
  const selected = selectAdaptiveSessionRows(rows, size);
  const sessionId = `adapt-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  insertStudySessionItems(sessionId, selected, plan);

  return {
    sessionId,
    plan,
    profile: profileId,
    size,
    questionIds: selected.map((row) => row.id),
    items: selected.map((row, index) => ({
      position: index + 1,
      ...adaptiveTargetPayload(row, plan, profileId)
    })),
    distribution: summarizeAdaptiveSession(selected),
    alerts: adaptiveSessionAlerts(selected, size)
  };
}

function getAdaptiveStudyStats() {
  const duplicateTypes = ["'exact_hash'", "'normalized_statement'", "'near_duplicate'"].join(', ');
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_clusters,
      SUM(CASE WHEN cluster_type IN (${duplicateTypes}) THEN 1 ELSE 0 END) AS duplicate_clusters,
      SUM(CASE WHEN cluster_type = 'same_skill' THEN 1 ELSE 0 END) AS skill_clusters,
      COALESCE(SUM(CASE WHEN cluster_type IN (${duplicateTypes}) THEN size - 1 ELSE 0 END), 0) AS postponed_variants
    FROM question_clusters
    WHERE status = 'active'
  `).get();
  const mastery = db.prepare(`
    SELECT
      COUNT(*) AS tracked_clusters,
      COALESCE(SUM(CASE
        WHEN mastery_score >= 0.85
          AND (NULLIF(CAST(next_due_at AS TEXT), '') IS NULL OR next_due_at > CURRENT_TIMESTAMP)
        THEN 1 ELSE 0 END), 0) AS dominated_clusters,
      COALESCE(SUM(CASE WHEN mastery_score < 0.35 OR last_result = 0 THEN 1 ELSE 0 END), 0) AS fragile_clusters
    FROM cluster_mastery
  `).get();
  const profiles = db.prepare(`
    SELECT id, name, description, is_default
    FROM study_strategy_profiles
    ORDER BY is_default DESC, name
  `).all();

  return {
    totals,
    mastery,
    profiles,
    defaultPlan: 'prf_otimizado',
    defaultLabel: 'PRF Otimizado'
  };
}

function getStudyResumeTarget(searchParams) {
  const plan = resolveStudyPlan(searchParams.get('plan') || searchParams.get('mode') || 'prf_otimizado');
  const profileId = resolveProfileId(searchParams.get('profile'));
  const flow = getStudyFlowState();
  const lastOpenId = Number(flow?.last_open_question_id || 0);
  const lastAnsweredId = Number(flow?.last_answered_question_id || 0);

  if (
    lastOpenId
    && flow?.last_opened_at
    && !wasQuestionAnsweredAfter(lastOpenId, flow.last_opened_at)
    && !isQuestionInFutureReview(lastOpenId)
  ) {
    recordServedQuestion(lastOpenId, {
      mode: plan,
      profileId,
      source: 'resume',
      reason: 'resume_unanswered_open_question'
    });
    return {
      id: lastOpenId,
      questionId: lastOpenId,
      reason: 'resume_unanswered_open_question',
      mode: 'study_now',
      plan,
      profile: profileId,
      message: 'Retomando a questão aberta e ainda não respondida.'
    };
  }

  const rows = getAdaptiveQueueRows(searchParams, {
    plan,
    profileId,
    limit: 80,
    excludeQuestionId: lastAnsweredId || null
  });
  const target = rows[0];
  if (target) {
    const skippedLastAnswered = lastAnsweredId > 0 && lastAnsweredId !== target.id;
    const due = target.reasons.includes('revisao_vencida');
    const reason = due ? 'due_review' : skippedLastAnswered ? 'last_answered_skipped' : 'next_adaptive';
    recordServedQuestion(target.id, {
      mode: plan,
      profileId,
      source: 'resume',
      reason,
      clusterId: target.clusterId,
      servedContext: {
        score: target.score,
        reasons: target.reasons,
        clusterPolicy: target.clusterPolicy
      }
    });
    return {
      ...adaptiveTargetPayload(target, plan, profileId),
      reason,
      mode: 'study_now',
      message: due
        ? 'Continuando por uma revisão vencida.'
        : skippedLastAnswered
          ? 'A última questão já foi respondida; seguindo para a próxima recomendada.'
          : 'Continuando pela próxima questão recomendada.'
    };
  }

  const fallback = getFallbackQuestionId(searchParams, { hideStudyExcluded: true, hideFutureReviews: true });
  if (fallback) {
    return {
      id: fallback,
      questionId: fallback,
      reason: 'fallback_first_available',
      mode: 'study_now',
      plan,
      profile: profileId,
      message: 'Nenhuma recomendação adaptativa disponível; abrindo a primeira questão dos filtros.'
    };
  }

  return {
    id: null,
    questionId: null,
    reason: 'no_question_available',
    mode: 'study_now',
    plan,
    profile: profileId,
    message: 'Nenhuma questão disponível.'
  };
}

function getAdaptiveQueueRows(searchParams, { plan, profileId, limit = 50, excludeQuestionId = null } = {}) {
  const resolvedPlan = resolveStudyPlan(plan);
  const resolvedProfile = resolveProfileId(profileId || searchParams.get('profile'));
  const { whereSql, values } = buildQuestionWhere(searchParams, {
    hideStudyExcluded: resolvedPlan !== 'ver_todas'
  });
  const answerSql = currentLawStudyAnswerSql('q', 'c');
  const hasNormative = hasNormativeUpdateTable();
  const normativeSelect = hasNormative
    ? `COALESCE(qnu.recomendacao, '') AS normative_recomendacao,
      COALESCE(qnu.nivel_seguranca, '') AS normative_nivel_seguranca,
      COALESCE(qnu.mudanca_gabarito, '') AS normative_mudanca_gabarito`
    : `'' AS normative_recomendacao,
      '' AS normative_nivel_seguranca,
      '' AS normative_mudanca_gabarito`;
  const normativeJoin = hasNormative
    ? 'LEFT JOIN question_normative_updates qnu ON qnu.question_id = q.id_question'
    : '';
  const filters = [];
  if (whereSql) filters.push(whereSql.replace(/^WHERE\s+/i, ''));
  if (resolvedPlan !== 'ver_todas') {
    filters.push(`${answerSql} != ''`);
    filters.push('COALESCE(q.anulada, 0) = 0');
    filters.push(`NOT (
      qm.next_due_at IS NOT NULL
      AND CAST(qm.next_due_at AS TEXT) != ''
      AND qm.next_due_at > CURRENT_TIMESTAMP
      AND (
        answer_stats.question_id IS NOT NULL
        OR COALESCE(qm.attempts, 0) > 0
        OR qm.last_result IS NOT NULL
      )
    )`);
    if (hasNormativeTeachingTable()) {
      filters.push(`NOT EXISTS (
        SELECT 1
        FROM question_normative_teaching_comments qntc_excluded
        WHERE qntc_excluded.question_id = q.id_question
          AND (
            qntc_excluded.status = 'discard'
            OR qntc_excluded.answer_policy = 'discard_original'
          )
      )`);
    }
  }
  if (resolvedPlan === 'revisar_erros') {
    filters.push('(last_answer.is_correct = 0 OR qm.last_result = 0 OR cm.last_result = 0)');
  }
  if (resolvedPlan === 'revisar_hoje') {
    filters.push('(qm.next_due_at <= CURRENT_TIMESTAMP OR cm.next_due_at <= CURRENT_TIMESTAMP)');
  }
  if (excludeQuestionId && resolvedPlan !== 'ver_todas') {
    filters.push(`q.id_question != ${Number(excludeQuestionId)}`);
  }
  if (resolvedPlan !== 'ver_todas') {
    filters.push(`NOT EXISTS (
      SELECT 1
      FROM study_answers sa_recent
      WHERE sa_recent.question_id = q.id_question
        AND sa_recent.answered_at >= datetime('now', '-${ADAPTIVE_ANSWER_COOLDOWN_MINUTES} minutes')
    )`);
    filters.push(`NOT EXISTS (
      SELECT 1
      FROM study_served_questions ss_recent
      WHERE ss_recent.question_id = q.id_question
        AND ss_recent.served_at >= datetime('now', '-${ADAPTIVE_SERVED_COOLDOWN_MINUTES} minutes')
    )`);
  }
  const finalWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const fetchLimit = Math.max(Number(limit || 50) * 30, 600);
  const coverage = new Map(getExamCoverageRows(resolvedProfile).map((row) => [row.subject_key, row]));
  const blockWeights = getPrfBlockWeights(resolvedProfile);

  const rows = db.prepare(`
    WITH primary_cluster AS (
      SELECT *
      FROM (
        SELECT
          qcm.question_id,
          qcm.cluster_id,
          qcm.role AS cluster_role,
          qcm.similarity,
          qcm.reason AS cluster_reason,
          qc.cluster_type,
          qc.title AS cluster_title,
          qc.representative_question_id,
          qc.size AS cluster_size,
          qc.confidence AS cluster_confidence,
          COALESCE(qc.cluster_policy, '') AS cluster_policy,
          COALESCE(qc.max_visible_per_pass, 1) AS max_visible_per_pass,
          ROW_NUMBER() OVER (
            PARTITION BY qcm.question_id
            ORDER BY
              CASE qc.cluster_type
                WHEN 'exact_hash' THEN 1
                WHEN 'normalized_statement' THEN 2
                WHEN 'near_duplicate' THEN 3
                WHEN 'same_skill' THEN 4
                ELSE 5
              END,
              CASE qcm.role WHEN 'representative' THEN 0 ELSE 1 END,
              qc.size DESC,
              qc.id
          ) AS rn
        FROM question_cluster_members qcm
        JOIN question_clusters qc ON qc.id = qcm.cluster_id
        WHERE qc.status = 'active'
      )
      WHERE rn = 1
    ),
    answer_stats AS (
      SELECT question_id, COUNT(*) AS total_answers, MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    )
    SELECT
      q.id_question AS id,
      q.materia,
      q.assunto,
      q.anulada,
      q.desatualizada,
      qes.subject_key,
      qes.subject_label,
      qes.block_key,
      COALESCE(w.expected_pct, 0) AS expected_pct,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      qm.next_due_at,
      qm.last_result,
      COALESCE(qm.wrong_streak, 0) AS wrong_streak,
      COALESCE(cm.mastery_score, 0) AS cluster_mastery_score,
      cm.next_due_at AS cluster_next_due_at,
      cm.last_result AS cluster_last_result,
      cm.last_confidence AS cluster_last_confidence,
      CASE WHEN answer_stats.question_id IS NULL THEN 1 ELSE 0 END AS never_answered,
      CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 1 ELSE 0 END AS recent_wrong,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      CASE WHEN ${answerSql} != '' THEN 1 ELSE 0 END AS has_answer,
      ${currentLawQueueSelect('qcla')},
      pc.cluster_id,
      pc.cluster_type,
      pc.cluster_role,
      pc.cluster_size,
      pc.cluster_title,
      pc.representative_question_id,
      pc.similarity,
      pc.cluster_reason,
      pc.cluster_confidence,
      pc.cluster_policy,
      pc.max_visible_per_pass,
      ${normativeSelect},
      CASE WHEN EXISTS (
        SELECT 1
        FROM study_events se
        WHERE se.question_id = q.id_question
          AND se.event_type = 'opened_theory'
      ) THEN 1 ELSE 0 END AS opened_theory
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${currentLawQueueJoin('q')}
    LEFT JOIN question_exam_subjects qes
      ON qes.question_id = q.id_question
      AND qes.profile_id = ?
    LEFT JOIN exam_subject_weights w
      ON w.profile_id = ?
      AND w.subject_key = qes.subject_key
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN primary_cluster pc ON pc.question_id = q.id_question
    LEFT JOIN cluster_mastery cm ON cm.cluster_id = pc.cluster_id
    LEFT JOIN answer_stats ON answer_stats.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = answer_stats.last_id
    ${normativeJoin}
    ${finalWhere}
    LIMIT ?
  `).all(resolvedProfile, resolvedProfile, ...values, fetchLimit);

  return rows
    .map((row) => scoreAdaptiveQuestion(row, {
      plan: resolvedPlan,
      profileId: resolvedProfile,
      coverageRow: coverage.get(row.subject_key),
      blockExpectedPct: blockWeights.get(row.block_key || '') || 0
    }))
    .sort((left, right) => right.score - left.score || left.materia.localeCompare(right.materia) || left.assunto.localeCompare(right.assunto) || left.id - right.id)
    .slice(0, Math.max(Number(limit || 50), 1));
}

function scoreAdaptiveQuestion(row, context) {
  const due = isDue(row.next_due_at);
  const clusterDue = isDue(row.cluster_next_due_at);
  const qMastery = Number(row.mastery_score || 0);
  const cMastery = Number(row.cluster_mastery_score || 0);
  const expectedPct = Number(row.expected_pct || 0);
  const blockPct = Number(context.blockExpectedPct || 0);
  const coverageGap = Number(context.coverageRow?.coverage_gap_pct || 0);
  const isRepresentative = row.cluster_role === 'representative';
  const clusterPolicy = resolveClusterPolicy(row.cluster_policy, row.cluster_type, Number(row.cluster_size || 0));
  const clusterCanSuppress = ['suppress_variants', 'reinforcement'].includes(clusterPolicy);
  const duplicateCluster = clusterCanSuppress && ['exact_hash', 'normalized_statement', 'near_duplicate'].includes(row.cluster_type);
  const variantUnlocked = clusterCanSuppress && (row.cluster_last_result === 0
    || ['doubt', 'guess'].includes(row.cluster_last_confidence)
    || cMastery < 0.35
    || clusterDue);
  const clusterDominated = clusterCanSuppress && cMastery >= 0.85 && !clusterDue;
  const answeredCorrectNotDue = !due
    && !clusterDue
    && !Number(row.never_answered)
    && !Number(row.recent_wrong)
    && Number(row.last_result) === 1
    && qMastery >= 0.4;
  const reasons = [];
  let score = 0;

  if (due || clusterDue) {
    score += 150;
    reasons.push('revisao_vencida');
  }
  if (Number(row.recent_wrong)) {
    score += 130;
    reasons.push('erro_recente');
  }
  if (row.cluster_last_result === 0) {
    score += 110;
    reasons.push('cluster_com_erro');
  }
  if (Number(row.never_answered)) {
    score += 90;
    reasons.push('nunca_resolvida');
  }
  if (qMastery < 0.35) {
    score += 80;
    reasons.push('baixo_dominio');
  }
  if (cMastery < 0.35) {
    score += 70;
    reasons.push('cluster_fragil');
  }
  if (blockPct) {
    score += Math.min(90, blockPct * 1.9);
    if (blockPct >= 25) reasons.push('bloco_importante_prf');
  }
  if (expectedPct) {
    score += Math.min(60, expectedPct * 2.4);
    if (expectedPct >= 8) reasons.push('disciplina_importante_prf');
  }
  if (isRepresentative) {
    score += 50;
    reasons.push('representante');
  }
  if (Number(row.has_comment)) {
    score += 35;
    reasons.push('tem_comentario');
  }
  if (Number(row.has_answer)) {
    score += 35;
    reasons.push('tem_gabarito');
  }
  if (coverageGap >= 3) {
    score += 20;
    reasons.push('lacuna_prf');
  }
  if (Number(row.recent_wrong) && !Number(row.opened_theory)) {
    score += 15;
    reasons.push('teoria_util_apos_erro');
  }
  const currentLawVerified = Number(row.desatualizada) && isCurrentLawVerifiedRow(row);

  if (Number(row.anulada)) {
    score -= 120;
    reasons.push('anulada');
  }
  if (currentLawVerified) {
    score += 20;
    reasons.push('lei_atual_verificada');
  }
  if (Number(row.desatualizada) && !currentLawVerified && !normativeRowSafe(row)) {
    score -= 100;
    reasons.push('desatualizada_sem_seguranca');
  }
  if (answeredCorrectNotDue) {
    score -= 240;
    reasons.push('revisao_futura');
  }
  if (!currentLawVerified) {
    if (normalizePlain(row.normative_recomendacao).includes('descartar')) {
      score -= 120;
      reasons.push('normativa_descartar');
    }
    if (normativeTextHasManual(row.normative_recomendacao) || normativeTextHasManual(row.normative_mudanca_gabarito) || ['baixo', 'manual'].includes(normalizePlain(row.normative_nivel_seguranca))) {
      score -= 80;
      reasons.push('revisao_normativa_manual');
    }
  }
  if (clusterDominated) {
    score -= 90;
    reasons.push('cluster_dominado');
  }
  if (context.plan !== 'ver_todas' && duplicateCluster && !isRepresentative && !variantUnlocked) {
    score -= 140;
    reasons.push('variacao_adiada');
  } else if (duplicateCluster && !isRepresentative) {
    score += 35;
    reasons.push('variacao_reforco');
  }
  if (context.plan === 'revisar_erros' && (Number(row.recent_wrong) || row.cluster_last_result === 0)) score += 80;
  if (context.plan === 'revisar_hoje' && (due || clusterDue)) score += 80;

  return {
    id: row.id,
    materia: row.materia || '',
    assunto: row.assunto || '',
    subjectKey: row.subject_key || '',
    subjectLabel: row.subject_label || '',
    blockKey: row.block_key || '',
    expectedPct,
    score: round(score, 2),
    clusterId: row.cluster_id || null,
    clusterType: row.cluster_type || '',
    clusterPolicy,
    clusterRole: row.cluster_role || '',
    clusterSize: Number(row.cluster_size || 0),
    clusterTitle: row.cluster_title || '',
    isRepresentative,
    hasComment: Boolean(row.has_comment),
    hasAnswer: Boolean(row.has_answer),
    nextDueAt: row.next_due_at || '',
    clusterNextDueAt: row.cluster_next_due_at || '',
    masteryScore: qMastery,
    clusterMasteryScore: cMastery,
    reasons: [...new Set(reasons)],
    reasonText: adaptiveReasonText(row, reasons)
  };
}

function selectAdaptiveSessionRows(rows, size) {
  const selected = [];
  const used = new Set();
  const subjectCounts = new Map();
  const blockCounts = new Map();
  const blockTargets = distributePrfBlocks(size);
  const maxPerSubject = Math.max(2, Math.ceil(size * 0.22));

  const tryPick = (row, strict) => {
    if (used.has(row.id)) return false;
    const last = selected[selected.length - 1];
    if (strict && last?.clusterId && row.clusterId && last.clusterId === row.clusterId) return false;
    const subjectKey = row.subjectKey || `${row.materia}|${row.assunto}`;
    if (strict && Number(subjectCounts.get(subjectKey) || 0) >= maxPerSubject) return false;
    const target = blockTargets.get(row.blockKey || '') || 0;
    if (strict && target && Number(blockCounts.get(row.blockKey) || 0) >= target) return false;
    selected.push(row);
    used.add(row.id);
    subjectCounts.set(subjectKey, Number(subjectCounts.get(subjectKey) || 0) + 1);
    blockCounts.set(row.blockKey || '', Number(blockCounts.get(row.blockKey || '') || 0) + 1);
    return true;
  };

  for (const row of rows) {
    if (selected.length >= size) break;
    tryPick(row, true);
  }
  for (const row of rows) {
    if (selected.length >= size) break;
    tryPick(row, false);
  }
  return selected.slice(0, size);
}

function insertStudySessionItems(sessionId, rows, plan) {
  if (!rows.length) return;
  const insert = db.prepare(`
    INSERT INTO study_session_items (
      session_id, question_id, cluster_id, plan_id, position, priority_score, reason_json, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')
  `);
  db.exec('BEGIN');
  try {
    rows.forEach((row, index) => {
      insert.run(
        sessionId,
        row.id,
        row.clusterId,
        plan,
        index + 1,
        row.score,
        JSON.stringify({ reasons: row.reasons, reasonText: row.reasonText })
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function adaptiveTargetPayload(row, plan, profileId) {
  return {
    questionId: row.id,
    id: row.id,
    plan,
    profile: profileId,
    clusterId: row.clusterId,
    clusterType: row.clusterType,
    clusterPolicy: row.clusterPolicy,
    clusterSize: row.clusterSize,
    isRepresentative: row.isRepresentative,
    score: row.score,
    reasonText: row.reasonText,
    reasons: row.reasons,
    materia: row.materia,
    assunto: row.assunto,
    blockKey: row.blockKey,
    subjectKey: row.subjectKey,
    subjectLabel: row.subjectLabel
  };
}

function summarizeAdaptiveSession(rows) {
  const blocks = new Map();
  const subjects = new Map();
  for (const row of rows) {
    const blockKey = row.blockKey || 'sem_bloco';
    const subjectKey = row.subjectKey || row.materia || 'sem_disciplina';
    blocks.set(blockKey, Number(blocks.get(blockKey) || 0) + 1);
    subjects.set(subjectKey, {
      subjectKey,
      subjectLabel: row.subjectLabel || row.materia || subjectKey,
      count: Number(subjects.get(subjectKey)?.count || 0) + 1
    });
  }
  return {
    blocks: [...blocks.entries()].map(([blockKey, count]) => ({ blockKey, count })),
    subjects: [...subjects.values()].sort((left, right) => right.count - left.count)
  };
}

function adaptiveSessionAlerts(rows, size) {
  const alerts = [];
  const blockCounts = new Map(rows.map((row) => [row.blockKey || 'sem_bloco', 0]));
  for (const row of rows) blockCounts.set(row.blockKey || 'sem_bloco', Number(blockCounts.get(row.blockKey || 'sem_bloco') || 0) + 1);
  for (const [blockKey, targetPct] of PRF_BLOCK_TARGETS) {
    const expected = Math.round((targetPct / 100) * size);
    const actual = Number(blockCounts.get(blockKey) || 0);
    if (actual + 2 < expected) {
      alerts.push(`Poucas questoes disponiveis para ${blockKey}; a sessao foi redistribuida sem compensacao silenciosa.`);
    }
  }
  return alerts;
}

function adaptiveReasonText(row, reasons) {
  if (row.cluster_id && Number(row.cluster_size || 0) > 1) {
    const clusterPolicy = resolveClusterPolicy(row.cluster_policy, row.cluster_type, Number(row.cluster_size || 0));
    if (clusterPolicy === 'stats_only') {
      return '';
    }
    if (row.cluster_type === 'same_skill') {
      if (row.cluster_role === 'representative') return 'Questão central deste assunto.';
      if (reasons.includes('variacao_reforco') || row.cluster_last_result === 0) return 'Reforço dentro do mesmo assunto.';
      return 'Família de treino do mesmo assunto.';
    }
    if (row.cluster_role === 'representative') {
      return `Representante de ${Number(row.cluster_size || 0).toLocaleString('pt-BR')} questões semelhantes.`;
    }
    if (reasons.includes('variacao_reforco') || row.cluster_last_result === 0) {
      return 'Você errou ou demonstrou dúvida neste tema; esta é uma variação para reforço.';
    }
  }
  if (reasons.includes('revisao_vencida')) return 'Revisao vencida pelo plano de estudo.';
  if (reasons.includes('erro_recente')) return 'Você errou este tema recentemente.';
  if (reasons.includes('revisao_futura')) return 'Já acertada; adiada até a próxima revisão.';
  if (reasons.includes('bloco_importante_prf') || reasons.includes('disciplina_importante_prf')) return 'Tema importante para a PRF.';
  return 'Selecionada pelo PRF Otimizado.';
}

function deriveClusterPolicy(clusterType, clusterSize) {
  const size = Number(clusterSize || 0);
  if (!clusterType) return 'interleave';
  if (size > 40) return 'stats_only';
  if (['exact_hash', 'normalized_statement', 'near_duplicate'].includes(clusterType)) return 'suppress_variants';
  if (clusterType === 'same_skill') return 'stats_only';
  return 'interleave';
}

function resolveClusterPolicy(storedPolicy, clusterType, clusterSize) {
  const policy = String(storedPolicy || '').trim();
  const derived = deriveClusterPolicy(clusterType, clusterSize);
  if (!policy) return derived;
  if (policy === 'interleave' && derived !== 'interleave') return derived;
  return policy;
}

function getQuestionCluster(clusterId) {
  const cluster = db.prepare(`
    SELECT qc.*, COALESCE(cm.mastery_score, 0) AS mastery_score, cm.next_due_at, cm.last_result, cm.last_confidence
    FROM question_clusters qc
    LEFT JOIN cluster_mastery cm ON cm.cluster_id = qc.id
    WHERE qc.id = ?
  `).get(clusterId);
  if (!cluster) return { error: 'Cluster nao encontrado.' };
  return {
    cluster: serializeCluster(cluster),
    members: getClusterMembers(clusterId)
  };
}

function getQuestionSimilar(questionId, searchParams) {
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 30)));
  const clusters = db.prepare(`
    SELECT qc.*
    FROM question_cluster_members qcm
    JOIN question_clusters qc ON qc.id = qcm.cluster_id
    WHERE qcm.question_id = ?
      AND qc.status = 'active'
    ORDER BY
      CASE qc.cluster_type
        WHEN 'exact_hash' THEN 1
        WHEN 'normalized_statement' THEN 2
        WHEN 'near_duplicate' THEN 3
        WHEN 'same_skill' THEN 4
        ELSE 5
      END,
      qc.size DESC,
      qc.id
  `).all(questionId);
  if (!clusters.length) {
    return { questionId, clusters: [], members: [] };
  }
  const cluster = clusters[0];
  return {
    questionId,
    clusters: clusters.map(serializeCluster),
    cluster: serializeCluster(cluster),
    members: getClusterMembers(cluster.id, limit, { excludeQuestionId: questionId })
  };
}

function getClusterMembers(clusterId, limit = 100, options = {}) {
  const excludeQuestionId = Number(options.excludeQuestionId || 0);
  const excludeSql = excludeQuestionId ? 'AND qcm.question_id != ?' : '';
  const params = excludeQuestionId ? [clusterId, excludeQuestionId, limit] : [clusterId, limit];
  return db.prepare(`
    SELECT
      q.id_question AS questionId,
      q.materia,
      q.assunto,
      q.banca,
      q.concurso_ano AS ano,
      q.anulada,
      q.desatualizada,
      qcm.role,
      qcm.similarity,
      qcm.representative_score,
      qcm.reason,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      qm.next_due_at,
      CASE WHEN sa.question_id IS NULL THEN 0 ELSE 1 END AS answered,
      last_answer.is_correct AS last_result
    FROM question_cluster_members qcm
    JOIN questions q ON q.id_question = qcm.question_id
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN (
      SELECT question_id, MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    ) sa ON sa.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = sa.last_id
    WHERE qcm.cluster_id = ?
      ${excludeSql}
    ORDER BY CASE qcm.role WHEN 'representative' THEN 0 ELSE 1 END, qcm.similarity DESC, q.id_question
    LIMIT ?
  `).all(...params).map(serializeClusterMember);
}

function serializeClusterMember(row) {
  return {
    questionId: Number(row.questionId || row.questionid || row.question_id || row.id || 0) || 0,
    materia: row.materia || '',
    assunto: row.assunto || '',
    banca: row.banca || '',
    ano: row.ano || '',
    anulada: row.anulada || 0,
    desatualizada: row.desatualizada || 0,
    role: row.role || '',
    similarity: Number(row.similarity || 0),
    representative_score: Number(row.representative_score || 0),
    reason: row.reason || '',
    mastery_score: Number(row.mastery_score || 0),
    next_due_at: row.next_due_at || '',
    answered: row.answered || 0,
    last_result: row.last_result
  };
}

function serializeCluster(cluster) {
  return {
    id: cluster.id,
    key: cluster.cluster_key || '',
    type: cluster.cluster_type || '',
    profile: cluster.profile_id || '',
    subjectKey: cluster.subject_key || '',
    subjectLabel: cluster.subject_label || '',
    materia: cluster.materia || '',
    assunto: cluster.assunto || '',
    skillKey: cluster.skill_key || '',
    title: cluster.title || '',
    representativeQuestionId: cluster.representative_question_id || null,
    size: Number(cluster.size || 0),
    confidence: Number(cluster.confidence || 0),
    status: cluster.status || '',
    policy: resolveClusterPolicy(cluster.cluster_policy, cluster.cluster_type, Number(cluster.size || 0)),
    maxVisiblePerPass: Number(cluster.max_visible_per_pass || 1),
    masteryScore: Number(cluster.mastery_score || 0),
    nextDueAt: cluster.next_due_at || '',
    lastResult: cluster.last_result,
    lastConfidence: cluster.last_confidence || ''
  };
}

function getQuestionAdaptiveSummary(questionId) {
  const row = db.prepare(`
    SELECT
      qc.*,
      qcm.role,
      qcm.similarity,
      qcm.reason,
      COALESCE(cm.mastery_score, 0) AS mastery_score,
      cm.next_due_at,
      cm.last_result,
      cm.last_confidence
    FROM question_cluster_members qcm
    JOIN question_clusters qc ON qc.id = qcm.cluster_id
    LEFT JOIN cluster_mastery cm ON cm.cluster_id = qc.id
    WHERE qcm.question_id = ?
      AND qc.status = 'active'
    ORDER BY
      CASE qc.cluster_type
        WHEN 'exact_hash' THEN 1
        WHEN 'normalized_statement' THEN 2
        WHEN 'near_duplicate' THEN 3
        WHEN 'same_skill' THEN 4
        ELSE 5
      END,
      CASE qcm.role WHEN 'representative' THEN 0 ELSE 1 END,
      qc.size DESC,
      qc.id
    LIMIT 1
  `).get(questionId);
  if (!row) {
    return {
      exists: false,
      clusterId: null,
      reasonText: ''
    };
  }
  const isRepresentative = row.role === 'representative';
  const clusterPolicy = resolveClusterPolicy(row.cluster_policy, row.cluster_type, Number(row.size || 0));
  return {
    exists: true,
    clusterId: row.id,
    clusterType: row.cluster_type || '',
    clusterPolicy,
    role: row.role || '',
    isRepresentative,
    size: Number(row.size || 0),
    title: row.title || '',
    reason: row.reason || '',
    similarity: Number(row.similarity || 0),
    masteryScore: Number(row.mastery_score || 0),
    nextDueAt: row.next_due_at || '',
    lastResult: row.last_result,
    lastConfidence: row.last_confidence || '',
    reasonText: clusterPolicy === 'stats_only'
      ? ''
      : row.cluster_type === 'same_skill'
        ? (isRepresentative ? 'Questão central deste assunto.' : 'Reforço dentro do mesmo assunto.')
      : isRepresentative && Number(row.size || 0) > 1
        ? `Representante de ${Number(row.size || 0).toLocaleString('pt-BR')} questões semelhantes.`
        : Number(row.size || 0) > 1
          ? 'Variacao de uma familia de questoes semelhantes.'
          : ''
  };
}

function updateClusterMastery(database, questionId, answerResult, attemptMeta) {
  const memberships = database.prepare(`
    SELECT qcm.cluster_id, qcm.role, qc.cluster_type
    FROM question_cluster_members qcm
    JOIN question_clusters qc ON qc.id = qcm.cluster_id
    WHERE qcm.question_id = ?
      AND qc.status = 'active'
  `).all(questionId);
  if (!memberships.length) return null;

  const now = new Date();
  const nowSql = formatSqlDate(now);
  const isCorrect = answerResult.isCorrect;
  const updated = [];

  for (const membership of memberships) {
    const previous = database.prepare(`
      SELECT *
      FROM cluster_mastery
      WHERE cluster_id = ?
    `).get(membership.cluster_id) || {
      attempts: 0,
      correct_count: 0,
      wrong_count: 0,
      correct_streak: 0,
      wrong_streak: 0,
      mastery_score: 0
    };

    const attempts = Number(previous.attempts || 0) + 1;
    const correctCount = Number(previous.correct_count || 0) + (isCorrect === 1 ? 1 : 0);
    const wrongCount = Number(previous.wrong_count || 0) + (isCorrect === 0 ? 1 : 0);
    let correctStreak = Number(previous.correct_streak || 0);
    let wrongStreak = Number(previous.wrong_streak || 0);
    let delta = 0;
    let intervalDays = 3;

    if (isCorrect === 0) {
      wrongStreak += 1;
      correctStreak = 0;
      delta = -0.22;
      intervalDays = membership.role === 'representative' ? 1 : 2;
    } else if (isCorrect === 1) {
      correctStreak += 1;
      wrongStreak = 0;
      if (attemptMeta.confidence === 'guess') {
        delta = 0.03;
        intervalDays = 2;
      } else if (attemptMeta.confidence === 'doubt') {
        delta = 0.08;
        intervalDays = 3;
      } else {
        delta = membership.role === 'representative' ? 0.16 : 0.12;
        intervalDays = correctStreak === 1 ? 7 : correctStreak === 2 ? 18 : 45;
      }
    }

    const masteryScore = clamp(Number(previous.mastery_score || 0) + delta, 0, 1);
    const nextDueAt = formatSqlDate(addDays(now, intervalDays));
    database.prepare(`
      INSERT INTO cluster_mastery (
        cluster_id, attempts, correct_count, wrong_count, correct_streak, wrong_streak,
        last_result, last_confidence, last_seen_at, next_due_at, mastery_score, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cluster_id) DO UPDATE SET
        attempts = excluded.attempts,
        correct_count = excluded.correct_count,
        wrong_count = excluded.wrong_count,
        correct_streak = excluded.correct_streak,
        wrong_streak = excluded.wrong_streak,
        last_result = excluded.last_result,
        last_confidence = excluded.last_confidence,
        last_seen_at = excluded.last_seen_at,
        next_due_at = excluded.next_due_at,
        mastery_score = excluded.mastery_score,
        updated_at = excluded.updated_at
    `).run(
      membership.cluster_id,
      attempts,
      correctCount,
      wrongCount,
      correctStreak,
      wrongStreak,
      isCorrect,
      attemptMeta.confidence,
      nowSql,
      nextDueAt,
      masteryScore,
      nowSql
    );
    updated.push({ clusterId: membership.cluster_id, masteryScore, nextDueAt });
  }

  return updated[0] || null;
}

function getPrfBlockWeights(profileId) {
  const rows = db.prepare(`
    SELECT block_key, SUM(expected_pct) AS expected_pct
    FROM exam_subject_weights
    WHERE profile_id = ?
    GROUP BY block_key
  `).all(profileId);
  const weights = new Map(rows.map((row) => [row.block_key || '', Number(row.expected_pct || 0)]));
  for (const [key, value] of PRF_BLOCK_TARGETS) {
    if (weights.has(key)) weights.set(key, value);
  }
  return weights;
}

function distributePrfBlocks(size) {
  const raw = [...PRF_BLOCK_TARGETS.entries()].map(([blockKey, pct]) => {
    const exact = (pct / 100) * size;
    return {
      blockKey,
      target: Math.floor(exact),
      remainder: exact - Math.floor(exact)
    };
  });
  let allocated = raw.reduce((sum, row) => sum + row.target, 0);
  raw.sort((left, right) => right.remainder - left.remainder);
  for (const row of raw) {
    if (allocated >= size) break;
    row.target += 1;
    allocated += 1;
  }
  return new Map(raw.map((row) => [row.blockKey, row.target]));
}

function resolveStudyPlan(value) {
  const plan = String(value || '').trim();
  if (['prf_otimizado', 'revisar_erros', 'revisar_hoje', 'ver_todas'].includes(plan)) {
    return plan;
  }
  return 'prf_otimizado';
}

function normativeRowSafe(row) {
  const recommendation = normalizePlain(row.normative_recomendacao);
  const security = normalizePlain(row.normative_nivel_seguranca);
  return !recommendation.includes('descartar')
    && !normativeTextHasManual(row.normative_recomendacao)
    && !['baixo', 'manual'].includes(security)
    && (security === 'alto' || recommendation.includes('manter') || recommendation.includes('adaptar'));
}

function isCurrentLawVerifiedRow(row) {
  return String(row?.current_law_status || '') === 'verified'
    && dbBoolean(row?.can_auto_score_current_law)
    && String(row?.current_answer || '').trim() !== ''
    && !dbBoolean(row?.should_discard_from_current_law_study)
    && !dbBoolean(row?.no_valid_alternative);
}

function distributeItems(weights, size) {
  const raw = weights.map((row) => {
    const exact = (Number(row.expected_pct || 0) / 100) * size;
    return {
      subjectKey: row.subject_key,
      subjectLabel: row.subject_label,
      exact,
      targetItems: Math.floor(exact),
      remainder: exact - Math.floor(exact)
    };
  });
  let allocated = raw.reduce((sum, row) => sum + row.targetItems, 0);
  raw.sort((left, right) => right.remainder - left.remainder);
  for (const row of raw) {
    if (allocated >= size) break;
    row.targetItems += 1;
    allocated += 1;
  }
  return raw.sort((left, right) => right.targetItems - left.targetItems || left.subjectLabel.localeCompare(right.subjectLabel));
}

function startExamSimulation(body) {
  const profileId = resolveProfileId(body?.profile);
  const size = Math.min(120, Math.max(5, Number(body?.size || 120)));
  const mode = String(body?.mode || 'full');
  const params = new URLSearchParams({ profile: profileId, size: String(size), mode: 'exam' });
  const plan = getSessionPlan(params);
  if (!plan.questionIds.length) {
    return { error: 'Nenhuma questao disponivel para o simulado neste perfil.' };
  }

  const simulationId = `sim-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
  const insertSimulation = db.prepare(`
    INSERT INTO exam_simulations (id, profile_id, started_at, mode, total_items)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO exam_simulation_items (simulation_id, question_id, position, block_key, subject_key)
    VALUES (?, ?, ?, ?, ?)
  `);
  const subjectByQuestion = db.prepare(`
    SELECT subject_key, block_key
    FROM question_exam_subjects
    WHERE question_id = ? AND profile_id = ?
    LIMIT 1
  `);

  db.exec('BEGIN');
  try {
    insertSimulation.run(simulationId, profileId, mode, plan.questionIds.length);
    plan.questionIds.forEach((questionId, index) => {
      const subject = subjectByQuestion.get(questionId, profileId) || {};
      insertItem.run(simulationId, questionId, index + 1, subject.block_key || '', subject.subject_key || '');
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    id: simulationId,
    profile: profileId,
    mode,
    totalItems: plan.questionIds.length,
    distribution: plan.distribution,
    questionIds: plan.questionIds
  };
}

function saveExamSimulationAnswer(simulationId, body) {
  const questionId = Number(body?.questionId || 0);
  const item = db.prepare(`
    SELECT *
    FROM exam_simulation_items
    WHERE simulation_id = ? AND question_id = ?
  `).get(simulationId, questionId);
  if (!item) {
    return { error: 'Item do simulado nao encontrado.' };
  }

  const blank = Boolean(body?.blank);
  const elapsedMs = Number(body?.elapsedMs);
  const answer = blank ? '' : String(body?.answer || '').trim();
  const expected = getExpectedAnswer(questionId);
  const normalized = blank ? { answer: '', isCorrect: null } : normalizeSimulationAnswer(questionId, answer, expected);
  const score = blank ? 0 : normalized.isCorrect === 1 ? 1 : normalized.isCorrect === 0 ? -1 : 0;

  db.prepare(`
    UPDATE exam_simulation_items
    SET answer_letter = ?,
        expected_answer = ?,
        is_correct = ?,
        score = ?,
        confidence = ?,
        elapsed_ms = ?
    WHERE id = ?
  `).run(
    normalized.answer,
    expected,
    normalized.isCorrect,
    score,
    validChoice(body?.confidence, ['sure', 'doubt', 'guess'], ''),
    Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : null,
    item.id
  );

  return {
    simulationId,
    questionId,
    answer: normalized.answer,
    expectedAnswer: expected,
    isCorrect: normalized.isCorrect,
    score
  };
}

function finishExamSimulation(simulationId) {
  const simulation = db.prepare('SELECT * FROM exam_simulations WHERE id = ?').get(simulationId);
  if (!simulation) {
    return { error: 'Simulado nao encontrado.' };
  }

  const aggregate = db.prepare(`
    SELECT
      COALESCE(SUM(score), 0) AS score_total,
      SUM(CASE WHEN block_key = 'bloco_1' THEN COALESCE(score, 0) ELSE 0 END) AS score_block_1,
      SUM(CASE WHEN block_key = 'bloco_2' THEN COALESCE(score, 0) ELSE 0 END) AS score_block_2,
      SUM(CASE WHEN block_key = 'bloco_3' THEN COALESCE(score, 0) ELSE 0 END) AS score_block_3,
      SUM(CASE WHEN COALESCE(answer_letter, '') = '' THEN 1 ELSE 0 END) AS blank_count,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
    FROM exam_simulation_items
    WHERE simulation_id = ?
  `).get(simulationId);
  const passed = Number(aggregate.score_block_1 || 0) >= 15
    && Number(aggregate.score_block_2 || 0) >= 10
    && Number(aggregate.score_block_3 || 0) >= 10
    && Number(aggregate.score_total || 0) >= 50;

  db.prepare(`
    UPDATE exam_simulations
    SET finished_at = CURRENT_TIMESTAMP,
        score_total = ?,
        score_block_1 = ?,
        score_block_2 = ?,
        score_block_3 = ?,
        blank_count = ?,
        correct_count = ?,
        wrong_count = ?,
        passed_cutoffs = ?
    WHERE id = ?
  `).run(
    aggregate.score_total || 0,
    aggregate.score_block_1 || 0,
    aggregate.score_block_2 || 0,
    aggregate.score_block_3 || 0,
    aggregate.blank_count || 0,
    aggregate.correct_count || 0,
    aggregate.wrong_count || 0,
    passed ? 1 : 0,
    simulationId
  );

  const dangerousSubjects = db.prepare(`
    SELECT i.subject_key, COALESCE(w.subject_label, i.subject_key) AS subject_label,
      SUM(CASE WHEN i.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
      SUM(CASE WHEN i.is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
      COALESCE(SUM(i.score), 0) AS score
    FROM exam_simulation_items i
    LEFT JOIN exam_subject_weights w
      ON w.profile_id = ?
      AND w.subject_key = i.subject_key
    WHERE i.simulation_id = ?
    GROUP BY i.subject_key
    ORDER BY wrong_count DESC, score ASC
    LIMIT 8
  `).all(simulation.profile_id, simulationId);
  const confidence = db.prepare(`
    SELECT COALESCE(NULLIF(confidence, ''), 'sem_confianca') AS confidence,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
      COALESCE(SUM(score), 0) AS score
    FROM exam_simulation_items
    WHERE simulation_id = ?
    GROUP BY COALESCE(NULLIF(confidence, ''), 'sem_confianca')
    ORDER BY confidence
  `).all(simulationId);

  return {
    id: simulationId,
    scoreTotal: aggregate.score_total || 0,
    scoreBlock1: aggregate.score_block_1 || 0,
    scoreBlock2: aggregate.score_block_2 || 0,
    scoreBlock3: aggregate.score_block_3 || 0,
    blankCount: aggregate.blank_count || 0,
    correctCount: aggregate.correct_count || 0,
    wrongCount: aggregate.wrong_count || 0,
    passedCutoffs: passed,
    dangerousSubjects,
    errorsByConfidence: confidence,
    recommendation: passed ? 'manter_revisao' : 'priorizar_reparo_e_revisao_vencida'
  };
}

function getCebraspeRiskReport() {
  const rows = db.prepare(`
    SELECT COALESCE(NULLIF(confidence, ''), 'sem_confianca') AS confidence,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
      SUM(CASE WHEN is_correct IS NULL THEN 1 ELSE 0 END) AS unknown,
      SUM(CASE WHEN is_correct = 1 THEN 1 WHEN is_correct = 0 THEN -1 ELSE 0 END) AS score
    FROM study_answers
    GROUP BY COALESCE(NULLIF(confidence, ''), 'sem_confianca')
    ORDER BY confidence
  `).all();
  return {
    rows,
    recommendation: buildCebraspeRecommendation(rows)
  };
}

function buildCebraspeRecommendation(rows) {
  const guess = rows.find((row) => row.confidence === 'guess');
  const doubt = rows.find((row) => row.confidence === 'doubt');
  const sure = rows.find((row) => row.confidence === 'sure');
  if (guess && Number(guess.score || 0) < 0) {
    return 'Em simulado, considere deixar chutes em branco ate melhorar a taxa de acerto.';
  }
  if (sure && Number(sure.wrong || 0) > 0) {
    return 'Ha falsa seguranca em respostas marcadas como certeza. Envie esses erros para a fila de reparo.';
  }
  if (doubt && Number(doubt.score || 0) > 0) {
    return 'Respostas com duvida estao gerando saldo positivo. Marque com cautela em simulados.';
  }
  return 'Ainda ha poucos dados de confianca para recomendar uma regra de marcacao.';
}

function getExpectedAnswer(questionId) {
  const question = db.prepare(`
    SELECT q.id_question, q.type_question, q.desatualizada,
      ${currentLawStudyAnswerSql('q', 'c')} AS expected_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.id_question = ?
  `).get(questionId);
  if (!question) {
    return '';
  }
  const alternatives = db.prepare(`
    SELECT letter, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
  return normalizeExpectedAnswerForScoring(question, alternatives, question.expected_answer).answer;
}

function normalizeSimulationAnswer(questionId, rawAnswer, expected) {
  const alternatives = db.prepare(`
    SELECT letter, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
  const normalizedRaw = normalizeAnswer(rawAnswer);
  const selected = alternatives.find((item) => item.letter === normalizedRaw)
    || alternatives.find((item) => normalizeAnswer(item.text) === normalizedRaw)
    || { letter: normalizedRaw, text: rawAnswer };
  const isCorrect = expected ? Number(matchesExpectedAnswer(selected, expected)) : null;
  return {
    answer: selected.letter || normalizedRaw,
    isCorrect
  };
}

function getSmartQueueRows(searchParams, options = {}) {
  const { whereSql, values } = buildQuestionWhere(searchParams, {
    hideStudyExcluded: options.hideStudyExcluded !== false
  });
  const dueOnly = Boolean(options.dueOnly);
  const extraWhere = dueOnly
    ? "qm.next_due_at IS NOT NULL AND CAST(qm.next_due_at AS TEXT) != '' AND qm.next_due_at <= datetime('now')"
    : '';
  const finalWhere = appendWhere(whereSql, extraWhere);
  const answerSql = currentLawStudyAnswerSql('q', 'c');
  const currentLawVerifiedSql = currentLawVerifiedRowSql('qcla');

  return db.prepare(`
    SELECT
      q.id_question AS id,
      q.materia,
      q.assunto,
      q.anulada,
      q.desatualizada,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      qm.next_due_at,
      qm.last_result,
      COALESCE(qm.wrong_streak, 0) AS wrong_streak,
      CASE WHEN s.question_id IS NULL THEN 1 ELSE 0 END AS never_answered,
      CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 1 ELSE 0 END AS recent_wrong,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment,
      CASE WHEN ${answerSql} != '' THEN 1 ELSE 0 END AS has_answer,
      ${currentLawQueueSelect('qcla')},
      (
        CASE WHEN qm.next_due_at IS NOT NULL AND CAST(qm.next_due_at AS TEXT) != '' AND qm.next_due_at <= datetime('now') THEN 100 ELSE 0 END
        + CASE WHEN last_answer.is_correct = 0 OR qm.last_result = 0 THEN 80 ELSE 0 END
        + CASE WHEN s.question_id IS NULL THEN 60 ELSE 0 END
        + CASE WHEN COALESCE(qm.mastery_score, 0) < 0.4 THEN 40 ELSE 0 END
        + CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 20 ELSE 0 END
        + CASE WHEN ${answerSql} != '' THEN 20 ELSE 0 END
        - CASE WHEN COALESCE(q.anulada, 0) = 1 THEN 80 ELSE 0 END
        + CASE WHEN COALESCE(q.desatualizada, 0) = 1 AND (${currentLawVerifiedSql}) THEN 20 ELSE 0 END
        - CASE WHEN COALESCE(q.desatualizada, 0) = 1 AND NOT (${currentLawVerifiedSql}) THEN 60 ELSE 0 END
        - CASE
            WHEN COALESCE(qm.mastery_score, 0) >= 0.85
              AND (qm.next_due_at IS NULL OR CAST(qm.next_due_at AS TEXT) = '' OR qm.next_due_at > datetime('now'))
            THEN 50 ELSE 0
          END
      ) AS score
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${currentLawQueueJoin('q')}
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN (
      SELECT
        question_id,
        COUNT(*) AS total,
        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
        MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    ) s ON s.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = s.last_id
    ${finalWhere}
    ORDER BY
      score DESC,
      COALESCE(qm.next_due_at, '9999-12-31 23:59:59') ASC,
      COALESCE(s.wrong, 0) DESC,
      COALESCE(q.materia, ''),
      COALESCE(q.assunto, ''),
      q.id_question
    LIMIT ?
  `).all(...values, options.limit || 50).map((row) => ({
    ...row,
    reasons: smartReasons(row)
  }));
}

function getSubjectsRanking(searchParams) {
  const limit = Math.min(200, Math.max(10, Number(searchParams.get('limit') || 80)));
  const q = String(searchParams.get('q') || '').trim();
  const materia = String(searchParams.get('materia') || '').trim();
  const excludedMaterias = getExcludedMaterias(searchParams);
  const hideOutdated = searchParams.get('hideOutdated') === '1';
  const hideStudyExcluded = searchParams.get('hideStudyExcluded') === '1';
  const where = ["COALESCE(q.assunto, '') != ''"];
  const values = [];

  if (q) {
    where.push('(q.statement_text LIKE ? OR q.materia LIKE ? OR q.assunto LIKE ? OR CAST(q.id_question AS TEXT) LIKE ?)');
    values.push(...Array(4).fill(`%${q}%`));
  }
  if (materia) {
    where.push('q.materia = ?');
    values.push(materia);
  }
  applyExcludedMateriasFilter(where, values, excludedMaterias);
  if (hideOutdated) {
    where.push('COALESCE(q.desatualizada, 0) = 0');
  }
  if (hideStudyExcluded) {
    applyQuestionStudyStatusFilter(where);
  }

  const rows = db.prepare(`
    SELECT
      q.materia,
      q.assunto,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(q.desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 1 THEN 1 ELSE 0 END) AS canceled,
      SUM(CASE
        WHEN COALESCE(c.html_local, c.html, c.text, '') != ''
          AND COALESCE(c.source_type, '') != 'ai'
        THEN 1 ELSE 0
      END) AS comments,
      SUM(CASE
        WHEN COALESCE(c.html_local, c.html, c.text, '') != ''
          AND COALESCE(c.source_type, '') = 'ai'
        THEN 1 ELSE 0
      END) AS ai_comments,
      SUM(CASE
        WHEN EXISTS (SELECT 1 FROM study_answers sa WHERE sa.question_id = q.id_question)
        THEN 1 ELSE 0
      END) AS answered
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE ${where.join(' AND ')}
    GROUP BY q.materia, q.assunto
    ORDER BY total DESC, q.materia, q.assunto
    LIMIT ?
  `).all(...values, limit);

  return { rows };
}

async function getRepairQueue(searchParams) {
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)));
  const includeOutdated = searchParams.get('includeOutdated') === '1';
  const { whereSql, values } = buildQuestionWhere(searchParams, { hideStudyExcluded: true });
  const finalWhere = appendWhere(whereSql, `
    (
      last_answer.is_correct = 0
      OR COALESCE(qm.wrong_streak, 0) > 0
      OR (qm.question_id IS NOT NULL AND COALESCE(qm.mastery_score, 0) < 0.35)
    )
    ${includeOutdated ? '' : 'AND COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0'}
  `);

  const rows = db.prepare(`
    SELECT
      q.id_question AS id,
      q.materia,
      q.assunto,
      q.anulada,
      q.desatualizada,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      COALESCE(qm.wrong_streak, 0) AS wrong_streak,
      qm.last_error_type,
      qm.next_due_at,
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END AS has_comment
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN (
      SELECT question_id, MAX(id) AS last_id
      FROM study_answers
      GROUP BY question_id
    ) s ON s.question_id = q.id_question
    LEFT JOIN study_answers last_answer ON last_answer.id = s.last_id
    ${finalWhere}
    ORDER BY
      CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 0 ELSE 1 END,
      COALESCE(qm.wrong_streak, 0) DESC,
      COALESCE(qm.mastery_score, 0) ASC,
      COALESCE(qm.next_due_at, '9999-12-31 23:59:59') ASC,
      q.id_question
    LIMIT ?
  `).all(...values, limit);

  const enriched = [];
  for (const row of rows) {
    const theory = await findTheoryPdf(row.materia, row.assunto);
    enriched.push({
      ...row,
      theoryAvailable: Boolean(theory.available),
      theoryUrl: theory.available ? theory.url : '',
      suggestion: repairSuggestion(row, theory)
    });
  }

  return { rows: enriched };
}

function repairSuggestion(row, theory) {
  if (Number(row.has_comment)) {
    return 'revisar_comentario';
  }
  if (theory.available) {
    return 'abrir_teoria';
  }
  if (Number(row.wrong_streak || 0) > 1) {
    return 'resolver_questao_irma';
  }
  return 'repetir_depois';
}

function getSubjectMasteryRanking(searchParams) {
  const limit = Math.min(500, Math.max(10, Number(searchParams.get('limit') || 200)));
  const q = String(searchParams.get('q') || '').trim();
  const materia = String(searchParams.get('materia') || '').trim();
  const excludedMaterias = getExcludedMaterias(searchParams);
  const where = ["COALESCE(q.assunto, '') != ''"];
  const values = [];

  if (q) {
    where.push('(q.statement_text LIKE ? OR q.materia LIKE ? OR q.assunto LIKE ?)');
    values.push(...Array(3).fill(`%${q}%`));
  }
  if (materia) {
    where.push('q.materia = ?');
    values.push(materia);
  }
  applyExcludedMateriasFilter(where, values, excludedMaterias);

  const rows = db.prepare(`
    SELECT
      q.materia,
      q.assunto,
      COUNT(*) AS total_questions,
      COUNT(qm.question_id) AS answered_questions,
      ROUND(CAST(COALESCE(AVG(qm.mastery_score), 0) AS NUMERIC), 4) AS mastery_score,
      COALESCE(SUM(qm.wrong_count), 0) AS wrong_count,
      COALESCE(SUM(qm.correct_count), 0) AS correct_count,
      CASE
        WHEN COALESCE(SUM(qm.attempts), 0) = 0 THEN 0
        ELSE ROUND(100.0 * COALESCE(SUM(qm.wrong_count), 0) / SUM(qm.attempts), 2)
      END AS error_rate,
      SUM(CASE
        WHEN qm.next_due_at IS NOT NULL AND CAST(qm.next_due_at AS TEXT) != '' AND qm.next_due_at <= datetime('now')
        THEN 1 ELSE 0
      END) AS due_reviews,
      SUM(CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END) AS comments,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 1 THEN 1 ELSE 0 END) AS canceled,
      SUM(CASE WHEN COALESCE(q.desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated
    FROM questions q
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE ${where.join(' AND ')}
    GROUP BY q.materia, q.assunto
    ORDER BY mastery_score ASC, total_questions DESC, q.materia, q.assunto
    LIMIT ?
  `).all(...values, limit);

  return { rows };
}

function getNextSubjectTarget(currentId) {
  const current = db.prepare(`
    SELECT materia, assunto
    FROM questions
    WHERE id_question = ?
  `).get(currentId);

  if (!current?.materia) {
    return { id: null, reason: 'Questao atual sem materia.' };
  }

  const subjects = db.prepare(`
    SELECT assunto AS name, MIN(id_question) AS first_id
    FROM questions
    WHERE materia = ?
      AND COALESCE(assunto, '') != ''
    GROUP BY assunto
    ORDER BY assunto
  `).all(current.materia);

  if (!subjects.length) {
    return { id: null, reason: 'Materia sem assuntos cadastrados.' };
  }

  const currentSubject = String(current.assunto || '');
  let target = subjects.find((subject) => String(subject.name || '') > currentSubject);
  if (!target || target.name === currentSubject) {
    target = subjects.find((subject) => subject.name !== currentSubject) || subjects[0];
  }

  return {
    id: target.first_id,
    mode: 'subject',
    materia: current.materia,
    assunto: target.name || ''
  };
}

function getNormativeUpdate(questionId) {
  if (!hasNormativeUpdateTable()) {
    return { exists: false };
  }

  const row = db.prepare(`
    SELECT
      question_id,
      source_file,
      source_version,
      imported_at,
      gabarito_banco,
      resposta_extraida_historica,
      classificacao_normativa,
      por_que_desatualizada,
      fundamento_juridico_atual,
      nova_regra_estado_atual,
      gabarito_atualizado_provavel,
      observacao_enunciado_literal,
      mudanca_gabarito,
      recomendacao,
      nivel_seguranca,
      fonte_base,
      review_status,
      reviewed_at,
      reviewed_by,
      reviewer_notes
    FROM question_normative_updates
    WHERE question_id = ?
  `).get(questionId);

  if (!row) {
    return { exists: false };
  }

  return {
    exists: true,
    questionId: row.question_id,
    sourceFile: row.source_file || '',
    sourceVersion: row.source_version || '',
    importedAt: row.imported_at || '',
    gabaritoBanco: row.gabarito_banco || '',
    respostaExtraidaHistorica: row.resposta_extraida_historica || '',
    classificacaoNormativa: row.classificacao_normativa || '',
    porQueDesatualizada: row.por_que_desatualizada || '',
    fundamentoJuridicoAtual: row.fundamento_juridico_atual || '',
    novaRegraEstadoAtual: row.nova_regra_estado_atual || '',
    gabaritoAtualizadoProvavel: row.gabarito_atualizado_provavel || '',
    observacaoEnunciadoLiteral: row.observacao_enunciado_literal || '',
    mudancaGabarito: row.mudanca_gabarito || '',
    recomendacao: row.recomendacao || '',
    nivelSeguranca: row.nivel_seguranca || '',
    fonteBase: row.fonte_base || '',
    reviewStatus: row.review_status || 'pending',
    reviewedAt: row.reviewed_at || '',
    reviewedBy: row.reviewed_by || '',
    reviewerNotes: row.reviewer_notes || '',
    isManualReview: normativeTextHasManual(row.recomendacao) || normativeTextHasManual(row.mudanca_gabarito) || ['baixo', 'manual'].includes(normalizePlain(row.nivel_seguranca)),
    isDiscardable: normalizePlain(row.recomendacao).includes('descartar'),
    hasChangedAnswer: normalizePlain(row.mudanca_gabarito).startsWith('sim')
  };
}

function getCurrentLawAnswer(questionId) {
  if (!hasCurrentLawAnswerTable()) {
    return {
      exists: false,
      status: 'needs_audit',
      currentLawStatus: 'needs_audit',
      canAutoScore: false,
      canAutoScoreCurrentLaw: false
    };
  }

  const row = db.prepare(`
    SELECT
      question_id,
      historical_answer,
      current_answer,
      current_law_status,
      can_auto_score_current_law,
      do_not_use_historical_answer_in_current_law_mode,
      answer_changed,
      no_valid_alternative,
      should_discard_from_current_law_study,
      hide_from_main_study_until_verified,
      legal_basis,
      article_reference,
      article_excerpt,
      teacher_explanation,
      rule_summary,
      professor_complement,
      study_conclusion,
      teaching_comment_md,
      source_url,
      source_version,
      imported_at,
      updated_at
    FROM question_current_law_answers
    WHERE question_id = ?
    LIMIT 1
  `).get(questionId);

  if (!row) {
    return {
      exists: false,
      status: 'needs_audit',
      currentLawStatus: 'needs_audit',
      canAutoScore: false,
      canAutoScoreCurrentLaw: false
    };
  }

  const status = row.current_law_status || 'needs_audit';
  const canAutoScore = dbBoolean(row.can_auto_score_current_law);
  const noValidAlternative = dbBoolean(row.no_valid_alternative) || status === 'no_valid_alternative';
  const shouldDiscard = dbBoolean(row.should_discard_from_current_law_study) || status === 'discard';

  return {
    exists: true,
    questionId: row.question_id,
    historicalAnswer: row.historical_answer || '',
    currentAnswer: row.current_answer || '',
    status,
    currentLawStatus: status,
    canAutoScore,
    canAutoScoreCurrentLaw: canAutoScore,
    doNotUseHistoricalAnswerInCurrentLawMode: row.do_not_use_historical_answer_in_current_law_mode !== false && row.do_not_use_historical_answer_in_current_law_mode !== 0,
    answerChanged: dbBoolean(row.answer_changed),
    noValidAlternative,
    shouldDiscard,
    shouldDiscardFromCurrentLawStudy: shouldDiscard,
    hideFromMainStudyUntilVerified: dbBoolean(row.hide_from_main_study_until_verified),
    hasCurrentLawConflict: false,
    legalBasis: row.legal_basis || '',
    articleReference: row.article_reference || '',
    articleExcerpt: row.article_excerpt || '',
    teacherExplanation: row.teacher_explanation || '',
    ruleSummary: row.rule_summary || '',
    professorComplement: row.professor_complement || '',
    studyConclusion: row.study_conclusion || '',
    teachingCommentMd: row.teaching_comment_md || '',
    sourceUrl: row.source_url || '',
    sourceVersion: row.source_version || '',
    importedAt: row.imported_at || '',
    updatedAt: row.updated_at || ''
  };
}

function resolveCurrentLawCorrection(question, currentLawAnswer, alternatives = []) {
  const historicalExpected = normalizeExpectedAnswerForScoring(question, alternatives, question.expected_answer);
  const isCanceled = Boolean(Number(question.anulada || 0));
  if (!Number(question.desatualizada)) {
    const canScore = !isCanceled && Boolean(historicalExpected.answer);
    return {
      mode: 'historical',
      canScore,
      expectedAnswer: historicalExpected.answer,
      answerSource: historicalExpected.answer ? getBestAnswerSource(question) : 'missing',
      currentLawStatus: 'not_applicable',
      nonScoringReason: canScore ? '' : (isCanceled ? 'canceled' : historicalExpected.reason),
      shouldAppearInStudyNow: canScore,
      shouldAppearInViewAll: true,
      scoringVersion: SCORING_VERSION
    };
  }

  if (currentLawAnswer?.exists
    && (currentLawAnswer.status || currentLawAnswer.currentLawStatus) === 'verified'
    && (currentLawAnswer.canAutoScore || currentLawAnswer.canAutoScoreCurrentLaw)
    && currentLawAnswer.currentAnswer) {
    const currentExpected = normalizeExpectedAnswerForScoring(question, alternatives, currentLawAnswer.currentAnswer);
    const canScore = !isCanceled && Boolean(currentExpected.answer);
    return {
      mode: 'current_law',
      canScore,
      expectedAnswer: currentExpected.answer,
      answerSource: currentExpected.answer ? 'current_law_verified' : 'invalid_current_law_answer',
      currentLawStatus: currentLawAnswer.status || currentLawAnswer.currentLawStatus || 'verified',
      nonScoringReason: canScore ? '' : (isCanceled ? 'canceled' : currentExpected.reason),
      shouldAppearInStudyNow: canScore,
      shouldAppearInViewAll: true,
      scoringVersion: SCORING_VERSION
    };
  }

  const status = currentLawAnswer?.status || currentLawAnswer?.currentLawStatus || 'needs_audit';
  const reason = status === 'no_valid_alternative'
    ? 'no_valid_alternative'
    : status === 'discard'
      ? 'discard'
      : 'needs_audit';
  return {
    mode: 'non_scoring',
    canScore: false,
    expectedAnswer: '',
    answerSource: reason,
    currentLawStatus: status,
    nonScoringReason: reason,
    shouldAppearInStudyNow: false,
    shouldAppearInViewAll: reason !== 'discard',
    scoringVersion: SCORING_VERSION
  };
}

function resolveQuestionScoring(questionId) {
  const question = db.prepare(`
    SELECT
      q.id_question,
      q.type_question,
      q.anulada,
      q.desatualizada,
      q.official_answer,
      q.official_answer_source,
      (
        SELECT nq.answer
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
        ORDER BY nq.notebook_id, nq.position
        LIMIT 1
      ) AS notebook_answer,
      (
        SELECT nq.answer_source
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
        ORDER BY nq.notebook_id, nq.position
        LIMIT 1
      ) AS notebook_answer_source,
      ${currentLawStudyAnswerSql('q', 'c')} AS expected_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.id_question = ?
  `).get(questionId);
  if (!question) {
    return { exists: false, questionId };
  }
  const alternatives = db.prepare(`
    SELECT letter, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
  const currentLawAnswer = getCurrentLawAnswer(questionId);
  const correction = resolveCurrentLawCorrection(question, currentLawAnswer, alternatives);
  return {
    exists: true,
    questionId,
    isOutdated: Boolean(Number(question.desatualizada || 0)),
    isCanceled: Boolean(Number(question.anulada || 0)),
    ...correction
  };
}

function normalizeExpectedAnswerForScoring(question, alternatives = [], rawExpected = '') {
  const normalized = normalizeAnswer(rawExpected);
  if (!normalized) {
    return { answer: '', reason: 'missing_answer' };
  }

  const type = String(question?.type_question || '').toUpperCase();
  if (type === 'CERTO_ERRADO') {
    if (normalized === 'CERTO' || normalized === 'ERRADO') {
      return { answer: normalized, reason: '' };
    }
    if (normalized === 'C') {
      return { answer: 'CERTO', reason: '' };
    }
    if (normalized === 'E') {
      return { answer: 'ERRADO', reason: '' };
    }

    const alternative = alternatives.find((item) => normalizeAnswer(item.letter) === normalized);
    const alternativeText = normalizeAnswer(alternative?.text || '');
    if (alternativeText === 'CERTO' || alternativeText === 'ERRADO') {
      return { answer: alternativeText, reason: '' };
    }

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

function getNormativeTeachingComment(questionId) {
  if (!hasNormativeTeachingTable()) {
    return { exists: false };
  }

  const row = db.prepare(`
    SELECT
      question_id,
      ${qntcColumn('display_version')},
      ${qntcColumn('source_version')},
      ${qntcColumn('generated_at')},
      ${qntcColumn('generated_by')},
      ${qntcColumn('generation_method')},
      ${qntcColumn('generation_status')},
      ${qntcColumn('status')},
      ${qntcColumn('historical_answer')},
      ${qntcColumn('historical_answer_raw')},
      ${qntcColumn('current_answer')},
      ${qntcColumn('current_answer_raw')},
      ${qntcColumn('current_answer_confidence', '0')},
      ${qntcColumn('changed_answer')},
      ${qntcColumn('answer_policy')},
      ${qntcColumn('adaptation_status')},
      ${qntcColumn('study_recommendation')},
      ${qntcColumn('safety_level')},
      ${qntcColumn('recommendation')},
      ${qntcColumn('title')},
      ${qntcColumn('teaching_comment_md')},
      ${qntcColumn('teaching_comment_html')},
      ${qntcColumn('legal_basis')},
      ${qntcColumn('main_legal_basis')},
      ${qntcColumn('legal_article_reference')},
      ${qntcColumn('legal_article_excerpt')},
      ${qntcColumn('article_exactness')},
      ${qntcColumn('short_explanation_md')},
      ${qntcColumn('current_rule_summary')},
      ${qntcColumn('current_rule_summary_md')},
      ${qntcColumn('professor_complement_md')},
      ${qntcColumn('study_conclusion_md')},
      ${qntcColumn('why_outdated')},
      ${qntcColumn('literal_statement_note')},
      ${qntcColumn('source_base')},
      ${qntcColumn('alternatives_analysis', 'NULL')},
      ${qntcColumn('technical_details_json', 'NULL')},
      ${qntcColumn('review_status')},
      ${qntcColumn('reviewed_by')},
      ${qntcColumn('reviewed_at')},
      ${qntcColumn('reviewer_notes')}
    FROM question_normative_teaching_comments
    WHERE question_id = ?
    LIMIT 1
  `).get(questionId);

  if (!row) {
    return { exists: false };
  }

  const studentEdit = getNormativeTeachingStudentEdit(questionId);
  const hasStudentEdit = Boolean(studentEdit.exists);
  const legalBasis = pickStudentEditValue(studentEdit, 'legalBasisMd', row.legal_article_reference || row.main_legal_basis || row.legal_basis || '');
  const shortExplanationMd = pickStudentEditValue(studentEdit, 'shortExplanationMd', row.short_explanation_md || '');
  const currentRuleSummaryMd = pickStudentEditValue(studentEdit, 'currentRuleSummaryMd', row.current_rule_summary_md || '');
  const professorComplementMd = pickStudentEditValue(studentEdit, 'professorComplementMd', row.professor_complement_md || '');
  const studyConclusionMd = pickStudentEditValue(studentEdit, 'studyConclusionMd', row.study_conclusion_md || '');

  return {
    exists: true,
    questionId: row.question_id,
    displayVersion: row.display_version || '',
    sourceVersion: row.source_version || '',
    generatedAt: row.generated_at || '',
    generatedBy: row.generated_by || '',
    generationMethod: row.generation_method || '',
    generationStatus: row.generation_status || '',
    status: row.status || 'needs_manual_review',
    historicalAnswer: row.historical_answer || '',
    historicalAnswerRaw: row.historical_answer_raw || '',
    currentAnswer: row.current_answer || '',
    currentAnswerRaw: row.current_answer_raw || '',
    currentAnswerConfidence: Number(row.current_answer_confidence || 0),
    changedAnswer: row.changed_answer || '',
    answerChanged: Boolean(
      row.current_answer
        && row.historical_answer
        && String(row.current_answer) !== String(row.historical_answer)
    ) || normalizePlain(row.changed_answer).startsWith('sim'),
    answerPolicy: row.answer_policy || 'not_assertive_manual_review',
    adaptationStatus: row.adaptation_status || '',
    studyRecommendation: row.study_recommendation || '',
    safetyLevel: row.safety_level || '',
    recommendation: row.recommendation || '',
    title: row.title || '',
    adaptedStatement: '',
    shortExplanation: hasStudentEdit ? shortExplanationMd : (shortExplanationMd || row.title || ''),
    shortExplanationMd,
    teachingCommentMd: row.teaching_comment_md || '',
    teachingCommentHtml: sanitizeStoredHtml(row.teaching_comment_html),
    legalBasis,
    mainLegalBasis: hasStudentEdit ? '' : (row.main_legal_basis || ''),
    legalArticleReference: hasStudentEdit ? '' : (row.legal_article_reference || ''),
    legalArticleExcerpt: hasStudentEdit ? '' : (row.legal_article_excerpt || ''),
    articleExactness: row.article_exactness || '',
    articleExcerptCanQuote: !hasStudentEdit && Boolean(row.legal_article_excerpt && ['exact', 'topic_safe'].includes(row.article_exactness)),
    currentRuleSummary: hasStudentEdit ? currentRuleSummaryMd : (currentRuleSummaryMd || row.current_rule_summary || ''),
    currentRuleSummaryMd,
    professorComplementMd,
    studyConclusionMd,
    whyOutdated: row.why_outdated || '',
    literalStatementWarning: row.literal_statement_note || '',
    literalStatementNote: row.literal_statement_note || '',
    sourceBase: row.source_base || '',
    alternativesAnalysis: safeJsonParse(row.alternatives_analysis, []),
    technicalDetailsJson: safeJsonParse(row.technical_details_json, {}),
    reviewStatus: row.review_status || 'pending',
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at || '',
    reviewerNotes: row.reviewer_notes || '',
    studentEdit: {
      exists: hasStudentEdit,
      legalBasisMd: studentEdit.legalBasisMd || '',
      shortExplanationMd: studentEdit.shortExplanationMd || '',
      currentRuleSummaryMd: studentEdit.currentRuleSummaryMd || '',
      professorComplementMd: studentEdit.professorComplementMd || '',
      studyConclusionMd: studentEdit.studyConclusionMd || '',
      editedBy: studentEdit.editedBy || '',
      updatedAt: studentEdit.updatedAt || ''
    },
    isSafeCurrentRule: row.status === 'ready'
      && row.answer_policy === 'current_law_probable'
      && Boolean(row.current_answer)
      && !['baixo', 'low', 'manual'].includes(normalizePlain(row.safety_level))
  };
}

function applyCurrentLawTeachingOverride(teachingComment, currentLawAnswer, isOutdatedQuestion) {
  if (!isOutdatedQuestion || !currentLawAnswer?.exists || !teachingComment?.exists) {
    return teachingComment;
  }

  const canonicalAnswer = normalizeAnswer(currentLawAnswer.currentAnswer);
  const teachingAnswer = normalizeAnswer(teachingComment.currentAnswer);
  const hasCurrentLawConflict = Boolean(canonicalAnswer && teachingAnswer && canonicalAnswer !== teachingAnswer);

  currentLawAnswer.hasCurrentLawConflict = hasCurrentLawConflict;
  currentLawAnswer.conflictingTeachingAnswer = hasCurrentLawConflict ? teachingComment.currentAnswer || '' : '';

  return {
    ...teachingComment,
    supersededByCurrentLawAnswer: true,
    hasCurrentLawConflict,
    currentLawCanonicalAnswer: currentLawAnswer.currentAnswer || '',
    currentAnswer: currentLawAnswer.currentAnswer || '',
    currentAnswerRaw: currentLawAnswer.currentAnswer || '',
    currentAnswerConfidence: 0,
    answerPolicy: `superseded_by_current_law_answer:${currentLawAnswer.status || currentLawAnswer.currentLawStatus || 'needs_audit'}`,
    isSafeCurrentRule: false
  };
}

function getNormativeTeachingStudentEdit(questionId) {
  if (!hasNormativeTeachingStudentEditsTable()) {
    return { exists: false };
  }

  const row = db.prepare(`
    SELECT
      question_id,
      legal_basis_md,
      short_explanation_md,
      current_rule_summary_md,
      professor_complement_md,
      study_conclusion_md,
      edited_by,
      updated_at
    FROM question_normative_teaching_student_edits
    WHERE question_id = ?
    LIMIT 1
  `).get(questionId);

  if (!row) {
    return { exists: false };
  }

  return {
    exists: true,
    questionId: row.question_id,
    legalBasisMd: row.legal_basis_md ?? '',
    shortExplanationMd: row.short_explanation_md ?? '',
    currentRuleSummaryMd: row.current_rule_summary_md ?? '',
    professorComplementMd: row.professor_complement_md ?? '',
    studyConclusionMd: row.study_conclusion_md ?? '',
    editedBy: row.edited_by || '',
    updatedAt: row.updated_at || ''
  };
}

function pickStudentEditValue(studentEdit, fieldName, fallback) {
  if (studentEdit?.exists && Object.prototype.hasOwnProperty.call(studentEdit, fieldName)) {
    return studentEdit[fieldName] ?? '';
  }
  return fallback || '';
}

function saveNormativeReview(questionId, body) {
  if (!hasNormativeUpdateTable()) {
    return { error: 'Tabela de analise normativa ainda nao existe' };
  }
  if (!db.prepare('SELECT 1 FROM question_normative_updates WHERE question_id = ?').get(questionId)) {
    return { error: 'Analise normativa nao encontrada para esta questao' };
  }

  const reviewStatus = validChoice(body?.reviewStatus, [
    'pending',
    'approved',
    'rejected',
    'manual_review',
    'needs_research',
    'adapted',
    'discarded'
  ], '');
  if (!reviewStatus) {
    return { error: 'Status de revisao invalido' };
  }

  db.prepare(`
    UPDATE question_normative_updates
    SET review_status = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?,
        reviewer_notes = ?
    WHERE question_id = ?
  `).run(
    reviewStatus,
    String(body?.reviewedBy || 'local-user').slice(0, 120),
    String(body?.reviewerNotes || '').slice(0, 4000),
    questionId
  );

  return { ok: true, normativeUpdate: getNormativeUpdate(questionId) };
}

function saveNormativeTeachingReview(questionId, body) {
  if (!hasNormativeTeachingTable()) {
    return { error: 'Tabela de comentarios atualizados ainda nao existe' };
  }
  if (!db.prepare('SELECT 1 FROM question_normative_teaching_comments WHERE question_id = ?').get(questionId)) {
    return { error: 'Comentario atualizado nao encontrado para esta questao' };
  }

  const reviewStatus = validChoice(body?.reviewStatus, [
    'pending',
    'needs_manual_review',
    'auto_ready_pending_human_review',
    'approved',
    'rejected',
    'discarded_by_policy'
  ], '');
  if (!reviewStatus) {
    return { error: 'Status de revisao invalido' };
  }

  db.prepare(`
    UPDATE question_normative_teaching_comments
    SET review_status = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?,
        reviewer_notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE question_id = ?
  `).run(
    reviewStatus,
    String(body?.reviewedBy || 'local-user').slice(0, 120),
    String(body?.reviewerNotes || '').slice(0, 4000),
    questionId
  );

  return { ok: true, normativeTeachingComment: getNormativeTeachingComment(questionId) };
}

function saveNormativeTeachingStudentEdit(questionId, body) {
  if (!hasNormativeTeachingTable()) {
    return { error: 'Tabela de comentarios atualizados ainda nao existe' };
  }
  if (!db.prepare('SELECT 1 FROM question_normative_teaching_comments WHERE question_id = ?').get(questionId)) {
    return { error: 'Comentario atualizado nao encontrado para esta questao' };
  }

  if (body?.reset) {
    db.prepare('DELETE FROM question_normative_teaching_student_edits WHERE question_id = ?').run(questionId);
    return { ok: true, normativeTeachingComment: getNormativeTeachingComment(questionId) };
  }

  db.prepare(`
    INSERT INTO question_normative_teaching_student_edits (
      question_id,
      legal_basis_md,
      short_explanation_md,
      current_rule_summary_md,
      professor_complement_md,
      study_conclusion_md,
      edited_by,
      updated_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      legal_basis_md = excluded.legal_basis_md,
      short_explanation_md = excluded.short_explanation_md,
      current_rule_summary_md = excluded.current_rule_summary_md,
      professor_complement_md = excluded.professor_complement_md,
      study_conclusion_md = excluded.study_conclusion_md,
      edited_by = excluded.edited_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    questionId,
    limitText(body?.legalBasisMd, 12000),
    limitText(body?.shortExplanationMd, 24000),
    limitText(body?.currentRuleSummaryMd, 24000),
    limitText(body?.professorComplementMd, 24000),
    limitText(body?.studyConclusionMd, 24000),
    String(body?.editedBy || 'student').slice(0, 120)
  );

  return { ok: true, normativeTeachingComment: getNormativeTeachingComment(questionId) };
}

function saveCurrentLawAnswerEdit(questionId, body) {
  if (!hasCurrentLawAnswerTable()) {
    return { error: 'Tabela question_current_law_answers ainda nao existe.' };
  }

  const question = db.prepare(`
    SELECT q.id_question, q.type_question, q.desatualizada, q.anulada,
      ${historicalAnswerSql('q', 'c')} AS historical_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.id_question = ?
    LIMIT 1
  `).get(questionId);
  if (!question) {
    return { error: 'Questao nao encontrada.' };
  }
  if (!dbBoolean(question.desatualizada)) {
    return { error: 'Resposta atual so deve ser editada para questoes desatualizadas.' };
  }

  const alternatives = db.prepare(`
    SELECT letter, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
  const previous = getCurrentLawAnswer(questionId);
  const status = validChoice(body?.currentLawStatus || body?.status, [
    'verified',
    'needs_audit',
    'no_valid_alternative',
    'discard'
  ], previous.status || 'needs_audit');
  const canAutoScore = status === 'verified' && Boolean(body?.canAutoScore);
  const normalizedAnswer = normalizeExpectedAnswerForScoring(question, alternatives, body?.currentAnswer || '');
  if ((status === 'verified' || canAutoScore) && !normalizedAnswer.answer) {
    return { error: 'Gabarito atual invalido para o tipo da questao.' };
  }

  const currentAnswer = status === 'verified' ? normalizedAnswer.answer : '';
  const noValidAlternative = status === 'no_valid_alternative' || Boolean(body?.noValidAlternative);
  const shouldDiscard = status === 'discard' || Boolean(body?.shouldDiscard);
  const hideUntilVerified = status !== 'verified';
  const historicalAnswer = String(body?.historicalAnswer || previous.historicalAnswer || question.historical_answer || '').trim();
  const answerChanged = Boolean(currentAnswer && historicalAnswer && normalizeAnswer(currentAnswer) !== normalizeAnswer(historicalAnswer));
  const bindBoolean = (value) => (activeDbClient === 'postgres' ? Boolean(value) : (value ? 1 : 0));

  db.prepare(`
    INSERT INTO question_current_law_answers (
      question_id,
      historical_answer,
      current_answer,
      current_law_status,
      can_auto_score_current_law,
      do_not_use_historical_answer_in_current_law_mode,
      answer_changed,
      no_valid_alternative,
      should_discard_from_current_law_study,
      hide_from_main_study_until_verified,
      legal_basis,
      article_reference,
      article_excerpt,
      teacher_explanation,
      rule_summary,
      professor_complement,
      study_conclusion,
      source_url,
      verification_method,
      source_version,
      teaching_comment_md,
      updated_at,
      imported_at
    )
    VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      historical_answer = excluded.historical_answer,
      current_answer = excluded.current_answer,
      current_law_status = excluded.current_law_status,
      can_auto_score_current_law = excluded.can_auto_score_current_law,
      do_not_use_historical_answer_in_current_law_mode = excluded.do_not_use_historical_answer_in_current_law_mode,
      answer_changed = excluded.answer_changed,
      no_valid_alternative = excluded.no_valid_alternative,
      should_discard_from_current_law_study = excluded.should_discard_from_current_law_study,
      hide_from_main_study_until_verified = excluded.hide_from_main_study_until_verified,
      legal_basis = excluded.legal_basis,
      article_reference = excluded.article_reference,
      article_excerpt = excluded.article_excerpt,
      teacher_explanation = excluded.teacher_explanation,
      rule_summary = excluded.rule_summary,
      professor_complement = excluded.professor_complement,
      study_conclusion = excluded.study_conclusion,
      source_url = excluded.source_url,
      verification_method = excluded.verification_method,
      source_version = excluded.source_version,
      teaching_comment_md = excluded.teaching_comment_md,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    questionId,
    historicalAnswer,
    currentAnswer,
    status,
    bindBoolean(canAutoScore),
    bindBoolean(answerChanged),
    bindBoolean(noValidAlternative),
    bindBoolean(shouldDiscard),
    bindBoolean(hideUntilVerified),
    limitText(body?.legalBasis, 30000),
    limitText(body?.articleReference, 12000),
    limitText(body?.articleExcerpt, 30000),
    limitText(body?.teacherExplanation, 30000),
    limitText(body?.ruleSummary, 30000),
    limitText(body?.professorComplement, 30000),
    limitText(body?.studyConclusion, 30000),
    limitText(body?.sourceUrl, 2000),
    'operator_edit_current_law_answer',
    'operator-edit-2026-06-06',
    limitText(body?.teachingCommentMd, 60000)
  );

  return {
    ok: true,
    currentLawAnswer: getCurrentLawAnswer(questionId),
    normativeTeachingComment: applyCurrentLawTeachingOverride(
      getNormativeTeachingComment(questionId),
      getCurrentLawAnswer(questionId),
      true
    )
  };
}

function getQuestionStudyStatus(questionId) {
  if (!hasQuestionStudyStatusTable()) {
    return activeQuestionStudyStatus(questionId);
  }

  const row = db.prepare(`
    SELECT question_id, status, reason, notes, hidden_at, updated_at
    FROM question_study_status
    WHERE question_id = ?
    LIMIT 1
  `).get(questionId);

  if (!row || !['excluded', 'review_later'].includes(row.status)) {
    return activeQuestionStudyStatus(questionId);
  }

  return {
    questionId: row.question_id,
    status: row.status,
    reason: row.reason || '',
    notes: row.notes || '',
    hiddenAt: row.hidden_at || '',
    updatedAt: row.updated_at || '',
    isOutOfStudy: true
  };
}

function activeQuestionStudyStatus(questionId) {
  return {
    questionId,
    status: 'active',
    reason: '',
    notes: '',
    hiddenAt: '',
    updatedAt: '',
    isOutOfStudy: false
  };
}

function saveQuestionStudyStatus(questionId, body) {
  if (!db.prepare('SELECT 1 FROM questions WHERE id_question = ?').get(questionId)) {
    return { error: 'Questao nao encontrada' };
  }

  const status = validChoice(body?.status, ['active', 'excluded', 'review_later'], 'active');
  if (status === 'active') {
    db.prepare('DELETE FROM question_study_status WHERE question_id = ?').run(questionId);
    return { ok: true, studyStatus: getQuestionStudyStatus(questionId) };
  }

  const reason = validChoice(body?.reason, [
    'outdated_no_value',
    'obsolete_norm',
    'bad_statement',
    'duplicate',
    'manual_review',
    'other'
  ], 'other');
  const notes = String(body?.notes || '').slice(0, 1000);

  db.prepare(`
    INSERT INTO question_study_status (
      question_id, status, reason, notes, hidden_at, updated_at
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      notes = excluded.notes,
      hidden_at = CASE
        WHEN question_study_status.status = excluded.status
          AND question_study_status.hidden_at IS NOT NULL
        THEN question_study_status.hidden_at
        ELSE excluded.hidden_at
      END,
      updated_at = CURRENT_TIMESTAMP
  `).run(questionId, status, reason, notes);

  return { ok: true, studyStatus: getQuestionStudyStatus(questionId) };
}

function saveHistoricalCommentEdit(questionId, body) {
  if (!db.prepare('SELECT 1 FROM questions WHERE id_question = ?').get(questionId)) {
    return { error: 'Questao nao encontrada' };
  }

  const html = sanitizeStoredHtml(limitText(body?.html, 300000)).trim();
  const text = htmlToPlainText(html).slice(0, 200000);
  if (!html && !text) {
    return { error: 'A explicacao historica nao pode ficar vazia.' };
  }

  db.prepare(`
    INSERT INTO comments (
      question_id,
      html_local,
      text,
      source_type,
      user_edited_at,
      user_edited_by,
      checked_at
    )
    VALUES (?, ?, ?, 'manual_edit', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(question_id) DO UPDATE SET
      html_local = excluded.html_local,
      text = excluded.text,
      source_type = excluded.source_type,
      user_edited_at = CURRENT_TIMESTAMP,
      user_edited_by = excluded.user_edited_by,
      checked_at = CURRENT_TIMESTAMP
  `).run(questionId, html, text, String(body?.editedBy || 'student').slice(0, 120));

  if (body?.markNotOutdated) {
    db.prepare(`
      UPDATE questions
      SET desatualizada = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id_question = ?
    `).run(activeDbClient === 'postgres' ? false : 0, questionId);
  }

  const question = db.prepare(`
    SELECT
      q.desatualizada,
      COALESCE(c.html_local, c.html, '') AS comment_html,
      COALESCE(c.text, '') AS comment_text,
      COALESCE(c.professor, '') AS professor,
      COALESCE(c.date_text, '') AS comment_date,
      COALESCE(c.source_type, '') AS comment_source_type,
      COALESCE(c.ai_model, '') AS comment_ai_model,
      COALESCE(CAST(c.ai_generated_at AS TEXT), '') AS comment_ai_generated_at,
      COALESCE(CAST(c.user_edited_at AS TEXT), '') AS comment_user_edited_at,
      COALESCE(c.user_edited_by, '') AS comment_user_edited_by,
      ${historicalAnswerSql('q', 'c')} AS historical_answer,
      ${historicalAnswerSourceSql('q', 'c')} AS historical_answer_source,
      ${currentLawStudyAnswerSql('q', 'c')} AS study_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.id_question = ?
    LIMIT 1
  `).get(questionId);

  return {
    ok: true,
    metadata: {
      desatualizada: Boolean(question.desatualizada)
    },
    comment: {
      html: sanitizeStoredHtml(question.comment_html),
      text: question.comment_text || '',
      professor: question.professor || '',
      date: question.comment_date || '',
      extractedAnswer: question.historical_answer || '',
      historicalAnswer: question.historical_answer || '',
      historicalAnswerSource: question.historical_answer_source || '',
      studyAnswer: question.study_answer || '',
      sourceType: question.comment_source_type || '',
      aiModel: question.comment_ai_model || '',
      aiGeneratedAt: question.comment_ai_generated_at || '',
      userEditedAt: question.comment_user_edited_at || '',
      userEditedBy: question.comment_user_edited_by || ''
    }
  };
}

function normativeTextHasManual(value) {
  const normalized = normalizePlain(value);
  return normalized.includes('revisao manual') || normalized.includes('revisão manual');
}

function normalizePlain(value) {
  return String(value || '').trim().toLowerCase();
}

async function getQuestion(questionId) {
  const question = db.prepare(`
    SELECT
      q.*,
      COALESCE(c.html_local, c.html, '') AS comment_html,
      COALESCE(c.text, '') AS comment_text,
      COALESCE(c.professor, '') AS professor,
      COALESCE(c.date_text, '') AS comment_date,
      COALESCE(c.source_type, '') AS comment_source_type,
      COALESCE(c.ai_model, '') AS comment_ai_model,
      COALESCE(CAST(c.ai_generated_at AS TEXT), '') AS comment_ai_generated_at,
      COALESCE(CAST(c.user_edited_at AS TEXT), '') AS comment_user_edited_at,
      COALESCE(c.user_edited_by, '') AS comment_user_edited_by,
      COALESCE(c.extracted_answer, '') AS extracted_answer,
      COALESCE(qm.mastery_score, 0) AS mastery_score,
      COALESCE(qm.difficulty, 0.5) AS difficulty,
      COALESCE(qm.stability, 0) AS stability,
      qm.next_due_at,
      qm.last_seen_at,
      qm.last_confidence,
      qm.last_error_type,
      ${historicalAnswerSql('q', 'c')} AS historical_answer,
      ${historicalAnswerSourceSql('q', 'c')} AS historical_answer_source,
      ${currentLawStudyAnswerSql('q', 'c')} AS study_answer,
      ${currentLawStudyAnswerSql('q', 'c')} AS expected_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    WHERE q.id_question = ?
  `).get(questionId);

  if (!question) {
    return { error: 'Questao nao encontrada' };
  }

  const alternatives = db.prepare(`
    SELECT letter, position, html, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId).map((alternative) => ({
    ...alternative,
    html: sanitizeStoredHtml(alternative.html)
  }));

  const lastAnswer = db.prepare(`
    SELECT answer_letter, answer_text, expected_answer, is_correct, answered_at,
      confidence, error_type, elapsed_ms, study_mode, saw_comment, opened_theory
    FROM study_answers
    WHERE question_id = ?
    ORDER BY answered_at DESC, id DESC
    LIMIT 1
  `).get(questionId) || null;
  const answerStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
      SUM(CASE WHEN is_correct IS NULL THEN 1 ELSE 0 END) AS unknown
    FROM study_answers
    WHERE question_id = ?
  `).get(questionId);
  const theory = await findTheoryPdf(question.materia, question.assunto, {
    questionId,
    statementText: question.statement_text || ''
  });
  const normativeUpdate = getNormativeUpdate(questionId);
  const currentLawAnswer = getCurrentLawAnswer(questionId);
  const correction = resolveCurrentLawCorrection(question, currentLawAnswer, alternatives);
  const normativeTeachingComment = applyCurrentLawTeachingOverride(
    getNormativeTeachingComment(questionId),
    currentLawAnswer,
    Boolean(question.desatualizada)
  );
  const legalStudy = getQuestionLegalStudy(questionId);
  const appliedTheoryCard = getQuestionAppliedTheoryCard(questionId);
  const adaptive = getQuestionAdaptiveSummary(questionId);
  const studyStatus = getQuestionStudyStatus(questionId);

  return {
    id: question.id_question,
    statementHtml: sanitizeStoredHtml(question.statement_html),
    statementText: question.statement_text || '',
    alternatives,
    metadata: {
      banca: question.banca || '',
      cargo: question.cargo || '',
      ano: question.concurso_ano || '',
      materia: question.materia || '',
      assunto: question.assunto || '',
      tipo: question.type_question || '',
      anulada: Boolean(question.anulada),
      desatualizada: Boolean(question.desatualizada)
    },
    normativeUpdate,
    currentLawAnswer,
    normativeTeachingComment,
    appliedTheoryCard,
    legalStudy,
    answering: {
      historicalAnswer: question.historical_answer || '',
      historicalAnswerSource: question.historical_answer_source || '',
      studyAnswer: correction.expectedAnswer || '',
      studyAnswerSource: correction.answerSource || '',
      correctionMode: correction.mode || '',
      currentLawStatus: correction.currentLawStatus || '',
      nonScoringReason: correction.nonScoringReason || '',
      canScore: Boolean(correction.canScore)
    },
    studyStatus,
    adaptive,
    comment: {
      html: sanitizeStoredHtml(question.comment_html),
      text: question.comment_text || '',
      professor: question.professor || '',
      date: question.comment_date || '',
      extractedAnswer: question.historical_answer || '',
      historicalAnswer: question.historical_answer || '',
      historicalAnswerSource: question.historical_answer_source || '',
      studyAnswer: correction.expectedAnswer || '',
      answerSource: correction.answerSource || '',
      sourceType: question.comment_source_type || '',
      aiModel: question.comment_ai_model || '',
      aiGeneratedAt: question.comment_ai_generated_at || '',
      userEditedAt: question.comment_user_edited_at || '',
      userEditedBy: question.comment_user_edited_by || ''
    },
    theory,
    answerStats: {
      total: answerStats?.total || 0,
      correct: answerStats?.correct || 0,
      wrong: answerStats?.wrong || 0,
      unknown: answerStats?.unknown || 0
    },
    mastery: {
      score: question.mastery_score || 0,
      difficulty: question.difficulty || 0.5,
      stability: question.stability || 0,
      nextDueAt: question.next_due_at || '',
      lastSeenAt: question.last_seen_at || '',
      lastConfidence: question.last_confidence || '',
      lastErrorType: question.last_error_type || ''
    },
    lastAnswer
  };
}

function saveAnswer(questionId, body) {
  const alternatives = db.prepare(`
    SELECT letter, text
    FROM alternatives
    WHERE question_id = ?
    ORDER BY position
  `).all(questionId);
  const alternative = alternatives.find((item) => item.letter === String(body?.answer || '').toUpperCase());

  if (!alternative) {
    return { error: 'Alternativa invalida' };
  }

  const question = db.prepare(`
    SELECT
      q.id_question,
      q.materia,
      q.assunto,
      q.type_question,
      q.anulada,
      q.desatualizada,
      q.official_answer,
      q.official_answer_source,
      c.extracted_answer,
      (
        SELECT nq.answer
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
        ORDER BY nq.notebook_id, nq.position
        LIMIT 1
      ) AS notebook_answer,
      (
        SELECT nq.answer_source
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
        ORDER BY nq.notebook_id, nq.position
        LIMIT 1
      ) AS notebook_answer_source,
      ${bestAnswerSql('q', 'c')} AS expected_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.id_question = ?
  `).get(questionId);

  if (!question) {
    return { error: 'Questao nao encontrada' };
  }

  const currentLawAnswer = getCurrentLawAnswer(questionId);
  const correction = resolveCurrentLawCorrection(question, currentLawAnswer, alternatives);
  const expected = correction.expectedAnswer;
  const isCorrect = correction.canScore && expected ? Number(matchesExpectedAnswer(alternative, expected)) : null;
  const attemptMeta = normalizeAttemptMeta(body, isCorrect);
  const storedCorrectionMode = correction.canScore ? correction.mode : 'non_scoring';

  db.prepare(`
    INSERT INTO study_answers (
      question_id, answer_letter, answer_text, expected_answer, is_correct, answered_at,
      confidence, error_type, elapsed_ms, study_mode, saw_comment, opened_theory,
      session_id, correction_mode, expected_answer_source, non_scoring_reason,
      current_law_status_at_answer, scoring_version, created_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    questionId,
    alternative.letter,
    alternative.text || '',
    expected,
    isCorrect,
    attemptMeta.confidence,
    attemptMeta.errorType,
    attemptMeta.elapsedMs,
    attemptMeta.studyMode,
    attemptMeta.sawComment,
    attemptMeta.openedTheory,
    attemptMeta.sessionId,
    storedCorrectionMode,
    correction.answerSource || '',
    correction.nonScoringReason || '',
    correction.currentLawStatus || '',
    correction.scoringVersion || SCORING_VERSION
  );

  const mastery = isCorrect === null
    ? { masteryScore: null, nextDueAt: '', recommendation: 'not_scored' }
    : updateQuestionMastery(db, question, { isCorrect }, attemptMeta);
  const clusterMastery = isCorrect === null
    ? null
    : updateClusterMastery(db, questionId, { isCorrect }, attemptMeta);
  if (isCorrect !== null) {
    updateSubjectMastery(db, question);
  }
  updateStudySession(db, question, isCorrect, attemptMeta);
  setSetting('last_question_id', String(questionId));
  setSetting('last_answered_question_id', String(questionId));
  updateStudyFlowAnswered(questionId, attemptMeta);

  return {
    questionId,
    answer: alternative.letter,
    answerText: alternative.text || '',
    expectedAnswer: expected,
    answerSource: correction.answerSource,
    correctionMode: storedCorrectionMode,
    nonScoringReason: correction.nonScoringReason,
    currentLawStatusAtAnswer: correction.currentLawStatus || '',
    scoringVersion: correction.scoringVersion || SCORING_VERSION,
    confidence: attemptMeta.confidence,
    errorType: attemptMeta.errorType,
    answeredAt: new Date().toISOString(),
    normativeUpdate: getNormativeUpdate(questionId),
    currentLawAnswer,
    normativeTeachingComment: applyCurrentLawTeachingOverride(
      getNormativeTeachingComment(questionId),
      currentLawAnswer,
      Boolean(question.desatualizada)
    ),
    isCorrect,
    masteryScore: mastery.masteryScore,
    nextDueAt: mastery.nextDueAt,
    recommendation: mastery.recommendation,
    clusterMastery
  };
}

function saveQuestionEvent(questionId, body) {
  const eventType = validChoice(body?.eventType, [
    'opened_comment',
    'opened_theory',
    'revealed_answer',
    'started_question',
    'finished_question'
  ], '');

  if (!eventType) {
    return { error: 'Evento invalido' };
  }

  db.prepare(`
    INSERT INTO study_events (question_id, event_type, event_value, created_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  `).run(questionId, eventType, String(body?.eventValue || '').slice(0, 1000));

  return { ok: true };
}

function normalizeAttemptMeta(body, isCorrect) {
  const confidence = validChoice(body?.confidence, ['sure', 'doubt', 'guess'], 'sure');
  const errorType = isCorrect === 0
    ? validChoice(body?.errorType, ['content', 'interpretation', 'confusion', 'memory', 'outdated', 'misclick', 'other'], 'other')
    : '';
  const elapsedMs = Number(body?.elapsedMs);
  return {
    confidence,
    errorType,
    elapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.round(elapsedMs) : null,
    adjustedElapsedMs: Number.isFinite(elapsedMs) && elapsedMs >= 0 ? normalizeStudyElapsedMs(elapsedMs) : 0,
    studyMode: validChoice(body?.studyMode, ['study', 'review', 'exam', 'repair', 'smart', 'adaptive', 'all'], 'study'),
    sawComment: body?.sawComment ? 1 : 0,
    openedTheory: body?.openedTheory ? 1 : 0,
    sessionId: String(body?.sessionId || '').slice(0, 120)
  };
}

function updateQuestionMastery(database, question, answerResult, attemptMeta) {
  const previous = database.prepare(`
    SELECT *
    FROM question_mastery
    WHERE question_id = ?
  `).get(question.id_question) || {
    attempts: 0,
    correct_count: 0,
    wrong_count: 0,
    correct_streak: 0,
    wrong_streak: 0,
    mastery_score: 0,
    difficulty: 0.5,
    stability: 0
  };

  const now = new Date();
  const isCorrect = answerResult.isCorrect;
  const attempts = Number(previous.attempts || 0) + 1;
  const correctCount = Number(previous.correct_count || 0) + (isCorrect === 1 ? 1 : 0);
  const wrongCount = Number(previous.wrong_count || 0) + (isCorrect === 0 ? 1 : 0);
  let correctStreak = Number(previous.correct_streak || 0);
  let wrongStreak = Number(previous.wrong_streak || 0);
  let delta = 0;
  let intervalDays = 3;
  let recommendation = 'advance';

  if (isCorrect === 0) {
    wrongStreak += 1;
    correctStreak = 0;
    delta = attemptMeta.errorType === 'outdated' ? -0.08 : -0.25;
    intervalDays = 1;
    recommendation = 'repair_now';
  } else if (isCorrect === 1) {
    correctStreak += 1;
    wrongStreak = 0;
    if (attemptMeta.confidence === 'guess') {
      delta = 0.05;
      intervalDays = 2;
      recommendation = 'review_soon';
    } else if (attemptMeta.confidence === 'doubt') {
      delta = 0.12;
      intervalDays = 4;
      recommendation = 'review_soon';
    } else {
      delta = 0.2;
      intervalDays = correctStreak === 1 ? 7 : correctStreak === 2 ? 15 : correctStreak === 3 ? 30 : 60;
      recommendation = correctStreak >= 4 ? 'mastered' : 'advance';
    }
  } else {
    intervalDays = 3;
    recommendation = 'advance';
  }

  const masteryScore = clamp(Number(previous.mastery_score || 0) + delta, 0, 1);
  const difficulty = clamp(1 - masteryScore, 0, 1);
  const stability = intervalDays;
  const nextDueAt = formatSqlDate(addDays(now, intervalDays));
  const nowSql = formatSqlDate(now);

  database.prepare(`
    INSERT INTO question_mastery (
      question_id, attempts, correct_count, wrong_count, correct_streak, wrong_streak,
      last_result, last_confidence, last_error_type, last_seen_at, next_due_at,
      mastery_score, difficulty, stability, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(question_id) DO UPDATE SET
      attempts = excluded.attempts,
      correct_count = excluded.correct_count,
      wrong_count = excluded.wrong_count,
      correct_streak = excluded.correct_streak,
      wrong_streak = excluded.wrong_streak,
      last_result = excluded.last_result,
      last_confidence = excluded.last_confidence,
      last_error_type = excluded.last_error_type,
      last_seen_at = excluded.last_seen_at,
      next_due_at = excluded.next_due_at,
      mastery_score = excluded.mastery_score,
      difficulty = excluded.difficulty,
      stability = excluded.stability,
      updated_at = excluded.updated_at
  `).run(
    question.id_question,
    attempts,
    correctCount,
    wrongCount,
    correctStreak,
    wrongStreak,
    isCorrect,
    attemptMeta.confidence,
    attemptMeta.errorType,
    nowSql,
    nextDueAt,
    masteryScore,
    difficulty,
    stability,
    nowSql
  );

  return { masteryScore, nextDueAt, recommendation };
}

function updateSubjectMastery(database, question) {
  const materia = question.materia || '';
  const assunto = question.assunto || '';
  if (!materia || !assunto) {
    return;
  }

  const aggregate = database.prepare(`
    SELECT
      COUNT(qm.question_id) AS mastered_questions,
      COALESCE(SUM(qm.attempts), 0) AS attempts,
      COALESCE(SUM(qm.correct_count), 0) AS correct_count,
      COALESCE(SUM(qm.wrong_count), 0) AS wrong_count,
      COALESCE(AVG(qm.mastery_score), 0) AS mastery_score,
      MIN(qm.next_due_at) AS next_due_at,
      MAX(qm.last_seen_at) AS last_seen_at
    FROM questions q
    JOIN question_mastery qm ON qm.question_id = q.id_question
    WHERE q.materia = ? AND q.assunto = ?
  `).get(materia, assunto);

  database.prepare(`
    INSERT INTO subject_mastery (
      materia, assunto, attempts, correct_count, wrong_count, last_seen_at,
      next_due_at, mastery_score, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(materia, assunto) DO UPDATE SET
      attempts = excluded.attempts,
      correct_count = excluded.correct_count,
      wrong_count = excluded.wrong_count,
      last_seen_at = excluded.last_seen_at,
      next_due_at = excluded.next_due_at,
      mastery_score = excluded.mastery_score,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    materia,
    assunto,
    aggregate.attempts || 0,
    aggregate.correct_count || 0,
    aggregate.wrong_count || 0,
    aggregate.last_seen_at || null,
    aggregate.next_due_at || null,
    aggregate.mastery_score || 0
  );
}

function updateStudySession(database, question, isCorrect, attemptMeta) {
  if (!attemptMeta.sessionId) {
    return;
  }

  database.prepare(`
    INSERT INTO study_sessions (
      id, started_at, mode, materia, assunto, total_questions, correct_count, wrong_count, total_elapsed_ms
    )
    VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ended_at = CURRENT_TIMESTAMP,
      mode = COALESCE(NULLIF(excluded.mode, ''), study_sessions.mode),
      materia = COALESCE(NULLIF(excluded.materia, ''), study_sessions.materia),
      assunto = COALESCE(NULLIF(excluded.assunto, ''), study_sessions.assunto),
      total_questions = study_sessions.total_questions + 1,
      correct_count = study_sessions.correct_count + excluded.correct_count,
      wrong_count = study_sessions.wrong_count + excluded.wrong_count,
      total_elapsed_ms = COALESCE(study_sessions.total_elapsed_ms, 0) + excluded.total_elapsed_ms
  `).run(
    attemptMeta.sessionId,
    attemptMeta.studyMode,
    question.materia || '',
    question.assunto || '',
    isCorrect === 1 ? 1 : 0,
    isCorrect === 0 ? 1 : 0,
    attemptMeta.adjustedElapsedMs || 0
  );
}

function getBestAnswerSource(question) {
  if (question.official_answer) {
    return question.official_answer_source || 'official';
  }
  if (question.notebook_answer) {
    return question.notebook_answer_source || 'notebook';
  }
  if (question.extracted_answer) {
    return 'comment_extracted';
  }
  return 'missing';
}

function initQuestionStudyStatusSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_study_status (
      question_id BIGINT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active',
      reason TEXT,
      notes TEXT,
      hidden_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_question_study_status_status
      ON question_study_status(status);
    CREATE INDEX IF NOT EXISTS idx_question_study_status_reason
      ON question_study_status(reason);
  `);
}

function initTheoryPagesSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS theory_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_path TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      page_count INTEGER,
      materia TEXT,
      assunto TEXT,
      title TEXT,
      text TEXT,
      normalized_text TEXT,
      indexed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pdf_path, page_number)
    );

    CREATE INDEX IF NOT EXISTS idx_theory_pages_pdf
      ON theory_pages(pdf_path, page_number);
    CREATE INDEX IF NOT EXISTS idx_theory_pages_subject
      ON theory_pages(materia, assunto);
  `);
}

function initNormativeTeachingStudentEditsSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_normative_teaching_student_edits (
      question_id BIGINT PRIMARY KEY,
      legal_basis_md TEXT,
      short_explanation_md TEXT,
      current_rule_summary_md TEXT,
      professor_complement_md TEXT,
      study_conclusion_md TEXT,
      edited_by TEXT DEFAULT 'student',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_qntc_student_edits_updated
      ON question_normative_teaching_student_edits(updated_at);
  `);
}

function initQuestionCurrentLawAnswersSchema(database, client = 'sqlite') {
  if (client === 'postgres') {
    database.exec(`
      CREATE TABLE IF NOT EXISTS question_current_law_answers (
        question_id BIGINT PRIMARY KEY,
        historical_answer TEXT,
        current_answer TEXT,
        current_law_status TEXT NOT NULL DEFAULT 'needs_audit',
        can_auto_score_current_law BOOLEAN NOT NULL DEFAULT FALSE,
        do_not_use_historical_answer_in_current_law_mode BOOLEAN NOT NULL DEFAULT TRUE,
        answer_changed BOOLEAN,
        no_valid_alternative BOOLEAN NOT NULL DEFAULT FALSE,
        should_discard_from_current_law_study BOOLEAN NOT NULL DEFAULT FALSE,
        hide_from_main_study_until_verified BOOLEAN NOT NULL DEFAULT TRUE,
        legal_basis TEXT,
        article_reference TEXT,
        article_excerpt TEXT,
        teacher_explanation TEXT,
        rule_summary TEXT,
        professor_complement TEXT,
        study_conclusion TEXT,
        source_url TEXT,
        verification_method TEXT,
        source_version TEXT,
        teaching_comment_md TEXT,
        raw_json JSONB,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT qcla_status_check CHECK (
          current_law_status IN ('verified', 'needs_audit', 'no_valid_alternative', 'discard')
        ),
        CONSTRAINT qcla_autoscore_requires_answer CHECK (
          can_auto_score_current_law = FALSE OR current_answer IS NOT NULL
        )
      );

      CREATE INDEX IF NOT EXISTS idx_qcla_status ON question_current_law_answers(current_law_status);
      CREATE INDEX IF NOT EXISTS idx_qcla_autoscore ON question_current_law_answers(can_auto_score_current_law);
      CREATE INDEX IF NOT EXISTS idx_qcla_changed ON question_current_law_answers(answer_changed);
      CREATE INDEX IF NOT EXISTS idx_qcla_hide ON question_current_law_answers(hide_from_main_study_until_verified);
      CREATE INDEX IF NOT EXISTS idx_qcla_discard ON question_current_law_answers(should_discard_from_current_law_study);
    `);
    return;
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS question_current_law_answers (
      question_id INTEGER PRIMARY KEY,
      historical_answer TEXT,
      current_answer TEXT,
      current_law_status TEXT NOT NULL DEFAULT 'needs_audit',
      can_auto_score_current_law INTEGER NOT NULL DEFAULT 0,
      do_not_use_historical_answer_in_current_law_mode INTEGER NOT NULL DEFAULT 1,
      answer_changed INTEGER,
      no_valid_alternative INTEGER NOT NULL DEFAULT 0,
      should_discard_from_current_law_study INTEGER NOT NULL DEFAULT 0,
      hide_from_main_study_until_verified INTEGER NOT NULL DEFAULT 1,
      legal_basis TEXT,
      article_reference TEXT,
      article_excerpt TEXT,
      teacher_explanation TEXT,
      rule_summary TEXT,
      professor_complement TEXT,
      study_conclusion TEXT,
      source_url TEXT,
      verification_method TEXT,
      source_version TEXT,
      teaching_comment_md TEXT,
      raw_json TEXT,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_qcla_status ON question_current_law_answers(current_law_status);
    CREATE INDEX IF NOT EXISTS idx_qcla_autoscore ON question_current_law_answers(can_auto_score_current_law);
    CREATE INDEX IF NOT EXISTS idx_qcla_changed ON question_current_law_answers(answer_changed);
    CREATE INDEX IF NOT EXISTS idx_qcla_hide ON question_current_law_answers(hide_from_main_study_until_verified);
    CREATE INDEX IF NOT EXISTS idx_qcla_discard ON question_current_law_answers(should_discard_from_current_law_study);
  `);
}

function initLegalKnowledgeSchema(database, client = 'sqlite') {
  if (client === 'postgres') {
    database.exec(`
      CREATE TABLE IF NOT EXISTS legal_sources (
        id BIGSERIAL PRIMARY KEY,
        source_key TEXT UNIQUE NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        source_org TEXT,
        url TEXT NOT NULL,
        status TEXT,
        number TEXT,
        year INTEGER,
        published_at DATE,
        effective_at DATE,
        revoked_by TEXT,
        priority INTEGER DEFAULT 50,
        raw_text TEXT,
        raw_hash TEXT,
        fetched_at TIMESTAMPTZ,
        indexed_at TIMESTAMPTZ,
        import_error TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS legal_articles (
        id BIGSERIAL PRIMARY KEY,
        source_id BIGINT NOT NULL REFERENCES legal_sources(id) ON DELETE CASCADE,
        article_ref TEXT NOT NULL,
        article_order INTEGER,
        heading TEXT,
        text TEXT NOT NULL,
        normalized_text TEXT,
        excerpt TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, article_ref)
      );

      CREATE TABLE IF NOT EXISTS legal_topic_cards (
        id BIGSERIAL PRIMARY KEY,
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
        source_refs JSONB DEFAULT '[]'::jsonb,
        verified_status TEXT DEFAULT 'draft',
        generated_by TEXT DEFAULT 'system',
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS question_legal_links (
        id BIGSERIAL PRIMARY KEY,
        question_id BIGINT NOT NULL,
        legal_article_id BIGINT REFERENCES legal_articles(id) ON DELETE SET NULL,
        legal_card_id BIGINT REFERENCES legal_topic_cards(id) ON DELETE SET NULL,
        card_key TEXT,
        relation_type TEXT DEFAULT 'supports_answer',
        relevance_score NUMERIC DEFAULT 0,
        reason TEXT,
        source TEXT DEFAULT 'auto',
        display_mode TEXT,
        auto_show_as_primary BOOLEAN NOT NULL DEFAULT FALSE,
        needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
        precision_level TEXT,
        matched_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
        matched_terms_in_statement JSONB NOT NULL DEFAULT '[]'::jsonb,
        evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        current_law_status TEXT,
        current_law_can_auto_score BOOLEAN,
        current_law_answer TEXT,
        warning TEXT,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(question_id, legal_article_id, legal_card_id, relation_type)
      );

      ALTER TABLE question_legal_links
        ADD COLUMN IF NOT EXISTS card_key TEXT,
        ADD COLUMN IF NOT EXISTS display_mode TEXT,
        ADD COLUMN IF NOT EXISTS auto_show_as_primary BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS precision_level TEXT,
        ADD COLUMN IF NOT EXISTS matched_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS matched_terms_in_statement JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS current_law_status TEXT,
        ADD COLUMN IF NOT EXISTS current_law_can_auto_score BOOLEAN,
        ADD COLUMN IF NOT EXISTS current_law_answer TEXT,
        ADD COLUMN IF NOT EXISTS warning TEXT,
        ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

      CREATE TABLE IF NOT EXISTS legal_change_events (
        id BIGSERIAL PRIMARY KEY,
        source_id BIGINT REFERENCES legal_sources(id) ON DELETE SET NULL,
        change_key TEXT UNIQUE,
        title TEXT NOT NULL,
        previous_rule TEXT,
        current_rule TEXT,
        affected_topics JSONB DEFAULT '[]'::jsonb,
        affected_question_count INTEGER DEFAULT 0,
        effective_at DATE,
        source_url TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_study_lessons (
        id BIGSERIAL PRIMARY KEY,
        question_id BIGINT,
        legal_card_id BIGINT REFERENCES legal_topic_cards(id) ON DELETE SET NULL,
        lesson_type TEXT NOT NULL DEFAULT 'error_remedy',
        title TEXT NOT NULL,
        short_text TEXT NOT NULL,
        created_from TEXT DEFAULT 'system',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_legal_sources_type_number
        ON legal_sources(source_type, number, year);
      CREATE INDEX IF NOT EXISTS idx_legal_articles_source_ref
        ON legal_articles(source_id, article_ref);
      CREATE INDEX IF NOT EXISTS idx_legal_cards_materia_assunto
        ON legal_topic_cards(materia, assunto, microtema);
      CREATE INDEX IF NOT EXISTS idx_question_legal_links_question
        ON question_legal_links(question_id);
      CREATE INDEX IF NOT EXISTS idx_question_legal_links_card
        ON question_legal_links(legal_card_id);
      CREATE INDEX IF NOT EXISTS idx_question_legal_links_display_mode
        ON question_legal_links(display_mode);
      CREATE INDEX IF NOT EXISTS idx_question_legal_links_primary_safe
        ON question_legal_links(question_id, auto_show_as_primary, needs_human_review, display_mode);
      CREATE INDEX IF NOT EXISTS idx_question_legal_links_source
        ON question_legal_links(source);
    `);
    return;
  }

  database.exec(`
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
      card_key TEXT,
      relation_type TEXT DEFAULT 'supports_answer',
      relevance_score REAL DEFAULT 0,
      reason TEXT,
      source TEXT DEFAULT 'auto',
      display_mode TEXT,
      auto_show_as_primary INTEGER NOT NULL DEFAULT 0,
      needs_human_review INTEGER NOT NULL DEFAULT 0,
      precision_level TEXT,
      matched_terms TEXT DEFAULT '[]',
      matched_terms_in_statement TEXT DEFAULT '[]',
      evidence TEXT DEFAULT '{}',
      current_law_status TEXT,
      current_law_can_auto_score INTEGER,
      current_law_answer TEXT,
      warning TEXT,
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
    CREATE INDEX IF NOT EXISTS idx_question_legal_links_display_mode
      ON question_legal_links(display_mode);
    CREATE INDEX IF NOT EXISTS idx_question_legal_links_primary_safe
      ON question_legal_links(question_id, auto_show_as_primary, needs_human_review, display_mode);
    CREATE INDEX IF NOT EXISTS idx_question_legal_links_source
      ON question_legal_links(source);
  `);
  ensureSqliteLegalLinkPrecisionSchema(database);
}

function ensureSqliteLegalLinkPrecisionSchema(database) {
  const columns = [
    ['card_key', 'TEXT'],
    ['display_mode', 'TEXT'],
    ['auto_show_as_primary', 'INTEGER NOT NULL DEFAULT 0'],
    ['needs_human_review', 'INTEGER NOT NULL DEFAULT 0'],
    ['precision_level', 'TEXT'],
    ['matched_terms', "TEXT DEFAULT '[]'"],
    ['matched_terms_in_statement', "TEXT DEFAULT '[]'"],
    ['evidence', "TEXT DEFAULT '{}'"],
    ['current_law_status', 'TEXT'],
    ['current_law_can_auto_score', 'INTEGER'],
    ['current_law_answer', 'TEXT'],
    ['warning', 'TEXT'],
    ['imported_at', 'TEXT'],
    ['updated_at', 'TEXT']
  ];
  for (const [name, definition] of columns) {
    try {
      database.exec(`ALTER TABLE question_legal_links ADD COLUMN ${name} ${definition}`);
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column')) throw error;
    }
  }
}

function initQuestionAppliedTheorySchema(database, client = 'sqlite') {
  if (client === 'postgres') {
    database.exec(`
      CREATE TABLE IF NOT EXISTS question_applied_theory_cards (
        question_id BIGINT PRIMARY KEY REFERENCES questions(id_question) ON DELETE CASCADE,
        card_status TEXT NOT NULL CHECK (card_status IN ('published','draft_needs_review','needs_current_law_audit','no_valid_alternative','discarded','blocked')),
        source_mode TEXT NOT NULL CHECK (source_mode IN ('historical_law','current_law_verified','current_law_no_valid_alternative','current_law_needs_audit','current_law_discard')),
        historical_answer TEXT,
        current_answer TEXT,
        answer_changed BOOLEAN,
        no_valid_alternative BOOLEAN DEFAULT FALSE,
        title TEXT NOT NULL,
        question_focus TEXT NOT NULL,
        rule_that_solves_this_question TEXT NOT NULL,
        legal_basis TEXT NOT NULL,
        article_excerpt TEXT,
        applied_explanation TEXT NOT NULL,
        rule_summary_bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
        professor_tip TEXT,
        common_traps JSONB NOT NULL DEFAULT '[]'::jsonb,
        study_conclusion TEXT NOT NULL,
        show_warning TEXT,
        show_before_answer BOOLEAN NOT NULL DEFAULT FALSE,
        show_after_answer BOOLEAN NOT NULL DEFAULT TRUE,
        source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        teaching_card_md TEXT,
        teaching_card_html TEXT,
        generated_by TEXT,
        verified_status TEXT NOT NULL DEFAULT 'unverified',
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_qatc_status ON question_applied_theory_cards(card_status);
      CREATE INDEX IF NOT EXISTS idx_qatc_source_mode ON question_applied_theory_cards(source_mode);
      CREATE INDEX IF NOT EXISTS idx_qatc_current_answer ON question_applied_theory_cards(current_answer);

      CREATE TABLE IF NOT EXISTS question_applied_theory_generation_jobs (
        id BIGSERIAL PRIMARY KEY,
        question_id BIGINT NOT NULL REFERENCES questions(id_question) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 100,
        generation_policy TEXT NOT NULL,
        job_payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','generated','imported','failed','blocked')),
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(question_id, generation_policy)
      );
      CREATE INDEX IF NOT EXISTS idx_qat_jobs_status_priority ON question_applied_theory_generation_jobs(status, priority);
      CREATE INDEX IF NOT EXISTS idx_qat_jobs_question ON question_applied_theory_generation_jobs(question_id);
    `);
    ensureQuestionAppliedTheoryExactAnchorSchema(database, client);
    return;
  }

  database.exec(`
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
  ensureQuestionAppliedTheoryExactAnchorSchema(database, client);
}

function ensureQuestionAppliedTheoryExactAnchorSchema(database, client = 'sqlite') {
  if (client === 'postgres') {
    database.exec(`
      CREATE TABLE IF NOT EXISTS legal_article_segments (
        id BIGSERIAL PRIMARY KEY,
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
        is_current BOOLEAN DEFAULT TRUE,
        extraction_method TEXT,
        excerpt_hash TEXT,
        raw_context TEXT,
        extracted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(source_key, segment_ref, excerpt_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_legal_segments_source_ref ON legal_article_segments(source_key, segment_ref);
      CREATE INDEX IF NOT EXISTS idx_legal_segments_type ON legal_article_segments(segment_type);

      CREATE TABLE IF NOT EXISTS question_applied_theory_legal_anchors (
        id BIGSERIAL PRIMARY KEY,
        question_id BIGINT NOT NULL,
        card_id BIGINT,
        anchor_role TEXT DEFAULT 'primary',
        source_key TEXT NOT NULL,
        source_title TEXT,
        source_url TEXT,
        legal_locator TEXT NOT NULL,
        exact_excerpt TEXT NOT NULL,
        segment_id BIGINT REFERENCES legal_article_segments(id),
        applies_to_question_json JSONB,
        applies_to_alternatives_json JSONB,
        anchor_status TEXT DEFAULT 'verified',
        verification_method TEXT,
        verified_by TEXT,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_qatla_question ON question_applied_theory_legal_anchors(question_id);
      CREATE INDEX IF NOT EXISTS idx_qatla_card ON question_applied_theory_legal_anchors(card_id);
      CREATE INDEX IF NOT EXISTS idx_qatla_status ON question_applied_theory_legal_anchors(anchor_status);

      ALTER TABLE question_applied_theory_cards
        ADD COLUMN IF NOT EXISTS publish_status TEXT DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS answer_for_study TEXT,
        ADD COLUMN IF NOT EXISTS legal_anchor_quality TEXT DEFAULT 'missing',
        ADD COLUMN IF NOT EXISTS primary_legal_locator TEXT,
        ADD COLUMN IF NOT EXISTS primary_exact_excerpt TEXT,
        ADD COLUMN IF NOT EXISTS exact_excerpt_source_url TEXT,
        ADD COLUMN IF NOT EXISTS exact_anchor_verified BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS exact_anchor_review_status TEXT DEFAULT 'missing',
        ADD COLUMN IF NOT EXISTS issue_mapping_json JSONB,
        ADD COLUMN IF NOT EXISTS why_correct_json JSONB,
        ADD COLUMN IF NOT EXISTS why_wrong_json JSONB,
        ADD COLUMN IF NOT EXISTS should_show_as_applied_theory BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS validation_errors_json JSONB,
        ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS raw_json JSONB;
      CREATE INDEX IF NOT EXISTS idx_qatc_publish_status ON question_applied_theory_cards(publish_status);
      CREATE INDEX IF NOT EXISTS idx_qatc_anchor_quality ON question_applied_theory_cards(legal_anchor_quality);
      CREATE INDEX IF NOT EXISTS idx_qatc_show_applied ON question_applied_theory_cards(should_show_as_applied_theory);
    `);
    return;
  }

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
      database.exec(`ALTER TABLE question_applied_theory_cards ADD COLUMN ${name} ${definition}`);
    } catch (error) {
      if (!String(error?.message || '').includes('duplicate column')) throw error;
    }
  }
  database.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_qatc_publish_status ON question_applied_theory_cards(publish_status);
    CREATE INDEX IF NOT EXISTS idx_qatc_anchor_quality ON question_applied_theory_cards(legal_anchor_quality);
    CREATE INDEX IF NOT EXISTS idx_qatc_show_applied ON question_applied_theory_cards(should_show_as_applied_theory);
  `);
}

function initStudySchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS study_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer_letter TEXT NOT NULL,
      answer_text TEXT,
      expected_answer TEXT,
      is_correct INTEGER,
      answered_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_study_answers_question ON study_answers(question_id);

    CREATE TABLE IF NOT EXISTS study_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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
      total_elapsed_ms INTEGER DEFAULT 0,
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
  `);

  ensureColumn(database, 'study_answers', 'confidence', 'TEXT');
  ensureColumn(database, 'study_answers', 'error_type', 'TEXT');
  ensureColumn(database, 'study_answers', 'elapsed_ms', 'INTEGER');
  ensureColumn(database, 'study_answers', 'study_mode', 'TEXT');
  ensureColumn(database, 'study_answers', 'saw_comment', 'INTEGER DEFAULT 0');
  ensureColumn(database, 'study_answers', 'opened_theory', 'INTEGER DEFAULT 0');
  ensureColumn(database, 'study_answers', 'session_id', 'TEXT');
  ensureColumn(database, 'study_answers', 'created_at', 'TEXT');
  ensureColumn(database, 'study_answers', 'correction_mode', 'TEXT');
  ensureColumn(database, 'study_answers', 'expected_answer_source', 'TEXT');
  ensureColumn(database, 'study_answers', 'non_scoring_reason', 'TEXT');
  ensureColumn(database, 'study_answers', 'current_law_status_at_answer', 'TEXT');
  ensureColumn(database, 'study_answers', 'scoring_version', 'TEXT');
  ensureColumn(database, 'questions', 'official_answer', 'TEXT');
  ensureColumn(database, 'questions', 'official_answer_source', 'TEXT');
  ensureColumn(database, 'notebook_questions', 'answer', 'TEXT');
  ensureColumn(database, 'notebook_questions', 'answer_source', 'TEXT');
  ensureColumn(database, 'notebook_questions', 'raw_json', 'TEXT');
  ensureColumn(database, 'comments', 'html_local', 'TEXT');
  ensureColumn(database, 'comments', 'source_type', 'TEXT');
  ensureColumn(database, 'comments', 'ai_model', 'TEXT');
  ensureColumn(database, 'comments', 'ai_generated_at', 'TEXT');
  ensureColumn(database, 'comments', 'ai_confidence', 'REAL');
  initAdaptiveStudySchema(database);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_answers_created ON study_answers(created_at);
    CREATE INDEX IF NOT EXISTS idx_study_answers_session ON study_answers(session_id);
    CREATE INDEX IF NOT EXISTS idx_question_mastery_due ON question_mastery(next_due_at);
    CREATE INDEX IF NOT EXISTS idx_question_mastery_score ON question_mastery(mastery_score);
    CREATE INDEX IF NOT EXISTS idx_question_mastery_result ON question_mastery(last_result);
    CREATE INDEX IF NOT EXISTS idx_subject_mastery_score ON subject_mastery(mastery_score);
    CREATE INDEX IF NOT EXISTS idx_subject_mastery_due ON subject_mastery(next_due_at);
    CREATE INDEX IF NOT EXISTS idx_study_events_question ON study_events(question_id, event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_question_answer_audit_question ON question_answer_audit(question_id, source);
    CREATE INDEX IF NOT EXISTS idx_question_skill_tags_question ON question_skill_tags(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_skill_tags_skill ON question_skill_tags(skill_key);
    CREATE INDEX IF NOT EXISTS idx_theory_links_question ON theory_links(question_id);
    CREATE INDEX IF NOT EXISTS idx_theory_links_skill ON theory_links(skill_key);
    CREATE INDEX IF NOT EXISTS idx_exam_subject_weights_profile ON exam_subject_weights(profile_id);
    CREATE INDEX IF NOT EXISTS idx_exam_subject_weights_subject ON exam_subject_weights(subject_key);
    CREATE INDEX IF NOT EXISTS idx_subject_aliases_raw ON subject_aliases(raw_materia, raw_assunto);
    CREATE INDEX IF NOT EXISTS idx_subject_aliases_subject ON subject_aliases(subject_key);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_question ON question_exam_subjects(question_id);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_profile ON question_exam_subjects(profile_id);
    CREATE INDEX IF NOT EXISTS idx_question_exam_subjects_subject ON question_exam_subjects(subject_key);
    CREATE INDEX IF NOT EXISTS idx_exam_simulation_items_simulation ON exam_simulation_items(simulation_id);
    CREATE INDEX IF NOT EXISTS idx_exam_simulation_items_question ON exam_simulation_items(question_id);

    UPDATE study_answers
    SET created_at = COALESCE(NULLIF(created_at, ''), NULLIF(answered_at, ''), CURRENT_TIMESTAMP)
    WHERE created_at IS NULL OR created_at = '';
  `);
}

function initHistoricalCommentEditSchema(database) {
  ensureColumn(database, 'comments', 'html_local', 'TEXT');
  ensureColumn(database, 'comments', 'user_edited_at', 'TEXT');
  ensureColumn(database, 'comments', 'user_edited_by', 'TEXT');
}

function initAdaptiveStudySchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_key TEXT UNIQUE,
      cluster_type TEXT NOT NULL,
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
      cluster_policy TEXT DEFAULT 'interleave',
      max_visible_per_pass INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS question_cluster_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      role TEXT DEFAULT 'variant',
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
      reason TEXT,
      cluster_id INTEGER,
      served_context_json TEXT
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

  ensureColumn(database, 'question_clusters', 'cluster_policy', "TEXT DEFAULT 'interleave'");
  ensureColumn(database, 'question_clusters', 'max_visible_per_pass', 'INTEGER DEFAULT 1');
  ensureColumn(database, 'study_served_questions', 'cluster_id', 'INTEGER');
  ensureColumn(database, 'study_served_questions', 'served_context_json', 'TEXT');

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_study_served_questions_cluster_recent
      ON study_served_questions(cluster_id, served_at);

    UPDATE question_clusters
    SET
      cluster_policy = CASE
        WHEN COALESCE(size, 0) > 40 THEN 'stats_only'
        WHEN cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 'suppress_variants'
        WHEN cluster_type = 'same_skill' THEN 'stats_only'
        ELSE COALESCE(NULLIF(cluster_policy, ''), 'interleave')
      END,
      max_visible_per_pass = CASE
        WHEN COALESCE(size, 0) <= 40
          AND cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 1
        ELSE COALESCE(max_visible_per_pass, 999)
      END
    WHERE COALESCE(cluster_policy, '') = ''
       OR cluster_policy = 'interleave'
       OR max_visible_per_pass IS NULL;
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
  for (const profile of [
    ['prf_otimizado', 'PRF Otimizado', 'Fila adaptativa padrao para PRF.', 1],
    ['revisar_erros', 'Revisar erros', 'Prioriza erros recentes e clusters frageis.', 0],
    ['revisar_hoje', 'Revisar hoje', 'Prioriza revisoes vencidas.', 0],
    ['ver_todas', 'Ver todas', 'Acesso completo ao banco.', 0]
  ]) {
    upsert.run(...profile);
  }
}

function ensureStudyTimeColumns(database) {
  ensureColumn(database, 'study_sessions', 'total_elapsed_ms', 'INTEGER DEFAULT 0');
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function getStudyState() {
  const flow = getStudyFlowState();
  return {
    resumeLast: getSetting('resume_last', '1') !== '0',
    lastQuestionId: Number(getSetting('last_question_id', '0')) || null,
    lastAnsweredQuestionId: Number(getSetting('last_answered_question_id', '0')) || null,
    flow: flow ? {
      currentMode: flow.current_mode || '',
      currentProfile: flow.current_profile || '',
      currentMateria: flow.current_materia || '',
      currentAssunto: flow.current_assunto || '',
      lastOpenQuestionId: Number(flow.last_open_question_id || 0) || null,
      lastOpenedAt: flow.last_opened_at || '',
      lastAnsweredQuestionId: Number(flow.last_answered_question_id || 0) || null,
      lastAnsweredAt: flow.last_answered_at || ''
    } : null
  };
}

function saveStudyState(body) {
  if (Object.prototype.hasOwnProperty.call(body, 'resumeLast')) {
    setSetting('resume_last', body.resumeLast ? '1' : '0');
  }
  if (body.currentQuestionId) {
    const questionId = Number(body.currentQuestionId);
    setSetting('last_question_id', String(questionId));
    updateStudyFlowOpen(questionId, body);
  }

  return getStudyState();
}

function getStudyFlowState() {
  return db.prepare('SELECT * FROM study_flow_state WHERE id = 1').get() || null;
}

function updateStudyFlowOpen(questionId, body = {}) {
  if (!questionId) return;
  db.prepare(`
    INSERT INTO study_flow_state (
      id, current_mode, current_profile, current_materia, current_assunto,
      last_open_question_id, last_opened_at, updated_at
    )
    VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      current_mode = COALESCE(NULLIF(excluded.current_mode, ''), study_flow_state.current_mode),
      current_profile = COALESCE(NULLIF(excluded.current_profile, ''), study_flow_state.current_profile),
      current_materia = excluded.current_materia,
      current_assunto = excluded.current_assunto,
      last_open_question_id = excluded.last_open_question_id,
      last_opened_at = excluded.last_opened_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    String(body.mode || body.studyMode || '').slice(0, 80),
    String(body.profile || body.profileId || '').slice(0, 120),
    String(body.materia || '').slice(0, 300),
    String(body.assunto || '').slice(0, 500),
    questionId
  );
}

function updateStudyFlowAnswered(questionId, attemptMeta = {}) {
  if (!questionId) return;
  db.prepare(`
    INSERT INTO study_flow_state (
      id, current_mode, last_answered_question_id, last_answered_at, updated_at
    )
    VALUES (1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      current_mode = COALESCE(NULLIF(excluded.current_mode, ''), study_flow_state.current_mode),
      last_answered_question_id = excluded.last_answered_question_id,
      last_answered_at = excluded.last_answered_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(String(attemptMeta.studyMode || '').slice(0, 80), questionId);
}

function wasQuestionAnsweredAfter(questionId, openedAt) {
  if (!questionId || !openedAt) return false;
  const row = db.prepare(`
    SELECT 1 AS answered
    FROM study_answers
    WHERE question_id = ?
      AND answered_at >= ?
    ORDER BY answered_at DESC, id DESC
    LIMIT 1
  `).get(questionId, openedAt);
  return Boolean(row);
}

function isQuestionInFutureReview(questionId) {
  if (!questionId) return false;
  const row = db.prepare(`
    SELECT 1 AS future_review
    FROM question_mastery qm
    WHERE qm.question_id = ?
      AND qm.next_due_at IS NOT NULL
      AND CAST(qm.next_due_at AS TEXT) != ''
      AND qm.next_due_at > CURRENT_TIMESTAMP
      AND (
        EXISTS (
          SELECT 1
          FROM study_answers sa
          WHERE sa.question_id = qm.question_id
        )
        OR COALESCE(qm.attempts, 0) > 0
        OR qm.last_result IS NOT NULL
      )
    LIMIT 1
  `).get(questionId);
  return Boolean(row);
}

function recordServedQuestion(questionId, { mode = '', profileId = '', source = '', reason = '', clusterId = null, servedContext = null } = {}) {
  if (!questionId) return;
  db.prepare(`
    INSERT INTO study_served_questions (
      question_id, mode, profile_id, source, reason, cluster_id, served_context_json, served_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    questionId,
    String(mode || '').slice(0, 80),
    String(profileId || '').slice(0, 120),
    String(source || '').slice(0, 80),
    String(reason || '').slice(0, 300),
    clusterId ? Number(clusterId) : null,
    servedContext ? JSON.stringify(servedContext) : null
  );
}

function getFallbackQuestionId(searchParams, extra = {}) {
  const { whereSql, values } = buildQuestionWhere(searchParams, extra);
  const finalWhere = extra.hideFutureReviews
    ? appendWhere(whereSql, `
      NOT EXISTS (
        SELECT 1
        FROM question_mastery qm_future
        WHERE qm_future.question_id = q.id_question
          AND qm_future.next_due_at IS NOT NULL
          AND CAST(qm_future.next_due_at AS TEXT) != ''
          AND qm_future.next_due_at > CURRENT_TIMESTAMP
          AND (
            EXISTS (
              SELECT 1
              FROM study_answers sa_future
              WHERE sa_future.question_id = qm_future.question_id
            )
            OR COALESCE(qm_future.attempts, 0) > 0
            OR qm_future.last_result IS NOT NULL
          )
      )
    `)
    : whereSql;
  const row = db.prepare(`
    SELECT q.id_question AS id
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    ${finalWhere}
    ORDER BY COALESCE(q.materia, ''), COALESCE(q.assunto, ''), q.id_question
    LIMIT 1
  `).get(...values);
  return row?.id || null;
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM study_settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO study_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function matchesExpectedAnswer(alternative, expected) {
  const normalizedExpected = normalizeAnswer(expected);
  const normalizedLetter = normalizeAnswer(alternative.letter);
  const normalizedText = normalizeAnswer(alternative.text);
  return normalizedExpected === normalizedLetter
    || normalizedExpected === normalizedText
    || matchesCertoErradoAlias(normalizedExpected, normalizedText);
}

function matchesCertoErradoAlias(answer, text) {
  return (answer === 'C' && text === 'CERTO') || (answer === 'E' && text === 'ERRADO');
}

function normalizeAnswer(value) {
  const text = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (text.includes('CERTO')) return 'CERTO';
  if (text.includes('ERRADO')) return 'ERRADO';
  const letter = text.match(/\b[A-E]\b/);
  return letter ? letter[0] : text;
}

function dbBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
}

function validChoice(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : fallback;
}

function limitText(value, maxLength) {
  return String(value ?? '').slice(0, maxLength);
}

function resolveProfileId(requested) {
  const profileId = String(requested || '').trim()
    || db.prepare('SELECT id FROM exam_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get()?.id
    || 'prf_2021_qconcursos_disciplina';
  if (!db.prepare('SELECT 1 FROM exam_profiles WHERE id = ?').get(profileId)) {
    throw new Error(`Perfil de prova nao encontrado: ${profileId}`);
  }
  return profileId;
}

function getExamProfile(profileId) {
  return db.prepare(`
    SELECT id, name, description, source, source_url, is_active
    FROM exam_profiles
    WHERE id = ?
  `).get(profileId) || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatSqlDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function currentSqlTimestamp() {
  return formatSqlDate(new Date());
}

function isDue(value) {
  if (!value) return false;
  if (value instanceof Date) return value.getTime() <= Date.now();
  const normalized = String(value).trim().replace(' ', 'T');
  const parsed = new Date(normalized);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
}

function sanitizeStoredHtml(html) {
  return normalizeLocalAssetRefs(String(html || ''))
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<p\b[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeLocalAssetRefs(html) {
  return html.replace(/(<img\b[^>]*\bsrc\s*=\s*['"])(assets\/[^'"]+)(['"])/gi, '$1/$2$3');
}

function trimPreview(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

async function findTheoryPdf(materia, assunto, context = {}) {
  if (!materia || !assunto) {
    return { available: false };
  }

  const matterDir = await findBestDirectory(pdfsDir, materia);
  if (!matterDir) {
    return findTheoryPdfByIndexedContent(materia, assunto, context)
      || { available: false, reason: 'matter_directory_not_found' };
  }

  const files = await fs.readdir(matterDir, { withFileTypes: true }).catch(() => []);
  const pdfs = files
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => ({
      name: entry.name,
      path: path.join(matterDir, entry.name),
      normalized: normalizeTheoryTitle(stripPdfExtension(entry.name))
    }));

  const subject = normalizeTheoryTitle(assunto);
  let best = null;
  for (const pdf of pdfs) {
    const score = theoryMatchScore(pdf.normalized, subject);
    if (!best || score > best.score) {
      best = { ...pdf, score };
    }
  }

  if (!best || best.score < 0.58) {
    return findTheoryPdfByIndexedContent(materia, assunto, context)
      || { available: false, reason: 'pdf_filename_match_below_threshold', bestScore: best?.score || 0 };
  }

  const relativePath = normalizePath(path.relative(pdfsDir, best.path));
  const baseUrl = `/pdfs/${encodePath(relativePath)}`;
  const pageMatch = findBestTheoryPage(relativePath, {
    materia,
    assunto,
    statementText: context.statementText || ''
  });
  const pageNumber = pageMatch?.pageNumber || null;

  return {
    available: true,
    title: stripPdfExtension(best.name).replace(/^\d+\s*-\s*/, ''),
    url: pageNumber ? `${baseUrl}#page=${pageNumber}` : baseUrl,
    baseUrl,
    pdfPath: relativePath,
    score: best.score,
    indexed: Boolean(pageMatch?.indexed),
    pageStart: pageNumber,
    pageEnd: pageNumber,
    pageCount: pageMatch?.pageCount || null,
    pageScore: pageMatch?.score || 0,
    excerpt: pageMatch?.excerpt || '',
    matchStrategy: 'filename'
  };
}

function findTheoryPdfByIndexedContent(materia, assunto, context = {}) {
  const pageMatch = findBestTheoryPageByContent({
    materia,
    assunto,
    statementText: context.statementText || ''
  });

  if (!pageMatch?.pdfPath || !pageMatch.pageNumber) {
    return null;
  }

  const baseUrl = `/pdfs/${encodePath(pageMatch.pdfPath)}`;
  const title = pageMatch.title || stripPdfExtension(path.basename(pageMatch.pdfPath)).replace(/^\d+\s*-\s*/, '');
  return {
    available: true,
    title,
    url: `${baseUrl}#page=${pageMatch.pageNumber}`,
    baseUrl,
    pdfPath: pageMatch.pdfPath,
    score: pageMatch.pdfScore || 0,
    indexed: true,
    pageStart: pageMatch.pageNumber,
    pageEnd: pageMatch.pageNumber,
    pageCount: pageMatch.pageCount || null,
    pageScore: pageMatch.score || 0,
    excerpt: pageMatch.excerpt || '',
    matchStrategy: 'content_index'
  };
}

function findBestTheoryPageByContent(context = {}) {
  if (!hasTheoryPagesTable()) {
    return null;
  }

  const tokens = buildTheorySearchTokens(context);
  if (!tokens.length) {
    return null;
  }

  const exactRows = context.materia
    ? db.prepare(`
      SELECT pdf_path, page_number, page_count, materia, assunto, title, text, normalized_text
      FROM theory_pages
      WHERE materia = ?
      ORDER BY pdf_path, page_number
    `).all(context.materia)
    : [];
  const rows = exactRows.length ? exactRows : db.prepare(`
    SELECT pdf_path, page_number, page_count, materia, assunto, title, text, normalized_text
    FROM theory_pages
    ORDER BY pdf_path, page_number
  `).all();

  let best = null;
  for (const row of rows) {
    const score = scoreTheoryPage(row, tokens, context.assunto);
    if (!best || score > best.score) {
      best = { row, score };
    }
  }

  if (!best || best.score < THEORY_CONTENT_FALLBACK_MIN_SCORE) {
    return null;
  }

  return {
    pdfPath: best.row.pdf_path || '',
    title: best.row.title || '',
    materia: best.row.materia || '',
    assunto: best.row.assunto || '',
    pageNumber: best.row.page_number || 1,
    pageCount: best.row.page_count || null,
    score: round(best.score, 4),
    pdfScore: 0,
    excerpt: buildTheoryExcerpt(best.row.text || '', tokens)
  };
}

function findBestTheoryPage(pdfPath, context = {}) {
  if (!hasTheoryPagesTable()) {
    return { indexed: false };
  }

  const pages = db.prepare(`
    SELECT page_number, page_count, text, normalized_text
    FROM theory_pages
    WHERE pdf_path = ?
    ORDER BY page_number
  `).all(pdfPath);

  if (!pages.length) {
    return { indexed: false };
  }

  const tokens = buildTheorySearchTokens(context);
  if (!tokens.length) {
    const first = pages[0];
    return {
      indexed: true,
      pageNumber: first.page_number || 1,
      pageCount: first.page_count || pages.length,
      score: 0,
      excerpt: trimPreview(first.text || '', 420)
    };
  }

  let best = null;
  for (const page of pages) {
    const score = scoreTheoryPage(page, tokens, context.assunto);
    if (!best || score > best.score) {
      best = { page, score };
    }
  }

  if (!best || best.score < THEORY_PAGE_MIN_SCORE) {
    return { indexed: true };
  }

  return {
    indexed: true,
    pageNumber: best.page.page_number || 1,
    pageCount: best.page.page_count || pages.length,
    score: round(best.score, 4),
    excerpt: buildTheoryExcerpt(best.page.text || '', tokens)
  };
}

function buildTheorySearchTokens({ assunto = '', statementText = '' } = {}) {
  const tokenWeights = new Map();
  const hasStatement = Boolean(normalizeTheoryTitle(statementText));
  addTheoryTokens(tokenWeights, assunto, hasStatement ? 0.8 : 3.5, 24, 'subject');
  addTheoryTokens(tokenWeights, statementText, hasStatement ? 3 : 1, 36, 'statement');
  return Array.from(tokenWeights, ([token, item]) => ({ token, ...item }))
    .sort((a, b) => b.weight - a.weight || b.token.length - a.token.length)
    .slice(0, 48);
}

function addTheoryTokens(tokenWeights, value, weight, maxTokens, source = '') {
  const tokens = normalizeTheoryTitle(value)
    .split(' ')
    .filter((token) => isUsefulTheoryToken(token));

  let added = 0;
  for (const token of tokens) {
    const previous = tokenWeights.get(token);
    if (!previous || weight > previous.weight) {
      tokenWeights.set(token, { weight, source });
    }
    added += 1;
    if (added >= maxTokens) break;
  }
}

function isUsefulTheoryToken(token) {
  if (!token) return false;
  if (THEORY_SEARCH_STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return token.length >= 2;
  return token.length >= 3;
}

function scoreTheoryPage(page, tokens, assunto) {
  const text = ` ${page.normalized_text || normalizeTheoryTitle(page.text)} `;
  const maxScore = tokens.reduce((total, item) => total + item.weight, 0);
  const hasStatementTokens = tokens.some((item) => item.source === 'statement');
  let score = 0;
  for (const item of tokens) {
    if (text.includes(` ${item.token} `)) {
      score += item.weight;
    }
  }

  const subjectPhrase = normalizeTheoryTitle(assunto);
  if (!hasStatementTokens && subjectPhrase && subjectPhrase.length >= 10 && text.includes(subjectPhrase)) {
    score += maxScore * 0.35;
  }

  return maxScore ? score / maxScore : 0;
}

function buildTheoryExcerpt(text, tokens) {
  const chunks = splitTextForExcerpt(text);
  let best = chunks[0] || String(text || '');
  let bestScore = -1;
  for (const chunk of chunks) {
    const normalized = ` ${normalizeTheoryTitle(chunk)} `;
    let score = 0;
    for (const item of tokens) {
      if (normalized.includes(` ${item.token} `)) {
        score += item.weight;
      }
    }
    if (score > bestScore) {
      best = chunk;
      bestScore = score;
    }
  }
  return trimPreview(best, 520);
}

function splitTextForExcerpt(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const chunks = normalized
    .split(/\.\s+|;\s+|\?\s+|!\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.some((chunk) => chunk.length >= 80)) {
    return chunks;
  }

  const fallback = [];
  for (let index = 0; index < normalized.length; index += 360) {
    fallback.push(normalized.slice(index, index + 420).trim());
  }
  return fallback.filter(Boolean);
}

async function findBestDirectory(baseDir, expectedName) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const expected = normalizeTheoryTitle(expectedName);
  let best = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const normalized = normalizeTheoryTitle(entry.name);
    const score = theoryMatchScore(normalized, expected);
    if (!best || score > best.score) {
      best = { path: path.join(baseDir, entry.name), score };
    }
  }

  return best?.score >= THEORY_DIRECTORY_MIN_SCORE ? best.path : null;
}

function theoryMatchScore(candidate, expected) {
  if (!candidate || !expected) {
    return 0;
  }
  if (candidate === expected) {
    return 1;
  }
  if (candidate.includes(expected) || expected.includes(candidate)) {
    return 0.92;
  }

  const candidateTokens = new Set(candidate.split(' ').filter((token) => token.length > 2));
  const expectedTokens = new Set(expected.split(' ').filter((token) => token.length > 2));
  if (!candidateTokens.size || !expectedTokens.size) {
    return 0;
  }

  let matches = 0;
  for (const token of expectedTokens) {
    if (candidateTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / expectedTokens.size;
}

function normalizeTheoryTitle(value) {
  return String(value || '')
    .replace(/\.pdf$/i, '')
    .replace(/^\d+\s*-\s*/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPdfExtension(filename) {
  return String(filename || '').replace(/\.pdf$/i, '');
}

function encodePath(relativePath) {
  return normalizePath(relativePath)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

async function serveFile(response, baseDir, relativePath) {
  const safePath = path.normalize(decodeURIComponent(relativePath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.resolve(baseDir, safePath);
  const resolvedBase = path.resolve(baseDir);

  if (filePath !== resolvedBase && !filePath.startsWith(`${resolvedBase}${path.sep}`)) {
    sendText(response, 403, 'Acesso negado');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(data);
  } catch {
    sendText(response, 404, 'Arquivo nao encontrado');
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function sendText(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(data);
}

async function loadConfig(configPath) {
  if (!configPath) {
    return {};
  }

  return JSON.parse(await fs.readFile(path.resolve(ROOT_DIR, configPath), 'utf8'));
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
