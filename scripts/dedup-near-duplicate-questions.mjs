// Deduplica questões quase-idênticas (mesmo conjunto de palavras de conteúdo).
// Critério seguro: duas questões são a MESMA só se o multiconjunto de tokens de
// conteúdo (len>=3 ou numérico) for idêntico — ignora conectivos "o/no", mas
// mantém "não", números e qualquer palavra significativa. Grupos com gabaritos
// não-vazios divergentes são deixados para revisão manual (nunca deletados).
//
// Keeper por grupo: prioriza (respondida) > (com gabarito) > (comentada) > (mais
// respostas) > (menor id). Antes de apagar, migra para o keeper o gabarito e o
// comentário que ele porventura não tenha e um excedente tenha.
//
// SEMPRE gera backup JSON dos excedentes antes de deletar. Deleção transacional.
//
// Uso:
//   node scripts/dedup-near-duplicate-questions.mjs                 # PROD, dry-run
//   node scripts/dedup-near-duplicate-questions.mjs --apply         # PROD, executa
//   node scripts/dedup-near-duplicate-questions.mjs --db questoes-prf.sqlite --apply  # LOCAL
import { openStudyDatabase } from '../src/db/open-study-database.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const useLocal = Boolean(args.db);
const apply = Boolean(args.apply);
const backupPath = args.backup || (useLocal ? 'tmp/dedup-backup-local.json' : 'tmp/dedup-backup-prod.json');
const { db, client } = openStudyDatabase({
  dbPath: args.db || 'questoes-prf.sqlite',
  databaseUrl: useLocal ? '' : (args['database-url'] || process.env.DATABASE_URL || ''),
  client: useLocal ? 'sqlite' : 'postgres'
});

function tokens(s) {
  const n = String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n.split(' ').filter((w) => w && (w.length >= 3 || /^[0-9]+$/.test(w)));
}
const keyOf = (s) => tokens(s).slice().sort().join(' ');

