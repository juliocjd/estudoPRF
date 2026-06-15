#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const repairAttempts = Boolean(args['repair-attempts']);
const dbPath = path.resolve(ROOT_DIR, args.db || 'questoes-prf.sqlite');
const { db, client } = openStudyDatabase({
  dbPath,
  databaseUrl: args['database-url'] || process.env.DATABASE_URL || '',
  client: args.client || process.env.DB_CLIENT || ''
});

const overrides = [
  {
    questionId: 300141,
    answer: 'E',
    source: 'manual_comment_contradiction_20260605',
    reason: 'Comentario historico aponta modelo do veiculo, mas texto final mencionava letra A; no cadastro atual modelo corresponde a E.',
    commentTextReplacement: 'Portanto, o item correto e o MODELO do veiculo; no cadastro atual das alternativas, corresponde a letra "E".',
    commentHtmlReplacement: 'Portanto, o item correto e o <span style="color:#e74c3c"><strong>MODELO do veiculo</strong></span>; no cadastro atual das alternativas, corresponde a <span style="color:#3498db"><strong>letra "E"</strong></span>.'
  }
];

try {
  const report = applyManualAnswerOverrides(db, { apply, repairAttempts });
  console.log(JSON.stringify({ client, mode: apply ? 'apply' : 'dry-run', ...report }, null, 2));
} finally {
  db.close?.();
}

function applyManualAnswerOverrides(database, options = {}) {
  const report = { overrides: [], attemptsRepaired: 0 };
  database.exec('BEGIN');
  try {
    for (const item of overrides) {
      const before = database.prepare(`
        SELECT q.official_answer, q.official_answer_source, c.extracted_answer
        FROM questions q
        LEFT JOIN comments c ON c.question_id = q.id_question
        WHERE q.id_question = ?
      `).get(item.questionId);
      report.overrides.push({ ...item, before });
      if (!options.apply) continue;
      database.prepare(`
        UPDATE questions
        SET official_answer = ?,
            official_answer_source = ?
        WHERE id_question = ?
      `).run(item.answer, item.source, item.questionId);
      database.prepare(`
        UPDATE comments
        SET extracted_answer = ?,
            checked_at = CURRENT_TIMESTAMP
        WHERE question_id = ?
      `).run(item.answer, item.questionId);
      if (item.commentTextReplacement || item.commentHtmlReplacement) {
        const comment = database.prepare('SELECT text, html, html_local FROM comments WHERE question_id = ?').get(item.questionId);
        database.prepare(`
          UPDATE comments
          SET text = ?,
              html = ?,
              html_local = ?,
              user_edited_at = CURRENT_TIMESTAMP,
              user_edited_by = ?
          WHERE question_id = ?
        `).run(
          replaceManualAnswerCommentText(comment?.text, item),
          replaceManualAnswerCommentHtml(comment?.html, item),
          replaceManualAnswerCommentHtml(comment?.html_local, item),
          item.source,
          item.questionId
        );
      }
      if (options.repairAttempts) {
        const result = database.prepare(`
          UPDATE study_answers
          SET expected_answer = ?,
              is_correct = CASE WHEN UPPER(COALESCE(answer_letter, '')) = ? THEN 1 ELSE 0 END,
              correction_mode = 'historical',
              expected_answer_source = ?,
              non_scoring_reason = '',
              current_law_status_at_answer = 'not_applicable',
              scoring_version = 'manual_answer_override'
          WHERE question_id = ?
        `).run(item.answer, item.answer, item.source, item.questionId);
        report.attemptsRepaired += Number(result?.changes || result?.rowCount || 0);
      }
    }
    if (options.apply) database.exec('COMMIT');
    else database.exec('ROLLBACK');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return report;
}

function replaceManualAnswerCommentText(value, item) {
  if (!item.commentTextReplacement) return value || '';
  return String(value || '')
    .replace(/Portanto,\s*gabarito\s+letra\s+"A"\./i, item.commentTextReplacement)
    .replace(/Portanto,\s*o item correto . o MODELO do ve.culo; no cadastro atual das alternativas, corresponde . letra "E"\./i, item.commentTextReplacement);
}

function replaceManualAnswerCommentHtml(value, item) {
  if (!item.commentHtmlReplacement) return value || '';
  return String(value || '')
    .replace(/Portanto,\s*<span[^>]*>\s*<strong>gabarito\s+letra\s+"A"\.<\/strong>\s*<\/span>/i, item.commentHtmlReplacement)
    .replace(/Portanto,\s*o item correto . o <span style="color:#e74c3c"><strong>MODELO do ve.culo<\/strong><\/span>; no cadastro atual das alternativas, corresponde . <span style="color:#3498db"><strong>letra "E"<\/strong><\/span>\./i, item.commentHtmlReplacement);
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
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
