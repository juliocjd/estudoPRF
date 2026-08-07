// Gera UM JSON por notebook do NotebookLM com as questões DESATUALIZADAS de
// trânsito daquele tema (agrupadas pelo de-para antiga->vigente do doc ago/2026),
// já com uma dica de "regra vigente + artigo" pra o NotebookLM responder preciso.
// Saída: tmp/notebooklm/<slug>.json (+ _index.json). Lê o SQLite local (read-only).
//   node --experimental-sqlite scripts/gen-notebooklm-export.mjs
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';

const OLD_TO_CUR = new Map([
  [4,911],[14,993],[24,968],[92,938],[160,973],[210,882],[211,882],[227,970],[290,882],
  [360,933],[441,946],[471,909],[520,882],[552,945],[667,970],[740,1004],[870,1004],
  [780,969],[803,882],[216,960],[253,960],[254,960],[349,946],[561,985],[925,985],[789,1020],[912,993],
]);
const NOTEBOOKS = [
  ['equipamentos-seguranca', 'Equipamentos e segurança veicular (993/960/970/951/958)', [993,960,970,951,958]],
  ['mbst-sinalizacao', 'MBST e sinalização viária (973)', [973]],
  ['pesos-dimensoes', 'Pesos e dimensões (882)', [882]],
  ['suspensao-cassacao', 'Suspensão e cassação (723)', [723]],
  ['ctv-granel-carga-externa', 'CTV/CTVP, granel e carga externa (735/946/955)', [735,946,955]],
  ['documentos-licenciamento', 'Documentos, registro, licenciamento e baixa (809/911/967/810)', [809,911,967,810]],
  ['motocicletas', 'Motocicletas e mobilidade individual (940/943/996)', [940,943,996]],
  ['pnatrans-campanhas', 'PNATRANS e campanhas educativas (1004/1014)', [1004,1014]],
  ['fiscalizacao-velocidade', 'Fiscalização de velocidade (798/804)', [798,804]],
  ['habilitacao-cnh', 'Habilitação, ACC, CNH e formação (1020)', [1020]],
  ['alcool', 'Álcool e substância psicoativa (432)', [432]],
  ['autuacao-multa-defesa', 'Autuação, multa, defesa e recursos (918/900)', [918,900]],
  ['passageiros-criancas', 'Passageiros em carga / transporte de crianças (508/819)', [508,819]],
  ['identificacao-piv-vistoria', 'Identificação, PIV, modificações e vistoria (968/969/916/941)', [968,969,916,941]],
  ['revisao-rapida', 'Revisão rápida (811/110/242/36)', [811,110,242,36]],
  ['fiscalizacao-video', 'Fiscalização por vídeo/imagem (909/920)', [909,920]],
  ['mbft', 'Manual Brasileiro de Fiscalização - MBFT (985)', [985]],
  ['cronotacografo', 'Cronotacógrafo, tempo de direção/descanso (938/525)', [938,525]],
  ['amarracao-cargas', 'Amarração de cargas (945)', [945]],
];
const NB_BY_NUM = new Map();
for (const [slug, name, nums] of NOTEBOOKS) for (const n of nums) NB_BY_NUM.set(n, { slug, name });

// Dicas de regra vigente + artigo (doc ago/2026). Chave = resolução vigente.
const HINTS = {
  960: 'Res. CONTRAN 960/2022, art. 22 — consolidou vidros de segurança, visibilidade e películas (revogou 216/2006, 253/2007, 254/2007). Áreas não envidraçadas: sem índice mínimo de transmitância quando há retrovisores externos (alteração da 989/2022).',
  970: 'Res. CONTRAN 970/2022, art. 5º — luz azul (e vermelha) exclusiva de 5 categorias: incêndio/salvamento, salvamento difuso, polícia, fiscalização/operação de trânsito e ambulâncias. Utilidade pública/guincho/escolta/lixo usam amarelo-âmbar (art. 6º).',
  882: 'Res. CONTRAN 882/2021 — largura 2,60 m (art.4,I); comprimento 14 m p/ não-articulado (art.4,III); PBTC de CVC 57 t sem AET e até 74 t com AET (arts.18-19); tolerância de 5% no PBT/PBTC e 12,5% por eixo (art.50).',
  938: 'Res. CONTRAN 938/2022 — rol das últimas 24 h de operação (art.3º); 90 dias à disposição da autoridade (art.8º); 1 ano em caso de acidente (art.9º); agente identifica-se e assina o disco/fita.',
  945: 'Res. CONTRAN 945/2022 — fator de resistência à ruptura mínimo de 2× o peso da carga (cintas, correntes, cabos); vedado o uso de cordas como amarração, salvo para fixar a lona de cobertura.',
  985: 'Res. CONTRAN 985/2022 — Manual Brasileiro de Fiscalização de Trânsito (MBFT), vigente (revogou 561/2015 via 925/2022); alterada por 1.003/2023 e 1.012/2024.',
  973: 'Res. CONTRAN 973/2022 — Regulamento de Sinalização Viária (MBST), sucessora da 160/2004.',
  1020: 'Res. CONTRAN 1.020/2025 — formação/habilitação de condutores e expedição de documentos (revogou 789/2020). Vigente NACIONALMENTE; liminar de 16/12/2025 suspende apenas para o Detran/MT. Responder pela 1.020/2025.',
  946: 'Res. CONTRAN 946/2022 — transporte de granel e transporte eventual de cargas/bicicletas (sucessora de 441/2013 e 349/2010).',
  909: 'Res. CONTRAN 909/2022 — fiscalização por videomonitoramento/imagem (sucessora da 471/2013).',
  969: 'Res. CONTRAN 969/2022 — Placa de Identificação Veicular (PIV), sucessora da 780/2019.',
  968: 'Res. CONTRAN 968/2022 — identificação de veículos/CSV (sucessora da 24/1998).',
  993: 'Res. CONTRAN 993/2023 — equipamentos obrigatórios (sucessora via 912/2022).',
  911: 'Res. CONTRAN 911/2022 — documentos/registro (sucessora da 04/1998).',
  1004: 'Res. CONTRAN 1.004/2023 — PNATRANS (sucessora da 740/2018 via 870/2021).',
  933: 'Res. CONTRAN 933/2022 — sucessora da 360/2010.',
  951: 'Res. CONTRAN 951/2022 — equipamentos/segurança veicular.',
  958: 'Res. CONTRAN 958/2022 — equipamentos/segurança veicular.',
};

