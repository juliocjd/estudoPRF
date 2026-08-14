// Vigia da coleta: NÃO coleta nada — só observa o banco e emite 1 linha quando a
// coleta PARA (por falta de progresso; pega o caso "captcha só aparece após F5")
// e quando VOLTA. Emite pouco de propósito (não spammar o Monitor).
//   node scripts/coleta-watchdog.mjs
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';

const STALL_SECS = 75;      // sem questão nova por mais que isso = parada
const POLL_MS = 20000;      // checa a cada 20s
const REMIND_EVERY = 6;     // enquanto parada, lembra a cada ~2 min

const db = new DatabaseSync('questoes-prf.sqlite');
db.exec('PRAGMA busy_timeout = 4000');

function collectorAlive() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*tec-to-pdf*questions-prf*\' } | Measure-Object).Count"',
      { encoding: 'utf8', timeout: 15000 },
    );
    return Number(String(out).trim()) > 0;
  } catch { return true; } // na dúvida, assume vivo (não encerra o vigia à toa)
}
function snapshot() {
  try {
    const r = db.prepare("SELECT materia, CAST((julianday('now')-julianday(collected_at))*86400 AS INT) s FROM questions ORDER BY collected_at DESC LIMIT 1").get();
    const c = db.prepare("SELECT count(*) n FROM questions WHERE collected_at > datetime('now','-3 hours')").get().n;
    return { age: r ? r.s : 999999, total: c, mat: r ? (r.materia || '') : '' };
  } catch { return null; }
}
function coletadasNaMateria(mat) {
  try { return db.prepare("SELECT count(*) n FROM questions WHERE materia = ? AND collected_at > datetime('now','-12 hours')").get(mat).n; }
  catch { return '?'; }
}
const TRANSITO_ID = 100770598; // caderno Legislação de Trânsito
function transitoNovas() {
  try { return db.prepare("SELECT count(*) n FROM notebook_questions nq JOIN questions q ON q.id_question = nq.question_id WHERE nq.notebook_id = ? AND q.collected_at > datetime('now','-24 hours')").get(TRANSITO_ID).n; }
  catch { return null; }
}

let stalled = false;
let lastMat = null; // matéria da última questão coletada (p/ avisar conclusão de caderno)
let lastTransitoHundred = null; // p/ avisar a cada 100 de trânsito
console.log('👁️ vigia da coleta ativo (checa a cada 20s; alerta se parar >75s; avisa matéria concluída).');
while (true) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  if (!collectorAlive()) { console.log('⛔ coletor terminou/saiu — vigia encerrando. Rode o balanço quando quiser.'); break; }
  const s = snapshot();
  if (!s) continue; // banco travado nesse instante; tenta de novo

  // matéria concluída = a matéria da última questão mudou (cadernos rodam em série)
  if (s.mat) {
    if (lastMat === null) lastMat = s.mat;
    else if (s.mat !== lastMat) {
      console.log(`🏁 MATÉRIA CONCLUÍDA: ${lastMat} (${coletadasNaMateria(lastMat)} coletadas). Agora coletando: ${s.mat}.`);
      lastMat = s.mat;
    }
  }

  // marco a cada 100 de trânsito coletadas
  const tn = transitoNovas();
  if (tn !== null) {
    const h = Math.floor(tn / 100);
    if (lastTransitoHundred === null) lastTransitoHundred = h; // largada: não anuncia o passado
    else if (h > lastTransitoHundred) { lastTransitoHundred = h; console.log(`📊 Trânsito: ${tn} questões novas coletadas.`); }
  }
  if (s.age > STALL_SECS) {
    if (!stalled) {
      stalled = true;
      console.log(`⚠️ COLETA PAROU (${s.age}s sem questão nova; ${s.total} novas até agora). Vá ao NAVEGADOR, dê F5 pra o captcha aparecer e resolva — ela retoma sozinha. (só aviso de novo quando voltar ou encerrar)`);
    }
    // sem lembretes repetidos: só alerto na transição, evitando spam
  } else if (stalled) {
    stalled = false;
    console.log(`✅ voltou a coletar (última há ${s.age}s; ${s.total} novas).`);
  }
}
db.close();
