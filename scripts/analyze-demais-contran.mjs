// ANÁLISE (read-only): tenta rotear as desatualizadas de trânsito que hoje só
// têm o "colchão" (not_verified_do_not_score_v7) e NÃO estão ocultas, extraindo
// o número da resolução do ENUNCIADO (não só do assunto), mapeando antiga->vigente
// e casando com os notebooks existentes. Reporta: roteadas x órfãs (com a lista
// de números órfãos pra decidir mapeamento). Lê o prod.
//   node --env-file=.env scripts/analyze-demais-contran.mjs
import postgres from 'postgres';

// Espelha gen-notebooklm-export.mjs (antiga -> vigente).
const OLD_TO_CUR = new Map([
  [4,911],[14,993],[24,968],[92,938],[160,973],[210,882],[211,882],[227,970],[290,882],
  [360,933],[441,946],[471,909],[520,882],[552,945],[667,970],[740,1004],[870,1004],
  [780,969],[803,882],[216,960],[253,960],[254,960],[349,946],[561,985],[925,985],[789,1020],[912,993],
]);
// Números VIGENTES que têm notebook (destino final).
const NB_NUMS = new Set([
  993,960,970,951,958,973,882,723,735,946,955,809,911,967,810,940,943,996,
  1004,1014,798,804,1020,432,918,900,508,819,968,969,916,941,811,110,242,36,909,920,985,938,525,945,
]);

// Extrai TODOS os números de resolução de um texto. Ignora a Lei 9.503 (CTB),
// anos soltos e leis (Lei nº ...). Captura "Resolução nº 441", "Res. 205/2006",
// "Resolução Contran n. 349", "CONTRAN 160/2004".
function extractResNums(text) {
  const s = String(text || '');
  const out = new Set();
  const re = /(?:Resolu[çc][aã]o|Res\.)\s*(?:d[eo]\s+)?(?:CONTRAN\s*)?n?[ºo°.]{0,3}\s*(\d{1,4})(?:\s*\/\s*((?:19|20)\d{2}))?/gi;
  for (const m of s.matchAll(re)) {
    const num = Number(m[1]);
    if (!num || num === 9503 || num === 9) continue; // CTB
    out.add(num);
  }
  // "CONTRAN 160/2004" sem a palavra Resolução
  const re2 = /CONTRAN\s*n?[ºo°.]{0,3}\s*(\d{1,4})\s*\/\s*((?:19|20)\d{2})/gi;
  for (const m of s.matchAll(re2)) { const n = Number(m[1]); if (n && n !== 9503) out.add(n); }
  return [...out];
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const rows = await sql`
    SELECT q.id_question, q.assunto, q.statement_text
    FROM questions q JOIN question_current_law_answers a ON a.question_id = q.id_question
    WHERE q.desatualizada = 1 AND q.materia LIKE 'Legisla% de Tr%nsito%'
      AND a.verification_method = 'not_verified_do_not_score_v7'
      AND NOT EXISTS (SELECT 1 FROM question_study_status s WHERE s.question_id = q.id_question AND s.status = 'excluded')`;
  console.log('pendentes (colchão, visíveis):', rows.length, '\n');

  const routed = new Map();      // cur -> count
  const orphanNums = new Map();  // detected(old|cur) -> count (sem notebook)
  let semNumero = 0;
  const semNumeroSamples = [];

  for (const r of rows) {
    const nums = extractResNums(`${r.assunto} | ${r.statement_text}`);
    if (!nums.length) { semNumero++; if (semNumeroSamples.length < 8) semNumeroSamples.push(r.id_question); continue; }
    // mapeia cada número p/ vigente; acha o 1º que tem notebook
    let hit = null;
    const mapped = nums.map((n) => OLD_TO_CUR.get(n) || n);
    for (const cur of mapped) { if (NB_NUMS.has(cur)) { hit = cur; break; } }
    if (hit) { routed.set(hit, (routed.get(hit) || 0) + 1); }
    else {
      // órfã: registra os números detectados (já mapeados) p/ decidir
      for (const cur of mapped) orphanNums.set(cur, (orphanNums.get(cur) || 0) + 1);
    }
  }

  const routedTotal = [...routed.values()].reduce((a, b) => a + b, 0);
  const orphanTotal = rows.length - routedTotal - semNumero;
  console.log('=== ROTEÁVEIS p/ notebook existente:', routedTotal, '===');
  for (const [cur, n] of [...routed.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(3), '-> Res.', cur);
  console.log('\n=== ÓRFÃS (mapeiam p/ resolução SEM notebook):', orphanTotal, '===');
  console.log('(números já mapeados p/ vigente; some p/ >1 número por questão)');
  for (const [cur, n] of [...orphanNums.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(3), '-> Res.', cur, OLD_TO_CUR.has(cur) ? '' : '(sem de-para)');
  console.log('\n=== SEM número detectável no texto:', semNumero, '=== ex.:', semNumeroSamples.join(', '));
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
