/**
 * Extrator de gabarito v2 — recupera a resposta A PARTIR DO COMENTÁRIO do
 * professor para questões que hoje NÃO têm gabarito algum (sem official_answer,
 * sem notebook, sem extracted_answer). Determinístico, sem IA: só lê o que o
 * professor já escreveu. Reconhece redações que o extrator v1 não pegava
 * ("daí a correção da letra E", "estando incorreto o item", "Item I - CORRETO"…).
 *
 * Segurança:
 *  - só preenche extracted_answer VAZIO (nunca sobrescreve gabarito existente
 *    nem edição manual);
 *  - dois níveis: veredito DEFINITIVO (gabarito/conclusão) vence hedges; senão,
 *    exige UNANIMIDADE dos vereditos — havendo conflito, PULA (não chuta);
 *  - trata negação ("não está correto" -> ERRADO);
 *  - valida a letra contra as alternativas reais da questão (múltipla);
 *  - detecta anuladas e pula.
 *
 * Uso:
 *   node scripts/repair-comment-extracted-answers-v2.mjs                 (dry-run)
 *   node scripts/repair-comment-extracted-answers-v2.mjs --apply         (grava)
 *   node scripts/repair-comment-extracted-answers-v2.mjs --db-client postgres --apply
 *   flags: --sample N (mostra N exemplos), --limit N
 */
import '../src/load-env.mjs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const sampleN = Number(args.sample || 12);
const limit = Number(args.limit || 0);
const { db, client } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: process.env.DATABASE_URL,
  client: args['db-client'] || args.client || ''
});

const norm = (v) => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').toLowerCase().trim();
const wrongWord = (v) => /(^|\s)(incorret[oa]|errad[oa]|fals[oa])(\s|$|\.|,|;|:)/.test(` ${norm(v)} `);
const isValidLetter = (v) => /^[A-E]$/.test(String(v || '').trim().toUpperCase());

// ---------- CERTO_ERRADO ----------
// Veredito DEFINITIVO: gabarito declarado, ou marcador de conclusão + status,
// ou uma sentença terminal "item (in)correto".
function certoErradoDefinitive(text) {
  const n = norm(text);
  // Conclusão clássica "daí a (in)correção do quesito/item/alternativa" — sinal
  // forte e inequívoco (incorreção = incorreto). Pega a ÚLTIMA ocorrência.
  const corr = concludeCorrecao(n);
  if (corr) return corr;
  // gabarito/resposta declarada
  let m = n.match(/\bgabarito\s*(?:oficial\s*)?[:\-]?\s*(certo|correto|errado|incorreto|c|e)\b/);
  if (m) return statusToCE(m[1]);
  m = n.match(/\bresposta\s*(?:correta\s*)?[:\-]?\s*(certo|correto|errado|incorreto)\b/);
  if (m) return statusToCE(m[1]);
  // conclusão: "portanto/logo/assim/por isso/dessa forma/conclui-se(,)? ... (in)correto o item"
  m = n.match(/\b(?:portanto|logo|assim|por isso|dessa forma|conclui-se|desse modo|destarte)\b[^.]*?\b(estando\s+)?(certo|correto|errado|incorreto)\b[^.]{0,20}\bo\s+item\b/);
  if (m) return statusToCE(m[2]);
  m = n.match(/\b(?:portanto|logo|assim|por isso|dessa forma|conclui-se|desse modo|destarte)\b[^.]*?\bo\s+item\b[^.]{0,20}\b(esta|e)\s+(certo|correto|errado|incorreto)\b/);
  if (m) return statusToCE(m[3]);
  // "estando (in)correto o item" / "(in)correto o item"
  m = n.match(/\bestando\s+(certo|correto|errado|incorreto)\s+o\s+item\b/);
  if (m) return statusToCE(m[1]);
  // terminal isolado: "... item incorreto." no fim
  m = n.match(/\b(?:o\s+)?item\s+(certo|correto|errado|incorreto)\s*\.?\s*$/);
  if (m) return statusToCE(m[1]);
  m = n.match(/^(certo|errado)\.?\s/);
  if (m) return statusToCE(m[1]);
  return '';
}
// Vereditos gerais (para unanimidade), COM negação.
function certoErradoVerdicts(text) {
  const n = norm(text);
  const out = [];
  const patterns = [
    /\b(nao\s+(?:esta|e)\s+)?(certo|correto|errado|incorreto)\s+o\s+item\b/g,
    /\bo\s+item\s+(nao\s+)?(esta|e)\s+(certo|correto|errado|incorreto)\b/g,
    /\b(?:a\s+)?(?:assertiva|afirmativa|questao|alternativa)\s+(nao\s+)?(esta|e)\s+(certa|correta|errada|incorreta|verdadeira|falsa)\b/g,
    /\b(nao\s+)?(?:e|esta)\s+(correto|incorreto|certo|errado)\s+afirmar\b/g,
    /\bitem\s+(certo|correto|errado|incorreto)\b/g,
  ];
  const pushNeg = (neg, status) => {
    let ce = statusToCE(status);
    if (!ce) return;
    if (neg) ce = ce === 'CERTO' ? 'ERRADO' : 'CERTO';
    out.push(ce);
  };
  for (const m of n.matchAll(patterns[0])) pushNeg(Boolean(m[1]), m[2]);
  for (const m of n.matchAll(patterns[1])) pushNeg(Boolean(m[1]), m[3]);
  for (const m of n.matchAll(patterns[2])) pushNeg(Boolean(m[1]), m[3]);
  for (const m of n.matchAll(patterns[3])) pushNeg(Boolean(m[1]), m[2]);
  for (const m of n.matchAll(patterns[4])) pushNeg(false, m[1]);
  return out;
}
// "daí a (in)correção..." ou "(in)correção do item/quesito/alternativa/assertiva/
// afirmativa". Só aceita essas formas seguras (não "correção" solta, que pode
// significar "conserto/correção do ato"). Usa a ÚLTIMA (a conclusão).
function concludeCorrecao(n) {
  const hits = [];
  for (const m of n.matchAll(/\bdai\s+a\s+(in)?correcao\b/g)) hits.push({ i: m.index, neg: Boolean(m[1]) });
  for (const m of n.matchAll(/\b(in)?correcao\s+d[oa]\s+(?:item|quesito|alternativa|assertiva|afirmativa)\b/g)) hits.push({ i: m.index, neg: Boolean(m[1]) });
  if (!hits.length) return '';
  hits.sort((a, b) => a.i - b.i);
  return hits[hits.length - 1].neg ? 'ERRADO' : 'CERTO';
}

