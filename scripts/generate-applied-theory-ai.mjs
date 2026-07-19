/**
 * Gera "Teoria aplicada" por questão usando a IA do sistema (Gemini).
 *
 * Filosofia (a mesma do dossiê de redação): a IA escreve APENAS a camada
 * pedagógica. A letra da lei nunca vem da IA — o dispositivo que ela nomeia é
 * verificado contra law_compendium_sections e o trecho é lido do banco.
 *
 *   - ai_anchored: dispositivo confirmado no compêndio -> trecho verbatim do
 *     banco, alta confiança.
 *   - ai_reviewed: sem dispositivo verificável (ou matéria sem lei) -> publica
 *     com selo "Gerado por IA — confira", sem nenhum trecho de lei fabricado.
 *
 * Por padrão roda em DRY-RUN: não escreve no banco, só gera um preview JSON
 * para revisão humana. A gravação/migração fica para uma etapa posterior.
 *
 * Uso:
 *   node scripts/generate-applied-theory-ai.mjs --materia "Legislação de Trânsito e Transportes" --limit 6
 *   node scripts/generate-applied-theory-ai.mjs --ids 3040,18839 --out data/applied_theory_ai/preview.json
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { generateText, aiAvailable, aiProviderName, extractJson } from '../src/study/ai-provider.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CTB_SLUG = 'lei_9503_1997_ctb_compilado';

const PROMPT_SYSTEM = [
  'Você é um professor de cursinho para o concurso da Polícia Rodoviária Federal (PRF).',
  'Escreve teoria aplicada a UMA questão específica: direta, sem enrolação, do jeito que faz o aluno acertar a próxima questão parecida.',
  'NUNCA transcreva o texto da lei de memória. Apenas NOMEIE o dispositivo (ex.: "art. 165 do CTB", "art. 168 do CTB"). O texto oficial será buscado no banco, não em você.',
  'Se não tiver certeza de qual dispositivo legal resolve a questão, deixe "legalDeviceLocator" vazio — é melhor vazio do que errado.',
  'Responda APENAS com JSON válido, sem comentários fora do JSON.'
].join('\n');

function buildPrompt(question) {
  const alternativas = question.alternatives
    .map((alt) => `${alt.letter}) ${alt.text}`)
    .join('\n');
  return [
    `MATÉRIA: ${question.materia}`,
    question.assunto ? `ASSUNTO: ${question.assunto}` : '',
    '',
    'ENUNCIADO:',
    question.statementText.slice(0, 3500),
    '',
    alternativas ? `ALTERNATIVAS:\n${alternativas}` : '',
    question.answer ? `\nGABARITO: ${question.answer}` : '',
    question.commentText ? `\nCOMENTÁRIO EXISTENTE (referência, pode conter lei desatualizada):\n${question.commentText.slice(0, 1500)}` : '',
    '',
    'Gere o JSON:',
    '{',
    '  "title": "título curto da teoria (max 80 chars)",',
    '  "questionFocus": "1-2 frases: o que exatamente a questão cobra",',
    '  "legalDeviceLocator": "o dispositivo que resolve, ex.: \\"art. 165 do CTB\\" — ou \\"\\" se não for questão de lei ou se você não tiver certeza",',
    '  "appliedExplanation": "2-4 frases aplicando a regra ao enunciado, explicando por que o gabarito é o que é",',
    '  "ruleSummaryBullets": ["2 a 4 bullets curtos para memorizar a regra"],',
    '  "professorTip": "a pegadinha típica de prova sobre esse ponto (1-2 frases)",',
    '  "commonTraps": ["1 a 3 armadilhas comuns"],',
    '  "studyConclusion": "1 frase de conclusão para fixar"',
    '}'
  ].filter((line) => line !== '').join('\n');
}

/** "art. 165-A do CTB", "Art 168", "artigo 165" -> "Art. 165-A" (display_ref do compêndio). */
function parseCtbLocator(locator) {
  const raw = String(locator || '').toLowerCase();
  if (!/\bctb\b|tr[aâ]nsito|9\.?503/.test(raw) && !/\bart/.test(raw)) return null;
  const match = raw.match(/art(?:igo|\.)?\s*(\d+)\s*(-\s*[a-z])?/i);
  if (!match) return null;
  const num = match[1];
  const suffix = match[2] ? `-${match[2].replace(/[\s-]/g, '').toUpperCase()}` : '';
  return `Art. ${num}${suffix}`;
}

function verifyAnchor(db, locator) {
  const displayRef = parseCtbLocator(locator);
  if (!displayRef) return null;
  const row = db.prepare(`
    SELECT section_key, display_ref, text, is_current, is_revoked
    FROM law_compendium_sections
    WHERE source_slug = ? AND display_ref = ?
    LIMIT 1
  `).get(CTB_SLUG, displayRef);
  if (!row || row.is_revoked) return null;
  return {
    sectionKey: row.section_key,
    locator: `${row.display_ref} do CTB`,
    excerpt: String(row.text || '').trim(),
    isCurrent: Boolean(row.is_current)
  };
}

