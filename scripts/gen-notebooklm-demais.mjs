// Gera o DELTA de notebooks: pega as desatualizadas de trânsito que hoje só têm
// o "colchão" (not_verified_do_not_score_v7, visíveis), extrai a resolução do
// ENUNCIADO (não só do assunto), mapeia antiga->vigente e agrupa por notebook.
// Só as PENDENTES entram — assim você cola apenas as novas em cada notebook.
// Saída: tmp/notebooklm/delta-<slug>.json  (+ delta-_index.json). Lê o prod.
//   node --env-file=.env scripts/gen-notebooklm-demais.mjs
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

// antiga -> vigente (espelha gen-notebooklm-export.mjs + 2 novos: 205->911, 292->916)
const OLD_TO_CUR = new Map([
  [4,911],[14,993],[24,968],[92,938],[160,973],[210,882],[211,882],[227,970],[290,882],
  [360,933],[441,946],[471,909],[520,882],[552,945],[561,985],[667,970],[740,1004],[870,1004],
  [780,969],[803,882],[216,960],[253,960],[254,960],[349,946],[925,985],[789,1020],[912,993],
  [205,911],[292,916],
]);
// notebooks (num vigente -> slug/nome). Inclui um NOVO p/ a 933.
const NOTEBOOKS = [
  ['equipamentos-seguranca', 'Equipamentos e segurança veicular', [993,960,970,951,958]],
  ['mbst-sinalizacao', 'MBST e sinalização viária', [973]],
  ['pesos-dimensoes', 'Pesos e dimensões', [882]],
  ['suspensao-cassacao', 'Suspensão e cassação', [723]],
  ['ctv-granel-carga-externa', 'CTV/CTVP, granel e carga externa', [735,946,955]],
  ['documentos-licenciamento', 'Documentos, registro, licenciamento e baixa', [809,911,967,810]],
  ['motocicletas', 'Motocicletas e mobilidade individual', [940,943,996]],
  ['pnatrans-campanhas', 'PNATRANS e campanhas educativas', [1004,1014]],
  ['fiscalizacao-velocidade', 'Fiscalização de velocidade', [798,804]],
  ['habilitacao-cnh', 'Habilitação, ACC, CNH e formação', [1020]],
  ['alcool', 'Álcool e substância psicoativa', [432]],
  ['autuacao-multa-defesa', 'Autuação, multa, defesa e recursos', [918,900]],
  ['passageiros-criancas', 'Passageiros em carga / transporte de crianças', [508,819]],
  ['identificacao-piv-vistoria', 'Identificação, PIV, modificações e vistoria', [968,969,916,941]],
  ['revisao-rapida', 'Revisão rápida', [811,110,242,36]],
  ['fiscalizacao-video', 'Fiscalização por vídeo/imagem', [909,920]],
  ['mbft', 'Manual Brasileiro de Fiscalização - MBFT', [985]],
  ['cronotacografo', 'Cronotacógrafo, tempo de direção/descanso', [938,525]],
  ['amarracao-cargas', 'Amarração de cargas', [945]],
  ['res-933', 'Res. CONTRAN 933/2022 (sucessora da 360/2010)', [933]],
];
const NB_BY_NUM = new Map();
for (const [slug, name, nums] of NOTEBOOKS) for (const n of nums) NB_BY_NUM.set(n, { slug, name });

const HINTS = {
  946: 'Res. CONTRAN 946/2022 — transporte de granel e transporte eventual de cargas/bicicletas (sucessora de 441/2013 e 349/2010).',
  938: 'Res. CONTRAN 938/2022 — cronotacógrafo: rol das últimas 24 h (art.3º); 90 dias à disposição (art.8º); 1 ano em acidente (art.9º).',
  970: 'Res. CONTRAN 970/2022 — luz azul/vermelha exclusiva de 5 categorias; utilidade pública usa amarelo-âmbar.',
  945: 'Res. CONTRAN 945/2022 — amarração de cargas: fator de resistência mínimo 2× o peso; vedado uso de cordas salvo p/ lona.',
  916: 'Res. CONTRAN 916/2022 — modificação de veículos e vistoria (sucessora, entre outras, da 292/2008).',
  911: 'Res. CONTRAN 911/2022 — documentos de porte obrigatório, registro e CLRV (sucessora da 04/1998 e da antiga 205/2006).',
  933: 'Res. CONTRAN 933/2022 — sucessora da 360/2010.',
};
const INSTRUCOES = 'Você é um curador da PRF. Para CADA questão, responda o gabarito PELA LEGISLAÇÃO VIGENTE (as resoluções deste notebook), usando as fontes carregadas. CERTO_ERRADO -> "CERTO" ou "ERRADO"; MULTIPLA_ESCOLHA -> a letra (A-E). Se o gabarito histórico mudou, INVERTA. Se, pela regra atual, NENHUMA alternativa/afirmação for correta, use status "sem_alternativa_valida" e gabaritoAtual "". Devolva SOMENTE um JSON no formato: {"respostas":[{"id":<id>,"status":"verificada|sem_alternativa_valida|descartar","gabaritoAtual":"","explicacao":"...","fundamento":"Res. X/AAAA, art. Y"}]}';

