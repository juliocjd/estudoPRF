// Corrige o mapa CONTRAN conforme o doc de vigência ago/2026:
//  - 349/2010 -> 946/2022 (estava 955)  [transporte eventual de cargas/bicicletas]
//  - 360/2010 -> 933/2022 (estava 1.020, claramente errado)
//  - 216/2006 e 253/2007: complemented_by = 989/2022 (como o 254, todos -> 960)
// Prod-only (mapa só existe no Postgres). Backup em tmp/.
//   node --env-file=.env scripts/fix-contran-map-vigencia.mjs            # dry-run
//   node --env-file=.env scripts/fix-contran-map-vigencia.mjs --apply
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'node:fs';

const apply = process.argv.includes('--apply');
const FIXES = [
  { sn: '349', sy: '2010', targetNumber: '946', targetYear: '2022' },
  { sn: '360', sy: '2010', targetNumber: '933', targetYear: '2022' },
  { sn: '216', sy: '2006', complementedBy: '989/2022' },
  { sn: '253', sy: '2007', complementedBy: '989/2022' },
];

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const before = await sql`
    SELECT id, source_number::text sn, source_year::text sy, target_number::text tn,
      target_year::text ty, relation, COALESCE(complemented_by,'') cb
    FROM contran_prf_2021_current_map
    WHERE source_number::text = ANY(${FIXES.map((f) => f.sn)}) AND source_year::text = ANY(${FIXES.map((f) => f.sy)})`;
  console.log('ANTES:');
  for (const r of before) console.log(`  ${r.sn}/${r.sy} -> ${r.tn}/${r.ty} compl=${r.cb || '-'}`);
  try { mkdirSync('tmp', { recursive: true }); } catch {}
  writeFileSync('tmp/fix-contran-map-backup.json', JSON.stringify(before, null, 1));

  if (!apply) { console.log('\nDRY-RUN (use --apply). backup em tmp/fix-contran-map-backup.json'); await sql.end(); process.exit(0); }

  for (const f of FIXES) {
    if (f.targetNumber) {
      await sql`UPDATE contran_prf_2021_current_map
        SET target_number = ${f.targetNumber}, target_year = ${f.targetYear},
            relation = 'substituida_ou_consolidada', updated_at = now()
        WHERE source_number::text = ${f.sn} AND source_year::text = ${f.sy}`;
    }
    if (f.complementedBy) {
      await sql`UPDATE contran_prf_2021_current_map
        SET complemented_by = ${f.complementedBy}, updated_at = now()
        WHERE source_number::text = ${f.sn} AND source_year::text = ${f.sy}`;
    }
  }
  const after = await sql`
    SELECT source_number::text sn, source_year::text sy, target_number::text tn,
      target_year::text ty, COALESCE(complemented_by,'') cb
    FROM contran_prf_2021_current_map
    WHERE source_number::text = ANY(${FIXES.map((f) => f.sn)}) AND source_year::text = ANY(${FIXES.map((f) => f.sy)})`;
  console.log('DEPOIS:');
  for (const r of after) console.log(`  ${r.sn}/${r.sy} -> ${r.tn}/${r.ty} compl=${r.cb || '-'}`);
  console.log('OK.');
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
