#!/usr/bin/env node
/**
 * Resolve uma referência antiga do edital para a norma atual no banco.
 * Exemplos:
 *   node scripts/resolve-contran-reference.mjs 552/2015
 *   node scripts/resolve-contran-reference.mjs "Resolução CONTRAN nº 789/2020"
 */
import { createClient } from './lib/db.mjs';

function parseReference(input) {
  const text = String(input || '').trim();
  const match = text.match(/(\d{1,4}(?:\.\d{3})?)\s*\/\s*(\d{2,4})/);
  if (!match) throw new Error(`Não consegui identificar número/ano em: ${text}`);
  const number = match[1].replace(/^0+(?=\d)/, '') || match[1];
  let year = match[2];
  if (year.length === 2) year = Number(year) > 80 ? `19${year}` : `20${year}`;
  return { number, year };
}

const input = process.argv.slice(2).join(' ');
if (!input) {
  console.error('Uso: node scripts/resolve-contran-reference.mjs "552/2015"');
  process.exit(1);
}

const ref = parseReference(input);
const { client, selected } = createClient({ preferDirect: false, applicationName: 'contran-prf-2021-resolver' });
try {
  await client.connect();
  const { rows } = await client.query(
    `select * from resolve_contran_prf_2021_norm($1, $2, 'CONTRAN')`,
    [ref.number, ref.year],
  );
  if (!rows.length) {
    console.log(JSON.stringify({ ok: false, searched: ref, message: 'Referência não encontrada no mapa CONTRAN PRF 2021.' }, null, 2));
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({ ok: true, connection_source: selected.sourceName, searched: ref, result: rows[0] }, null, 2));
  }
} finally {
  try { await client.end(); } catch {}
}
