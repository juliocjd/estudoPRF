// Garante que o perfil prf_principais tenha as disciplinas de Bloco I que
// entraram depois do seed original: Redação Oficial (matéria autônoma) e
// Ética no Serviço Público (cobrável no edital PRF 2021, Bloco I).
//
// Idempotente: só insere o que faltar. Como os alvos por bloco são fixos
// (PRF_BLOCK_TARGETS no servidor), adicionar disciplinas não desbalanceia a
// meta — apenas dá a elas uma fatia do Bloco I.
//
// Uso:
//   node scripts/ensure-prf-principais-extra-subjects.mjs                 # produção (DATABASE_URL)
//   node scripts/ensure-prf-principais-extra-subjects.mjs --db questoes-prf.sqlite  # local
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const { db, client } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

const PROFILE_ID = 'prf_principais';
const SUBJECTS = [
  {
    key: 'redacao_oficial', label: 'Redação Oficial',
    block: 'bloco_1', blockLabel: 'Bloco I',
    items: 4, pct: 3, cutoff: 3, weight: 0.03,
    note: 'Redação Oficial separada de Português (matéria autônoma, peso próprio).'
  },
  {
    key: 'etica', label: 'Ética no Serviço Público',
    block: 'bloco_1', blockLabel: 'Bloco I',
    items: 3, pct: 3, cutoff: 15, weight: 0.03,
    note: 'Ética no Serviço Público (Bloco I do edital PRF 2021). Torna as questões de ética estudáveis no perfil.'
  }
];

try {
  for (const subject of SUBJECTS) {
    const exists = db.prepare(
      'SELECT 1 FROM exam_subject_weights WHERE profile_id = ? AND subject_key = ?'
    ).get(PROFILE_ID, subject.key);
    if (exists) {
      console.log(`[skip] ${subject.key} já existe em ${PROFILE_ID}`);
      continue;
    }
    if (client === 'postgres') {
      const nextId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM exam_subject_weights').get().n;
      db.prepare(`
        INSERT INTO exam_subject_weights
          (id, profile_id, subject_key, subject_label, block_key, block_label,
           expected_items, expected_pct, min_score_cutoff, importance_weight, source_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(nextId, PROFILE_ID, subject.key, subject.label, subject.block, subject.blockLabel,
        subject.items, subject.pct, subject.cutoff, subject.weight, subject.note);
      // mantém a sequence alinhada (a coluna não tem default nextval)
      db.prepare("SELECT setval('public.exam_subject_weights_id_seq', (SELECT MAX(id) FROM exam_subject_weights))").get();
      console.log(`[ins] ${subject.key} (id ${nextId})`);
    } else {
      db.prepare(`
        INSERT INTO exam_subject_weights
          (profile_id, subject_key, subject_label, block_key, block_label,
           expected_items, expected_pct, min_score_cutoff, importance_weight, source_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(PROFILE_ID, subject.key, subject.label, subject.block, subject.blockLabel,
        subject.items, subject.pct, subject.cutoff, subject.weight, subject.note);
      console.log(`[ins] ${subject.key}`);
    }
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM exam_subject_weights WHERE profile_id = ?').get(PROFILE_ID).n;
  console.log(`Pesos em ${PROFILE_ID}: ${total}`);
} finally {
  db.close();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) { parsed[key] = true; continue; }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}
