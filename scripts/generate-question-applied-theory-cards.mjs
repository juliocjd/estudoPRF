import {
  initQuestionAppliedTheorySchema,
  openCliDatabase,
  parseArgs
} from './question-applied-theory-utils.mjs';

const args = parseArgs();
const { db, client } = openCliDatabase(args);

try {
  initQuestionAppliedTheorySchema(db, client);
  const materia = args.materia || 'Legislação de Trânsito e Transportes';
  const pending = db.prepare(`
    SELECT COUNT(*) AS total
    FROM questions q
    LEFT JOIN question_applied_theory_cards c ON c.question_id = q.id_question
    WHERE q.materia = ?
      AND (
        c.question_id IS NULL
        OR COALESCE(c.publish_status, c.card_status) <> 'published'
        OR COALESCE(c.exact_anchor_verified, false) = false
      )
  `).get(materia);

  console.log('# Geracao de Teoria aplicada v6');
  console.log(`Banco: ${client}`);
  console.log(`Materia: ${materia}`);
  console.log('Modo automatico: desabilitado');
  console.log(`Pendentes sem card publicado com ancora exata: ${pending?.total || 0}`);
  console.log('Use um pacote/seed validado e rode import-question-applied-theory-exact-v6. A publicacao automatica sem dispositivo exato continua bloqueada.');
} finally {
  db.close();
}
