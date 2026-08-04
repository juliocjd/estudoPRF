// Reverte a ocultação de questões de "Transformação digital" (Big Data, IoT, IA,
// Cloud, ML) — que ESTÃO no edital de Informática da PRF (item 3 e 5) e foram
// ocultadas por engano no hide-offscope. Apaga o status 'excluded' delas.
//   node scripts/restore-transformacao-digital.mjs                 # PROD, dry-run
//   node scripts/restore-transformacao-digital.mjs --apply         # PROD
//   node scripts/restore-transformacao-digital.mjs --db questoes-prf.sqlite --apply  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const ASSUNTOS = [
  'Conceitos de Big Data',
  'Internet das Coisas (IoT)',
  'Conceitos Iniciais e Gerais de Inteligência Artificial',
  'Conceitos Gerais de Machine Learning',
  'Cloud Computing (Computação em Nuvem)',
];
const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const apply = Boolean(args.apply);
const { db } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});
const ph = ASSUNTOS.map(() => '?').join(',');
const where = `status = 'excluded' AND question_id IN (
  SELECT id_question FROM questions WHERE materia LIKE 'TI - %' AND assunto IN (${ph})
)`;
try {
  const n = db.prepare(`SELECT COUNT(*) n FROM question_study_status WHERE ${where}`).get(...ASSUNTOS).n;
  console.log(`Questões ocultas a restaurar (Transformação digital): ${n}`);
  if (!apply) { console.log('DRY-RUN (use --apply).'); }
  else {
    const res = db.prepare(`DELETE FROM question_study_status WHERE ${where}`).run(...ASSUNTOS);
    console.log(`OK: ${Number(res?.changes ?? n)} restauradas (voltaram ao estudo).`);
  }
} finally { db.close(); }

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (!a.startsWith('--')) continue;
    const k = a.slice(2), nx = argv[i + 1];
    if (!nx || nx.startsWith('--')) p[k] = true; else { p[k] = nx; i++; }
  }
  return p;
}
