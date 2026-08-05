// DEMO da correção pela legislação atual. Preenche question_current_law_answers
// da Q1023275 (película: "Res. 254 altera o índice de visibilidade dos vidros
// traseiros de 50% para: A)60 B)55 C)35 D)28 E)10", gab. histórico D=28%).
// Pela Res. CONTRAN 989/2022 não há mais índice mínimo para os vidros traseiros/
// áreas não envidraçadas quando o veículo tem retrovisores externos → nenhuma
// alternativa vale hoje (no_valid_alternative). Reversível: DELETE da linha.
//   node --experimental-sqlite --env-file=.env scripts/fill-pelicula-current-law.mjs           # dry-run
//   node --experimental-sqlite --env-file=.env scripts/fill-pelicula-current-law.mjs --apply    # local + prod
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const apply = process.argv.includes('--apply');
const QID = 1023275;

const REC = {
  question_id: QID,
  historical_answer: 'D',
  current_answer: '',
  current_law_status: 'no_valid_alternative',
  can_auto_score_current_law: 0,
  do_not_use_historical_answer_in_current_law_mode: 1,
  answer_changed: 1,
  no_valid_alternative: 1,
  should_discard_from_current_law_study: 0,
  hide_from_main_study_until_verified: 0,
  legal_basis: 'Resolução CONTRAN nº 960/2022, alterada pela Resolução CONTRAN nº 989/2022',
  article_reference: 'Res. CONTRAN nº 989/2022',
  article_excerpt: 'A Res. CONTRAN nº 989/2022 dispensou o índice mínimo de transmitância luminosa para as áreas não envidraçadas (vidros traseiros e traseiros laterais) dos veículos dotados de espelhos retrovisores externos em ambos os lados.',
  teacher_explanation: 'A Resolução CONTRAN nº 254/2007 foi revogada. Pela regra vigente (Res. 960/2022, alterada pela Res. 989/2022) NÃO há índice mínimo de transmitância luminosa para os vidros traseiros / áreas não envidraçadas quando o veículo possui espelhos retrovisores externos dos dois lados. Logo, não existe mais o "índice de 28%": nenhuma das alternativas (60%, 55%, 35%, 28%, 10%) corresponde à regra atual.',
  rule_summary: 'Para-brisa e vidros dianteiros mantêm mínimos (75%/70%). Vidros traseiros / áreas não envidraçadas: sem exigência de índice mínimo se houver retrovisores externos em ambos os lados (Res. 989/2022).',
  professor_complement: '',
  study_conclusion: 'Questão desatualizada: hoje não há percentual mínimo para os vidros traseiros nessa hipótese; a questão ficou sem resposta válida entre as alternativas.',
  source_url: 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes',
  verification_method: 'manual_curadoria',
  source_version: 'Res. CONTRAN 989/2022',
  teaching_comment_md: '',
  raw_json: JSON.stringify({ demo: true, motivo: '989/2022 removeu índice mínimo dos vidros traseiros' })
};
const COLS = Object.keys(REC);

const local = new DatabaseSync('questoes-prf.sqlite');
const exists = local.prepare('SELECT 1 FROM questions WHERE id_question = ?').get(QID);
console.log('Q1023275 no banco local:', exists ? 'sim' : 'NÃO');
const prev = local.prepare('SELECT current_law_status FROM question_current_law_answers WHERE question_id = ?').get(QID);
console.log('correção anterior local:', prev ? prev.current_law_status : '(nenhuma)');

if (!apply) { console.log('\nDRY-RUN (use --apply). Nada gravado.'); local.close(); process.exit(0); }

// LOCAL (upsert)
const ph = COLS.map(() => '?').join(', ');
const setClause = COLS.filter((c) => c !== 'question_id').map((c) => `${c} = excluded.${c}`).join(', ');
local.prepare(`
  INSERT INTO question_current_law_answers (${COLS.join(', ')}, imported_at, updated_at)
  VALUES (${ph}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT(question_id) DO UPDATE SET ${setClause}, updated_at = CURRENT_TIMESTAMP
`).run(...COLS.map((c) => REC[c]));
console.log('LOCAL: correção gravada.');
local.close();

// PROD
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
try {
  const has = await sql`SELECT 1 FROM questions WHERE id_question = ${QID}`;
  if (!has.length) { console.log('PROD: Q1023275 não existe no prod — pulei.'); }
  else {
    const setP = COLS.filter((c) => c !== 'question_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    await sql`
      INSERT INTO question_current_law_answers ${sql(REC, ...COLS)}
      ON CONFLICT (question_id) DO UPDATE SET ${sql.unsafe(setP)}, updated_at = now()
    `;
    console.log('PROD: correção gravada.');
  }
} catch (e) { console.error('ERRO PROD:', e.message); process.exitCode = 1; } finally { await sql.end(); }
