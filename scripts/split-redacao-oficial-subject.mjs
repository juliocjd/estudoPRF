/**
 * Torna "Redação Oficial" uma matéria autônoma no perfil de prova, em vez de
 * herdar o peso cheio de "Português" (15%). Antes, as 532 questões de Redação
 * Oficial estavam mapeadas ao subject_key 'portugues' e pontuavam como se
 * fossem Português de alto peso — o motor as servia demais.
 *
 * O que faz (idempotente):
 *   1) cria/atualiza o peso 'redacao_oficial' (bloco_1) com expected_pct menor;
 *   2) reduz 'portugues' para que a família (Português + Redação) some o mesmo;
 *   3) remapeia as questões de matéria 'Redação Oficial' para 'redacao_oficial'.
 *
 * Uso:
 *   node scripts/split-redacao-oficial-subject.mjs           (aplica)
 *   node scripts/split-redacao-oficial-subject.mjs --revert  (desfaz)
 *   Flags: --profile <id> (padrão prf_principais), --pct <n> (padrão 3),
 *          --portugues <n> (padrão 12), --materia "<nome>" (padrão Redação Oficial)
 */
import '../src/load-env.mjs';
import { openStudyDatabase } from '../src/db/open-study-database.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const REVERT = args.includes('--revert');
const PROFILE = flag('profile', 'prf_principais');
const MATERIA = flag('materia', 'Redação Oficial');
const REDACAO_PCT = Number(flag('pct', '3'));
const PORTUGUES_PCT = Number(flag('portugues', '12'));
const PORTUGUES_FULL_PCT = 15; // valor original, para o --revert

const { db, client } = openStudyDatabase({ databaseUrl: process.env.DATABASE_URL });
console.log(`Banco: ${client} | perfil: ${PROFILE} | matéria: ${MATERIA}`);

const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

const countRedacaoAs = (subjectKey) => one(
  `SELECT COUNT(*) AS n FROM question_exam_subjects qes
   JOIN questions q ON q.id_question = qes.question_id
   WHERE qes.profile_id = ? AND qes.subject_key = ? AND q.materia = ?`,
  PROFILE, subjectKey, MATERIA
).n;

console.log('\nAntes:');
console.log('  Redação como portugues:', countRedacaoAs('portugues'));
console.log('  Redação como redacao_oficial:', countRedacaoAs('redacao_oficial'));
console.log('  peso portugues:', one(`SELECT expected_pct FROM exam_subject_weights WHERE profile_id=? AND subject_key='portugues'`, PROFILE)?.expected_pct);
console.log('  peso redacao_oficial:', one(`SELECT expected_pct FROM exam_subject_weights WHERE profile_id=? AND subject_key='redacao_oficial'`, PROFILE)?.expected_pct ?? '(não existe)');

if (REVERT) {
  // Volta as questões para portugues e restaura o peso.
  run(`UPDATE question_exam_subjects SET subject_key='portugues', subject_label='Lingua Portuguesa'
       WHERE profile_id=? AND subject_key='redacao_oficial'
       AND question_id IN (SELECT id_question FROM questions WHERE materia=?)`, PROFILE, MATERIA);
  run(`UPDATE exam_subject_weights SET expected_pct=?, importance_weight=? WHERE profile_id=? AND subject_key='portugues'`,
    PORTUGUES_FULL_PCT, PORTUGUES_FULL_PCT / 100, PROFILE);
  run(`DELETE FROM exam_subject_weights WHERE profile_id=? AND subject_key='redacao_oficial'`, PROFILE);
  console.log('\n[REVERT] Redação voltou a ser Português; peso restaurado para', PORTUGUES_FULL_PCT + '%.');
} else {
  // 1) peso próprio da Redação Oficial (cria ou atualiza).
  const exists = one(`SELECT id FROM exam_subject_weights WHERE profile_id=? AND subject_key='redacao_oficial'`, PROFILE);
  if (exists) {
    run(`UPDATE exam_subject_weights SET expected_pct=?, importance_weight=?, min_score_cutoff=? WHERE id=?`,
      REDACAO_PCT, REDACAO_PCT / 100, REDACAO_PCT, exists.id);
  } else {
    run(`INSERT INTO exam_subject_weights
         (profile_id, subject_key, subject_label, block_key, block_label, expected_items, expected_pct, min_score_cutoff, importance_weight, source_note, created_at)
         VALUES (?, 'redacao_oficial', 'Redação Oficial', 'bloco_1', 'Bloco I', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      PROFILE, Math.round(REDACAO_PCT * 1.2), REDACAO_PCT, REDACAO_PCT, REDACAO_PCT / 100,
      'Redação Oficial separada de Português (matéria autônoma, peso próprio).');
  }
  // 2) reduz portugues para manter a família ~15%.
  run(`UPDATE exam_subject_weights SET expected_pct=?, importance_weight=? WHERE profile_id=? AND subject_key='portugues'`,
    PORTUGUES_PCT, PORTUGUES_PCT / 100, PROFILE);
  // 3) remapeia as questões de Redação Oficial.
  const res = run(`UPDATE question_exam_subjects SET subject_key='redacao_oficial', subject_label='Redação Oficial', source='redacao_autonoma'
       WHERE profile_id=? AND subject_key='portugues'
       AND question_id IN (SELECT id_question FROM questions WHERE materia=?)`, PROFILE, MATERIA);
  console.log('\n[APLICADO] Redação Oficial =', REDACAO_PCT + '%; Português =', PORTUGUES_PCT + '%; questões remapeadas:', res?.changes ?? '(ok)');
}

console.log('\nDepois:');
console.log('  Redação como portugues:', countRedacaoAs('portugues'));
console.log('  Redação como redacao_oficial:', countRedacaoAs('redacao_oficial'));
console.log('  peso portugues:', one(`SELECT expected_pct FROM exam_subject_weights WHERE profile_id=? AND subject_key='portugues'`, PROFILE)?.expected_pct);
console.log('  peso redacao_oficial:', one(`SELECT expected_pct FROM exam_subject_weights WHERE profile_id=? AND subject_key='redacao_oficial'`, PROFILE)?.expected_pct ?? '(não existe)');
process.exit(0);
