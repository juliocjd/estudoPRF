// Vigia do passo "só comentários" (re-fetch): mede COMENTÁRIOS recuperados
// (linhas de comentário com texto, entre as questões novas), não questões novas.
// Alerta parou/voltou (F5+captcha), marco a cada 100, e fim.
//   node --experimental-sqlite scripts/coleta-watchdog-comentarios.mjs
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';

const STALL_SECS = 75, POLL_MS = 20000;
const db = new DatabaseSync('questoes-prf.sqlite');
db.exec('PRAGMA busy_timeout = 4000');

function collectorAlive() {
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*tec-to-pdf*comments-only*\' -or $_.CommandLine -like \'*tec-to-pdf*questions-prf*\' } | Measure-Object).Count"', { encoding: 'utf8', timeout: 15000 });
    return Number(String(out).trim()) > 0;
  } catch { return true; }
}
function comentariosRecuperados() {
  try { return db.prepare("SELECT count(*) n FROM questions q JOIN comments c ON c.question_id = q.id_question WHERE q.collected_at > datetime('now','-40 hours') AND COALESCE(NULLIF(c.text,''),'') <> ''").get().n; }
  catch { return null; }
}

let last = comentariosRecuperados();
let lastChange = Date.now();
let stalled = false;
let baseHundred = last === null ? 0 : Math.floor(last / 100);
console.log(`👁️ vigia de COMENTÁRIOS ativo (base: ${last} recuperados). Alerta se parar >75s.`);
while (true) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  if (!collectorAlive()) { console.log('⛔ re-fetch de comentários terminou/saiu — vigia encerrando.'); break; }
  const cur = comentariosRecuperados();
  if (cur === null) continue;
  if (cur > last) { last = cur; lastChange = Date.now(); if (stalled) { stalled = false; console.log(`✅ voltou (comentários: ${cur}).`); }
    const h = Math.floor(cur / 100); if (h > baseHundred) { baseHundred = h; console.log(`📊 Comentários recuperados: ${cur}.`); }
  } else {
    const idle = Math.round((Date.now() - lastChange) / 1000);
    if (idle > STALL_SECS && !stalled) { stalled = true; console.log(`⚠️ COMENTÁRIOS PARARAM (${idle}s sem novo; ${cur} recuperados). F5 no navegador + resolver o captcha. (só aviso de novo quando voltar ou encerrar)`); }
  }
}
db.close();