function statusToCE(s) {
  const t = norm(s);
  if (['certo', 'correto', 'correta', 'verdadeira', 'verdadeiro', 'c'].includes(t)) return 'CERTO';
  if (['errado', 'incorreto', 'incorreta', 'errada', 'falsa', 'falso', 'e'].includes(t)) return 'ERRADO';
  return '';
}

// ---------- MULTIPLA_ESCOLHA ----------
function multiplaDefinitive(text) {
  const n = norm(text);
  const pats = [
    /\bgabarito\s*(?:oficial\s*)?[:\-]?\s*(?:letra|alternativa|opcao)?\s*([a-e])\b/,
    /\bresposta\s*(?:correta|certa)?\s*[:\-]?\s*(?:e\s+a\s+)?(?:letra|alternativa|opcao)\s+([a-e])\b/,
    /\bresposta\s*(?:correta|certa)\s*[:\-]?\s*([a-e])\b/,
    /\bcorre(?:cao|ta|to)\s+(?:da\s+|e\s+a\s+|esta\s+na\s+)?(?:letra|alternativa|opcao)\s+([a-e])\b/,
    /\b(?:dai|logo|portanto|assim|por isso|dessa forma)[,]?\s+(?:a\s+)?(?:correcao\s+da\s+|resposta\s+e\s+a\s+)?(?:letra|alternativa|opcao)\s+([a-e])\b/,
    /\b(?:a\s+)?(?:letra|alternativa|opcao)\s+([a-e])\s+(?:e\s+)?(?:a\s+)?(?:esta\s+)?(correta|certa|o\s+gabarito|a\s+resposta)\b/,
    /\ba\s+(?:correta|certa|resposta)\s+e\s+a\s+(?:letra|alternativa|opcao)\s+([a-e])\b/,
    /\b(?:letra|alternativa|opcao)\s*[:\-]\s*([a-e])\b/,
    /\b(?:letra|gabarito)\s+([a-e])\s*\.?\s*$/,
  ];
  const found = new Set();
  for (const p of pats) {
    const m = n.match(p);
    if (m) found.add(m[1].toUpperCase());
  }
  return found.size === 1 ? [...found][0] : '';
}
function multiplaByStatus(text, asksWrong) {
  const n = norm(text);
  const items = [];
  const seen = new Set();
  const pats = [
    /\b(?:letra|alternativa|opcao)\s+([a-e])\s*(?:[-:)]\s*)?(incorreta|incorreto|errada|errado|correta|correto)\b/gi,
    /\b([a-e])\)\s*(incorreta|incorreto|errada|errado|correta|correto)\b/gi,
    /\b(?:letra|alternativa|opcao)\s+([a-e])\s+(?:esta|e)\s+(incorreta|incorreto|errada|errado|correta|correto)\b/gi,
  ];
  for (const p of pats) for (const m of n.matchAll(p)) {
    const letter = m[1].toUpperCase();
    const status = wrongWord(m[2]) ? 'ERRADA' : 'CORRETA';
    const k = `${letter}:${status}`;
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ letter, status });
  }
  const target = asksWrong ? 'ERRADA' : 'CORRETA';
  const u = [...new Set(items.filter((x) => x.status === target).map((x) => x.letter))];
  return u.length === 1 ? u[0] : '';
}
const asksForWrong = (v) => /\bexceto\b|\bincorret[ao]\b|\berrad[ao]\b|\bnao\s+(?:e|esta)\s+corret[ao]\b/.test(norm(v));

