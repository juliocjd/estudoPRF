import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT_DIR,
  openCliDatabase,
  parseArgs
} from './legal-knowledge-utils.mjs';

const args = parseArgs();
const outMd = args.md ? path.resolve(ROOT_DIR, args.md) : path.resolve(ROOT_DIR, 'data/diagnostico_teoria_rapida_v4.md');
const outJson = args.json ? path.resolve(ROOT_DIR, args.json) : path.resolve(ROOT_DIR, 'data/diagnostico_teoria_rapida_v4.json');
const source = String(args.source || args['replace-source'] || 'chatgpt_traffic_v4').trim();
const { db, client } = openCliDatabase(args);

try {
  const totalTrafficQuestions = db.prepare(`
    SELECT COUNT(*) AS n
    FROM questions
    WHERE COALESCE(anulada, 0) = 0
      AND materia = 'Legislação de Trânsito e Transportes'
  `).get()?.n || 0;

  const byMode = db.prepare(`
    SELECT COALESCE(display_mode, 'missing') AS display_mode, COUNT(DISTINCT question_id) AS questions, COUNT(*) AS links
    FROM question_legal_links
    WHERE source = ?
    GROUP BY COALESCE(display_mode, 'missing')
    ORDER BY questions DESC
  `).all(source);

  const specific = countQuestions(`
    source = ?
    AND display_mode = 'rule_that_solves_or_clarifies_question'
    AND auto_show_as_primary = TRUE
    AND (needs_human_review IS NULL OR needs_human_review = FALSE)
  `, [source]);
  const panorama = countQuestions(`source = ? AND display_mode = 'general_orientation_only'`, [source]);
  const ambiguous = countQuestions(`source = ? AND (display_mode = 'suggested_card_needs_review' OR needs_human_review = TRUE)`, [source]);
  const currentLawReferenceOnly = countQuestions(`source = ? AND display_mode = 'theory_reference_only__not_solution_current_law'`, [source]);
  const anyLinked = countQuestions(`source = ?`, [source]);
  const withoutLink = Math.max(0, Number(totalTrafficQuestions) - Number(anyLinked));

  const topCards = db.prepare(`
    SELECT c.card_key, c.title, c.assunto, qll.display_mode, COUNT(DISTINCT qll.question_id) AS questions
    FROM question_legal_links qll
    JOIN legal_topic_cards c ON c.id = qll.legal_card_id
    WHERE qll.source = ?
    GROUP BY c.card_key, c.title, c.assunto, qll.display_mode
    ORDER BY questions DESC
    LIMIT 25
  `).all(source);

  const weakSubjects = db.prepare(`
    SELECT q.assunto,
      COUNT(DISTINCT q.id_question) AS total,
      COUNT(DISTINCT CASE
        WHEN qll.display_mode = 'rule_that_solves_or_clarifies_question'
          AND qll.auto_show_as_primary = TRUE
          AND (qll.needs_human_review IS NULL OR qll.needs_human_review = FALSE)
        THEN q.id_question END) AS specific,
      COUNT(DISTINCT CASE WHEN qll.display_mode = 'general_orientation_only' THEN q.id_question END) AS panorama,
      COUNT(DISTINCT qll.question_id) AS linked
    FROM questions q
    LEFT JOIN question_legal_links qll ON qll.question_id = q.id_question AND qll.source = ?
    WHERE COALESCE(q.anulada, 0) = 0
      AND q.materia = 'Legislação de Trânsito e Transportes'
    GROUP BY q.assunto
    ORDER BY specific ASC, total DESC
    LIMIT 40
  `).all(source);

  const unsafePrimary = db.prepare(`
    SELECT COUNT(*) AS n
    FROM question_legal_links
    WHERE source = ?
      AND auto_show_as_primary = TRUE
      AND (
        needs_human_review = TRUE
        OR display_mode != 'rule_that_solves_or_clarifies_question'
      )
  `).get(source)?.n || 0;

  const report = {
    generatedAt: new Date().toISOString(),
    dbClient: client,
    source,
    totalTrafficQuestions,
    counts: {
      specificPrimary: specific,
      panoramaOnly: panorama,
      ambiguousOrReview: ambiguous,
      currentLawReferenceOnly,
      anyLinked,
      withoutLink,
      unsafePrimary
    },
    byDisplayMode: byMode,
    topCards,
    weakSubjects
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(outMd, renderMarkdown(report), 'utf8');

  console.log('# Diagnostico de Teoria rapida v4');
  console.log(`Banco: ${client}`);
  console.log(`Fonte: ${source}`);
  console.log(`Especificas seguras: ${specific}`);
  console.log(`Panorama: ${panorama}`);
  console.log(`Revisao/ambiguas: ${ambiguous}`);
  console.log(`Referencia current-law: ${currentLawReferenceOnly}`);
  console.log(`Sem vinculo: ${withoutLink}`);
  console.log(`Primarios inseguros: ${unsafePrimary}`);
  console.log(`MD: ${path.relative(ROOT_DIR, outMd)}`);
  console.log(`JSON: ${path.relative(ROOT_DIR, outJson)}`);
} finally {
  db.close();
}

function countQuestions(whereSql, params = []) {
  return db.prepare(`
    SELECT COUNT(DISTINCT question_id) AS n
    FROM question_legal_links
    WHERE ${whereSql}
  `).get(...params)?.n || 0;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Diagnóstico de Teoria rápida v4.1 precision-safe');
  lines.push('');
  lines.push(`Gerado em: ${report.generatedAt}`);
  lines.push(`Banco: ${report.dbClient}`);
  lines.push(`Fonte: ${report.source}`);
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- Questões de trânsito: ${report.totalTrafficQuestions}`);
  lines.push(`- Teoria rápida específica segura: ${report.counts.specificPrimary}`);
  lines.push(`- Apenas panorama do assunto: ${report.counts.panoramaOnly}`);
  lines.push(`- Sugestões/ambíguas/revisão: ${report.counts.ambiguousOrReview}`);
  lines.push(`- Referência não resolutiva em legislação atual: ${report.counts.currentLawReferenceOnly}`);
  lines.push(`- Sem vínculo v4: ${report.counts.withoutLink}`);
  lines.push(`- Primários inseguros: ${report.counts.unsafePrimary}`);
  lines.push('');
  lines.push('## Por display_mode');
  lines.push('');
  for (const row of report.byDisplayMode) {
    lines.push(`- ${row.display_mode}: ${row.questions} questão(ões), ${row.links} vínculo(s)`);
  }
  lines.push('');
  lines.push('## Cards mais usados');
  lines.push('');
  for (const row of report.topCards) {
    lines.push(`- ${row.questions} - ${row.card_key} - ${row.display_mode} - ${row.title}`);
  }
  lines.push('');
  lines.push('## Assuntos com cobertura específica fraca');
  lines.push('');
  for (const row of report.weakSubjects) {
    lines.push(`- ${row.assunto || '(sem assunto)'}: específicas ${row.specific}/${row.total}; panorama ${row.panorama}; vinculadas ${row.linked}`);
  }
  return `${lines.join('\n')}\n`;
}
