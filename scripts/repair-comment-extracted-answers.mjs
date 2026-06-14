import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const dbPath = args.db || 'questoes-prf.sqlite';
const apply = Boolean(args.apply);
const reportConflicts = Boolean(args['report-conflicts']);
const reportAnnulled = Boolean(args['report-annulled']);
const reportAllAnnulled = Boolean(args['report-all-annulled']);
const reportLimit = Math.max(0, Number(args['report-limit'] ?? 50));
const includeConflicts = Boolean(args['include-conflicts']);
const limit = Number(args.limit || 0);
const startAfter = Number(args['start-after'] || 0);
const progressEvery = Math.max(1, Number(args['progress-every'] || 250));
const showProgress = !args['no-progress'];
const startedAt = Date.now();
const { client, db } = openStudyDatabase({ dbPath, client: args['db-client'] || args.client || '' });

try {
  if (showProgress) {
    console.log(`[inicio] banco=${client} modo=${apply ? 'apply' : 'dry-run'} limit=${limit || 'sem limite'} start_after=${startAfter || 0}`);
    console.log('[consulta] carregando comentarios candidatos...');
  }

  const values = [];
  const startAfterSql = startAfter > 0 ? 'AND q.id_question > ?' : '';
  if (startAfter > 0) values.push(startAfter);
  if (limit > 0) values.push(limit);

  const rows = db.prepare(`
    SELECT q.id_question,
           q.type_question,
           COALESCE(q.anulada, 0) AS anulada,
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
      ${startAfterSql}
    ORDER BY q.id_question
    ${limit > 0 ? 'LIMIT ?' : ''}
  `).all(...values);

  if (showProgress) {
    console.log(`[consulta] ${rows.length} comentario(s) carregado(s) em ${formatDuration(Date.now() - startedAt)}.`);
  }

  const update = db.prepare(`
    UPDATE comments
    SET extracted_answer = ?,
        checked_at = CURRENT_TIMESTAMP
    WHERE question_id = ?
  `);

  let checked = 0;
  let candidates = 0;
  let changed = 0;
  let skippedConflicts = 0;
  let annulledDetected = 0;
  let annulledAlreadyMarked = 0;
  let annulledNotMarked = 0;
  let lastQuestionId = 0;
  const examples = [];
  const conflicts = [];
  const annulled = [];

  for (const row of rows) {
    checked += 1;
    lastQuestionId = Number(row.id_question || 0);
    try {
      const annulledEvidence = detectAnnulledComment(row.comment_text);
      if (annulledEvidence) {
        annulledDetected += 1;
        const alreadyMarked = Boolean(Number(row.anulada || 0));
        if (alreadyMarked) {
          annulledAlreadyMarked += 1;
        } else {
          annulledNotMarked += 1;
        }
        if (reportAnnulled && (!alreadyMarked || reportAllAnnulled) && (reportLimit === 0 || annulled.length < reportLimit)) {
          annulled.push(buildAnnulledReport(row, annulledEvidence));
        }
        continue;
      }

      const answer = extractExplicitCommentAnswer(row);
      if (!answer) continue;

      candidates += 1;
      const current = normalizeStoredAnswer(row.extracted_answer);
      if (current === answer) continue;
      if (
        String(row.type_question || '').toUpperCase() === 'CERTO_ERRADO'
        && ['CERTO', 'ERRADO'].includes(current)
        && !includeConflicts
      ) {
        skippedConflicts += 1;
        if (reportConflicts) {
          conflicts.push(buildConflictReport(row, current, answer));
        }
        continue;
      }

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
    } finally {
      if (showProgress && checked % progressEvery === 0) {
        logProgress({
          checked,
          total: rows.length,
          candidates,
          changed,
          skippedConflicts,
          annulledDetected,
          lastQuestionId,
          startedAt
        });
      }
    }
  }

  if (showProgress && rows.length && checked % progressEvery !== 0) {
    logProgress({
      checked,
      total: rows.length,
      candidates,
      changed,
      skippedConflicts,
      annulledDetected,
      lastQuestionId,
      startedAt
    });
  }

  console.log(JSON.stringify({
    banco: client,
    modo: apply ? 'apply' : 'dry-run',
    verificados: checked,
    candidatos_explicitos: candidates,
    alteracoes: changed,
    conflitos_pulados: skippedConflicts,
    anuladas_detectadas: annulledDetected,
    anuladas_ja_marcadas_no_banco: annulledAlreadyMarked,
    anuladas_nao_marcadas_no_banco: annulledNotMarked,
    ultimo_question_id: lastQuestionId,
    conflitos: reportConflicts ? conflicts : undefined,
    anuladas: reportAnnulled ? annulled : undefined,
    exemplos: examples
  }, null, 2));
} finally {
  db.close();
}