try {
  const rows = db.prepare(
    "SELECT id_question AS id, type_question AS t, official_answer AS o, COALESCE(NULLIF(statement_text,''), statement_html) AS txt, statement_html AS sh FROM questions WHERE COALESCE(anulada,0)=0"
  ).all();
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r.txt);
    if (k.length < 30) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ id: r.id, t: r.t, o: String(r.o || '').trim(), sh: r.sh });
  }
  const groups = [...map.values()].filter((g) => g.length > 1);

  // Enriquecimento de TODOS os candidatos (gabarito de todas as fontes + negrito).
  const candIds = groups.flat().map((x) => x.id);
  const ansCnt = new Map();
  const commented = new Set();
  const nbAns = new Map();
  const cmAns = new Map();
  for (let i = 0; i < candIds.length; i += 400) {
    const c = candIds.slice(i, i + 400);
    const ph = c.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT question_id AS q, COUNT(*) AS n FROM study_answers WHERE question_id IN (${ph}) GROUP BY question_id`).all(...c)) ansCnt.set(r.q, Number(r.n));
    for (const r of db.prepare(`SELECT DISTINCT question_id AS q FROM comments WHERE question_id IN (${ph}) AND (COALESCE(html,'')!='' OR COALESCE(text,'')!='')`).all(...c)) commented.add(r.q);
    for (const r of db.prepare(`SELECT question_id AS q, answer AS a FROM notebook_questions WHERE question_id IN (${ph}) AND COALESCE(answer,'')!=''`).all(...c)) { if (!nbAns.has(r.q)) nbAns.set(r.q, String(r.a).trim()); }
    for (const r of db.prepare(`SELECT question_id AS q, extracted_answer AS a FROM comments WHERE question_id IN (${ph}) AND COALESCE(extracted_answer,'')!=''`).all(...c)) cmAns.set(r.q, String(r.a).trim());
  }
  const bestAnswer = (x) => String(x.o || '').trim() || nbAns.get(x.id) || cmAns.get(x.id) || '';
  const boldOf = (html) => (String(html || '').match(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi) || [])
    .map((m) => m.replace(/<[^>]+>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean).join(' | ');

  // GUARDAS: só é duplicata real se, no grupo, o gabarito (de qualquer fonte) for
  // conhecido e IGUAL para todos, E o texto em negrito for igual. Isso separa as
  // baterias "cloze" CEBRASPE (mesmo texto-base, negrito/assertiva diferentes) das
  // duplicatas de importação verdadeiras.
  const safeGroups = [];
  let divAnswer = 0, divBold = 0, allEmpty = 0;
  for (const g of groups) {
    const answers = new Set(g.map(bestAnswer).filter(Boolean));
    const bolds = new Set(g.map((x) => boldOf(x.sh)));
    if (answers.size > 1) { divAnswer += 1; continue; }
    if (bolds.size > 1) { divBold += 1; continue; }
    if (answers.size === 0) { allEmpty += 1; continue; }
    safeGroups.push(g);
  }
  const reviewCount = divAnswer;
  console.log(`guardas -> excluídos: gabarito divergente ${divAnswer}, negrito divergente ${divBold}, sem gabarito ${allEmpty}`);

  const score = (x) => (ansCnt.get(x.id) ? 1e6 : 0) + (x.o ? 1e4 : 0) + (commented.has(x.id) ? 1e2 : 0) + (ansCnt.get(x.id) || 0);

  const keepers = [];
  const delIds = [];
  const merges = []; // {keeper, fromGab, fromComment}
  for (const g of safeGroups) {
    const sorted = g.slice().sort((a, b) => score(b) - score(a) || a.id - b.id);
    const keeper = sorted[0];
    const del = sorted.slice(1);
    keepers.push(keeper.id);
    for (const d of del) delIds.push(d.id);
    // merge de gabarito
    if (!keeper.o) {
      const withGab = del.find((d) => d.o);
      if (withGab) merges.push({ keeper: keeper.id, fromGab: withGab.id });
    }
    // merge de comentário
    if (!commented.has(keeper.id)) {
      const withCom = del.find((d) => commented.has(d.id));
      if (withCom) merges.push({ keeper: keeper.id, fromComment: withCom.id });
    }
  }

  console.log(`[${client}] grupos seguros: ${safeGroups.length} | a deletar: ${delIds.length} | keepers: ${keepers.length} | grupos p/ revisão (ignorados): ${reviewCount}`);
  console.log(`merges necessários -> gabarito: ${merges.filter((m) => m.fromGab).length} | comentário: ${merges.filter((m) => m.fromComment).length}`);

  // descobrir tabelas-filho com question_id
  const childTables = discoverChildTables(db, client);
  console.log('tabelas-filho:', childTables.join(', '));

  // BACKUP dos excedentes (sempre)
  const backup = { client, generatedTokens: delIds.length, questions: [], children: {} };
  backup.questions = chunkedSelect(db, delIds, (ph) => `SELECT * FROM questions WHERE id_question IN (${ph})`);
  for (const tbl of childTables) {
    backup.children[tbl] = chunkedSelect(db, delIds, (ph) => `SELECT * FROM ${tbl} WHERE question_id IN (${ph})`);
  }
  try { mkdirSync('tmp', { recursive: true }); } catch {}
  writeFileSync(backupPath, JSON.stringify(backup, null, 1));
  const childCounts = Object.entries(backup.children).map(([k, v]) => `${k}:${v.length}`).join(' ');
  console.log(`backup salvo em ${backupPath} (questions:${backup.questions.length} | ${childCounts})`);

  if (!apply) {
    console.log('\nDRY-RUN (use --apply para executar a deleção).');
    console.log('exemplos:', JSON.stringify(safeGroups.slice(0, 3).map((g) => g.map((x) => x.id))));
  } else {
    // EXECUÇÃO transacional
    db.exec('BEGIN');
    try {
      // 1) merges antes de deletar
      for (const m of merges) {
        if (m.fromGab) {
          db.prepare("UPDATE questions SET official_answer = (SELECT official_answer FROM questions WHERE id_question = ?) WHERE id_question = ? AND COALESCE(official_answer,'')=''").run(m.fromGab, m.keeper);
        }
        if (m.fromComment) {
          const src = db.prepare('SELECT * FROM comments WHERE question_id = ?').get(m.fromComment);
          if (src) {
            const cols = Object.keys(src).filter((c) => c !== 'question_id');
            const setList = cols.map((c) => `${c}`).join(', ');
            const ph = cols.map(() => '?').join(', ');
            const exists = db.prepare('SELECT 1 FROM comments WHERE question_id = ?').get(m.keeper);
            if (!exists) {
              db.prepare(`INSERT INTO comments (question_id, ${setList}) VALUES (?, ${ph})`).run(m.keeper, ...cols.map((c) => src[c]));
            }
          }
        }
      }
      // 2) deletar filhos
      let childDeleted = 0;
      for (const tbl of childTables) {
        childDeleted += chunkedRun(db, delIds, (ph) => `DELETE FROM ${tbl} WHERE question_id IN (${ph})`);
      }
      // 3) deletar questões
      const qDeleted = chunkedRun(db, delIds, (ph) => `DELETE FROM questions WHERE id_question IN (${ph})`);
      db.exec('COMMIT');
      console.log(`\nOK: questões deletadas: ${qDeleted} | linhas-filho deletadas: ${childDeleted}`);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('ROLLBACK —', error.message);
      throw error;
    }
  }
} finally {
  db.close();
}

function discoverChildTables(database, dbClient) {
  const out = [];
  if (dbClient === 'postgres') {
    // Apenas BASE TABLE — nunca views (DELETE em view quebraria a transação).
    const rows = database.prepare(`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.column_name = 'question_id' AND c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    `).all();
    for (const r of rows) out.push(r.table_name);
  } else {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const tRow of tables) {
      const info = database.prepare(`PRAGMA table_info(${tRow.name})`).all();
      if (info.some((c) => c.name === 'question_id')) out.push(tRow.name);
    }
  }
  return out.filter((t) => t !== 'questions');
}

function chunkedSelect(database, ids, sqlFn) {
  const out = [];
  for (let i = 0; i < ids.length; i += 400) {
    const c = ids.slice(i, i + 400);
    const ph = c.map(() => '?').join(',');
    for (const r of database.prepare(sqlFn(ph)).all(...c)) out.push(r);
  }
  return out;
}

function chunkedRun(database, ids, sqlFn) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const c = ids.slice(i, i + 400);
    const ph = c.map(() => '?').join(',');
    const res = database.prepare(sqlFn(ph)).run(...c);
    n += Number(res?.changes || 0);
  }
  return n;
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