function selectQuestions(db, { ids, materia, limit }) {
  if (ids?.length) {
    const placeholders = ids.map(() => '?').join(', ');
    return db.prepare(`
      SELECT q.id_question, q.materia, q.assunto, q.statement_text,
             COALESCE(NULLIF(q.official_answer, ''), NULLIF(c.extracted_answer, ''), '') AS answer,
             COALESCE(c.html_local, c.html, c.text, '') AS comment_html
      FROM questions q
      LEFT JOIN comments c ON c.question_id = q.id_question
      WHERE q.id_question IN (${placeholders})
    `).all(...ids);
  }
  return db.prepare(`
    SELECT q.id_question, q.materia, q.assunto, q.statement_text,
           COALESCE(NULLIF(q.official_answer, ''), NULLIF(c.extracted_answer, ''), '') AS answer,
           COALESCE(c.html_local, c.html, c.text, '') AS comment_html
    FROM questions q
    LEFT JOIN comments c ON c.question_id = q.id_question
    LEFT JOIN question_applied_theory_cards atc ON atc.question_id = q.id_question
      AND COALESCE(atc.publish_status, atc.card_status) = 'published'
    WHERE q.materia = ?
      AND COALESCE(q.anulada, 0) = 0
      AND atc.question_id IS NULL
      AND COALESCE(q.statement_text, '') != ''
    ORDER BY q.id_question
    LIMIT ?
  `).all(materia, limit);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!aiAvailable()) {
    console.error('IA não configurada. Defina AI_PROVIDER e a chave no .env.');
    process.exit(1);
  }
  const ids = args.ids ? String(args.ids).split(',').map((v) => Number(v.trim())).filter(Boolean) : null;
  const materia = args.materia || 'Legislação de Trânsito e Transportes';
  const limit = Math.max(1, Number(args.limit || 6));
  const outPath = path.resolve(ROOT_DIR, args.out || 'data/applied_theory_ai/preview_batch.json');

  const { client, db } = openStudyDatabase({ dbPath: args.db || 'questoes-prf.sqlite' });
  console.log(`Provedor de IA: ${aiProviderName()} | banco: ${client}`);
  console.log(ids ? `Questões: ${ids.join(', ')}` : `Matéria: ${materia} | limite: ${limit}`);

  const questions = selectQuestions(db, { ids, materia, limit });
  console.log(`Selecionadas: ${questions.length}\n`);

  const getAlternatives = db.prepare('SELECT letter, text FROM alternatives WHERE question_id = ? ORDER BY position');
  const preview = [];
  let anchored = 0;
  let reviewed = 0;

  for (const q of questions) {
    const question = {
      id: q.id_question,
      materia: q.materia || '',
      assunto: q.assunto || '',
      statementText: q.statement_text || '',
      answer: q.answer || '',
      commentText: htmlToText(q.comment_html),
      alternatives: getAlternatives.all(q.id_question)
    };

    const result = await generateText({
      system: PROMPT_SYSTEM,
      prompt: buildPrompt(question),
      maxTokens: 900,
      temperature: 0.3
    });
    if (!result.ok) {
      console.log(`  [${q.id_question}] FALHA IA: ${result.error}`);
      preview.push({ questionId: q.id_question, error: result.error });
      continue;
    }
    const parsed = extractJson(result.text);
    if (!parsed || !parsed.appliedExplanation) {
      console.log(`  [${q.id_question}] JSON inválido`);
      preview.push({ questionId: q.id_question, error: 'json_invalido', raw: String(result.text).slice(0, 300) });
      continue;
    }

    const anchor = verifyAnchor(db, parsed.legalDeviceLocator);
    const sourceMode = anchor ? 'ai_anchored' : 'ai_reviewed';
    if (anchor) anchored += 1; else reviewed += 1;

    preview.push({
      questionId: q.id_question,
      materia: question.materia,
      assunto: question.assunto,
      sourceMode,
      title: String(parsed.title || '').slice(0, 120),
      questionFocus: parsed.questionFocus || '',
      appliedExplanation: parsed.appliedExplanation || '',
      ruleSummaryBullets: Array.isArray(parsed.ruleSummaryBullets) ? parsed.ruleSummaryBullets.slice(0, 4) : [],
      professorTip: parsed.professorTip || '',
      commonTraps: Array.isArray(parsed.commonTraps) ? parsed.commonTraps.slice(0, 3) : [],
      studyConclusion: parsed.studyConclusion || '',
      aiSuggestedLocator: parsed.legalDeviceLocator || '',
      // âncora verificada no banco — trecho NUNCA vem da IA
      legalLocator: anchor?.locator || '',
      legalExcerpt: anchor?.excerpt || '',
      legalSectionKey: anchor?.sectionKey || '',
      showWarning: anchor ? '' : 'Gerado por IA — confira o conteúdo com a fonte oficial.'
    });
    console.log(`  [${q.id_question}] ${sourceMode}${anchor ? ` (${anchor.locator})` : ''} — ${String(parsed.title || '').slice(0, 60)}`);
  }

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify({ materia: ids ? '(por ids)' : materia, generatedWith: aiProviderName(), anchored, reviewed, cards: preview }, null, 2));
  console.log(`\nAncorados: ${anchored} | Revisão (selo): ${reviewed}`);
  console.log(`Preview salvo em: ${path.relative(ROOT_DIR, outPath)}`);
  db.close?.();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    i += 1;
  }
  return args;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
