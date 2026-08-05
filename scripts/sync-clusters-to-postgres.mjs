// Substitui os clusters do prod pelos reconstruídos no local (question_clusters +
// question_cluster_members). Limpa cluster_mastery (progresso de cluster fica
// órfão com IDs novos; question_mastery/FSRS NÃO é tocado). Só rows de questões
// presentes no prod.
//   node --experimental-sqlite --env-file=.env scripts/sync-clusters-to-postgres.mjs --apply
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const local = new DatabaseSync('questoes-prf.sqlite', { readOnly: true });
const clusters = local.prepare('SELECT * FROM question_clusters').all();
const members = local.prepare('SELECT * FROM question_cluster_members').all();
const clusterCols = local.prepare('PRAGMA table_info(question_clusters)').all().map((c) => c.name);
const memberCols = local.prepare('PRAGMA table_info(question_cluster_members)').all().map((c) => c.name);
local.close();
console.log(`local: ${clusters.length} clusters, ${members.length} membros`);
if (!apply) { console.log('DRY-RUN (use --apply).'); process.exit(0); }

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
const TS = new Set(['created_at', 'updated_at']);
const clean = (row, cols) => { const o = {}; for (const c of cols) o[c] = (TS.has(c) && (row[c] === '' || row[c] == null)) ? null : row[c]; return o; };
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
try {
  // só questões presentes no prod (evita órfãos/FK)
  const prodIds = new Set((await sql`SELECT id_question FROM questions`).map((r) => Number(r.id_question)));
  const memF = members.filter((m) => prodIds.has(Number(m.question_id)));
  const cluIdsKeep = new Set(memF.map((m) => m.cluster_id));
  const cluF = clusters.filter((c) => cluIdsKeep.has(c.id));
  console.log(`a sincronizar (presentes no prod): ${cluF.length} clusters, ${memF.length} membros`);

  await sql`DELETE FROM cluster_mastery`;
  await sql`DELETE FROM question_cluster_members`;
  await sql`DELETE FROM question_clusters`;
  console.log('prod limpo (clusters/membros/cluster_mastery).');

  let nc = 0;
  for (const b of chunk(cluF.map((r) => clean(r, clusterCols)), 300)) { await sql`INSERT INTO question_clusters ${sql(b, ...clusterCols)}`; nc += b.length; }
  console.log(`clusters inseridos: ${nc}`);
  let nm = 0;
  for (const b of chunk(memF.map((r) => clean(r, memberCols)), 400)) { await sql`INSERT INTO question_cluster_members ${sql(b, ...memberCols)}`; nm += b.length; }
  console.log(`membros inseridos: ${nm}`);
  console.log('OK: clusters sincronizados no prod.');
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1; } finally { await sql.end(); }
