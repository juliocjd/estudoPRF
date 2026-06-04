import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = args.db || 'questoes-prf.sqlite';
const apply = Boolean(args.apply);
const limit = Number(args.limit || 0);
const { client, db } = openStudyDatabase({ dbPath, client: args['db-client'] || args.client || '' });

try {
  const rows = db.prepare(`
    SELECT q.id_question,
           q.type_question,
           q.statement_text,
           COALESCE(c.extracted_answer, '') AS extracted_answer,
           COALESCE(c.text, '') AS comment_text
    FROM questions q
    JOIN comments c ON c.question_id = q.id_question
    WHERE COALESCE(c.text, '') != ''
      AND COALESCE(q.official_answer, '') = ''
      AND NOT EXISTS (
        SELECT 1
        FROM notebook_questions nq
        WHERE nq.question_id = q.id_question
          AND COALESCE(nq.answer, '') != ''
      )
    ORDER BY q.id_question
    ${limit > 0 ? 'LIMIT ?' : ''}
  `).all(...(limit > 0 ? [limit] : []));

  const update = db.prepare(`
    UPDATE comments
    SET extracted_answer = ?,
        checked_at = CURRENT_TIMESTAMP
    WHERE question_id = ?
  `);

  let checked = 0;
  let candidates = 0;
  let changed = 0;
  const examples = [];

  for (const row of rows) {
    checked += 1;
    const alternatives = db.prepare(`
      SELECT letter, text
      FROM alternatives
      WHERE question_id = ?
      ORDER BY position
    `).all(row.id_question);
    const answer = extractExplicitAlternativeAnswer(row, alternatives);
    if (!answer) continue;

    candidates += 1;
    const current = normalizeAnswer(row.extracted_answer);
    if (current === answer) continue;

    changed += 1;
    if (examples.length < 30) {
      examples.push({
        question_id: row.id_question,
        before: current || '(vazio)',
        after: answer
      });
    }
    if (apply) {
      update.run(answer, row.id_question);
    }
  }

  console.log(JSON.stringify({
    banco: client,
    modo: apply ? 'apply' : 'dry-run',
    verificados: checked,
    candidatos_explicitos: candidates,
    alteracoes: changed,
    exemplos: examples
  }, null, 2));
} finally {
  db.close();
}

function extractExplicitAlternativeAnswer(question, alternatives) {
  if (String(question.type_question || '').toUpperCase() !== 'MULTIPLA_ESCOLHA') {
    return '';
  }
  const letters = new Set((alternatives || []).map((item) => normalizeAnswer(item.letter)).filter(Boolean));
  if (!letters.size) return '';

  const targetStatus = asksForWrongAnswer(question.statement_text) ? 'ERRADA' : 'CORRETA';
  const statuses = extractAlternativeStatuses(question.comment_text)
    .filter((item) => letters.has(item.letter));
  const matches = statuses.filter((item) => item.status === targetStatus);
  const unique = [...new Set(matches.map((item) => item.letter))];
  return unique.length === 1 ? unique[0] : '';
}

function extractAlternativeStatuses(text) {
  const normalized = normalizeSearchText(text);
  const items = [];
  const seen = new Set();
  const patterns = [
    /\balternativa\s+([a-e])\s*(?:[-:]\s*)?(incorreta|incorreto|errada|errado|correta|correto)\b/gi,
    /\b([a-e])\)\s*(incorreta|incorreto|errada|errado|correta|correto)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const letter = normalizeAnswer(match[1]);
      const status = wrongStatus(match[2]) ? 'ERRADA' : 'CORRETA';
      const key = `${letter}:${status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ letter, status });
    }
  }

  return items;
}

function asksForWrongAnswer(value) {
  const text = normalizeSearchText(value);
  return /\bexceto\b|\bincorreta\b|\bincorreto\b|\berrada\b|\berrado\b|\bnao\s+(?:e|esta)\s+correta\b/.test(text);
}

function wrongStatus(value) {
  return /\bincorreto\b|\bincorreta\b|\berrado\b|\berrada\b/.test(normalizeSearchText(value));
}

function normalizeAnswer(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-E]$/.test(text) ? text : '';
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
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
