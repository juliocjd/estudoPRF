// Re-extrai o gabarito do TEXTO do comentário (sem captcha) para questões novas
// cujo extracted_answer ficou vazio, mas o comentário tem o gabarito em formato
// que o scraper não pegou ("Gabarito: Letra E", 'ALTERNATIVA "D"', "Gabarito
// Definitivo: ANULADA/CERTO/ERRADO"...). Grava em comments.extracted_answer e,
// se for ANULADA, marca questions.anulada. Só LOCAL (sqlite). Dry-run por padrão.
//   node --experimental-sqlite scripts/reextrair-gabarito.mjs --since-hours 30 [--apply]
import { DatabaseSync } from 'node:sqlite';

const apply = process.argv.includes('--apply');
const shArg = process.argv.indexOf('--since-hours');
const SINCE = shArg >= 0 && process.argv[shArg + 1] ? Number(process.argv[shArg + 1]) : 30;

// tira acento e normaliza espaços pra facilitar o regex
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function extrair(tipo, texto) {
  const t = norm(texto);
  // "Gabarito Definitivo" tem prioridade sobre "Preliminar"
  const def = t.match(/Gabarito\s+Definitivo\s*:?\s*([A-Za-z"']+)/i);
  const prelim = t.match(/Gabarito(?:\s+Preliminar)?\s*:?\s*(?:Letra|Alternativa)?\s*["']{0,2}\s*([A-Za-z]+)/i);
  const pick = (m) => (m ? m[1].replace(/["']/g, '').toUpperCase() : '');
  const isCE = String(tipo).toUpperCase() === 'CERTO_ERRADO';

  // ANULADA / DESATUALIZADA no definitivo
  if (def && /ANULAD/i.test(def[1])) return { anulada: true, ans: '' };

  if (isCE) {
    for (const cand of [pick(def), pick(prelim)]) {
      if (cand === 'CERTO' || cand === 'C') return { ans: 'CERTO' };
      if (cand === 'ERRADO' || cand === 'E') return { ans: 'ERRADO' };
      if (/ANULAD/i.test(cand)) return { anulada: true, ans: '' };
    }
    // fallback: "Gabarito: CERTO/ERRADO" em qualquer lugar
    const m = t.match(/Gabarito[^A-Za-z]{0,12}(CERTO|ERRADO)/i);
    if (m) return { ans: m[1].toUpperCase() };
    return { ans: '' };
  }
  // MULTIPLA_ESCOLHA: pega a letra A-E
  for (const cand of [pick(def), pick(prelim)]) {
    const L = (cand.match(/^([A-E])$/) || [])[1];
    if (L) return { ans: L };
  }
  const m = t.match(/Gabarito[^A-Za-z]{0,20}(?:Letra|Alternativa)?\s*["']{0,2}\s*([A-E])\b/i);
  return { ans: m ? m[1].toUpperCase() : '' };
}

const db = new DatabaseSync('questoes-prf.sqlite');
const rows = db.prepare(`
  SELECT q.id_question, q.type_question, c.text
  FROM questions q JOIN comments c ON c.question_id = q.id_question
  WHERE q.collected_at > datetime('now', ?)
    AND COALESCE(NULLIF(c.extracted_answer,''),'') = ''
    AND COALESCE(NULLIF(c.text,''),'') <> ''
`).all(`-${SINCE} hours`);

let ok = 0, anul = 0, falhou = 0;
const updC = db.prepare("UPDATE comments SET extracted_answer = ?, extracted_answer_source = 'reextraido_texto' WHERE question_id = ?");
const updQ = db.prepare('UPDATE questions SET anulada = 1 WHERE id_question = ?');
if (apply) db.exec('BEGIN');
for (const r of rows) {
  const res = extrair(r.type_question, r.text);
  if (res.anulada) { anul++; if (apply) updQ.run(r.id_question); }
  else if (res.ans) { ok++; if (apply) updC.run(res.ans, r.id_question); }
  else falhou++;
}
if (apply) db.exec('COMMIT');

console.log(`Candidatas (com texto): ${rows.length}`);
console.log(`  gabarito recuperado: ${ok}`);
console.log(`  marcadas ANULADA: ${anul}`);
console.log(`  não deu p/ extrair: ${falhou}`);
console.log(apply ? '\nAPLICADO no sqlite local.' : '\nDRY-RUN (use --apply).');
db.close();
