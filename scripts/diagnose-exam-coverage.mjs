import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(args.db || 'questoes-prf.sqlite');

const db = new DatabaseSync(dbPath);

try {
  ensureSchema(db);
  const profileId = String(args.profile || getActiveProfile(db));
  if (!profileId) throw new Error('Informe --profile ou defina um perfil ativo.');
  const diagnostics = diagnose(db, profileId);
  printConsole(diagnostics);

  if (args.json) {
    await fs.writeFile(path.resolve(args.json), `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
    console.log(`JSON gravado: ${path.resolve(args.json)}`);
  }
  if (args.md) {
    await fs.writeFile(path.resolve(args.md), buildMarkdown(diagnostics), 'utf8');
    console.log(`Markdown gravado: ${path.resolve(args.md)}`);
  }
} finally {
  db.close();
}

function diagnose(database, profileId) {
  const profile = database.prepare('SELECT * FROM exam_profiles WHERE id = ?').get(profileId);
  if (!profile) throw new Error(`Perfil nao encontrado: ${profileId}`);

  const totalValidMapped = scalar(database, `
    SELECT COUNT(DISTINCT q.id_question)
    FROM question_exam_subjects qes
    JOIN questions q ON q.id_question = qes.question_id
    WHERE qes.profile_id = ?
      AND COALESCE(q.anulada, 0) = 0
      AND COALESCE(q.desatualizada, 0) = 0
  `, profileId);

  const rows = database.prepare(`
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
          AND ${bestAnswerSql('q', 'c')} != ''
        THEN q.id_question END
      ) AS valid_with_answer,
      COUNT(DISTINCT CASE
        WHEN COALESCE(c.html_local, c.html, c.text, '') != ''
        THEN q.id_question END
      ) AS comments,
      COUNT(sa.id) AS attempts,
      ROUND(COALESCE(AVG(qm.mastery_score), 0), 4) AS mastery_score,
      SUM(CASE
        WHEN COALESCE(qm.next_due_at, '') != '' AND qm.next_due_at <= datetime('now')
        THEN 1 ELSE 0 END
      ) AS due_reviews,
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
    GROUP BY w.subject_key
    ORDER BY w.expected_pct DESC, w.subject_label
  `).all(profileId).map((row) => enrichCoverageRow(row, totalValidMapped));

  const unmapped = database.prepare(`
    SELECT q.materia, COUNT(*) AS total
    FROM questions q
    WHERE NOT EXISTS (
      SELECT 1
      FROM question_exam_subjects qes
      WHERE qes.question_id = q.id_question
        AND qes.profile_id = ?
    )
    GROUP BY q.materia
    ORDER BY total DESC, q.materia
  `).all(profileId);

  const alerts = buildAlerts(rows);

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      source: profile.source || ''
    },
    generatedAt: new Date().toISOString(),
    totals: {
      totalValidMapped,
      unmappedQuestions: unmapped.reduce((sum, row) => sum + Number(row.total || 0), 0)
    },
    rows,
    unmapped,
    alerts
  };
}

function enrichCoverageRow(row, totalValidMapped) {
  const valid = Number(row.valid_questions || 0);
  const localPct = totalValidMapped ? round((valid / totalValidMapped) * 100, 2) : 0;
  const expectedPct = Number(row.expected_pct || 0);
  const answerCoverage = valid ? round((Number(row.valid_with_answer || 0) / valid) * 100, 2) : 0;
  const masteryScore = Number(row.mastery_score || 0);
  const coverageGap = round(Math.max(0, expectedPct - localPct), 2);
  const excessCoverage = round(Math.max(0, localPct - expectedPct), 2);
  const noAnswerGap = Math.max(0, 80 - answerCoverage);
  const outdatedPct = Number(row.local_questions || 0)
    ? round((Number(row.outdated || 0) / Number(row.local_questions || 0)) * 100, 2)
    : 0;
  const strategicPriority = round(
    expectedPct
      + coverageGap * 2
      + (1 - masteryScore) * expectedPct
      + noAnswerGap * 0.25
      + Number(row.due_reviews || 0) * 0.5
      + outdatedPct * 0.2,
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
    status: coverageStatus({ expectedPct, valid, coverageGap, excessCoverage, answerCoverage, masteryScore })
  };
}

function coverageStatus({ expectedPct, valid, coverageGap, excessCoverage, answerCoverage, masteryScore }) {
  if (expectedPct >= 8 && masteryScore < 0.35) return 'alta_prioridade';
  if (expectedPct >= 5 && valid < 50) return 'sub-representada';
  if (expectedPct >= 5 && answerCoverage < 65) return 'sem_gabarito_suficiente';
  if (excessCoverage > Math.max(5, coverageGap * 2)) return 'super-representada';
  return 'ok';
}

function buildAlerts(rows) {
  const alerts = [];
  for (const row of rows) {
    if (row.excess_coverage_pct >= 5 && row.expected_pct <= 6) {
      alerts.push(`Atencao: ${row.subject_label} representa ${row.local_pct}% da base valida mapeada, mas pesa ${row.expected_pct}% no perfil. Se o dominio estiver alto, reduza a prioridade.`);
    }
    if (row.expected_pct >= 8 && row.valid_questions < 80) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo e poucas questoes validas mapeadas (${row.valid_questions}).`);
    }
    if (row.expected_pct >= 8 && row.answer_coverage_pct < 70) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo, mas so ${row.answer_coverage_pct}% das questoes validas tem gabarito aproveitavel.`);
    }
    if (row.expected_pct >= 8 && row.attempts === 0) {
      alerts.push(`Atencao: ${row.subject_label} tem alto peso externo e ainda nao recebeu tentativas no historico local.`);
    }
  }
  return alerts;
}

function printConsole(diagnostics) {
  console.log(`Perfil: ${diagnostics.profile.id} - ${diagnostics.profile.name}`);
  console.log(`Validas mapeadas: ${diagnostics.totals.totalValidMapped}`);
  console.log(`Sem mapeamento: ${diagnostics.totals.unmappedQuestions}`);
  console.log('');
  for (const row of diagnostics.rows) {
    console.log(`${row.subject_key}: peso ${row.expected_pct}% | base ${row.local_questions} | validas ${row.valid_questions} | gabarito ${row.valid_with_answer} | dominio ${row.mastery_score} | status ${row.status}`);
  }
  console.log('');
  console.log('Alertas');
  for (const alert of diagnostics.alerts) console.log(`- ${alert}`);
}

function buildMarkdown(diagnostics) {
  const lines = [
    '# Cobertura Base x Prova PRF',
    '',
    `- Perfil: \`${diagnostics.profile.id}\` - ${diagnostics.profile.name}`,
    `- Gerado em: \`${diagnostics.generatedAt}\``,
    `- Questoes validas mapeadas: ${diagnostics.totals.totalValidMapped}`,
    `- Questoes sem mapeamento: ${diagnostics.totals.unmappedQuestions}`,
    '',
    '## Cobertura',
    '',
    '| Disciplina | Peso % | Itens | Base | Validas | Com gabarito | Comentarios | Tentativas | Dominio | Lacuna | Excesso | Prioridade | Status |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
    ...diagnostics.rows.map((row) => `| ${escapeMd(row.subject_label)} | ${row.expected_pct} | ${row.expected_items} | ${row.local_questions} | ${row.valid_questions} | ${row.valid_with_answer} | ${row.comments} | ${row.attempts} | ${row.mastery_score} | ${row.coverage_gap_pct} | ${row.excess_coverage_pct} | ${row.strategic_priority} | ${row.status} |`),
    '',
    '## Alertas',
    '',
    ...(diagnostics.alerts.length ? diagnostics.alerts.map((alert) => `- ${escapeMd(alert)}`) : ['- Nenhum alerta relevante.']),
    '',
    '## Materias Sem Mapeamento',
    '',
    '| Materia | Questoes |',
    '|---|---:|',
    ...diagnostics.unmapped.map((row) => `| ${escapeMd(row.materia || '')} | ${row.total} |`)
  ];
  return `${lines.join('\n')}\n`;
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

function getActiveProfile(database) {
  return database.prepare('SELECT id FROM exam_profiles WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get()?.id || '';
}

function ensureSchema(database) {
  for (const tableName of ['exam_profiles', 'exam_subject_weights', 'question_exam_subjects']) {
    if (!database.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(tableName)) {
      throw new Error(`Tabela ausente: ${tableName}. Rode migrate-exam-profiles primeiro.`);
    }
  }
}

function scalar(database, sql, ...values) {
  const row = database.prepare(sql).get(...values);
  return row ? Object.values(row)[0] ?? 0 : 0;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function escapeMd(value) {
  return String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
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
