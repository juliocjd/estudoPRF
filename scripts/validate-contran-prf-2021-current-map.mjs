#!/usr/bin/env node
/** Valida o mapa antes de importar. Não exige banco. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const mapPath = args.find((arg) => !arg.startsWith('--')) || path.join(root, 'data', 'contran_prf_2021', 'contran_prf_2021_current_resolution_map.json');
const strictOfficial = args.includes('--strict-official');
const data = JSON.parse(await fs.readFile(mapPath, 'utf8'));
const mappings = data.mappings || [];
const errors = [];
const warnings = [];

function key(organ, number, year) {
  return `${organ || 'CONTRAN'}:${String(number)}/${String(year)}`;
}

function hasBooleanPolicy(policy, name) {
  return policy?.[name] === true;
}

if (mappings.length !== 39) errors.push(`Esperado 39 itens do edital PRF 2021; encontrado ${mappings.length}.`);
if (!data.metadata?.official_index_url) warnings.push('metadata.official_index_url ausente.');

const sourceKeys = new Set();
const aliasKeys = new Map();
const targetKeys = new Set();
const relationsAllowed = new Set(['substituida_ou_consolidada', 'permanece_vigente', 'substituida_por_cadeia_anual']);
const confidenceAllowed = new Set(['high', 'medium', 'low']);

for (const m of mappings) {
  const s = m.source_edital || {};
  const t = m.current_target || {};
  const sk = key(s.organ, s.number, s.year);
  if (sourceKeys.has(sk)) errors.push(`Fonte duplicada: ${sk}`);
  sourceKeys.add(sk);

  const tk = key(t.organ, t.number, t.year);
  targetKeys.add(tk);

  if (!s.number || !s.year) errors.push(`Fonte incompleta em item: ${JSON.stringify(m).slice(0, 120)}...`);
  if (!t.number || !t.year || !t.official_url || !t.title) errors.push(`Destino incompleto para ${sk}`);
  if (!String(t.year).match(/^\d{4}$/)) errors.push(`Ano do alvo deve ser ano normativo com 4 dígitos em ${sk}; recebido: ${t.year}`);
  if (strictOfficial && !String(t.official_url).startsWith('https://www.gov.br/')) warnings.push(`URL fora de gov.br para ${sk}: ${t.official_url}`);
  if (!relationsAllowed.has(m.relation)) errors.push(`Relação não reconhecida em ${sk}: ${m.relation}`);
  if (!confidenceAllowed.has(m.confidence || 'high')) errors.push(`Confiança não reconhecida em ${sk}: ${m.confidence}`);

  if (s.use_as_study_target !== false) errors.push(`Fonte antiga deve ser alias, não alvo de estudo: ${sk}`);
  if (m.implementation?.old_norm_allowed_only_as_alias !== true) errors.push(`Alias antigo não bloqueado como alvo de estudo: ${sk}`);
  if (m.implementation?.show_in_current_study_filter !== true) warnings.push(`Item fora do filtro de estudo atual: ${sk}`);

  const policy = m.scope_policy || {};
  if ((String(s.edital_scope || '').includes('exceto os anexos')) && !hasBooleanPolicy(policy, 'exclude_annexes_from_original_edital')) {
    errors.push(`Faltou marcar exclusão de anexos: ${sk}`);
  }
  if ((String(s.edital_scope || '').includes('exceto as fichas')) && !hasBooleanPolicy(policy, 'exclude_fichas_from_original_edital')) {
    errors.push(`Faltou marcar exclusão de fichas: ${sk}`);
  }
  if (String(s.edital_scope || '').toLowerCase() === 'anexo i' && !policy.include_only_current_equivalent) {
    errors.push(`Faltou recorte equivalente ao Anexo I: ${sk}`);
  }

  for (const alias of [`${s.number}/${s.year}`, ...(s.aliases || [])]) {
    const ak = `CONTRAN:${String(alias)}`;
    const previous = aliasKeys.get(ak);
    if (previous && previous !== sk) warnings.push(`Alias ${ak} aparece em mais de uma fonte: ${previous} e ${sk}`);
    aliasKeys.set(ak, sk);
  }
}

const currentTargets = data.current_targets || [];
if (currentTargets.length && currentTargets.length !== targetKeys.size) {
  errors.push(`current_targets deveria ter ${targetKeys.size} alvos únicos; encontrado ${currentTargets.length}.`);
}

const mustHave = ['04/1998','14/1998','24/1998','36/1998','92/1998','110/2000','160/2004','210/2011','211/2006','216/2006','227/2007','253/2007','254/2007','268/2008','290/2008','292/2008','349/2010','360/2010','432/2013','441/2013','453/2013','471/2013','508/2014','520/2015','525/2015','552/2015','561/2015','619/2016','667/2017','723/2018','735/2018','740/2018','780/2019','789/2020','798/2020','803/2020','806/2020','809/2020','810/2020'];
for (const k of mustHave) {
  const [n, y] = k.split('/');
  if (!mappings.some((m) => String(m.source_edital.number) === n && String(m.source_edital.year) === y)) {
    errors.push(`Item do edital ausente: ${k}`);
  }
}

const checkTarget = (sourceNo, expectedTargetNo, expectedYear) => {
  const found = mappings.find((m) => String(m.source_edital.number) === String(sourceNo));
  if (!found) return;
  if (String(found.current_target.number) !== String(expectedTargetNo) || String(found.current_target.year) !== String(expectedYear)) {
    errors.push(`Mapeamento suspeito: ${sourceNo} deveria apontar para ${expectedTargetNo}/${expectedYear}, mas aponta para ${found.current_target.number}/${found.current_target.year}.`);
  }
};
checkTarget('349', '955', '2022');
checkTarget('740', '1.004', '2023');
checkTarget('561', '985', '2022');
checkTarget('789', '1.020', '2025');
checkTarget('806', '1.014', '2025');

const mediumOrManual = mappings.filter((m) => m.confidence !== 'high' || m.implementation?.needs_manual_review === true);
if (mediumOrManual.length) {
  warnings.push(`Há ${mediumOrManual.length} item(ns) com confiança menor que high ou revisão manual: ${mediumOrManual.map((m) => `${m.source_edital.number}/${m.source_edital.year}`).join(', ')}.`);
}

if (errors.length) {
  console.error('VALIDAÇÃO FALHOU');
  for (const e of errors) console.error(`- ${e}`);
  if (warnings.length) {
    console.error('AVISOS');
    for (const w of warnings) console.error(`- ${w}`);
  }
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, mappings: mappings.length, unique_current_targets: targetKeys.size, warnings }, null, 2));