// anulada
function isAnnulled(text) {
  const n = norm(text);
  return /\bquestao\s+(?:foi\s+)?anulada\b|\bitem\s+(?:foi\s+)?anulado\b|\bgabarito\s*[:\-]?\s*anulad|banca\s+(?:decidiu|resolveu|optou por)\s+anular|houve\s+anulacao/.test(n);
}

function extractV2(type, statement, comment) {
  if (isAnnulled(comment)) return { answer: '', reason: 'anulada' };
  const T = String(type || '').toUpperCase();
  if (T === 'CERTO_ERRADO') {
    const def = certoErradoDefinitive(comment);
    if (def) return { answer: def, reason: 'definitivo' };
    const verdicts = [...new Set(certoErradoVerdicts(comment))];
    if (verdicts.length === 1) return { answer: verdicts[0], reason: 'unanime' };
    return { answer: '', reason: verdicts.length ? 'conflito' : 'sem-sinal' };
  }
  if (T === 'MULTIPLA_ESCOLHA') {
    const def = multiplaDefinitive(comment);
    if (def) return { answer: def, reason: 'definitivo' };
    const byStatus = multiplaByStatus(comment, asksForWrong(statement));
    if (byStatus) return { answer: byStatus, reason: 'status' };
    return { answer: '', reason: 'sem-sinal' };
  }
  return { answer: '', reason: 'tipo' };
}

// ---------- execução ----------
console.log(`[v2] banco=${client} modo=${apply ? 'APPLY' : 'dry-run'}`);

const noAns = `COALESCE(q.official_answer,'')=''
  AND NOT EXISTS (SELECT 1 FROM notebook_questions nq WHERE nq.question_id=q.id_question AND COALESCE(nq.answer,'')<>'')
  AND COALESCE(c.extracted_answer,'')=''`;
const rows = db.prepare(`
  SELECT q.id_question AS id, q.type_question AS type, q.statement_text AS stmt,
         COALESCE(c.text, c.html, '') AS comment
  FROM questions q
  JOIN comments c ON c.question_id = q.id_question AND COALESCE(c.text, c.html, '') <> ''
  WHERE COALESCE(q.anulada,0)=0 AND COALESCE(q.desatualizada,0)=0 AND ${noAns}
  ORDER BY q.id_question
  ${limit > 0 ? `LIMIT ${Math.floor(limit)}` : ''}
`).all();

const altLetters = db.prepare(`SELECT letter FROM alternatives WHERE question_id = ? ORDER BY position`);
const update = db.prepare(`UPDATE comments SET extracted_answer = ?, checked_at = CURRENT_TIMESTAMP WHERE question_id = ?`);

let filled = 0, skipConflito = 0, skipSemSinal = 0, skipAnulada = 0, skipInvalida = 0;
const byReason = new Map();
const samples = [];
const skipTails = [];
const dumpSkips = Number(args['dump-skips'] || 0);
for (const r of rows) {
  const { answer, reason } = extractV2(r.type, r.stmt, r.comment);
  if (!answer) {
    if (reason === 'conflito') skipConflito++;
    else if (reason === 'anulada') skipAnulada++;
    else skipSemSinal++;
    if (dumpSkips && reason === 'sem-sinal' && skipTails.length < dumpSkips) {
      const clean = String(r.comment).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
      skipTails.push({ id: r.id, type: r.type, tail: clean.slice(-200) });
    }
    continue;
  }
  // valida letra contra alternativas reais (múltipla)
  if (String(r.type).toUpperCase() === 'MULTIPLA_ESCOLHA') {
    if (!isValidLetter(answer)) { skipInvalida++; continue; }
    const letters = altLetters.all(r.id).map((x) => String(x.letter || '').toUpperCase());
    if (letters.length && !letters.includes(answer)) { skipInvalida++; continue; }
  }
  filled++;
  byReason.set(reason, (byReason.get(reason) || 0) + 1);
  if (samples.length < sampleN) {
    samples.push({ id: r.id, type: r.type, answer, reason, c: String(r.comment).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) });
  }
  if (apply) update.run(answer, r.id);
}

console.log(JSON.stringify({
  analisadas: rows.length,
  preenchidas: filled,
  por_metodo: Object.fromEntries(byReason),
  pulos: { conflito: skipConflito, sem_sinal: skipSemSinal, anulada: skipAnulada, letra_invalida: skipInvalida }
}, null, 2));
console.log('\n=== amostras (comentário -> resposta inferida) ===');
for (const s of samples) console.log(`[${s.id}|${s.type}] => ${s.answer} (${s.reason})\n   ${s.c}\n`);
if (skipTails.length) {
  console.log('\n=== CAUDAS de comentários PULADOS (sem-sinal) — final 200 chars ===');
  for (const s of skipTails) console.log(`[${s.id}|${s.type}] …${s.tail}\n`);
}

if (typeof db.close === 'function') db.close();

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else { parsed[key] = next; i += 1; }
  }
  return parsed;
}
