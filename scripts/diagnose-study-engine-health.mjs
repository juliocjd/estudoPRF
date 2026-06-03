import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const databaseUrl = args['database-url'] || process.env.DATABASE_URL || '';
const dbClient = args.client || process.env.DB_CLIENT || '';
const jsonPath = path.resolve(ROOT_DIR, args.json || 'data/diagnostico_saude_motor_estudo.json');
const mdPath = path.resolve(ROOT_DIR, args.md || 'data/diagnostico_saude_motor_estudo.md');
const { db, client } = openStudyDatabase({ dbPath, databaseUrl, client: dbClient });

try {
  const report = diagnose(db, { client, dbPath });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  console.log('Diagnostico de saude do motor gerado.');
  console.log(`Banco: ${client}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD: ${mdPath}`);
} finally {
  db.close?.();
}

function diagnose(database, meta) {
  const hasCurrentLaw = tableExists(database, 'question_current_law_answers');
  const hasAnswers = tableExists(database, 'study_answers');
  const hasQuestionMastery = tableExists(database, 'question_mastery');
  const hasClusterMastery = tableExists(database, 'cluster_mastery');
  const hasQntc = tableExists(database, 'question_normative_teaching_comments');
  const hasClusters = tableExists(database, 'question_clusters');
  const studyAnswerCols = hasAnswers ? columns(database, 'study_answers') : new Set();
  const qntcCols = hasQntc ? columns(database, 'question_normative_teaching_comments') : new Set();

  const currentLawTotals = hasCurrentLaw ? database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN current_law_status = 'verified' AND can_auto_score_current_law IS TRUE AND COALESCE(current_answer, '') != '' THEN 1 ELSE 0 END) AS verified_auto_score,
      SUM(CASE WHEN current_law_status = 'needs_audit' THEN 1 ELSE 0 END) AS needs_audit,
      SUM(CASE WHEN current_law_status = 'no_valid_alternative' THEN 1 ELSE 0 END) AS no_valid_alternative,
      SUM(CASE WHEN current_law_status = 'discard' THEN 1 ELSE 0 END) AS discard
    FROM question_current_law_answers
  `).get() : emptyCounts();

  const outdated = database.prepare(`
    SELECT
      COUNT(*) AS total_outdated,
      SUM(CASE WHEN qcla.question_id IS NOT NULL THEN 1 ELSE 0 END) AS with_current_law_row,
      SUM(CASE WHEN qcla.current_law_status = 'verified' AND qcla.can_auto_score_current_law IS TRUE AND COALESCE(qcla.current_answer, '') != '' THEN 1 ELSE 0 END) AS scoreable_by_current_law,
      SUM(CASE WHEN qcla.question_id IS NULL OR qcla.current_law_status IS NULL OR qcla.current_law_status != 'verified' OR qcla.can_auto_score_current_law IS NOT TRUE OR COALESCE(qcla.current_answer, '') = '' THEN 1 ELSE 0 END) AS blocked_by_current_law
    FROM questions q
    ${hasCurrentLaw ? 'LEFT JOIN question_current_law_answers qcla ON qcla.question_id = q.id_question' : 'LEFT JOIN (SELECT NULL AS question_id, NULL AS current_law_status, NULL AS can_auto_score_current_law, NULL AS current_answer) qcla ON 0 = 1'}
    WHERE COALESCE(q.desatualizada, 0) = 1
  `).get();

  const blockedAttemptRows = hasCurrentLaw && hasAnswers ? database.prepare(`
    SELECT
      qcla.current_law_status,
      COUNT(*) AS attempts,
      COUNT(DISTINCT sa.question_id) AS questions
    FROM study_answers sa
    JOIN question_current_law_answers qcla ON qcla.question_id = sa.question_id
    JOIN questions q ON q.id_question = sa.question_id
    WHERE COALESCE(q.desatualizada, 0) = 1
      AND qcla.current_law_status IN ('needs_audit', 'no_valid_alternative', 'discard')
      AND sa.is_correct IS NOT NULL
    GROUP BY qcla.current_law_status
    ORDER BY attempts DESC
  `).all() : [];

  const blockedMastery = hasCurrentLaw && hasQuestionMastery ? database.prepare(`
    SELECT
      qcla.current_law_status,
      COUNT(*) AS questions_with_mastery
    FROM question_mastery qm
    JOIN question_current_law_answers qcla ON qcla.question_id = qm.question_id
    JOIN questions q ON q.id_question = qm.question_id
    WHERE COALESCE(q.desatualizada, 0) = 1
      AND qcla.current_law_status IN ('needs_audit', 'no_valid_alternative', 'discard')
    GROUP BY qcla.current_law_status
    ORDER BY questions_with_mastery DESC
  `).all() : [];

  const scoringMetadata = hasAnswers ? {
    hasCorrectionMode: studyAnswerCols.has('correction_mode'),
    hasExpectedAnswerSource: studyAnswerCols.has('expected_answer_source'),
    hasNonScoringReason: studyAnswerCols.has('non_scoring_reason'),
    hasCurrentLawStatusAtAnswer: studyAnswerCols.has('current_law_status_at_answer'),
    hasScoringVersion: studyAnswerCols.has('scoring_version'),
    recentByCorrectionMode: studyAnswerCols.has('correction_mode')
      ? database.prepare(`
          SELECT COALESCE(correction_mode, '') AS correction_mode, COUNT(*) AS attempts
          FROM study_answers
          GROUP BY correction_mode
          ORDER BY attempts DESC
        `).all()
      : []
  } : {};

  const currentLawDivergences = hasCurrentLaw && hasAnswers ? findCurrentLawAnswerDivergences(database, studyAnswerCols) : [];
  const qntcDivergences = hasCurrentLaw && hasQntc ? findTeachingCommentDivergences(database, qntcCols) : [];
  const clusters = hasClusters ? diagnoseClusters(database) : { byPolicy: [], giantClusters: [] };
  const cases = diagnoseCases(database, hasCurrentLaw);

  return {
    generatedAt: new Date().toISOString(),
    database: {
      client: meta.client,
      path: meta.client === 'sqlite' ? meta.dbPath : ''
    },
    tables: {
      question_current_law_answers: hasCurrentLaw,
      question_normative_teaching_comments: hasQntc,
      study_answers: hasAnswers,
      question_mastery: hasQuestionMastery,
      cluster_mastery: hasClusterMastery,
      question_clusters: hasClusters
    },
    currentLawSource: {
      totals: normalizeRow(currentLawTotals),
      outdated: normalizeRow(outdated),
      statusDistribution: hasCurrentLaw ? database.prepare(`
        SELECT COALESCE(current_law_status, '') AS current_law_status, COUNT(*) AS questions
        FROM question_current_law_answers
        GROUP BY current_law_status
        ORDER BY questions DESC
      `).all() : []
    },
    scoringBlocks: {
      blockedStatusesWithScoredAttempts: blockedAttemptRows,
      blockedStatusesWithQuestionMastery: blockedMastery,
      currentLawAnswerDivergences: currentLawDivergences,
      qntcDivergences
    },
    scoringMetadata,
    clusters,
    cases
  };
}

function findCurrentLawAnswerDivergences(database, studyAnswerCols) {
  if (!studyAnswerCols.has('expected_answer')) return [];
  const rows = database.prepare(`
    SELECT
      sa.question_id,
      sa.expected_answer AS stored_expected_answer,
      qcla.current_answer AS current_law_answer,
      COUNT(*) AS attempts
    FROM study_answers sa
    JOIN questions q ON q.id_question = sa.question_id
    JOIN question_current_law_answers qcla ON qcla.question_id = sa.question_id
    WHERE COALESCE(q.desatualizada, 0) = 1
      AND qcla.current_law_status = 'verified'
      AND qcla.can_auto_score_current_law IS TRUE
      AND COALESCE(qcla.current_answer, '') != ''
      AND sa.is_correct IS NOT NULL
    GROUP BY sa.question_id, sa.expected_answer, qcla.current_answer
    ORDER BY attempts DESC
  `).all();
  return rows
    .filter((row) => normalizeAnswer(row.stored_expected_answer) !== normalizeAnswer(row.current_law_answer))
    .slice(0, 50);
}

function findTeachingCommentDivergences(database, qntcCols) {
  const answerColumn = ['current_answer_verified', 'current_answer', 'engine_answer']
    .find((column) => qntcCols.has(column));
  if (!answerColumn) return [];
  return database.prepare(`
    SELECT
      qcla.question_id,
      qcla.current_answer AS current_law_answer,
      qntc.${answerColumn} AS teaching_answer
    FROM question_current_law_answers qcla
    JOIN question_normative_teaching_comments qntc ON qntc.question_id = qcla.question_id
    WHERE qcla.current_law_status = 'verified'
      AND qcla.can_auto_score_current_law IS TRUE
      AND COALESCE(qcla.current_answer, '') != ''
      AND COALESCE(qntc.${answerColumn}, '') != ''
      AND UPPER(TRIM(qcla.current_answer)) != UPPER(TRIM(qntc.${answerColumn}))
    ORDER BY qcla.question_id
    LIMIT 50
  `).all();
}

function diagnoseClusters(database) {
  const cols = columns(database, 'question_clusters');
  const policyExpr = cols.has('cluster_policy')
    ? "COALESCE(NULLIF(cluster_policy, ''), CASE WHEN COALESCE(size, 0) > 40 THEN 'stats_only' WHEN cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 'suppress_variants' WHEN cluster_type = 'same_skill' THEN 'stats_only' ELSE 'interleave' END)"
    : "CASE WHEN COALESCE(size, 0) > 40 THEN 'stats_only' WHEN cluster_type IN ('exact_hash', 'normalized_statement', 'near_duplicate') THEN 'suppress_variants' WHEN cluster_type = 'same_skill' THEN 'stats_only' ELSE 'interleave' END";
  return {
    byPolicy: database.prepare(`
      SELECT ${policyExpr} AS cluster_policy, COUNT(*) AS clusters, SUM(size) AS summed_size, MAX(size) AS max_size
      FROM question_clusters
      WHERE status = 'active'
      GROUP BY ${policyExpr}
      ORDER BY clusters DESC
    `).all(),
    giantClusters: database.prepare(`
      SELECT id, cluster_type, materia, assunto, size, ${policyExpr} AS cluster_policy
      FROM question_clusters
      WHERE status = 'active'
        AND COALESCE(size, 0) > 40
      ORDER BY size DESC
      LIMIT 30
    `).all()
  };
}

function diagnoseCases(database, hasCurrentLaw) {
  const ids = [28259, 28260, 1028008, 42747];
  const rows = database.prepare(`
    SELECT
      q.id_question,
      q.type_question,
      q.materia,
      q.assunto,
      q.desatualizada,
      q.anulada,
      q.official_answer,
      ${hasCurrentLaw ? 'qcla.current_law_status, qcla.can_auto_score_current_law, qcla.current_answer, qcla.no_valid_alternative, qcla.should_discard_from_current_law_study' : "'' AS current_law_status, NULL AS can_auto_score_current_law, '' AS current_answer, NULL AS no_valid_alternative, NULL AS should_discard_from_current_law_study"}
    FROM questions q
    ${hasCurrentLaw ? 'LEFT JOIN question_current_law_answers qcla ON qcla.question_id = q.id_question' : ''}
    WHERE q.id_question IN (${ids.map(() => '?').join(', ')})
    ORDER BY q.id_question
  `).all(...ids);
  return rows.map((row) => {
    const isOutdated = Boolean(Number(row.desatualizada || 0));
    const currentLawCanScore = isOutdated
      && row.current_law_status === 'verified'
      && truthy(row.can_auto_score_current_law)
      && String(row.current_answer || '').trim();
    return {
      questionId: Number(row.id_question),
      typeQuestion: row.type_question || '',
      isOutdated,
      isCanceled: Boolean(Number(row.anulada || 0)),
      currentLawStatus: row.current_law_status || (isOutdated ? 'missing_current_law_row' : 'not_applicable'),
      canScore: isOutdated ? Boolean(currentLawCanScore) : Boolean(String(row.official_answer || '').trim()),
      expectedAnswer: isOutdated ? (currentLawCanScore ? row.current_answer : '') : row.official_answer || '',
      answerSource: isOutdated ? (currentLawCanScore ? 'current_law_verified' : 'blocked_current_law') : 'historical_question_answer'
    };
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Diagnostico de saude do motor de estudo');
  lines.push('');
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`Banco: ${report.database.client}`);
  lines.push('');
  lines.push('## Fonte canonica de lei atual');
  lines.push('');
  lines.push(`- question_current_law_answers existe: ${yesNo(report.tables.question_current_law_answers)}`);
  lines.push(`- questoes desatualizadas: ${num(report.currentLawSource.outdated.total_outdated)}`);
  lines.push(`- desatualizadas pontuaveis por lei atual: ${num(report.currentLawSource.outdated.scoreable_by_current_law)}`);
  lines.push(`- desatualizadas bloqueadas: ${num(report.currentLawSource.outdated.blocked_by_current_law)}`);
  lines.push('');
  lines.push('## Bloqueios de pontuacao');
  lines.push('');
  lines.push(`- tentativas pontuadas em statuses bloqueados: ${sum(report.scoringBlocks.blockedStatusesWithScoredAttempts, 'attempts')}`);
  lines.push(`- questoes bloqueadas com question_mastery historico: ${sum(report.scoringBlocks.blockedStatusesWithQuestionMastery, 'questions_with_mastery')}`);
  lines.push(`- divergencias study_answers x lei atual verificada: ${report.scoringBlocks.currentLawAnswerDivergences.length}`);
  lines.push(`- divergencias comentario tecnico x lei atual: ${report.scoringBlocks.qntcDivergences.length}`);
  lines.push('');
  lines.push('## Clusters');
  lines.push('');
  for (const row of report.clusters.byPolicy || []) {
    lines.push(`- ${row.cluster_policy}: ${num(row.clusters)} clusters, maior tamanho ${num(row.max_size)}`);
  }
  lines.push(`- clusters gigantes (>40): ${(report.clusters.giantClusters || []).length}`);
  lines.push('');
  lines.push('## Casos sentinela');
  lines.push('');
  for (const item of report.cases) {
    lines.push(`- ${item.questionId}: status=${item.currentLawStatus}, canScore=${item.canScore}, source=${item.answerSource}, expected=${item.expectedAnswer || '(bloqueado)'}`);
  }
  lines.push('');
  lines.push('Arquivos detalhados ficam no JSON.');
  return `${lines.join('\n')}\n`;
}

function tableExists(database, tableName) {
  const row = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function columns(database, tableName) {
  return new Set(database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function normalizeRow(row = {}) {
  return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, normalizeValue(value)]));
}

function normalizeValue(value) {
  if (typeof value === 'bigint') return Number(value);
  return value ?? 0;
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

function sum(rows, key) {
  return (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0);
}

function num(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function yesNo(value) {
  return value ? 'sim' : 'nao';
}

function emptyCounts() {
  return {
    total: 0,
    verified_auto_score: 0,
    needs_audit: 0,
    no_valid_alternative: 0,
    discard: 0
  };
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
