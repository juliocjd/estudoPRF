// Esconde do estudo as questões de matérias FORA DO ESCOPO da PRF:
//  - Tipo A: disciplinas "TI - *" (conteúdo avançado de TI: Big Data, Hadoop,
//    NoSQL, IoT... que não caem na Informática básica da PRF).
//  - Tipo C: matérias-ruído que vazaram de outros concursos (Medicina,
//    Biblioteconomia, Serviço Social, Pedagogia, Direito Digital, etc.).
// NÃO toca Estatística nem Raciocínio Lógico (são úteis, ficam).
//
// Marca em question_study_status como 'excluded' (reversível: basta apagar a
// linha). Idempotente: não toca questões que já tenham um status.
// Sempre grava backup dos ids afetados.
//
//   node scripts/hide-offscope-materias.mjs                # PROD, dry-run
//   node scripts/hide-offscope-materias.mjs --apply        # PROD, aplica
//   node scripts/hide-offscope-materias.mjs --db questoes-prf.sqlite --apply  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const MATERIAS = [
  // Tipo A — TI fora de escopo
  { m: 'TI - Ciência de Dados e Inteligência Artificial', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Banco de Dados', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Redes de Computadores', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Desenvolvimento de Sistemas', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Organização e Arquitetura dos Computadores', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Segurança da Informação', reason: 'auto: TI avançada fora de escopo PRF' },
  { m: 'TI - Sistemas Operacionais', reason: 'auto: TI avançada fora de escopo PRF' },
  // Tipo C — ruído de outros concursos
  { m: 'Biblioteconomia', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Medicina', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Serviço Social', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Direito Sanitário e Saúde', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Finanças e Conhecimentos Bancários', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Pedagogia', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Direito Digital', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Legislação Civil e Processual Civil Especial', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Legislação Específica dos Ministérios Públicos', reason: 'auto: materia fora de escopo PRF' },
  { m: 'Segurança Privada e Transportes', reason: 'auto: materia fora de escopo PRF' },
];

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const apply = Boolean(args.apply);
const backupPath = args.backup || (useLocal ? 'tmp/hide-offscope-local.json' : 'tmp/hide-offscope-prod.json');
const { db } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

try {
  const select = db.prepare(`
    SELECT q.id_question AS id
    FROM questions q
    WHERE q.materia = ?
      AND NOT EXISTS (SELECT 1 FROM question_study_status s WHERE s.question_id=q.id_question AND COALESCE(s.status,'')<>'')
  `);
  const plan = [];
  let grandTotal = 0;
  for (const { m, reason } of MATERIAS) {
    const ids = select.all(m).map((r) => r.id);
    plan.push({ materia: m, reason, ids });
    grandTotal += ids.length;
    console.log(`${String(ids.length).padStart(4)}  ${m}`);
  }
  console.log(`\nTOTAL a esconder: ${grandTotal}`);

  try { mkdirSync('tmp', { recursive: true }); } catch {}
  writeFileSync(backupPath, JSON.stringify(plan, null, 1));
  console.log(`backup dos ids em ${backupPath}`);

  if (!apply) {
    console.log('\nDRY-RUN (use --apply para aplicar).');
  } else {
    db.exec('BEGIN');
    try {
      const ins = db.prepare(`
        INSERT INTO question_study_status (question_id, status, reason, hidden_at, updated_at)
        VALUES (?, 'excluded', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      let n = 0;
      for (const { reason, ids } of plan) for (const id of ids) { ins.run(id, reason); n += 1; }
      db.exec('COMMIT');
      console.log(`\nOK: ${n} questões marcadas como excluídas do estudo.`);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('ROLLBACK —', error.message);
      throw error;
    }
  }
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
