#!/usr/bin/env node
/**
 * Gera relatorio Markdown de aceite do mapa CONTRAN PRF 2021.
 * Por padrao usa o JSON local. Com --from-db, acrescenta contagens reais do banco.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { packageRoot } from './lib/env.mjs';

const args = process.argv.slice(2);
const fromDb = args.includes('--from-db');
const outArgIndex = args.indexOf('--out');
const outPath = outArgIndex >= 0 && args[outArgIndex + 1]
  ? path.resolve(args[outArgIndex + 1])
  : path.join(packageRoot, 'reports', 'contran-prf-2021-current-map-report.md');
const mapPath = path.join(packageRoot, 'data', 'contran_prf_2021', 'contran_prf_2021_current_resolution_map.json');

const data = JSON.parse(await fs.readFile(mapPath, 'utf8'));
const mappings = data.mappings || [];

function cleanReportText(value) {
  const raw = String(value || '');
  const recoded = /Ã|Â|â/.test(raw) ? Buffer.from(raw, 'latin1').toString('utf8') : raw;
  return recoded
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ã§/g, 'c')
    .replace(/Ã£/g, 'a')
    .replace(/Ã¡/g, 'a')
    .replace(/Ã¢/g, 'a')
    .replace(/Ã©/g, 'e')
    .replace(/Ãª/g, 'e')
    .replace(/Ã­/g, 'i')
    .replace(/Ã³/g, 'o')
    .replace(/Ã´/g, 'o')
    .replace(/Ãµ/g, 'o')
    .replace(/Ãº/g, 'u')
    .replace(/Ã/g, 'A')
    .replace(/Ã‰/g, 'E')
    .replace(/Ã“/g, 'O')
    .replace(/Ãš/g, 'U')
    .replace(/Ã‡/g, 'C')
    .replace(/â€”/g, '-')
    .replace(/â€“/g, '-')
    .replace(/Âº/g, 'o')
    .replace(/Âª/g, 'a');
}

const targetMap = new Map();
for (const mapping of mappings) {
  const target = mapping.current_target;
  targetMap.set(`${target.organ || 'CONTRAN'} ${target.number}/${target.year}`, target);
}

const exclusions = mappings.filter((mapping) => {
  const policy = mapping.scope_policy || {};
  return policy.exclude_annexes_from_original_edital
    || policy.exclude_fichas_from_original_edital
    || policy.include_only_current_equivalent;
});
const review = mappings.filter((mapping) => (
  mapping.implementation?.needs_manual_review === true
  || mapping.confidence !== 'high'
));

let dbBlock = '';
if (fromDb) {
  const { createClient } = await import('./lib/db.mjs');
  const { client, selected } = createClient({ preferDirect: false, applicationName: 'contran-prf-2021-report' });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM contran_prf_2021_current_map) AS map_rows,
        (SELECT COUNT(DISTINCT target_organ || ':' || target_number || '/' || target_year)::int FROM contran_prf_2021_current_map WHERE show_in_current_study_filter = true) AS unique_current_targets,
        (SELECT COUNT(*)::int FROM legal_norm_aliases WHERE alias_reason = 'PRF_2021_current_resolution_map') AS alias_rows,
        (SELECT MAX(finished_at) FROM contran_prf_2021_import_runs WHERE status IN ('ok','dry_run')) AS last_import_finished_at
    `);
    const lastImport = rows[0].last_import_finished_at
      ? new Date(rows[0].last_import_finished_at).toISOString()
      : 'nao encontrada';
    dbBlock = [
      '',
      '## Conferencia do banco',
      '',
      `- Fonte da conexao: \`${selected.sourceName}\`${selected.pooledNeon ? ' (Neon pooler)' : ''}`,
      `- Linhas em \`contran_prf_2021_current_map\`: ${rows[0].map_rows}`,
      `- Alvos atuais unicos no banco: ${rows[0].unique_current_targets}`,
      `- Aliases historicos no banco: ${rows[0].alias_rows}`,
      `- Ultima importacao registrada: ${lastImport}`,
    ].join('\n');
  } finally {
    await client.end();
  }
}

const lines = [];
lines.push('# Relatorio - mapa CONTRAN PRF 2021 atualizado');
lines.push('');
lines.push(`Gerado em: ${new Date().toISOString()}`);
lines.push(`Base do pacote: ${data.metadata?.reviewed_at || data.metadata?.generated_at || 'nao informado'}`);
lines.push('');
lines.push('## Resumo');
lines.push('');
lines.push(`- Normas antigas/itens do edital mapeados: ${mappings.length}`);
lines.push(`- Normas atuais unicas para estudo: ${targetMap.size}`);
lines.push(`- Itens com anexos/fichas/recorte especial: ${exclusions.length}`);
lines.push(`- Itens com revisao manual ou confianca menor que high: ${review.length}`);
lines.push('');
lines.push('## Itens com escopo excluido ou recorte especial');
lines.push('');
lines.push('| Fonte do edital | Alvo atual | Escopo do edital | Regra aplicada |');
lines.push('|---|---|---|---|');
for (const mapping of exclusions) {
  const policy = mapping.scope_policy || {};
  const rules = [];
  if (policy.exclude_annexes_from_original_edital) rules.push('excluir anexos');
  if (policy.exclude_fichas_from_original_edital) rules.push('excluir fichas');
  if (policy.include_only_current_equivalent) rules.push(`somente equivalente atual: ${cleanReportText(policy.include_only_current_equivalent)}`);
  lines.push(`| ${mapping.source_edital.organ || 'CONTRAN'} ${mapping.source_edital.number}/${mapping.source_edital.year} | ${mapping.current_target.organ || 'CONTRAN'} ${mapping.current_target.number}/${mapping.current_target.year} | ${mapping.source_edital.edital_scope || ''} | ${rules.join('; ')} |`);
}
lines.push('');
lines.push('## Itens que exigem atencao');
lines.push('');
if (!review.length) {
  lines.push('- Nenhum item marcado como revisao manual.');
} else {
  for (const mapping of review) {
    lines.push(`- ${mapping.source_edital.organ || 'CONTRAN'} ${mapping.source_edital.number}/${mapping.source_edital.year} -> ${mapping.current_target.organ || 'CONTRAN'} ${mapping.current_target.number}/${mapping.current_target.year}: confianca ${mapping.confidence || 'high'}${mapping.notes ? ` - ${cleanReportText(mapping.notes)}` : ''}`);
  }
}
lines.push('');
lines.push('## Testes de fumaca esperados');
lines.push('');
lines.push('| Busca por | Deve resolver para | Observacao |');
lines.push('|---|---|---|');
for (const sourceNumber of ['552', '561', '349', '740', '789', '806']) {
  const mapping = mappings.find((item) => String(item.source_edital.number) === sourceNumber);
  if (!mapping) continue;
  const policy = mapping.scope_policy || {};
  const notes = [];
  if (policy.exclude_annexes_from_original_edital) notes.push('anexos excluidos');
  if (policy.exclude_fichas_from_original_edital) notes.push('fichas excluidas');
  if (policy.include_only_current_equivalent) notes.push('recorte equivalente atual');
  if (mapping.relation === 'substituida_por_cadeia_anual') notes.push('cadeia anual');
  lines.push(`| ${mapping.source_edital.organ || 'CONTRAN'} ${mapping.source_edital.number}/${mapping.source_edital.year} | ${mapping.current_target.organ || 'CONTRAN'} ${mapping.current_target.number}/${mapping.current_target.year} | ${notes.join('; ') || mapping.relation} |`);
}
if (dbBlock) lines.push(dbBlock);
lines.push('');

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ ok: true, report: path.relative(packageRoot, outPath), from_db: fromDb }, null, 2));