function extractResNums(text) {
  const s = String(text || '');
  const out = [];
  const seen = new Set();
  const push = (raw, hasYear) => {
    const n = Number(raw);
    if (!n || n === 9503 || n === 9) return;   // CTB
    if (n < 10 && !hasYear) return;            // corta ruído "Res. 1"
    if (seen.has(n)) return;
    seen.add(n); out.push(n);
  };
  for (const m of s.matchAll(/(?:Resolu[çc][aã]o|Res\.)\s*(?:d[eo]\s+)?(?:CONTRAN\s*)?n?[ºo°.]{0,3}\s*(\d{1,4})(?:\s*\/\s*((?:19|20)\d{2}))?/gi)) push(m[1], Boolean(m[2]));
  for (const m of s.matchAll(/CONTRAN\s*n?[ºo°.]{0,3}\s*(\d{1,4})\s*\/\s*((?:19|20)\d{2})/gi)) push(m[1], true);
  return out;
}
function pickNotebookNum(assunto, statement) {
  for (const text of [assunto, statement]) {
    for (const raw of extractResNums(text)) {
      const cur = OLD_TO_CUR.get(raw) || raw;
      if (NB_BY_NUM.has(cur)) return cur;
    }
  }
  return null;
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const rows = await sql`
    SELECT q.id_question, q.type_question, q.assunto, q.statement_text,
      COALESCE(NULLIF(q.official_answer,''), c.extracted_answer, '') AS gab
    FROM questions q
    JOIN question_current_law_answers a ON a.question_id = q.id_question
    LEFT JOIN comments c ON c.question_id = q.id_question
    WHERE q.desatualizada = 1 AND q.materia LIKE 'Legisla% de Tr%nsito%'
      AND a.verification_method = 'not_verified_do_not_score_v7'
      AND NOT EXISTS (SELECT 1 FROM question_study_status s WHERE s.question_id = q.id_question AND s.status = 'excluded')`;
  // dedupe (o LEFT JOIN comments pode repetir a questão se houver >1 comentário)
  const byId = new Map();
  for (const r of rows) if (!byId.has(Number(r.id_question))) byId.set(Number(r.id_question), r);
  const uniqueRows = [...byId.values()];
  const ids = uniqueRows.map((r) => Number(r.id_question));
  const altRows = await sql`SELECT question_id, letter, text FROM alternatives WHERE question_id = ANY(${ids}) ORDER BY question_id, position`;
  const altByQ = new Map();
  for (const a of altRows) {
    if (!altByQ.has(Number(a.question_id))) altByQ.set(Number(a.question_id), []);
    altByQ.get(Number(a.question_id)).push({ letra: a.letter, texto: a.text });
  }

  const buckets = new Map(); // slug -> {name, resNums:Set, questoes:[]}
  let orphan = 0, semNumero = 0;
  for (const r of uniqueRows) {
    const cur = pickNotebookNum(r.assunto, r.statement_text);
    if (cur == null) {
      if (extractResNums(`${r.assunto} | ${r.statement_text}`).length) orphan++; else semNumero++;
      continue;
    }
    const nb = NB_BY_NUM.get(cur);
    if (!buckets.has(nb.slug)) buckets.set(nb.slug, { name: nb.name, resNums: new Set(), questoes: [] });
    const b = buckets.get(nb.slug);
    b.resNums.add(cur);
    b.questoes.push({
      id: Number(r.id_question),
      tipo: r.type_question,
      enunciado: (r.statement_text || '').trim(),
      alternativas: altByQ.get(Number(r.id_question)) || [],
      gabaritoHistorico: r.gab || '',
      regraVigente: HINTS[cur] || `Estudar pela resolução vigente do tema: Res. CONTRAN ${cur}.`,
    });
  }

  const OUT = 'tmp/notebooklm';
  mkdirSync(OUT, { recursive: true });
  const index = [];
  for (const [slug, b] of [...buckets.entries()].sort((a, b) => b[1].questoes.length - a[1].questoes.length)) {
    const file = `${OUT}/delta-${slug}.json`;
    writeFileSync(file, JSON.stringify({
      notebook: b.name,
      resolucoesVigentes: [...b.resNums].sort((x, y) => x - y),
      instrucoes: INSTRUCOES,
      total: b.questoes.length,
      questoes: b.questoes,
    }, null, 1));
    index.push({ slug, notebook: b.name, questoes: b.questoes.length, novo: slug === 'res-933' });
    console.log(`${String(b.questoes.length).padStart(3)}  delta-${slug}.json  (${b.name})${slug === 'res-933' ? '  <== NOTEBOOK NOVO' : ''}`);
  }
  writeFileSync(`${OUT}/delta-_index.json`, JSON.stringify(index, null, 1));
  const routed = index.reduce((s, x) => s + x.questoes, 0);
  console.log(`\nRoteadas p/ notebook: ${routed}  |  órfãs (resolução sem notebook): ${orphan}  |  sem número no texto: ${semNumero}`);
  console.log(`Arquivos em ${OUT}/delta-*.json`);
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
