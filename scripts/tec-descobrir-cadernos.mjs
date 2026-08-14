// Descobre os cadernos pessoais do TEC (lista "Meus Cadernos") usando o mesmo
// perfil de navegador logado do coletor, e escreve um report enxuto pro
// questions-prf. NÃO usa senha (a sessão vive no .browser-profile).
//   node scripts/tec-descobrir-cadernos.mjs "<URL_DA_LISTA_DE_CADERNOS>" [reportFile]
// Ex.: node scripts/tec-descobrir-cadernos.mjs "https://www.tecconcursos.com.br/questoes/cadernos" aulas.prf.2025-2026.json
import { chromium } from 'playwright';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const listUrl = process.argv[2];
const reportFile = process.argv[3] || 'aulas.prf.2025-2026.json';
if (!listUrl) { console.error('Uso: node scripts/tec-descobrir-cadernos.mjs "<URL da lista>" [reportFile]'); process.exit(1); }

let profileDir = '.browser-profile';
try { profileDir = JSON.parse(await readFile('config.restante.json', 'utf8'))?.browserProfileDir || profileDir; } catch {}

const context = await chromium.launchPersistentContext(path.resolve(profileDir), {
  headless: false,
  viewport: { width: 1366, height: 900 },
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(45000);

console.log('Abrindo o TEC. NÃO feche a janela — faça login no seu ritmo (e-mail, senha, 2º fator).');
await page.goto(listUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

// ESPERA NÃO-INVASIVA: só observa a URL, sem navegar por cima de você.
// Quando você sair da tela de login (concluiu o 2FA), o script segue sozinho.
const deadline = Date.now() + 600000; // até 10 min
let ready = false;
let offLoginSince = 0;
while (Date.now() < deadline) {
  let u = '';
  try { u = page.url(); } catch (e) { console.log('janela fechada/instável — reabra rodando o comando de novo.'); break; }
  const onLogin = /\/login|\/entrar/i.test(u);
  if (onLogin) {
    offLoginSince = 0;
    console.log('aguardando você concluir o login/2FA na janela...');
  } else {
    // saiu do login: espera estabilizar ~4s antes de assumir que logou
    if (!offLoginSince) offLoginSince = Date.now();
    if (Date.now() - offLoginSince >= 4000) { ready = true; break; }
  }
  await page.waitForTimeout(4000);
}
if (!ready) { console.log('Login não concluído a tempo. Rode o comando de novo quando puder logar.'); await context.close(); process.exit(0); }

console.log('Login detectado. Abrindo a lista de cadernos...');
await page.goto(listUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
// dá tempo de renderizar / rola pra carregar tudo (listas costumam ser lazy)
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 4000).catch(() => {}); await page.waitForTimeout(700); }
await page.waitForTimeout(1500);

// Diagnóstico: onde paramos de fato?
const diag = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  totalLinks: document.querySelectorAll('a[href]').length,
  cadernoLinks: document.querySelectorAll('a[href*="caderno"]').length,
  amostra: [...document.querySelectorAll('a[href*="caderno"]')].slice(0, 5).map((a) => a.getAttribute('href')),
  logadoIndicios: /entrar|login|acesse|fazer login/i.test(document.body?.innerText?.slice(0, 400) || ''),
}));
console.log('DIAG url final:', diag.url);
console.log('DIAG titulo:', diag.title);
console.log('DIAG links totais:', diag.totalLinks, '| com "caderno":', diag.cadernoLinks);
console.log('DIAG amostra hrefs caderno:', JSON.stringify(diag.amostra));
console.log('DIAG parece tela de login?', diag.logadoIndicios);

// Extração robusta: 1) links <a>; 2) varre o HTML inteiro por "cadernos/<id>"
// (o TEC é app JS — o id pode estar em atributo/estado, não em <a href>).
const viaAnchors = await page.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href*="/questoes/cadernos/"]')) {
    const m = a.getAttribute('href').match(/\/questoes\/cadernos\/(\d+)/);
    if (!m) continue;
    const row = a.closest('tr, li, .caderno, div') || a;
    const countMatch = (row.textContent || '').match(/(\d[\d.]*)\s*quest/i);
    out.push({ id: Number(m[1]), title: (a.textContent || '').trim().slice(0, 120), questoes: countMatch ? countMatch[1] : '' });
  }
  return out;
});
const html = await page.content();
const fromHtml = [...html.matchAll(/cadernos\/(\d{4,})/g)].map((m) => Number(m[1]));
const byId = new Map();
for (const c of viaAnchors) if (c.id && !/lixeira/i.test(String(c.id))) byId.set(c.id, c);
for (const id of fromHtml) if (!byId.has(id)) byId.set(id, { id, title: '', questoes: '' });
const cadernos = [...byId.values()];

console.log(`\nCadernos encontrados: ${cadernos.length}`);
for (const c of cadernos) console.log(`  [${c.id}] ${c.questoes ? c.questoes.padStart(5) + ' q ·' : ''} ${c.title}`.slice(0, 110));

await writeFile(reportFile, JSON.stringify({ notebooks: cadernos.map((c) => ({ url: `https://www.tecconcursos.com.br/questoes/cadernos/${c.id}`, title: c.title, subjects: [] })) }, null, 1));
console.log(`\nReport salvo em ${reportFile} (${cadernos.length} cadernos).`);
console.log('Confira a lista acima antes de coletar. Feche esta janela se algo estiver errado.');
await context.close();
