import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { migrateAdaptiveStudyEngine } from './migrate-adaptive-study-engine.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const profileId = String(args.profile || 'prf_2021_qconcursos_disciplina');
const mdPath = path.resolve(ROOT_DIR, args.md || 'data/diagnostico_eficiencia_estudo.md');
const jsonPath = path.resolve(ROOT_DIR, args.json || 'data/diagnostico_eficiencia_estudo.json');

const db = new DatabaseSync(dbPath);

try {
  migrateAdaptiveStudyEngine(db);
  const report = diagnose(db, profileId);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  console.log(`Diagnostico de eficiencia gerado.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`MD: ${mdPath}`);
} finally {
  db.close();
}

function diagnose(database, profile) {
  const bestAnswer = bestAnswerSql('q', 'c');
  const totals = database.prepare(`
    SELECT
      COUNT(*) AS total_questions,
      SUM(CASE WHEN COALESCE(c.html_local, c.html, c.text, '') != '' THEN 1 ELSE 0 END) AS with_comment,
      SUM(CASE WHEN ${bestAnswer} != '' THEN 1 ELSE 0 END) AS with_answer,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0 AND ${bestAnswer} != '' THEN 1 ELSE 0 END) AS valid_with_answer,
      SUM(CASE WHEN COALESCE(q.desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 1 THEN 1 ELSE 0 END) AS canceled
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
  `).get();

  const clusterRows = database.prepare(`
    SELECT cluster_type, COUNT(*) AS clusters, SUM(size) AS summed_size, AVG(size) AS average_size, MAX(size) AS max_size
    FROM question_clusters
    WHERE status = 'active'
    GROUP BY cluster_type
    ORDER BY clusters DESC
  `).all();

  const duplicateTypes = "'exact_hash', 'normalized_statement', 'near_duplicate'";
  const postponed = database.prepare(`
    SELECT COUNT(DISTINCT qcm.question_id) AS n
    FROM question_cluster_members qcm
    JOIN question_clusters qc ON qc.id = qcm.cluster_id
    JOIN questions q ON q.id_question = qcm.question_id
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE qc.cluster_type IN (${duplicateTypes})
      AND qcm.role != 'representative'
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
      AND ${bestAnswer} != ''
  `).get().n || 0;

  const representativeCore = Math.max(0, Number(totals.valid_with_answer || 0) - postponed);
  const exactClusters = clusterRows.find((row) => row.cluster_type === 'exact_hash')?.clusters || 0;
  const nearClusters = Number(clusterRows.find((row) => row.cluster_type === 'near_duplicate')?.clusters || 0)
    + Number(clusterRows.find((row) => row.cluster_type === 'normalized_statement')?.clusters || 0);

  const coverage = getCoverage(database, profile);
  const blockCoverage = aggregateBlocks(coverage);
  const repeatedSubjects = database.prepare(`
    SELECT
      COALESCE(qc.materia, '') AS materia,
      COALESCE(qc.assunto, '') AS assunto,
      COUNT(*) AS clusters,
      SUM(qc.size) AS questions,
      SUM(qc.size - 1) AS variants
    FROM question_clusters qc
    WHERE qc.cluster_type IN (${duplicateTypes})
      AND qc.status = 'active'
    GROUP BY qc.materia, qc.assunto
    HAVING questions >= 4
    ORDER BY variants DESC, clusters DESC, questions DESC
    LIMIT 20
  `).all();

  const strongSubjects = database.prepare(`
    SELECT
      COALESCE(q.materia, '') AS materia,
      COALESCE(q.assunto, '') AS assunto,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0 THEN 1 ELSE 0 END) AS valid,
      SUM(CASE WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0 AND ${bestAnswer} != '' THEN 1 ELSE 0 END) AS valid_with_answer
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE COALESCE(q.assunto, '') != ''
    GROUP BY q.materia, q.assunto
    ORDER BY valid_with_answer DESC, valid DESC
    LIMIT 20
  `).all();

  const outdatedSubjects = database.prepare(`
    SELECT
      COALESCE(materia, '') AS materia,
      COALESCE(assunto, '') AS assunto,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) AS outdated,
      ROUND(100.0 * SUM(CASE WHEN COALESCE(desatualizada, 0) = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) AS outdated_pct
    FROM questions
    WHERE COALESCE(assunto, '') != ''
    GROUP BY materia, assunto
    HAVING outdated > 0
    ORDER BY outdated DESC, outdated_pct DESC
    LIMIT 20
  `).all();

  const weakAnswerSubjects = database.prepare(`
    SELECT
      COALESCE(q.materia, '') AS materia,
      COALESCE(q.assunto, '') AS assunto,
      COUNT(*) AS total,
      SUM(CASE WHEN ${bestAnswer} != '' THEN 1 ELSE 0 END) AS with_answer,
      ROUND(100.0 * SUM(CASE WHEN ${bestAnswer} != '' THEN 1 ELSE 0 END) / COUNT(*), 2) AS answer_pct
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE COALESCE(q.assunto, '') != ''
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
    GROUP BY q.materia, q.assunto
    HAVING total >= 10 AND answer_pct < 80
    ORDER BY answer_pct ASC, total DESC
    LIMIT 20
  `).all();

  const clusterMastery = database.prepare(`
    SELECT
      COUNT(*) AS tracked_clusters,
      SUM(CASE WHEN mastery_score >= 0.85 AND (next_due_at IS NULL OR next_due_at = '' OR next_due_at > CURRENT_TIMESTAMP) THEN 1 ELSE 0 END) AS dominated,
      SUM(CASE WHEN mastery_score < 0.35 OR last_result = 0 THEN 1 ELSE 0 END) AS fragile
    FROM cluster_mastery
  `).get();

  return {
    generatedAt: new Date().toISOString(),
    dbPath,
    profile,
    totals,
    clusters: {
      byType: clusterRows,
      exactClusters,
      nearDuplicateClusters: nearClusters,
      postponedFirstPass: postponed,
      representativeCoreEstimate: representativeCore,
      estimatedMinutesSavedFirstPass: Math.round(postponed * 2.5)
    },
    coverage: {
      byBlock: blockCoverage,
      bySubject: coverage,
      underRepresented: coverage.filter((row) => row.expected_pct >= 2 && row.coverage_gap_pct >= 3).slice(0, 15),
      overRepresented: coverage.filter((row) => row.excess_coverage_pct >= 5).slice(0, 15)
    },
    subjects: {
      strongest: strongSubjects,
      repeated: repeatedSubjects,
      outdated: outdatedSubjects,
      weakAnswerCoverage: weakAnswerSubjects
    },
    mastery: clusterMastery,
    recommendations: buildRecommendations(totals, coverage, postponed)
  };
}

function getCoverage(database, profile) {
  const bestAnswer = bestAnswerSql('q', 'c');
  const totalValidMapped = database.prepare(`
    SELECT COUNT(DISTINCT q.id_question) AS n
    FROM question_exam_subjects qes
    JOIN questions q ON q.id_question = qes.question_id
    WHERE qes.profile_id = ?
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
  `).get(profile).n || 0;

  const rows = database.prepare(`
    SELECT
      w.profile_id,
      w.subject_key,
      w.subject_label,
      w.block_key,
      w.block_label,
      COALESCE(w.expected_items, 0) AS expected_items,
      COALESCE(w.expected_pct, 0) AS expected_pct,
      COUNT(DISTINCT q.id_question) AS local_questions,
      COUNT(DISTINCT CASE WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0 THEN q.id_question END) AS valid_questions,
      COUNT(DISTINCT CASE WHEN COALESCE(q.anulada, 0) = 0 AND COALESCE(q.desatualizada, 0) = 0 AND ${bestAnswer} != '' THEN q.id_question END) AS valid_with_answer,
      COUNT(DISTINCT CASE WHEN COALESCE(q.desatualizada, 0) = 1 THEN q.id_question END) AS outdated_questions,
      COUNT(DISTINCT CASE WHEN COALESCE(q.anulada, 0) = 1 THEN q.id_question END) AS canceled_questions,
      ROUND(COALESCE(AVG(qm.mastery_score), 0), 4) AS mastery_score
    FROM exam_subject_weights w
    LEFT JOIN question_exam_subjects qes
      ON qes.profile_id = w.profile_id
      AND qes.subject_key = w.subject_key
    LEFT JOIN questions q ON q.id_question = qes.question_id
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_mastery qm ON qm.question_id = q.id_question
    WHERE w.profile_id = ?
    GROUP BY w.profile_id, w.subject_key, w.subject_label, w.block_key, w.block_label, w.expected_items, w.expected_pct
    ORDER BY w.block_key, w.expected_pct DESC, w.subject_label
  `).all(profile);

  return rows.map((row) => {
    const valid = Number(row.valid_questions || 0);
    const localPct = totalValidMapped ? round((valid / totalValidMapped) * 100, 2) : 0;
    const expectedPct = Number(row.expected_pct || 0);
    const answerCoveragePct = valid ? round((Number(row.valid_with_answer || 0) / valid) * 100, 2) : 0;
    return {
      ...row,
      local_pct: localPct,
      answer_coverage_pct: answerCoveragePct,
      coverage_gap_pct: round(Math.max(0, expectedPct - localPct), 2),
      excess_coverage_pct: round(Math.max(0, localPct - expectedPct), 2)
    };
  });
}

function aggregateBlocks(rows) {
  const blocks = new Map();
  for (const row of rows) {
    const key = row.block_key || 'sem_bloco';
    const current = blocks.get(key) || {
      block_key: key,
      block_label: row.block_label || key,
      expected_items: 0,
      expected_pct: 0,
      local_questions: 0,
      valid_questions: 0,
      valid_with_answer: 0,
      outdated_questions: 0,
      canceled_questions: 0
    };
    current.expected_items += Number(row.expected_items || 0);
    current.expected_pct += Number(row.expected_pct || 0);
    current.local_questions += Number(row.local_questions || 0);
    current.valid_questions += Number(row.valid_questions || 0);
    current.valid_with_answer += Number(row.valid_with_answer || 0);
    current.outdated_questions += Number(row.outdated_questions || 0);
    current.canceled_questions += Number(row.canceled_questions || 0);
    blocks.set(key, current);
  }
  const totalValid = [...blocks.values()].reduce((sum, row) => sum + row.valid_questions, 0);
  return [...blocks.values()].map((row) => ({
    ...row,
    expected_pct: round(row.expected_pct, 2),
    local_pct: totalValid ? round((row.valid_questions / totalValid) * 100, 2) : 0,
    answer_coverage_pct: row.valid_questions ? round((row.valid_with_answer / row.valid_questions) * 100, 2) : 0
  }));
}

function buildRecommendations(totals, coverage, postponed) {
  const recommendations = [];
  recommendations.push('Use PRF Otimizado como fluxo padrao: resolver representantes primeiro e liberar variacoes por erro, duvida, chute ou revisao.');
  if (postponed > 0) {
    recommendations.push(`Na primeira passada, aproximadamente ${postponed} questoes muito semelhantes podem ser adiadas sem apagar acesso ao banco completo.`);
  }
  const transito = coverage.find((row) => normalizePlain(row.subject_label).includes('transito'));
  if (transito && Number(transito.coverage_gap_pct || 0) >= 3) {
    recommendations.push('Legislacao de Transito tem peso forte no edital; priorize questoes com gabarito seguro e analise normativa antes de repetir materias super-representadas.');
  }
  const missing = coverage.filter((row) => Number(row.local_questions || 0) === 0).map((row) => row.subject_label);
  if (missing.length) {
    recommendations.push(`Ha lacunas sem questoes mapeadas: ${missing.slice(0, 5).join(', ')}. Use material externo para nao deixar o sistema compensar silenciosamente.`);
  }
  if (Number(totals.outdated || 0) > 0) {
    recommendations.push('Questoes desatualizadas devem entrar apenas quando houver analise normativa segura ou para revisao critica, nao como nucleo inicial.');
  }
  return recommendations;
}

function renderMarkdown(report) {
  return `# Diagnostico de eficiencia do estudo

Gerado em: ${report.generatedAt}

Perfil: \`${report.profile}\`

## Resumo

| Metrica | Valor |
| --- | ---: |
| Questoes no banco | ${report.totals.total_questions} |
| Questoes com comentario | ${report.totals.with_comment} |
| Questoes com gabarito | ${report.totals.with_answer} |
| Questoes validas com gabarito | ${report.totals.valid_with_answer} |
| Questoes desatualizadas | ${report.totals.outdated} |
| Questoes anuladas | ${report.totals.canceled} |
| Clusters exatos | ${report.clusters.exactClusters} |
| Clusters muito semelhantes | ${report.clusters.nearDuplicateClusters} |
| Questoes adiaveis na primeira passada | ${report.clusters.postponedFirstPass} |
| Nucleo representativo estimado | ${report.clusters.representativeCoreEstimate} |
| Tempo estimado economizado na primeira passada | ${report.clusters.estimatedMinutesSavedFirstPass} min |

## Cobertura por bloco PRF

${table(report.coverage.byBlock, ['block_label', 'expected_items', 'expected_pct', 'valid_questions', 'valid_with_answer', 'local_pct', 'answer_coverage_pct'])}

## Cobertura por disciplina

${table(report.coverage.bySubject, ['subject_label', 'block_label', 'expected_pct', 'valid_questions', 'valid_with_answer', 'local_pct', 'coverage_gap_pct', 'excess_coverage_pct'])}

## Sub-representadas

${table(report.coverage.underRepresented, ['subject_label', 'block_label', 'expected_pct', 'local_pct', 'coverage_gap_pct', 'valid_questions'])}

## Super-representadas

${table(report.coverage.overRepresented, ['subject_label', 'block_label', 'expected_pct', 'local_pct', 'excess_coverage_pct', 'valid_questions'])}

## Assuntos mais fortes na base

${table(report.subjects.strongest, ['materia', 'assunto', 'valid', 'valid_with_answer'])}

## Assuntos com muita repeticao

${table(report.subjects.repeated, ['materia', 'assunto', 'clusters', 'questions', 'variants'])}

## Assuntos com muita desatualizacao

${table(report.subjects.outdated, ['materia', 'assunto', 'total', 'outdated', 'outdated_pct'])}

## Assuntos com pouco gabarito

${table(report.subjects.weakAnswerCoverage, ['materia', 'assunto', 'total', 'with_answer', 'answer_pct'])}

## Recomendacao

${report.recommendations.map((item) => `- ${item}`).join('\n')}
`;
}

function table(rows, columns) {
  if (!rows?.length) return '_Sem registros._';
  const header = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => escapeMd(row[column])).join(' | ')} |`).join('\n');
  return `${header}\n${sep}\n${body}`;
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

function normalizePlain(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