function resNum(text) {
  const s = String(text || '');
  if (/9\.?503|\bCTB\b|\bart(?:s|igo)?\.?\s|Lei\s+n[ºo]/i.test(s)) return null;
  let m = s.match(/(\d{1,4})\s*\/\s*(?:19|20)\d{2}/);
  if (m) return Number(m[1]);
  m = s.match(/Resolu[çc][ãa]o(?:\s+CONTRAN)?(?:\s+n[ºo.]?)?\s*(\d{2,4})/i);
  return m ? Number(m[1]) : null;
}

const db = new DatabaseSync('questoes-prf.sqlite', { readOnly: true });
const rows = db.prepare(`
  SELECT q.id_question, q.type_question, q.assunto, q.statement_text,
    COALESCE(NULLIF(q.official_answer,''), c.extracted_answer, '') AS gab
  FROM questions q
  LEFT JOIN comments c ON c.question_id = q.id_question
  WHERE q.desatualizada = 1 AND q.materia LIKE 'Legisla%o de Tr%nsito%'
`).all();
const altStmt = db.prepare('SELECT letter, text FROM alternatives WHERE question_id = ? ORDER BY position');

const buckets = new Map(); // slug -> {name, resNums:Set, questoes:[]}
let semNotebook = 0;
for (const r of rows) {
  const raw = resNum(r.assunto);
  if (raw == null) { semNotebook++; continue; }
  const cur = OLD_TO_CUR.get(raw) || raw;
  const nb = NB_BY_NUM.get(cur);
  if (!nb) { semNotebook++; continue; }
  if (!buckets.has(nb.slug)) buckets.set(nb.slug, { name: nb.name, resNums: new Set(), questoes: [] });
  const b = buckets.get(nb.slug);
  b.resNums.add(cur);
  const alts = altStmt.all(r.id_question).map((a) => ({ letra: a.letter, texto: a.text }));
  b.questoes.push({
    id: r.id_question,
    tipo: r.type_question,
    enunciado: (r.statement_text || '').trim(),
    alternativas: alts,
    gabaritoHistorico: r.gab || '',
    regraVigente: HINTS[cur] || `Estudar pela resolução vigente do tema: Res. CONTRAN ${cur}.`,
  });
}
db.close();

const OUT = 'tmp/notebooklm';
mkdirSync(OUT, { recursive: true });
const INSTRUCOES = 'Você é um curador da PRF. Para CADA questão, responda o gabarito PELA LEGISLAÇÃO VIGENTE (as resoluções deste notebook), usando as fontes carregadas. CERTO_ERRADO -> "CERTO" ou "ERRADO"; MULTIPLA_ESCOLHA -> a letra (A-E). Se o gabarito histórico mudou, INVERTA (uma assertiva antes correta pode ficar errada). Se, pela regra atual, NENHUMA alternativa/afirmação for correta, use status "sem_alternativa_valida" e gabaritoAtual "". Devolva SOMENTE um JSON no formato: {"respostas":[{"id":<id>,"status":"verificada|sem_alternativa_valida|descartar","gabaritoAtual":"","explicacao":"...","fundamento":"Res. X/AAAA, art. Y"}]}';

const index = [];
for (const [slug, b] of [...buckets.entries()].sort((a, b) => b[1].questoes.length - a[1].questoes.length)) {
  const file = `${OUT}/${slug}.json`;
  writeFileSync(file, JSON.stringify({
    notebook: b.name,
    resolucoesVigentes: [...b.resNums].sort((x, y) => x - y),
    instrucoes: INSTRUCOES,
    total: b.questoes.length,
    questoes: b.questoes,
  }, null, 1));
  index.push({ slug, notebook: b.name, questoes: b.questoes.length });
  console.log(`${String(b.questoes.length).padStart(3)}  ${slug}.json  (${b.name})`);
}
writeFileSync(`${OUT}/_index.json`, JSON.stringify(index, null, 1));
console.log(`\nTotal exportado: ${index.reduce((s, x) => s + x.questoes, 0)} questões em ${index.length} arquivos.`);
console.log(`Sem notebook (assunto genérico/CTB — ficam pro 2º passo): ${semNotebook}`);
console.log(`Arquivos em ${OUT}/`);