function logProgress({ checked, total, candidates, changed, skippedConflicts, annulledDetected, lastQuestionId, startedAt }) {
  const percent = total ? ((checked / total) * 100).toFixed(1) : '100.0';
  console.log(`[progresso] ${checked}/${total} (${percent}%) | ultimo_id=${lastQuestionId || '-'} | candidatos=${candidates} | alteracoes=${changed} | conflitos_pulados=${skippedConflicts} | anuladas=${annulledDetected} | tempo=${formatDuration(Date.now() - startedAt)}`);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

function buildConflictReport(row, current, inferred) {
  return {
    question_id: row.id_question,
    type_question: row.type_question || '',
    atual_no_banco: current,
    inferido_pelo_comentario: inferred,
    enunciado: trimText(row.statement_text, 500),
    trecho_comentario: conflictCommentSnippet(row.comment_text)
  };
}

function buildAnnulledReport(row, evidence) {
  return {
    question_id: row.id_question,
    type_question: row.type_question || '',
    anulada_no_banco: Boolean(Number(row.anulada || 0)),
    gabarito_atual_no_banco: normalizeStoredAnswer(row.extracted_answer) || String(row.extracted_answer || ''),
    evidencia: evidence,
    enunciado: trimText(row.statement_text, 500),
    trecho_comentario: annulledCommentSnippet(row.comment_text)
  };
}

function detectAnnulledComment(text) {
  const normalized = normalizeSearchText(text);
  const patterns = [
    /\bgabarito\s*[:\-]?\s*(anulada|anulado|questao\s+anulada|questao\s+anulado)\b/,
    /\bquestao\s+(?:foi\s+)?anulada\b/,
    /\bitem\s+(?:foi\s+)?anulado\b/,
    /\ba\s+banca\s+(?:decidiu|resolveu|optou\s+por)\s+anular\b/,
    /\b(?:questao|item)\s+anulad[ao]\s+pela\s+banca\b/,
    /\bhouve\s+anulacao\s+(?:da\s+questao|do\s+item)\b/
  ];
  const match = patterns.map((pattern) => normalized.match(pattern)).find(Boolean);
  return match ? match[0] : '';
}

function annulledCommentSnippet(text) {
  const value = String(text || '');
  const normalized = normalizeSearchText(value);
  const patterns = [
    'gabarito anulada',
    'gabarito anulado',
    'questao anulada',
    'item anulado',
    'banca decidiu anular',
    'banca resolveu anular',
    'houve anulacao'
  ];
  const index = patterns
    .map((pattern) => normalized.indexOf(pattern))
    .filter((item) => item >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (index < 0) return trimText(value, 900);
  return trimText(value.slice(Math.max(0, index - 450), index + 450), 900);
}

function conflictCommentSnippet(text) {
  const value = String(text || '');
  const normalized = normalizeSearchText(value);
  const patterns = [
    'item correto',
    'item errado',
    'o item esta correto',
    'o item esta errado',
    'assertiva esta correta',
    'assertiva esta errada',
    'afirmativa esta correta',
    'afirmativa esta errada',
    'questao esta correta',
    'questao esta errada'
  ];
  const index = patterns
    .map((pattern) => normalized.indexOf(pattern))
    .filter((item) => item >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  if (index < 0) return trimText(value, 900);
  return trimText(value.slice(Math.max(0, index - 450), index + 450), 900);
}

function trimText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function extractExplicitCommentAnswer(question) {
  const type = String(question.type_question || '').toUpperCase();
  if (type === 'CERTO_ERRADO') {
    return extractExplicitItemAnswer(question);
  }
  if (type !== 'MULTIPLA_ESCOLHA') return '';

  return extractExplicitAlternativeAnswer(question);
}

function extractExplicitAlternativeAnswer(question) {
  const declared = extractDeclaredAlternativeAnswer(question.comment_text);
  if (declared) return declared;

  const targetStatus = asksForWrongAnswer(question.statement_text) ? 'ERRADA' : 'CORRETA';
  const statuses = extractAlternativeStatuses(question.comment_text);
  const matches = statuses.filter((item) => item.status === targetStatus);
  const unique = [...new Set(matches.map((item) => item.letter))];
  return unique.length === 1 ? unique[0] : '';
}

function extractExplicitItemAnswer(question) {
  const declared = extractDeclaredItemAnswer(question.comment_text);
  if (declared) return declared;

  const statuses = extractItemStatuses(question.comment_text);
  const unique = [...new Set(statuses)];
  return unique.length === 1 ? unique[0] : '';
}

function extractDeclaredAlternativeAnswer(text) {
  const normalized = normalizeSearchText(text);
  const patterns = [
    /\bresposta\s+mais\s+correta\s*(?:[:\-]?\s*)?(?:letra|alternativa)?\s*([a-e])\b/,
    /\balternativa\s+mais\s+correta\s*(?:[:\-]?\s*)?(?:letra|alternativa)?\s*([a-e])\b/,
    /\bgabarito\s*(?:oficial\s*)?(?:[:\-]?\s*)?(?:letra|alternativa)\s+([a-e])\b/,
    /\bgabarito\s*(?:oficial\s*)?[:\-]\s*([a-e])\b/,
    /\bresposta\s*(?:correta\s*)?(?:[:\-]?\s*)?(?:letra|alternativa)\s+([a-e])\b/,
    /\bresposta\s*(?:correta\s*)?[:\-]\s*([a-e])\b/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return normalizeAnswer(match[1]);
  }
  return '';
}

function extractDeclaredItemAnswer(text) {
  const normalized = normalizeSearchText(text);
  const patterns = [
    /\bgabarito\s*(?:oficial\s*)?[:\-]?\s*(certo|correto|errado|incorreto)\b/,
    /\bresposta\s*(?:correta\s*)?[:\-]?\s*(certo|correto|errado|incorreto)\b/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return wrongStatus(match[1]) ? 'ERRADO' : 'CERTO';
  }
  return '';
}

function extractItemStatuses(text) {
  const normalized = normalizeSearchText(text);
  const statuses = [];
  const patterns = [
    /\b(?:gabarito\s*[:\-]?\s*)?item\s+(certo|correto|errado|incorreto)\b/g,
    /\bo\s+item\s+(?:esta|e)\s+(certo|correto|errado|incorreto)\b/g,
    /\b(?:a\s+)?(?:assertiva|afirmativa|questao)\s+(?:esta|e)\s+(certa|correta|errada|incorreta)\b/g,
    /\b(?:portanto|logo|assim),?\s+(certo|correto|errado|incorreto)\s+o\s+item\b/g
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      statuses.push(wrongStatus(match[1]) ? 'ERRADO' : 'CERTO');
    }
  }

  return statuses;
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

function normalizeStoredAnswer(value) {
  const text = String(value || '').trim().toUpperCase();
  if (/^[A-E]$/.test(text)) return text;
  if (['CERTO', 'CORRETO', 'CERTA', 'CORRETA'].includes(text)) return 'CERTO';
  if (['ERRADO', 'INCORRETO', 'ERRADA', 'INCORRETA'].includes(text)) return 'ERRADO';
  return '';
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
